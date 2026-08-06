import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { messagingName } from "./contact-name";
import { expandKittySeries, parseKittyRecurrence } from "./kitty-classes";
import {
  projectKittyClassRoster,
  validateKittyEnrollments,
  type KittyEnrollmentInput,
  type KittyEnrollmentProjection,
} from "./kitty-class-enrollments";
import {
  normalizeKittyAttendance,
  normalizeKittyOperationalRelay,
  type KittyAttendanceStatus,
  type KittyPreparationCategory,
  type KittyRelayIntent,
  type KittyRelayMode,
} from "./kitty-class-relays";

export type KittyClassActor =
  | { kind: "admin"; profileId: string | null; channel: "dashboard" | "imessage" }
  | { kind: "contact"; contactId: string; channel: "whatsapp" };

type Client = SupabaseClient;

function assertAdmin(actor: KittyClassActor): asserts actor is Extract<KittyClassActor, { kind: "admin" }> {
  if (actor.kind !== "admin") throw new Error("admin_required");
}

function dbError(error: { message?: string } | null) {
  if (!error) return;
  if (error.message?.includes("stale_class")) throw new Error("stale_class");
  for (const code of [
    "selection_confirmation_required", "client_request_payload_mismatch", "attendance_not_found",
    "stale_attendance", "relay_not_permitted", "attendance_not_permitted",
    "invalid_change_scope", "change_not_permitted", "stale_change_request",
    "request_unavailable", "enrollment_approvals_required", "teacher_confirmation_required",
    "invalid_scope", "notification_not_retryable",
  ]) if (error.message?.includes(code)) throw new Error(code);
  throw new Error("kitty_class_operation_failed");
}

function nonEmpty(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function projectOccurrence(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    seriesId: row.series_id ? String(row.series_id) : null,
    title: String(row.title),
    subject: row.subject ? String(row.subject) : null,
    startsAt: String(row.starts_at),
    endsAt: String(row.ends_at),
    localDate: String(row.local_date),
    timezone: String(row.timezone),
    status: String(row.status),
    version: Number(row.version),
  };
}

async function fetchOccurrence(client: Client, occurrenceId: string) {
  const { data: occurrence, error } = await client
    .from("kitty_class_occurrences")
    .select("id, series_id, title, subject, starts_at, ends_at, local_date, timezone, status, version")
    .eq("id", occurrenceId)
    .maybeSingle();
  dbError(error);
  if (!occurrence) throw new Error("class_not_found");
  return occurrence;
}

function enrollmentProjection(row: Record<string, unknown>): KittyEnrollmentProjection {
  const contacts = Array.isArray(row.contacts) ? row.contacts as Array<Record<string, unknown>> : [];
  return {
    id: String(row.id),
    studentContactId: String(row.student_contact_id),
    contacts: contacts
      .filter((contact) => contact.is_active !== false)
      .map((contact) => ({
        contactId: String(contact.contact_id),
        role: contact.contact_role as "student" | "parent_guardian",
        receivesNotifications: Boolean(contact.receives_notifications),
        confirmsCancellation: Boolean(contact.confirms_cancellation),
        confirmsReschedule: Boolean(contact.confirms_reschedule),
      })),
  };
}

async function loadOccurrenceRoster(client: Client, occurrence: Record<string, unknown>) {
  const occurrenceId = String(occurrence.id);
  const scope = occurrence.series_id
    ? `occurrence_id.eq.${occurrenceId},series_id.eq.${occurrence.series_id}`
    : `occurrence_id.eq.${occurrenceId}`;
  const [teacherResult, enrollmentResult] = await Promise.all([
    client
    .from("kitty_class_participants")
      .select("contact_id, participant_role, receives_notifications, confirms_cancellation, confirms_reschedule, decision_side, is_active")
      .eq("participant_role", "teacher")
      .eq("is_active", true)
      .or(scope),
    client
      .from("kitty_class_enrollments")
      .select("id, series_id, occurrence_id, student_contact_id, active_from, active_until, is_active, contacts:kitty_class_enrollment_contacts(contact_id, contact_role, receives_notifications, confirms_cancellation, confirms_reschedule, is_active)")
      .or(scope),
  ]);
  dbError(teacherResult.error);
  dbError(enrollmentResult.error);
  const localDate = String(occurrence.local_date);
  const rosterRows = enrollmentResult.data ?? [];
  const occurrenceStudentIds = new Set(rosterRows
    .filter((row) => String(row.occurrence_id ?? "") === occurrenceId)
    .map((row) => String(row.student_contact_id)));
  const enrollments = rosterRows
    .filter((row) => row.is_active !== false)
    .filter((row) => String(row.occurrence_id ?? "") === occurrenceId || !occurrenceStudentIds.has(String(row.student_contact_id)))
    .filter((row) => String(row.active_from) <= localDate && (!row.active_until || String(row.active_until) >= localDate))
    .map((row) => enrollmentProjection(row));
  return { teacher: teacherResult.data?.[0] ?? null, enrollments };
}

function contactMembership(
  roster: Awaited<ReturnType<typeof loadOccurrenceRoster>>,
  contactId: string,
) {
  if (roster.teacher?.contact_id === contactId) return roster.teacher;
  for (const enrollment of roster.enrollments) {
    const contact = enrollment.contacts.find((item) => item.contactId === contactId);
    if (contact) return {
      contact_id: contact.contactId,
      decision_side: "student",
      confirms_cancellation: contact.confirmsCancellation,
      confirms_reschedule: contact.confirmsReschedule,
      enrollment_id: enrollment.id,
    };
  }
  throw new Error("class_not_found");
}

function projectCurrentChangeRequest(
  changeRequest: Record<string, unknown> | null,
  actor: KittyClassActor,
  roster: Awaited<ReturnType<typeof loadOccurrenceRoster>>,
) {
  if (!changeRequest || actor.kind === "admin") return changeRequest;
  const individual = changeRequest.scope === "individual_attendance" || changeRequest.scope === "individual_reschedule";
  if (individual && String(roster.teacher?.contact_id ?? "") !== actor.contactId) {
    const enrollmentId = String(changeRequest.enrollment_id ?? "");
    const represented = roster.enrollments.some((enrollment) =>
      enrollment.id === enrollmentId
        && enrollment.contacts.some((contact) => contact.contactId === actor.contactId),
    );
    if (!represented) return null;
  }
  const optionalText = (key: string) => changeRequest[key] === undefined
    ? {}
    : { [key]: changeRequest[key] === null ? null : String(changeRequest[key]) };
  return {
    id: String(changeRequest.id),
    changeType: String(changeRequest.change_type),
    scope: String(changeRequest.scope),
    status: String(changeRequest.status),
    version: Number(changeRequest.version),
    ...optionalText("proposedStartsAt"),
    ...optionalText("proposedEndsAt"),
    ...optionalText("proposedTimezone"),
    ...(changeRequest.proposed_starts_at === undefined ? {} : {
      proposedStartsAt: changeRequest.proposed_starts_at === null ? null : String(changeRequest.proposed_starts_at),
    }),
    ...(changeRequest.proposed_ends_at === undefined ? {} : {
      proposedEndsAt: changeRequest.proposed_ends_at === null ? null : String(changeRequest.proposed_ends_at),
    }),
    ...(changeRequest.proposed_timezone === undefined ? {} : {
      proposedTimezone: changeRequest.proposed_timezone === null ? null : String(changeRequest.proposed_timezone),
    }),
  };
}

function projectAdminChangeRequest(changeRequest: Record<string, unknown> | null) {
  if (!changeRequest) return null;
  const version = Number(changeRequest.version);
  const payloadDigest = String(changeRequest.payload_digest ?? "");
  const requiredEnrollmentIds = Array.isArray(changeRequest.required_enrollment_ids)
    ? changeRequest.required_enrollment_ids.map(String)
    : [];
  const confirmations = Array.isArray(changeRequest.confirmations)
    ? changeRequest.confirmations as Array<Record<string, unknown>>
    : [];
  const currentConfirmations = confirmations.filter((confirmation) =>
    Number(confirmation.request_version) === version
      && String(confirmation.payload_digest ?? "") === payloadDigest,
  );
  const enrollmentApprovals = requiredEnrollmentIds.map((enrollmentId) => {
    const confirmation = currentConfirmations.find((item) =>
      item.decision_side === "student" && String(item.enrollment_id) === enrollmentId,
    );
    return {
      enrollmentId,
      status: confirmation ? String(confirmation.decision) : "pending",
      decidedAt: confirmation?.decided_at ? String(confirmation.decided_at) : null,
    };
  });
  const teacherConfirmation = currentConfirmations.find((item) =>
    item.decision_side === "teacher" && item.enrollment_id === null,
  );
  return {
    id: String(changeRequest.id),
    changeType: String(changeRequest.change_type),
    scope: String(changeRequest.scope),
    status: String(changeRequest.status),
    version,
    proposedStartsAt: changeRequest.proposed_starts_at ? String(changeRequest.proposed_starts_at) : null,
    proposedEndsAt: changeRequest.proposed_ends_at ? String(changeRequest.proposed_ends_at) : null,
    proposedTimezone: changeRequest.proposed_timezone ? String(changeRequest.proposed_timezone) : null,
    requiredEnrollmentApprovals: requiredEnrollmentIds.length,
    receivedEnrollmentApprovals: enrollmentApprovals.filter((item) => item.status === "approved").length,
    teacherApprovalStatus: teacherConfirmation ? String(teacherConfirmation.decision) : "pending",
    enrollmentApprovals,
  };
}

function projectAdminAttendance(rows: Array<Record<string, unknown>>) {
  const supersededIds = new Set(rows.flatMap((row) =>
    row.supersedes_attendance_id ? [String(row.supersedes_attendance_id)] : [],
  ));
  const currentByEnrollment = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const enrollmentId = String(row.enrollment_id);
    if (!supersededIds.has(String(row.id)) && !currentByEnrollment.has(enrollmentId)) {
      currentByEnrollment.set(enrollmentId, row);
    }
  }
  return [...currentByEnrollment.values()].map((row) => ({
    id: String(row.id),
    enrollmentId: String(row.enrollment_id),
    status: String(row.status),
    estimatedAt: row.estimated_at ? String(row.estimated_at) : null,
    note: row.note ? String(row.note) : null,
    version: Number(row.version),
    isCorrection: Boolean(row.supersedes_attendance_id),
    reportedByContactId: String(row.reported_by_contact_id),
    createdAt: String(row.created_at),
  }));
}

export async function listKittyClasses(client: Client, actor: KittyClassActor, options: {
  view?: "upcoming" | "attention" | "history";
  limit?: number;
} = {}) {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  let contactFilterClauses: string[] | null = null;
  let contactScopes: Array<{
    occurrence_id: string | null;
    series_id: string | null;
    active_from?: string | null;
    active_until?: string | null;
  }> = [];
  if (actor.kind === "contact") {
    const [teacherResult, enrollmentResult] = await Promise.all([
      client.from("kitty_class_participants").select("occurrence_id, series_id").eq("contact_id", actor.contactId).eq("is_active", true),
      client.from("kitty_class_enrollment_contacts")
        .select("enrollment:kitty_class_enrollments!inner(occurrence_id, series_id, active_from, active_until)")
        .eq("contact_id", actor.contactId).eq("is_active", true),
    ]);
    dbError(teacherResult.error);
    dbError(enrollmentResult.error);
    const enrollmentScopes = (enrollmentResult.data ?? []).flatMap((row) => {
      if (!row.enrollment) return [];
      return Array.isArray(row.enrollment) ? row.enrollment : [row.enrollment];
    });
    contactScopes = [
      ...(teacherResult.data ?? []),
      ...enrollmentScopes,
    ];
    contactFilterClauses = [...new Set(contactScopes.flatMap((scope) => {
      const identity = scope.occurrence_id
        ? `id.eq.${String(scope.occurrence_id)}`
        : scope.series_id ? `series_id.eq.${String(scope.series_id)}` : "";
      if (!identity) return [];
      const predicates = [
        identity,
        scope.active_from ? `local_date.gte.${scope.active_from}` : "",
        scope.active_until ? `local_date.lte.${scope.active_until}` : "",
      ].filter(Boolean);
      return [predicates.length === 1 ? predicates[0] : `and(${predicates.join(",")})`];
    }))];
    if (!contactFilterClauses.length) return [];
  }

  let query = client
    .from("kitty_class_occurrences")
    .select("id, series_id, title, subject, starts_at, ends_at, local_date, timezone, status, version")
    .order("starts_at", { ascending: options.view !== "history" })
    .limit(limit);
  if (options.view === "attention") query = query.eq("status", "change_requested");
  else if (options.view === "history") query = query.in("status", ["completed", "cancelled", "rescheduled"]);
  else query = query.in("status", ["scheduled", "change_requested"]);
  if (contactFilterClauses) query = query.or(contactFilterClauses.join(","));
  const { data, error } = await query;
  dbError(error);
  const visible = actor.kind === "contact"
    ? (data ?? []).filter((row) => contactScopes.some((scope) => {
        const sameClass = scope.occurrence_id
          ? String(scope.occurrence_id) === String(row.id)
          : scope.series_id && String(scope.series_id) === String(row.series_id);
        if (!sameClass) return false;
        const localDate = String(row.local_date);
        return (!scope.active_from || scope.active_from <= localDate)
          && (!scope.active_until || scope.active_until >= localDate);
      })).slice(0, limit)
    : data ?? [];
  return visible.map((row) => projectOccurrence(row));
}

export async function getKittyClassOccurrence(client: Client, actor: KittyClassActor, occurrenceId: string) {
  const data = await fetchOccurrence(client, occurrenceId);
  const adminOnly = actor.kind === "admin";
  const changePromise = adminOnly
    ? client.from("kitty_class_change_requests")
        .select("id, change_type, scope, enrollment_id, proposed_starts_at, proposed_ends_at, proposed_timezone, status, payload_digest, version, required_enrollment_ids, replacement_occurrence_id, confirmations:kitty_class_change_confirmations(request_version, decision_side, enrollment_id, decision, payload_digest, decided_at)")
        .eq("occurrence_id", occurrenceId)
        .in("status", ["awaiting_requester_confirmation", "awaiting_counterparty", "collecting_alternatives", "ready_to_finalize"])
        .maybeSingle()
    : client.from("kitty_class_change_requests")
        .select("id, change_type, scope, enrollment_id, proposed_starts_at, proposed_ends_at, proposed_timezone, status, version")
        .eq("occurrence_id", occurrenceId)
        .in("status", ["awaiting_requester_confirmation", "awaiting_counterparty", "collecting_alternatives", "ready_to_finalize"])
        .maybeSingle();
  const [roster, changeResult, attendanceResult, auditResult, notificationResult] = await Promise.all([
    loadOccurrenceRoster(client, data),
    changePromise,
    adminOnly
      ? client.from("kitty_class_attendance_updates")
          .select("id, enrollment_id, reported_by_contact_id, status, estimated_at, note, version, supersedes_attendance_id, created_at")
          .eq("occurrence_id", occurrenceId).order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    adminOnly
      ? client.rpc("get_kitty_class_admin_detail_events", { p_occurrence_id: occurrenceId })
      : Promise.resolve({ data: [], error: null }),
    adminOnly
      ? client.from("kitty_class_notification_outbox")
          .select("id, contact_id, intent, status, attempt_count, last_error_code, hermes_message_id, updated_at")
          .eq("occurrence_id", occurrenceId).in("status", ["failed", "blocked"])
          .order("updated_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);
  dbError(changeResult.error);
  dbError(attendanceResult.error);
  dbError(auditResult.error);
  dbError(notificationResult.error);
  if (actor.kind === "contact") contactMembership(roster, actor.contactId);
  const projectedEnrollments = projectKittyClassRoster(
    roster.enrollments,
    actor.kind === "admin" ? { kind: "admin" } : { kind: "contact", contactId: actor.contactId },
  );
  const projected = {
    ...projectOccurrence(data),
    enrollments: projectedEnrollments,
    enrollmentCount: roster.enrollments.length,
    currentChangeRequest: actor.kind === "admin"
      ? projectAdminChangeRequest(changeResult.data)
      : projectCurrentChangeRequest(changeResult.data, actor, roster),
  };
  return actor.kind === "admin"
    ? {
        ...projected,
        teacherContactId: String(roster.teacher?.contact_id ?? ""),
        attendance: projectAdminAttendance(attendanceResult.data ?? []),
        auditEvents: (auditResult.data ?? []).map((event: {
          id: unknown; actor_type: unknown; event_type: unknown; entity_type: unknown; created_at: unknown;
        }) => ({
          id: String(event.id),
          actorType: String(event.actor_type),
          eventType: String(event.event_type),
          entityType: String(event.entity_type),
          createdAt: String(event.created_at),
        })),
        notificationFailures: (notificationResult.data ?? []).map((notification) => ({
          id: String(notification.id),
          contactId: String(notification.contact_id),
          intent: String(notification.intent),
          status: String(notification.status),
          attemptCount: Number(notification.attempt_count),
          errorCode: notification.last_error_code ? String(notification.last_error_code) : null,
          messageId: notification.hermes_message_id ? String(notification.hermes_message_id) : null,
          updatedAt: String(notification.updated_at),
        })),
      }
    : projected;
}

export type CreateKittyClassInput = {
  kind: "one_off" | "weekly";
  title: string;
  subject?: string | null;
  timezone: string;
  startsAt?: string;
  endsAt?: string;
  localDate?: string;
  recurrence?: unknown;
  durationMinutes?: number;
  effectiveStart?: string;
  effectiveEnd?: string | null;
  teacherContactId: string;
  enrollments: KittyEnrollmentInput[];
  clientRequestId: string;
};

export async function createKittyClass(client: Client, actor: KittyClassActor, input: CreateKittyClassInput) {
  assertAdmin(actor);
  if (!nonEmpty(input.title) || !nonEmpty(input.teacherContactId) || !nonEmpty(input.clientRequestId) || input.clientRequestId.trim().length > 200) throw new Error("invalid_class");
  validateKittyEnrollments(input.enrollments);
  if (input.kind === "one_off") {
    if (!input.startsAt || !input.endsAt || !input.localDate) throw new Error("invalid_class");
    const { data, error } = await client.rpc("create_kitty_group_one_off", {
      p_title: input.title, p_subject: input.subject ?? null, p_starts_at: input.startsAt,
      p_ends_at: input.endsAt, p_local_date: input.localDate, p_timezone: input.timezone,
      p_origin_channel: actor.channel, p_created_by: actor.profileId,
      p_teacher_contact_id: input.teacherContactId, p_enrollments: input.enrollments,
      p_client_request_id: input.clientRequestId,
    });
    dbError(error);
    const occurrence = Array.isArray(data) ? data[0] : data;
    return projectOccurrence(occurrence);
  }

  const recurrence = parseKittyRecurrence(input.recurrence);
  if (!input.effectiveStart || !input.durationMinutes) throw new Error("invalid_class");
  const { data, error } = await client.rpc("create_kitty_group_series", {
    p_title: input.title, p_subject: input.subject ?? null, p_timezone: input.timezone,
    p_local_time: recurrence.localTime, p_duration_minutes: input.durationMinutes,
    p_weekdays: recurrence.weekdays, p_effective_start: input.effectiveStart,
    p_effective_end: input.effectiveEnd ?? null, p_origin_channel: actor.channel,
    p_created_by: actor.profileId, p_teacher_contact_id: input.teacherContactId,
    p_enrollments: input.enrollments, p_client_request_id: input.clientRequestId,
  });
  dbError(error);
  const series = Array.isArray(data) ? data[0] : data;
  return { id: series.id, kind: "weekly", version: series.version };
}

export async function addKittyClassEnrollment(client: Client, actor: KittyClassActor, input: {
  occurrenceId: string;
  version: number;
  scope: "occurrence" | "this_and_future";
  effectiveDate: string;
  enrollment: KittyEnrollmentInput;
}) {
  assertAdmin(actor);
  if (!nonEmpty(input.occurrenceId) || !Number.isInteger(input.version) || input.version < 1
    || !["occurrence", "this_and_future"].includes(input.scope) || !validDate(input.effectiveDate)) throw new Error("invalid_scope");
  validateKittyEnrollments([input.enrollment]);
  const { data, error } = await client.rpc("add_kitty_class_enrollment", {
    p_occurrence_id: input.occurrenceId,
    p_expected_version: input.version,
    p_effective_date: input.effectiveDate,
    p_scope: input.scope,
    p_enrollment: input.enrollment,
    p_profile_id: actor.profileId,
  });
  dbError(error);
  return projectOccurrence(Array.isArray(data) ? data[0] : data);
}

export async function endKittyClassEnrollment(client: Client, actor: KittyClassActor, input: {
  occurrenceId: string;
  enrollmentId: string;
  version: number;
  scope: "occurrence" | "this_and_future";
  effectiveDate: string;
}) {
  assertAdmin(actor);
  if (!nonEmpty(input.occurrenceId) || !nonEmpty(input.enrollmentId) || !Number.isInteger(input.version) || input.version < 1
    || !["occurrence", "this_and_future"].includes(input.scope) || !validDate(input.effectiveDate)) throw new Error("invalid_scope");
  const { data, error } = await client.rpc("end_kitty_class_enrollment", {
    p_occurrence_id: input.occurrenceId,
    p_enrollment_id: input.enrollmentId,
    p_expected_version: input.version,
    p_effective_date: input.effectiveDate,
    p_scope: input.scope,
    p_profile_id: actor.profileId,
  });
  dbError(error);
  return projectOccurrence(Array.isArray(data) ? data[0] : data);
}

export async function editKittyClass(client: Client, actor: KittyClassActor, input: {
  id: string; version: number; scope: "occurrence" | "this_and_future" | "entire_series";
  title?: string; subject?: string | null;
}) {
  assertAdmin(actor);
  const table = input.scope === "occurrence" ? "kitty_class_occurrences" : "kitty_class_series";
  const update: Record<string, unknown> = { version: input.version + 1 };
  if (input.title !== undefined) update.title = input.title.trim();
  if (input.subject !== undefined) update.subject = input.subject;
  const { data, error } = await client.from(table).update(update).eq("id", input.id).eq("version", input.version).select("id, version").maybeSingle();
  dbError(error);
  if (!data) throw new Error("stale_class");
  return data;
}

export async function confirmKittyClassSelection(client: Client, actor: KittyClassActor, input: { occurrenceId: string; version: number }) {
  if (actor.kind !== "contact") throw new Error("contact_required");
  const rawOccurrence = await fetchOccurrence(client, input.occurrenceId);
  const roster = await loadOccurrenceRoster(client, rawOccurrence);
  contactMembership(roster, actor.contactId);
  const occurrence = await getKittyClassOccurrence(client, actor, input.occurrenceId);
  if (occurrence.version !== input.version || !["scheduled", "change_requested"].includes(occurrence.status)) throw new Error("stale_class");
  const represented = roster.enrollments.filter((enrollment) =>
    enrollment.contacts.some((contact) => contact.contactId === actor.contactId),
  );
  const studentIds = represented.map((enrollment) => enrollment.studentContactId);
  const studentResult = studentIds.length
    ? await client.from("hermes_contacts").select("id, display_name, preferred_name").in("id", studentIds)
    : { data: [], error: null };
  dbError(studentResult.error);
  const students = new Map((studentResult.data ?? []).map((student) => [String(student.id), student]));
  if (represented.some((enrollment) => !students.has(enrollment.studentContactId))) {
    throw new Error("kitty_class_operation_failed");
  }
  const selectionToken = randomBytes(32).toString("hex");
  const selectionTokenDigest = createHash("sha256").update(selectionToken).digest("hex");
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
  const representedEnrollments = represented.map((enrollment) => {
    const enrollmentHandle = randomBytes(32).toString("hex");
    return {
      enrollmentId: enrollment.id,
      enrollmentHandle,
      enrollmentHandleDigest: createHash("sha256").update(enrollmentHandle).digest("hex"),
      studentName: messagingName(students.get(enrollment.studentContactId)!),
    };
  });
  const { error } = await client.from("kitty_class_audit_events").insert({
    actor_type: "contact", actor_contact_id: actor.contactId,
    event_type: "occurrence_selection_confirmed", entity_type: "occurrence", entity_id: input.occurrenceId,
    metadata: {
      occurrenceVersion: input.version,
      selectionTokenDigest,
      expiresAt,
      representedEnrollmentBindings: representedEnrollments.map((enrollment) => ({
        enrollmentId: enrollment.enrollmentId,
        enrollmentHandleDigest: enrollment.enrollmentHandleDigest,
      })),
    },
  });
  dbError(error);
  return {
    occurrence,
    selectionToken,
    expiresAt,
    representedEnrollments: representedEnrollments.map(({ enrollmentHandle, studentName }) => ({
      enrollmentHandle,
      studentName,
    })),
  };
}

function assertContactRelayInput(actor: KittyClassActor, input: {
  occurrenceId: string;
  selectionToken: string;
  clientRequestId: string;
}): asserts actor is Extract<KittyClassActor, { kind: "contact" }> {
  if (actor.kind !== "contact") throw new Error("contact_required");
  if (!nonEmpty(input.occurrenceId)
    || !/^[a-f0-9]{64}$/.test(input.selectionToken)
    || !nonEmpty(input.clientRequestId)
    || input.clientRequestId.trim().length > 200) {
    throw new Error("invalid_payload");
  }
}

async function resolveKittyEnrollmentHandle(client: Client, actor: KittyClassActor, input: {
  occurrenceId: string;
  selectionToken: string;
  enrollmentHandle?: string | null;
}) {
  if (actor.kind !== "contact") throw new Error("contact_required");
  if (!nonEmpty(input.occurrenceId)
    || !/^[a-f0-9]{64}$/.test(input.selectionToken)
    || (input.enrollmentHandle !== undefined
      && input.enrollmentHandle !== null
      && !/^[a-f0-9]{64}$/.test(input.enrollmentHandle))) {
    throw new Error("invalid_payload");
  }
  const selectionTokenDigest = createHash("sha256").update(input.selectionToken).digest("hex");
  const { data, error } = await client.from("kitty_class_audit_events")
    .select("metadata")
    .eq("actor_contact_id", actor.contactId)
    .eq("event_type", "occurrence_selection_confirmed")
    .eq("entity_type", "occurrence")
    .eq("entity_id", input.occurrenceId)
    .eq("metadata->>selectionTokenDigest", selectionTokenDigest)
    .maybeSingle();
  dbError(error);
  if (!data || !data.metadata || typeof data.metadata !== "object" || Array.isArray(data.metadata)) {
    throw new Error("selection_confirmation_required");
  }
  const metadata = data.metadata as Record<string, unknown>;
  const expiresAt = typeof metadata.expiresAt === "string" ? new Date(metadata.expiresAt) : null;
  if (!expiresAt || !Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    throw new Error("selection_expired");
  }
  const rawBindings = metadata.representedEnrollmentBindings;
  if (!Array.isArray(rawBindings)) throw new Error("selection_confirmation_required");
  const bindings = rawBindings.flatMap((binding) => {
    if (!binding || typeof binding !== "object" || Array.isArray(binding)) return [];
    const value = binding as Record<string, unknown>;
    return nonEmpty(value.enrollmentId)
      && typeof value.enrollmentHandleDigest === "string"
      && /^[a-f0-9]{64}$/.test(value.enrollmentHandleDigest)
      ? [{ enrollmentId: value.enrollmentId, enrollmentHandleDigest: value.enrollmentHandleDigest }]
      : [];
  });
  if (!input.enrollmentHandle) {
    if (bindings.length === 1) return bindings[0].enrollmentId;
    if (bindings.length > 1) throw new Error("enrollment_selection_required");
    throw new Error("enrollment_not_represented");
  }
  const enrollmentHandleDigest = createHash("sha256").update(input.enrollmentHandle).digest("hex");
  const selected = bindings.find((binding) => binding.enrollmentHandleDigest === enrollmentHandleDigest);
  if (!selected) throw new Error("enrollment_selection_required");
  return selected.enrollmentId;
}

function projectKittyAttendanceMutation(data: Record<string, unknown> | null) {
  if (!data) throw new Error("kitty_class_operation_failed");
  const estimatedAt = data.estimatedAt ?? data.estimated_at;
  const supersedesAttendanceId = data.supersedesAttendanceId ?? data.supersedes_attendance_id;
  const createdAt = data.createdAt ?? data.created_at;
  return {
    id: String(data.id),
    status: String(data.status),
    version: Number(data.version),
    ...(estimatedAt === undefined ? {} : { estimatedAt: estimatedAt === null ? null : String(estimatedAt) }),
    ...(supersedesAttendanceId === undefined ? {} : {
      supersedesAttendanceId: supersedesAttendanceId === null ? null : String(supersedesAttendanceId),
    }),
    ...(createdAt === undefined ? {} : { createdAt: String(createdAt) }),
  };
}

function projectKittyRelayMutation(data: Record<string, unknown> | null) {
  if (!data) throw new Error("kitty_class_operation_failed");
  const structuredPayload = data.structuredPayload ?? data.structured_payload;
  const createdAt = data.createdAt ?? data.created_at;
  return {
    id: String(data.id),
    intent: String(data.intent),
    ...(structuredPayload === undefined ? {} : { structuredPayload }),
    ...(createdAt === undefined ? {} : { createdAt: String(createdAt) }),
  };
}

export async function recordKittyAttendance(client: Client, actor: KittyClassActor, input: {
  occurrenceId: string;
  enrollmentHandle?: string | null;
  status: KittyAttendanceStatus;
  estimatedAt?: string | null;
  note?: string | null;
  selectionToken: string;
  clientRequestId: string;
}) {
  assertContactRelayInput(actor, input);
  const enrollmentId = await resolveKittyEnrollmentHandle(client, actor, input);
  const normalized = normalizeKittyAttendance(input);
  const { data, error } = await client.rpc("record_kitty_class_attendance", {
    p_occurrence_id: input.occurrenceId,
    p_enrollment_id: enrollmentId,
    p_actor_contact_id: actor.contactId,
    p_status: normalized.status,
    p_estimated_at: normalized.estimatedAt,
    p_note: normalized.note,
    p_selection_token: input.selectionToken,
    p_client_request_id: input.clientRequestId.trim(),
  });
  dbError(error);
  return projectKittyAttendanceMutation(Array.isArray(data) ? data[0] : data);
}

export async function correctKittyAttendance(client: Client, actor: KittyClassActor, input: {
  attendanceId: string;
  occurrenceId: string;
  enrollmentHandle?: string | null;
  status: KittyAttendanceStatus;
  estimatedAt?: string | null;
  note?: string | null;
  selectionToken: string;
  clientRequestId: string;
}) {
  assertContactRelayInput(actor, input);
  if (!nonEmpty(input.attendanceId)) throw new Error("invalid_payload");
  const enrollmentId = await resolveKittyEnrollmentHandle(client, actor, input);
  const normalized = normalizeKittyAttendance(input);
  const { data, error } = await client.rpc("correct_kitty_class_attendance", {
    p_supersedes_attendance_id: input.attendanceId,
    p_occurrence_id: input.occurrenceId,
    p_enrollment_id: enrollmentId,
    p_actor_contact_id: actor.contactId,
    p_status: normalized.status,
    p_estimated_at: normalized.estimatedAt,
    p_note: normalized.note,
    p_selection_token: input.selectionToken,
    p_client_request_id: input.clientRequestId.trim(),
  });
  dbError(error);
  return projectKittyAttendanceMutation(Array.isArray(data) ? data[0] : data);
}

export async function createKittyOperationalRelay(client: Client, actor: KittyClassActor, input: {
  occurrenceId: string;
  enrollmentHandle?: string | null;
  intent: KittyRelayIntent;
  estimatedAt?: string | null;
  mode?: KittyRelayMode | null;
  locationLabel?: string | null;
  preparationCategory?: KittyPreparationCategory | null;
  selectionToken: string;
  clientRequestId: string;
}) {
  assertContactRelayInput(actor, input);
  const normalized = normalizeKittyOperationalRelay(input);
  const enrollmentScoped = [
    "student_absent", "student_late", "student_leaving_early",
    "meeting_link_requested", "class_status_requested",
  ].includes(normalized.intent);
  if (!enrollmentScoped && input.enrollmentHandle) throw new Error("invalid_payload");
  const enrollmentId = enrollmentScoped
    ? await resolveKittyEnrollmentHandle(client, actor, input)
    : null;
  const { data, error } = await client.rpc("create_kitty_class_operational_relay", {
    p_occurrence_id: input.occurrenceId,
    p_enrollment_id: enrollmentId,
    p_actor_contact_id: actor.contactId,
    p_intent: normalized.intent,
    p_estimated_at: normalized.estimatedAt,
    p_mode: normalized.mode,
    p_location_label: normalized.locationLabel,
    p_preparation_category: normalized.preparationCategory,
    p_selection_token: input.selectionToken,
    p_client_request_id: input.clientRequestId.trim(),
  });
  dbError(error);
  return projectKittyRelayMutation(Array.isArray(data) ? data[0] : data);
}

export async function beginKittyClassChange(client: Client, actor: KittyClassActor, input: {
  occurrenceId: string; occurrenceVersion: number; changeType: "cancel" | "reschedule";
  scope: "individual_reschedule" | "whole_occurrence";
  enrollmentHandle?: string | null;
  selectionToken: string;
  clientRequestId: string;
  proposedStartsAt?: string;
  proposedEndsAt?: string;
  proposedTimezone?: string;
}) {
  if (actor.kind !== "contact") throw new Error("contact_required");
  if (!nonEmpty(input.occurrenceId)
    || !Number.isInteger(input.occurrenceVersion) || input.occurrenceVersion < 1
    || !["individual_reschedule", "whole_occurrence"].includes(input.scope)
    || !/^[a-f0-9]{64}$/.test(input.selectionToken)
    || !nonEmpty(input.clientRequestId) || input.clientRequestId.trim().length > 200) {
    throw new Error("invalid_payload");
  }
  if (input.scope === "individual_reschedule" && input.changeType !== "reschedule") throw new Error("invalid_change_scope");
  if (input.scope === "whole_occurrence" && input.enrollmentHandle) throw new Error("invalid_change_scope");
  const enrollmentId = input.scope === "individual_reschedule"
    ? await resolveKittyEnrollmentHandle(client, actor, input)
    : null;
  const { data, error } = await client.rpc("request_kitty_group_class_change", {
    p_occurrence_id: input.occurrenceId,
    p_expected_occurrence_version: input.occurrenceVersion,
    p_scope: input.scope,
    p_enrollment_id: enrollmentId,
    p_actor_contact_id: actor.contactId,
    p_change_type: input.changeType,
    p_proposed_starts_at: input.proposedStartsAt ?? null,
    p_proposed_ends_at: input.proposedEndsAt ?? null, p_proposed_timezone: input.proposedTimezone ?? null,
    p_selection_token: input.selectionToken,
    p_client_request_id: input.clientRequestId.trim(),
  });
  dbError(error);
  return projectKittyChangeRequest(Array.isArray(data) ? data[0] : data);
}

type KittyChangeRequestProjection = {
  id: string;
  occurrenceId?: string;
  changeType?: string;
  scope?: string;
  status: string;
  proposedStartsAt?: string | null;
  proposedEndsAt?: string | null;
  proposedTimezone?: string | null;
  payloadDigest?: string;
  version: number;
  expiresAt?: string;
  replacementOccurrenceId?: string | null;
  requiredEnrollmentApprovals: number;
  receivedEnrollmentApprovals: number;
};

function projectKittyChangeRequest(data: Record<string, unknown> | null): KittyChangeRequestProjection {
  if (!data) throw new Error("kitty_class_operation_failed");
  const required = data.requiredEnrollmentApprovals ?? data.required_enrollment_approvals;
  const received = data.receivedEnrollmentApprovals ?? data.received_enrollment_approvals;
  if (!Number.isInteger(required) || !Number.isInteger(received)) throw new Error("kitty_class_operation_failed");
  const field = (camel: string, snake: string) => data[camel] !== undefined ? data[camel] : data[snake];
  const occurrenceId = field("occurrenceId", "occurrence_id");
  const changeType = field("changeType", "change_type");
  const proposedStartsAt = field("proposedStartsAt", "proposed_starts_at");
  const proposedEndsAt = field("proposedEndsAt", "proposed_ends_at");
  const proposedTimezone = field("proposedTimezone", "proposed_timezone");
  const payloadDigest = field("payloadDigest", "payload_digest");
  const expiresAt = field("expiresAt", "expires_at");
  const replacementOccurrenceId = field("replacementOccurrenceId", "replacement_occurrence_id");
  return {
    id: String(data.id),
    ...(occurrenceId === undefined ? {} : { occurrenceId: String(occurrenceId) }),
    ...(changeType === undefined ? {} : { changeType: String(changeType) }),
    ...(data.scope === undefined ? {} : { scope: String(data.scope) }),
    status: data.status === "awaiting_counterparty" ? "awaiting_counterparties" : String(data.status),
    ...(proposedStartsAt === undefined ? {} : { proposedStartsAt: proposedStartsAt === null ? null : String(proposedStartsAt) }),
    ...(proposedEndsAt === undefined ? {} : { proposedEndsAt: proposedEndsAt === null ? null : String(proposedEndsAt) }),
    ...(proposedTimezone === undefined ? {} : { proposedTimezone: proposedTimezone === null ? null : String(proposedTimezone) }),
    ...(payloadDigest === undefined ? {} : { payloadDigest: String(payloadDigest) }),
    version: Number(data.version),
    ...(expiresAt === undefined ? {} : { expiresAt: String(expiresAt) }),
    ...(replacementOccurrenceId === undefined ? {} : {
      replacementOccurrenceId: replacementOccurrenceId === null ? null : String(replacementOccurrenceId),
    }),
    requiredEnrollmentApprovals: Number(required),
    receivedEnrollmentApprovals: Number(received),
  };
}

export async function decideKittyClassChange(client: Client, actor: KittyClassActor, input: {
  requestId: string; requestVersion: number; payloadDigest: string;
  decision: "approved" | "rejected"; providerMessageId?: string; clientRequestId: string;
}) {
  if (actor.kind !== "contact") throw new Error("contact_required");
  if (!nonEmpty(input.clientRequestId) || input.clientRequestId.trim().length > 200) throw new Error("invalid_payload");
  const { data, error } = await client.rpc("decide_kitty_group_class_change", {
    p_request_id: input.requestId, p_request_version: input.requestVersion,
    p_payload_digest: input.payloadDigest, p_actor_contact_id: actor.contactId, p_decision: input.decision,
    p_provider_message_id: input.providerMessageId ?? null,
    p_client_request_id: input.clientRequestId.trim(),
  });
  dbError(error);
  return projectKittyChangeRequest(Array.isArray(data) ? data[0] : data);
}

export async function proposeKittyClassReplacement(client: Client, actor: KittyClassActor, input: {
  requestId: string; requestVersion: number; payloadDigest: string;
  proposedStartsAt: string; proposedEndsAt: string; proposedTimezone?: string; clientRequestId: string;
}) {
  if (actor.kind !== "contact") throw new Error("contact_required");
  if (!nonEmpty(input.clientRequestId) || input.clientRequestId.trim().length > 200) throw new Error("invalid_payload");
  const { data, error } = await client.rpc("propose_kitty_group_class_change", {
    p_request_id: input.requestId, p_request_version: input.requestVersion,
    p_payload_digest: input.payloadDigest, p_actor_contact_id: actor.contactId,
    p_starts_at: input.proposedStartsAt, p_ends_at: input.proposedEndsAt,
    p_timezone: input.proposedTimezone ?? null,
    p_client_request_id: input.clientRequestId.trim(),
  });
  dbError(error);
  return projectKittyChangeRequest(Array.isArray(data) ? data[0] : data);
}

export async function findMyPendingKittyChanges(client: Client, actor: KittyClassActor, referenceCode?: string) {
  if (actor.kind !== "contact") throw new Error("contact_required");
  const normalizedReference = referenceCode?.replace(/[^a-f0-9]/gi, "").toUpperCase() || null;
  if (normalizedReference && normalizedReference.length !== 6) throw new Error("invalid_payload");
  const { data, error } = await client.rpc("find_my_pending_kitty_class_changes", {
    p_contact_id: actor.contactId, p_reference_code: normalizedReference,
  });
  dbError(error);
  return (data ?? []).map((row: Record<string, unknown>) => ({
    ...projectKittyChangeRequest(row),
    referenceCode: String(row.id).replaceAll("-", "").slice(0, 6).toUpperCase(),
  }));
}

export async function maintainKittyClassState(client: Client) {
  const { data, error } = await client.rpc("maintain_kitty_class_state");
  dbError(error);
  return data as { expiredRequests?: number; reclaimedNotifications?: number } | null;
}

export async function retryKittyClassNotification(client: Client, actor: KittyClassActor, notificationId: string) {
  assertAdmin(actor);
  const { data: notification, error: readError } = await client
    .from("kitty_class_notification_outbox")
    .select("id, status, last_error_code")
    .eq("id", notificationId)
    .maybeSingle();
  dbError(readError);
  if (!notification || notification.status !== "failed") throw new Error("notification_not_retryable");
  const { data, error } = await client.rpc("retry_kitty_class_notification", {
    p_notification_id: notificationId, p_profile_id: actor.profileId,
  });
  dbError(error);
  return Array.isArray(data) ? data[0] : data;
}

export async function overrideKittyClass(client: Client, actor: KittyClassActor, input: {
  occurrenceId: string; changeType: "cancel" | "reschedule"; reason: string;
  startsAt?: string; endsAt?: string; timezone?: string;
}) {
  assertAdmin(actor);
  if (!input.reason.trim()) throw new Error("override_reason_required");
  const { data, error } = await client.rpc("override_kitty_class_occurrence", {
    p_occurrence_id: input.occurrenceId, p_change_type: input.changeType, p_reason: input.reason,
    p_profile_id: actor.profileId, p_starts_at: input.startsAt ?? null,
    p_ends_at: input.endsAt ?? null, p_timezone: input.timezone ?? null,
  });
  dbError(error);
  return projectOccurrence(Array.isArray(data) ? data[0] : data);
}

async function expandSingleSeries(client: Client, series: Record<string, unknown>, now: Date) {
  const fromDate = now.toISOString().slice(0, 10);
  const through = new Date(now);
  through.setUTCDate(through.getUTCDate() + 90);
  const rows = expandKittySeries({
    seriesId: String(series.id), title: String(series.title), subject: series.subject ? String(series.subject) : null,
    timezone: String(series.timezone), recurrence: { frequency: "weekly", weekdays: series.weekdays as number[], localTime: String(series.local_time).slice(0, 5), intervalWeeks: 1 },
    durationMinutes: Number(series.duration_minutes), effectiveStart: String(series.effective_start),
    effectiveEnd: series.effective_end ? String(series.effective_end) : null, fromDate, throughDate: through.toISOString().slice(0, 10),
  });
  let createdCount = 0;
  if (rows.length) {
    const { data: created, error } = await client.from("kitty_class_occurrences").upsert(rows.map((row) => ({
      series_id: row.seriesId, occurrence_key: row.occurrenceKey, title: row.title, subject: row.subject,
      starts_at: row.startsAt, ends_at: row.endsAt, local_date: row.localDate, timezone: row.timezone,
      origin_channel: "system",
    })), { onConflict: "occurrence_key", ignoreDuplicates: true }).select("id");
    dbError(error);
    createdCount = created?.length ?? 0;
  }
  const { error: expansionError } = await client.from("kitty_class_series")
    .update({ expanded_through: through.toISOString().slice(0, 10) }).eq("id", series.id);
  dbError(expansionError);
  return createdCount;
}

export async function expandDueKittySeries(client: Client, now = new Date()) {
  const { data, error } = await client.from("kitty_class_series").select("*").eq("status", "active");
  dbError(error);
  let createdOccurrences = 0;
  for (const series of data ?? []) createdOccurrences += await expandSingleSeries(client, series, now);
  return { expandedSeries: (data ?? []).length, createdOccurrences };
}

export async function completePastKittyOccurrences(client: Client, now = new Date()) {
  const { data, error } = await client.from("kitty_class_occurrences")
    .update({ status: "completed", completed_at: now.toISOString() })
    .eq("status", "scheduled").lt("ends_at", now.toISOString()).select("id");
  dbError(error);
  return (data ?? []).length;
}

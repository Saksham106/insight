import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { expandKittySeries, parseKittyRecurrence } from "./kitty-classes";
import {
  projectKittyClassRoster,
  validateKittyEnrollments,
  type KittyEnrollmentInput,
  type KittyEnrollmentProjection,
} from "./kitty-class-enrollments";

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

async function assertContactMembership(client: Client, occurrenceId: string, contactId: string) {
  const occurrence = await fetchOccurrence(client, occurrenceId);
  const roster = await loadOccurrenceRoster(client, occurrence);
  return contactMembership(roster, contactId);
}

export async function listKittyClasses(client: Client, actor: KittyClassActor, options: {
  view?: "upcoming" | "attention" | "history";
  limit?: number;
} = {}) {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  let allowedOccurrenceIds: string[] | null = null;
  let allowedSeriesIds: string[] = [];
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
    allowedOccurrenceIds = contactScopes.flatMap((row) => row.occurrence_id ? [String(row.occurrence_id)] : []);
    allowedSeriesIds = contactScopes.flatMap((row) => row.series_id ? [String(row.series_id)] : []);
    if (!allowedOccurrenceIds.length && !allowedSeriesIds.length) return [];
  }

  let query = client
    .from("kitty_class_occurrences")
    .select("id, series_id, title, subject, starts_at, ends_at, local_date, timezone, status, version")
    .order("starts_at", { ascending: options.view !== "history" })
    .limit(actor.kind === "contact" ? 100 : limit);
  if (options.view === "attention") query = query.eq("status", "change_requested");
  else if (options.view === "history") query = query.in("status", ["completed", "cancelled", "rescheduled"]);
  else query = query.in("status", ["scheduled", "change_requested"]);
  if (allowedOccurrenceIds) {
    const clauses = [
      allowedOccurrenceIds.length ? `id.in.(${allowedOccurrenceIds.join(",")})` : "",
      allowedSeriesIds.length ? `series_id.in.(${allowedSeriesIds.join(",")})` : "",
    ].filter(Boolean);
    query = query.or(clauses.join(","));
  }
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
  const [roster, changeResult] = await Promise.all([
    loadOccurrenceRoster(client, data),
    client.from("kitty_class_change_requests")
      .select("id, change_type, requester_side, proposed_starts_at, proposed_ends_at, proposed_timezone, status, payload_digest, version, created_at")
      .eq("occurrence_id", occurrenceId)
      .in("status", ["awaiting_requester_confirmation", "awaiting_counterparty", "collecting_alternatives", "ready_to_finalize"])
      .maybeSingle(),
  ]);
  dbError(changeResult.error);
  if (actor.kind === "contact") contactMembership(roster, actor.contactId);
  const projectedEnrollments = projectKittyClassRoster(
    roster.enrollments,
    actor.kind === "admin" ? { kind: "admin" } : { kind: "contact", contactId: actor.contactId },
  );
  const projected = {
    ...projectOccurrence(data),
    enrollments: projectedEnrollments,
    enrollmentCount: roster.enrollments.length,
    currentChangeRequest: changeResult.data,
  };
  return actor.kind === "admin"
    ? { ...projected, teacherContactId: String(roster.teacher?.contact_id ?? "") }
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
  effectiveDate: string;
  enrollment: KittyEnrollmentInput;
}) {
  assertAdmin(actor);
  if (!nonEmpty(input.occurrenceId) || !Number.isInteger(input.version) || input.version < 1 || !validDate(input.effectiveDate)) throw new Error("invalid_class");
  validateKittyEnrollments([input.enrollment]);
  const { data, error } = await client.rpc("add_kitty_class_enrollment", {
    p_occurrence_id: input.occurrenceId,
    p_expected_version: input.version,
    p_effective_date: input.effectiveDate,
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
  effectiveDate: string;
}) {
  assertAdmin(actor);
  if (!nonEmpty(input.occurrenceId) || !nonEmpty(input.enrollmentId) || !Number.isInteger(input.version) || input.version < 1 || !validDate(input.effectiveDate)) throw new Error("invalid_class");
  const { data, error } = await client.rpc("end_kitty_class_enrollment", {
    p_occurrence_id: input.occurrenceId,
    p_enrollment_id: input.enrollmentId,
    p_expected_version: input.version,
    p_effective_date: input.effectiveDate,
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
  await assertContactMembership(client, input.occurrenceId, actor.contactId);
  const occurrence = await getKittyClassOccurrence(client, actor, input.occurrenceId);
  if (occurrence.version !== input.version || !["scheduled", "change_requested"].includes(occurrence.status)) throw new Error("stale_class");
  const selectionToken = randomBytes(32).toString("hex");
  const selectionTokenDigest = createHash("sha256").update(selectionToken).digest("hex");
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
  const { error } = await client.from("kitty_class_audit_events").insert({
    actor_type: "contact", actor_contact_id: actor.contactId,
    event_type: "occurrence_selection_confirmed", entity_type: "occurrence", entity_id: input.occurrenceId,
    metadata: { occurrenceVersion: input.version, selectionTokenDigest, expiresAt },
  });
  dbError(error);
  return { occurrence, selectionToken, expiresAt };
}

export async function beginKittyClassChange(client: Client, actor: KittyClassActor, input: {
  occurrenceId: string; occurrenceVersion: number; changeType: "cancel" | "reschedule";
  selectionToken: string; reason?: string; proposedStartsAt?: string; proposedEndsAt?: string; proposedTimezone?: string;
}) {
  if (actor.kind !== "contact") throw new Error("contact_required");
  const member = await assertContactMembership(client, input.occurrenceId, actor.contactId);
  const occurrence = await getKittyClassOccurrence(client, actor, input.occurrenceId);
  if (occurrence.version !== input.occurrenceVersion || occurrence.status !== "scheduled") throw new Error("stale_class");
  if (!/^[a-f0-9]{64}$/.test(input.selectionToken)) throw new Error("selection_confirmation_required");
  const selectionTokenDigest = createHash("sha256").update(input.selectionToken).digest("hex");
  const { data: selection } = await client.from("kitty_class_audit_events").select("id")
    .eq("actor_contact_id", actor.contactId).eq("event_type", "occurrence_selection_confirmed")
    .eq("entity_type", "occurrence").eq("entity_id", input.occurrenceId)
    .contains("metadata", { occurrenceVersion: input.occurrenceVersion, selectionTokenDigest })
    .gte("created_at", new Date(Date.now() - 15 * 60_000).toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!selection) throw new Error("selection_confirmation_required");
  const confirms = input.changeType === "cancel" ? member.confirms_cancellation : member.confirms_reschedule;
  if (!confirms || !member.decision_side) throw new Error("change_not_permitted");
  const payload = [input.occurrenceId, input.occurrenceVersion, input.changeType, input.proposedStartsAt ?? "", input.proposedEndsAt ?? "", input.proposedTimezone ?? ""];
  const digest = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  const { data, error } = await client.rpc("request_kitty_class_change", {
    p_occurrence_id: input.occurrenceId, p_change_type: input.changeType,
    p_requested_by: actor.contactId, p_requester_side: member.decision_side,
    p_reason: input.reason ?? null, p_proposed_starts_at: input.proposedStartsAt ?? null,
    p_proposed_ends_at: input.proposedEndsAt ?? null, p_proposed_timezone: input.proposedTimezone ?? null,
    p_payload_digest: digest,
  });
  dbError(error);
  return Array.isArray(data) ? data[0] : data;
}

export async function decideKittyClassChange(client: Client, actor: KittyClassActor, input: {
  requestId: string; requestVersion: number; payloadDigest: string;
  decision: "approved" | "rejected"; providerMessageId?: string;
}) {
  if (actor.kind !== "contact") throw new Error("contact_required");
  const { data, error } = await client.rpc("decide_kitty_class_change", {
    p_request_id: input.requestId, p_request_version: input.requestVersion,
    p_payload_digest: input.payloadDigest, p_decided_by: actor.contactId, p_decision: input.decision,
    p_provider_message_id: input.providerMessageId ?? null,
  });
  dbError(error);
  return Array.isArray(data) ? data[0] : data;
}

export async function proposeKittyClassReplacement(client: Client, actor: KittyClassActor, input: {
  requestId: string; requestVersion: number; payloadDigest: string;
  proposedStartsAt: string; proposedEndsAt: string; proposedTimezone?: string;
}) {
  if (actor.kind !== "contact") throw new Error("contact_required");
  const newDigest = createHash("sha256").update(JSON.stringify([
    input.requestId, input.requestVersion + 1, input.proposedStartsAt, input.proposedEndsAt, input.proposedTimezone ?? "",
  ])).digest("hex");
  const { data, error } = await client.rpc("propose_kitty_class_replacement", {
    p_request_id: input.requestId, p_request_version: input.requestVersion,
    p_payload_digest: input.payloadDigest, p_proposed_by: actor.contactId,
    p_starts_at: input.proposedStartsAt, p_ends_at: input.proposedEndsAt,
    p_timezone: input.proposedTimezone ?? null, p_new_payload_digest: newDigest,
  });
  dbError(error);
  return Array.isArray(data) ? data[0] : data;
}

export async function findMyPendingKittyChanges(client: Client, actor: KittyClassActor, referenceCode?: string) {
  if (actor.kind !== "contact") throw new Error("contact_required");
  const normalizedReference = referenceCode?.replace(/[^a-f0-9]/gi, "").toUpperCase() || null;
  if (normalizedReference && normalizedReference.length !== 6) throw new Error("invalid_payload");
  const { data, error } = await client.rpc("find_my_pending_kitty_class_changes", {
    p_contact_id: actor.contactId, p_reference_code: normalizedReference,
  });
  dbError(error);
  return (data ?? []).map((row: Record<string, unknown>) => ({ ...row, referenceCode: String(row.id).replaceAll("-", "").slice(0, 6).toUpperCase() }));
}

export async function maintainKittyClassState(client: Client) {
  const { data, error } = await client.rpc("maintain_kitty_class_state");
  dbError(error);
  return data as { expiredRequests?: number; reclaimedNotifications?: number } | null;
}

export async function retryKittyClassNotification(client: Client, actor: KittyClassActor, notificationId: string) {
  assertAdmin(actor);
  const { data, error } = await client.rpc("retry_kitty_class_notification", {
    p_notification_id: notificationId, p_profile_id: actor.profileId,
  });
  dbError(error);
  return Array.isArray(data) ? data[0] : data;
}

export async function finalizeKittyClassChange(client: Client, input: { requestId: string; requestVersion: number; payloadDigest: string }) {
  const { data, error } = await client.rpc("finalize_kitty_class_change", {
    p_request_id: input.requestId, p_request_version: input.requestVersion, p_payload_digest: input.payloadDigest,
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

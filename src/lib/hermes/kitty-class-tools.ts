import type { SupabaseClient } from "@supabase/supabase-js";

import { matchKittyOccurrences } from "./kitty-classes";
import { validateKittyEnrollments, type KittyEnrollmentInput } from "./kitty-class-enrollments";
import {
  addKittyClassEnrollment,
  beginKittyClassChange,
  confirmKittyClassSelection,
  correctKittyAttendance,
  createKittyClass,
  createKittyOperationalRelay,
  decideKittyClassChange,
  editKittyClass,
  endKittyClassEnrollment,
  findMyPendingKittyChanges,
  getKittyClassOccurrence,
  listKittyClasses,
  overrideKittyClass,
  proposeKittyClassReplacement,
  recordKittyAttendance,
  type KittyClassActor,
} from "./kitty-class-service";

export const ADMIN_CLASS_ACTIONS = ["preview_class", "create_class", "list_classes", "get_class", "edit_class", "override_class", "add_enrollment", "end_enrollment"] as const;
export const CONTACT_CLASS_ACTIONS = ["find_my_classes", "find_my_pending_changes", "confirm_class_selection", "record_class_attendance", "correct_class_attendance", "relay_class_update", "request_class_change", "decide_class_change", "propose_replacement_time"] as const;
export type KittyClassToolAction = (typeof ADMIN_CLASS_ACTIONS)[number] | (typeof CONTACT_CLASS_ACTIONS)[number];

type Payload = Record<string, unknown>;
type KittyClassToolContext = { clientRequestId?: string };

export function isKittyClassToolAction(value: unknown): value is KittyClassToolAction {
  return typeof value === "string" && ([...ADMIN_CLASS_ACTIONS, ...CONTACT_CLASS_ACTIONS] as string[]).includes(value);
}

function text(payload: Payload, key: string, required = true) {
  const value = payload[key];
  if (typeof value !== "string" || (required && !value.trim()) || value.length > 500) throw new Error("invalid_payload");
  return value.trim();
}

function number(payload: Payload, key: string) {
  const value = payload[key];
  if (!Number.isInteger(value) || Number(value) < 1) throw new Error("invalid_payload");
  return Number(value);
}

function clientRequestId(payload: Payload, fallback?: string) {
  const value = typeof payload.clientRequestId === "string" && payload.clientRequestId.trim()
    ? payload.clientRequestId.trim()
    : fallback?.trim();
  if (!value || value.length > 200) throw new Error("invalid_payload");
  return value;
}

function legacyGroupRoster(payload: Payload) {
  if (!Array.isArray(payload.participants) || payload.participants.length < 2) throw new Error("invalid_payload");
  const participants = payload.participants as Array<Record<string, unknown>>;
  const teachers = participants.filter((participant) => participant?.role === "teacher");
  const students = participants.filter((participant) => participant?.role === "student");
  const family = participants.filter((participant) => participant?.role === "student" || participant?.role === "parent_guardian");
  if (teachers.length !== 1 || students.length !== 1 || family.length !== participants.length - 1
    || teachers[0].decisionSide !== "teacher"
    || family.some((participant) => participant.decisionSide !== "student")) throw new Error("invalid_payload");
  const enrollment = {
    studentContactId: String(students[0].contactId ?? ""),
    contacts: family.map((participant) => ({
      contactId: String(participant.contactId ?? ""),
      role: participant.role as "student" | "parent_guardian",
      receivesNotifications: participant.receivesNotifications,
      confirmsCancellation: participant.confirmsCancellation,
      confirmsReschedule: participant.confirmsReschedule,
    })) as KittyEnrollmentInput["contacts"],
  };
  return {
    teacherContactId: String(teachers[0].contactId ?? ""),
    enrollments: validateKittyEnrollments([enrollment]),
  };
}

export function normalizeKittyClassCreatePayload(payload: Payload, fallbackClientRequestId?: string) {
  const hasLegacyRoster = "participants" in payload;
  const hasNativeRoster = "teacherContactId" in payload || "enrollments" in payload;
  if (hasLegacyRoster && hasNativeRoster) throw new Error("invalid_payload");
  const native = hasNativeRoster && !hasLegacyRoster;
  const roster = native
    ? { teacherContactId: text(payload, "teacherContactId"), enrollments: validateKittyEnrollments(payload.enrollments as KittyEnrollmentInput[]) }
    : legacyGroupRoster(payload);
  return {
    kind: payload.kind === "weekly" ? "weekly" as const : "one_off" as const,
    title: text(payload, "title"), subject: typeof payload.subject === "string" ? payload.subject : null,
    timezone: text(payload, "timezone"), startsAt: typeof payload.startsAt === "string" ? payload.startsAt : undefined,
    endsAt: typeof payload.endsAt === "string" ? payload.endsAt : undefined,
    localDate: typeof payload.localDate === "string" ? payload.localDate : undefined,
    recurrence: payload.recurrence,
    durationMinutes: typeof payload.durationMinutes === "number" ? payload.durationMinutes : undefined,
    effectiveStart: typeof payload.effectiveStart === "string" ? payload.effectiveStart : undefined,
    effectiveEnd: typeof payload.effectiveEnd === "string" ? payload.effectiveEnd : null,
    teacherContactId: roster.teacherContactId,
    enrollments: roster.enrollments,
    clientRequestId: clientRequestId(payload, fallbackClientRequestId),
  };
}

export async function executeKittyClassTool(
  client: SupabaseClient,
  actor: KittyClassActor,
  action: KittyClassToolAction,
  payload: Payload,
  context: KittyClassToolContext = {},
) {
  const isAdminAction = (ADMIN_CLASS_ACTIONS as readonly string[]).includes(action);
  const isContactAction = (CONTACT_CLASS_ACTIONS as readonly string[]).includes(action);
  if ((isAdminAction && actor.kind !== "admin") || (isContactAction && actor.kind !== "contact")) throw new Error("action_not_allowed");

  switch (action) {
    case "preview_class": {
      const input = normalizeKittyClassCreatePayload(payload, context.clientRequestId);
      return { preview: input, requiresConfirmation: true, saved: false };
    }
    case "create_class": return { class: await createKittyClass(client, actor, normalizeKittyClassCreatePayload(payload, context.clientRequestId)) };
    case "list_classes": return { classes: await listKittyClasses(client, actor, { view: payload.view === "history" || payload.view === "attention" ? payload.view : "upcoming", limit: typeof payload.limit === "number" ? payload.limit : 50 }) };
    case "get_class": return { class: await getKittyClassOccurrence(client, actor, text(payload, "occurrenceId")) };
    case "edit_class": return { class: await editKittyClass(client, actor, {
      id: text(payload, "id"), version: number(payload, "version"),
      scope: payload.scope === "this_and_future" || payload.scope === "entire_series" ? payload.scope : "occurrence",
      title: typeof payload.title === "string" ? payload.title : undefined,
      subject: typeof payload.subject === "string" || payload.subject === null ? payload.subject : undefined,
    }) };
    case "override_class": return { class: await overrideKittyClass(client, actor, {
      occurrenceId: text(payload, "occurrenceId"), changeType: payload.changeType === "reschedule" ? "reschedule" : "cancel",
      reason: text(payload, "overrideReason"), startsAt: typeof payload.startsAt === "string" ? payload.startsAt : undefined,
      endsAt: typeof payload.endsAt === "string" ? payload.endsAt : undefined, timezone: typeof payload.timezone === "string" ? payload.timezone : undefined,
    }) };
    case "add_enrollment": {
      if (!payload.enrollment || typeof payload.enrollment !== "object" || Array.isArray(payload.enrollment)) throw new Error("invalid_payload");
      return { class: await addKittyClassEnrollment(client, actor, {
        occurrenceId: text(payload, "occurrenceId"), version: number(payload, "version"),
        effectiveDate: text(payload, "effectiveDate"), enrollment: payload.enrollment as KittyEnrollmentInput,
      }) };
    }
    case "end_enrollment": return { class: await endKittyClassEnrollment(client, actor, {
      occurrenceId: text(payload, "occurrenceId"), enrollmentId: text(payload, "enrollmentId"),
      version: number(payload, "version"), effectiveDate: text(payload, "effectiveDate"),
    }) };
    case "find_my_classes": {
      const classes = await listKittyClasses(client, actor, { view: "upcoming", limit: 100 });
      return { classes: matchKittyOccurrences({ candidates: classes as Parameters<typeof matchKittyOccurrences>[0]["candidates"], referenceDate: text(payload, "referenceDate"), query: typeof payload.query === "string" ? payload.query : "", limit: 5 }), requiresSelectionConfirmation: true };
    }
    case "find_my_pending_changes": return { changeRequests: await findMyPendingKittyChanges(client, actor, typeof payload.referenceCode === "string" ? payload.referenceCode : undefined) };
    case "confirm_class_selection": return { confirmation: await confirmKittyClassSelection(client, actor, { occurrenceId: text(payload, "occurrenceId"), version: number(payload, "occurrenceVersion") }), confirmed: true };
    case "record_class_attendance": return { attendance: await recordKittyAttendance(client, actor, {
      occurrenceId: text(payload, "occurrenceId"), enrollmentId: text(payload, "enrollmentId"),
      status: payload.status as Parameters<typeof recordKittyAttendance>[2]["status"],
      estimatedAt: typeof payload.estimatedAt === "string" ? payload.estimatedAt : undefined,
      note: typeof payload.note === "string" ? payload.note : undefined,
      selectionToken: text(payload, "selectionToken"), clientRequestId: clientRequestId(payload, context.clientRequestId),
    }) };
    case "correct_class_attendance": return { attendance: await correctKittyAttendance(client, actor, {
      attendanceId: text(payload, "attendanceId"), occurrenceId: text(payload, "occurrenceId"),
      enrollmentId: text(payload, "enrollmentId"),
      status: payload.status as Parameters<typeof correctKittyAttendance>[2]["status"],
      estimatedAt: typeof payload.estimatedAt === "string" ? payload.estimatedAt : undefined,
      note: typeof payload.note === "string" ? payload.note : undefined,
      selectionToken: text(payload, "selectionToken"), clientRequestId: clientRequestId(payload, context.clientRequestId),
    }) };
    case "relay_class_update": return { relay: await createKittyOperationalRelay(client, actor, {
      occurrenceId: text(payload, "occurrenceId"),
      enrollmentId: typeof payload.enrollmentId === "string" ? payload.enrollmentId : undefined,
      intent: payload.intent as Parameters<typeof createKittyOperationalRelay>[2]["intent"],
      estimatedAt: typeof payload.estimatedAt === "string" ? payload.estimatedAt : undefined,
      mode: payload.mode as Parameters<typeof createKittyOperationalRelay>[2]["mode"],
      locationLabel: typeof payload.locationLabel === "string" ? payload.locationLabel : undefined,
      preparationCategory: payload.preparationCategory as Parameters<typeof createKittyOperationalRelay>[2]["preparationCategory"],
      selectionToken: text(payload, "selectionToken"), clientRequestId: clientRequestId(payload, context.clientRequestId),
    }) };
    case "request_class_change": {
      const occurrenceId = text(payload, "occurrenceId");
      const occurrenceVersion = number(payload, "occurrenceVersion");
      const changeType = payload.changeType === "reschedule" ? "reschedule" : "cancel";
      if (payload.scope !== "individual_reschedule" && payload.scope !== "whole_occurrence") throw new Error("invalid_payload");
      const changeRequest = await beginKittyClassChange(client, actor, {
        occurrenceId, occurrenceVersion, changeType, scope: payload.scope,
        enrollmentId: typeof payload.enrollmentId === "string" ? payload.enrollmentId : undefined,
        selectionToken: text(payload, "selectionToken"),
        clientRequestId: clientRequestId(payload, context.clientRequestId),
        proposedStartsAt: typeof payload.proposedStartsAt === "string" ? payload.proposedStartsAt : undefined,
        proposedEndsAt: typeof payload.proposedEndsAt === "string" ? payload.proposedEndsAt : undefined,
        proposedTimezone: typeof payload.proposedTimezone === "string" ? payload.proposedTimezone : undefined,
      });
      return {
        changeRequest,
        counterpartyNotificationReserved: changeRequest.status !== "finalized",
        finalNotificationsReserved: changeRequest.status === "finalized",
      };
    }
    case "propose_replacement_time": return { changeRequest: await proposeKittyClassReplacement(client, actor, {
      requestId: text(payload, "requestId"), requestVersion: number(payload, "requestVersion"),
      payloadDigest: text(payload, "payloadDigest"),
      proposedStartsAt: text(payload, "proposedStartsAt"), proposedEndsAt: text(payload, "proposedEndsAt"),
      proposedTimezone: typeof payload.proposedTimezone === "string" ? payload.proposedTimezone : undefined,
      clientRequestId: clientRequestId(payload, context.clientRequestId),
    }), counterpartyNotificationReserved: true };
    case "decide_class_change": {
      const decided = await decideKittyClassChange(client, actor, {
        requestId: text(payload, "requestId"), requestVersion: number(payload, "requestVersion"),
        payloadDigest: text(payload, "payloadDigest"),
        decision: payload.decision === "approved" ? "approved" : "rejected",
        providerMessageId: typeof payload.providerMessageId === "string" ? payload.providerMessageId : undefined,
        clientRequestId: clientRequestId(payload, context.clientRequestId),
      });
      return { changeRequest: decided, finalNotificationsReserved: decided.status === "finalized" };
    }
  }
}

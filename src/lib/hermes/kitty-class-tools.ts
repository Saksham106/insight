import type { SupabaseClient } from "@supabase/supabase-js";

import { matchKittyOccurrences } from "./kitty-classes";
import {
  beginKittyClassChange,
  confirmKittyClassSelection,
  createKittyClass,
  decideKittyClassChange,
  editKittyClass,
  findMyPendingKittyChanges,
  getKittyClassOccurrence,
  listKittyClasses,
  overrideKittyClass,
  proposeKittyClassReplacement,
  type KittyClassActor,
  type KittyClassParticipantInput,
} from "./kitty-class-service";

export const ADMIN_CLASS_ACTIONS = ["preview_class", "create_class", "list_classes", "get_class", "edit_class", "override_class"] as const;
export const CONTACT_CLASS_ACTIONS = ["find_my_classes", "find_my_pending_changes", "confirm_class_selection", "request_class_change", "decide_class_change", "propose_replacement_time"] as const;
export type KittyClassToolAction = (typeof ADMIN_CLASS_ACTIONS)[number] | (typeof CONTACT_CLASS_ACTIONS)[number];

type Payload = Record<string, unknown>;

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

function adminCreateInput(payload: Payload) {
  if (!Array.isArray(payload.participants)) throw new Error("invalid_payload");
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
    participants: payload.participants as KittyClassParticipantInput[],
  };
}

export async function executeKittyClassTool(client: SupabaseClient, actor: KittyClassActor, action: KittyClassToolAction, payload: Payload) {
  const isAdminAction = (ADMIN_CLASS_ACTIONS as readonly string[]).includes(action);
  const isContactAction = (CONTACT_CLASS_ACTIONS as readonly string[]).includes(action);
  if ((isAdminAction && actor.kind !== "admin") || (isContactAction && actor.kind !== "contact")) throw new Error("action_not_allowed");

  switch (action) {
    case "preview_class": {
      const input = adminCreateInput(payload);
      return { preview: input, requiresConfirmation: true, saved: false };
    }
    case "create_class": return { class: await createKittyClass(client, actor, adminCreateInput(payload)) };
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
    case "find_my_classes": {
      const classes = await listKittyClasses(client, actor, { view: "upcoming", limit: 100 });
      return { classes: matchKittyOccurrences({ candidates: classes as Parameters<typeof matchKittyOccurrences>[0]["candidates"], referenceDate: text(payload, "referenceDate"), query: typeof payload.query === "string" ? payload.query : "", limit: 5 }), requiresSelectionConfirmation: true };
    }
    case "find_my_pending_changes": return { changeRequests: await findMyPendingKittyChanges(client, actor, typeof payload.referenceCode === "string" ? payload.referenceCode : undefined) };
    case "confirm_class_selection": return { confirmation: await confirmKittyClassSelection(client, actor, { occurrenceId: text(payload, "occurrenceId"), version: number(payload, "occurrenceVersion") }), confirmed: true };
    case "request_class_change": {
      const occurrenceId = text(payload, "occurrenceId");
      const occurrenceVersion = number(payload, "occurrenceVersion");
      const changeType = payload.changeType === "reschedule" ? "reschedule" : "cancel";
      return { changeRequest: await beginKittyClassChange(client, actor, {
        occurrenceId, occurrenceVersion, changeType, selectionToken: text(payload, "selectionToken"),
        reason: typeof payload.reason === "string" ? payload.reason : undefined,
        proposedStartsAt: typeof payload.proposedStartsAt === "string" ? payload.proposedStartsAt : undefined,
        proposedEndsAt: typeof payload.proposedEndsAt === "string" ? payload.proposedEndsAt : undefined,
        proposedTimezone: typeof payload.proposedTimezone === "string" ? payload.proposedTimezone : undefined,
      }), counterpartyNotificationReserved: true };
    }
    case "propose_replacement_time": return { changeRequest: await proposeKittyClassReplacement(client, actor, {
      requestId: text(payload, "requestId"), requestVersion: number(payload, "requestVersion"),
      payloadDigest: text(payload, "payloadDigest"),
      proposedStartsAt: text(payload, "proposedStartsAt"), proposedEndsAt: text(payload, "proposedEndsAt"),
      proposedTimezone: typeof payload.proposedTimezone === "string" ? payload.proposedTimezone : undefined,
    }), counterpartyNotificationReserved: true };
    case "decide_class_change": {
      const decided = await decideKittyClassChange(client, actor, {
        requestId: text(payload, "requestId"), requestVersion: number(payload, "requestVersion"),
        payloadDigest: text(payload, "payloadDigest"),
        decision: payload.decision === "approved" ? "approved" : "rejected",
        providerMessageId: typeof payload.providerMessageId === "string" ? payload.providerMessageId : undefined,
      });
      return { changeRequest: decided, finalNotificationsReserved: decided.status === "finalized" };
    }
  }
}

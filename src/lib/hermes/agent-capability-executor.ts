import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { AgentActor } from "./agent-capability-types";
import { executeKittyClassTool } from "./kitty-class-tools";

function dbError(error: { message?: string } | null) {
  if (!error) return;
  if (error.message?.includes("client_request_payload_mismatch")) throw new Error("client_request_payload_mismatch");
  throw new Error("capability_execution_unavailable");
}

function idempotencyKey(clientRequestId: string) {
  return clientRequestId.length <= 194
    ? `agent:${clientRequestId}`
    : `agent:${createHash("sha256").update(clientRequestId).digest("hex")}`;
}

function projectOccurrence(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    title: String(row.title),
    startsAt: String(row.starts_at),
    endsAt: String(row.ends_at),
    localDate: String(row.local_date),
    timezone: String(row.timezone),
    status: String(row.status),
    version: Number(row.version),
  };
}

export async function executeAgentCapability(
  client: SupabaseClient,
  actor: AgentActor,
  action: {
    capabilityName: string;
    capabilityVersion: number;
    normalizedInput: Record<string, unknown>;
    clientRequestId: string;
  },
): Promise<Record<string, unknown>> {
  if (action.capabilityVersion !== 1) throw new Error("capability_not_executable");
  const input = action.normalizedInput;
  switch (action.capabilityName) {
    case "class.reminder.send": {
      const { data, error } = await client.from("kitty_class_notification_outbox").insert({
        occurrence_id: String(input.occurrenceId),
        contact_id: String(input.recipientId),
        intent: "class_reminder",
        payload: {},
        idempotency_key: idempotencyKey(action.clientRequestId),
      }).select("id, status").maybeSingle();
      dbError(error);
      if (!data) throw new Error("capability_execution_unavailable");
      return { reservationId: String(data.id), status: String(data.status) };
    }
    case "class.one_off.create": {
      const studentContactIds = input.studentContactIds as string[];
      const { data, error } = await client.rpc("create_kitty_group_one_off", {
        p_title: String(input.title),
        p_subject: input.subject ? String(input.subject) : null,
        p_starts_at: String(input.startsAt),
        p_ends_at: String(input.endsAt),
        p_local_date: String(input.localDate),
        p_timezone: String(input.timezone),
        p_origin_channel: actor.kind === "admin" ? actor.channel : "imessage",
        p_created_by: actor.kind === "admin" ? actor.profileId : null,
        p_teacher_contact_id: String(input.teacherContactId),
        p_enrollments: studentContactIds.map((studentContactId) => ({
          studentContactId,
          contacts: [{
            contactId: studentContactId,
            role: "student",
            receivesNotifications: true,
            confirmsCancellation: true,
            confirmsReschedule: true,
          }],
        })),
        p_client_request_id: action.clientRequestId,
      });
      dbError(error);
      const occurrence = Array.isArray(data) ? data[0] : data;
      if (!occurrence) throw new Error("capability_execution_unavailable");
      return { class: projectOccurrence(occurrence as Record<string, unknown>) };
    }
    case "class.attendance.record":
      return executeKittyClassTool(client, actor, "record_class_attendance", {
        ...input,
        clientRequestId: action.clientRequestId,
      });
    case "class.reschedule.request":
      return executeKittyClassTool(client, actor, "request_class_change", {
        ...input,
        changeType: "reschedule",
        occurrenceVersion: Number(input.occurrenceVersion),
        clientRequestId: action.clientRequestId,
      });
    default:
      throw new Error("capability_not_executable");
  }
}

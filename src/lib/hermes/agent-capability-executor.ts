import { createHash, createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { AgentActor } from "./agent-capability-types";
import { manageAgentRoutine } from "./agent-routines";
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

function feeStatementToken(clientRequestId: string) {
  const secret = process.env.HERMES_ACTION_TOKEN_SECRET ?? process.env.HERMES_EVALUATION_SECRET;
  if (!secret || secret.length < 32) throw new Error("capability_execution_unavailable");
  return createHmac("sha256", secret)
    .update(`fee-statement:v1:${clientRequestId}`, "utf8")
    .digest()
    .subarray(0, 24)
    .toString("base64url");
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
    case "fee_statement.create": {
      if (actor.kind !== "admin") throw new Error("capability_not_executable");
      // Stable for one request ID so an uncertain RPC retry returns the same usable bearer URL.
      const publicToken = feeStatementToken(action.clientRequestId);
      const publicTokenHash = createHash("sha256").update(publicToken, "utf8").digest("hex");
      const { data, error } = await client.rpc("create_academy_fee_statement", {
        p_public_token_hash: publicTokenHash,
        p_student_name: String(input.studentName),
        p_billed_to_name: input.billedToName ? String(input.billedToName) : null,
        p_period_start: String(input.periodStart),
        p_period_end: String(input.periodEnd),
        p_due_date: input.dueDate ? String(input.dueDate) : null,
        p_currency: String(input.currency),
        p_total_minor: Number(input.totalMinor),
        p_line_items: input.lineItems,
        p_source_channel: actor.channel,
        p_actor_profile_id: actor.profileId,
        p_client_request_id: action.clientRequestId,
      });
      dbError(error);
      const statement = Array.isArray(data) ? data[0] : data;
      if (!statement) throw new Error("capability_execution_unavailable");
      const record = statement as Record<string, unknown>;
      const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
      return {
        statementId: String(record.id),
        statementReference: String(record.statement_reference),
        status: String(record.status),
        publicUrl: `${appUrl}/statement/${publicToken}`,
      };
    }
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
    case "routine.manage":
      return manageAgentRoutine(client, actor, input);
    default:
      throw new Error("capability_not_executable");
  }
}

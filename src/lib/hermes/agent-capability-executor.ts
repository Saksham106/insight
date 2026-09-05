import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { formatMinorCurrency } from "../format-minor-currency";
import type { AgentActor } from "./agent-capability-types";
import { manageAgentRoutine } from "./agent-routines";
import { feeStatementPublicUrl } from "./fee-statement-link";
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

function exactIlikePattern(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

function feeStatementMonthLabel(periodStart: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${periodStart.slice(0, 7)}-01T00:00:00Z`));
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
      const publicLink = feeStatementPublicUrl(action.clientRequestId);
      const { data, error } = await client.rpc("create_academy_fee_statement", {
        p_public_token_hash: publicLink.tokenHash,
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
        p_actor_identifier_hash: actor.externalIdHash ?? null,
        p_client_request_id: action.clientRequestId,
      });
      if (error?.message?.includes("client_request_payload_mismatch")) dbError(error);
      let statement = Array.isArray(data) ? data[0] : data;
      if (error && !statement) {
        const recovered = await client
          .from("academy_fee_statements")
          .select("id, statement_reference, status, replaces_statement_id")
          .eq("client_request_id", action.clientRequestId)
          .eq("public_token_hash", publicLink.tokenHash)
          .maybeSingle();
        if (recovered.error) throw new Error("capability_execution_uncertain");
        statement = recovered.data;
      }
      if (!statement) dbError(error);
      if (!statement) throw new Error("capability_execution_unavailable");
      const record = statement as Record<string, unknown>;
      return {
        statementId: String(record.id),
        statementReference: String(record.statement_reference),
        status: String(record.status),
        publicUrl: publicLink.url,
      };
    }
    case "fee_statement.replace": {
      if (actor.kind !== "admin") throw new Error("capability_not_executable");
      const publicLink = feeStatementPublicUrl(action.clientRequestId);
      const { data, error } = await client.rpc("replace_academy_fee_statement", {
        p_statement_id: input.statementId ? String(input.statementId) : null,
        p_correction_reason: String(input.correctionReason),
        p_public_token_hash: publicLink.tokenHash,
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
        p_actor_identifier_hash: actor.externalIdHash ?? null,
        p_client_request_id: action.clientRequestId,
      });
      if (error?.message?.includes("client_request_payload_mismatch")) dbError(error);
      let statement = Array.isArray(data) ? data[0] : data;
      if (error && !statement) {
        const recovered = await client
          .from("academy_fee_statements")
          .select("id, statement_reference, status, replaces_statement_id")
          .eq("client_request_id", action.clientRequestId)
          .eq("public_token_hash", publicLink.tokenHash)
          .maybeSingle();
        if (recovered.error) throw new Error("capability_execution_uncertain");
        statement = recovered.data;
      }
      if (!statement) dbError(error);
      if (!statement) throw new Error("capability_execution_unavailable");
      const record = statement as Record<string, unknown>;
      return {
        statementId: String(record.id),
        statementReference: String(record.statement_reference),
        status: String(record.status),
        publicUrl: publicLink.url,
        replacedStatementId: String(record.replaces_statement_id),
      };
    }
    case "fee_statement.lookup": {
      if (actor.kind !== "admin") throw new Error("capability_not_executable");
      let query = client
        .from("academy_fee_statements")
        .select("id, statement_reference, status, student_name, billed_to_name, period_start, period_end, currency, total_minor, client_request_id, public_token_hash, issued_at");
      query = input.statementId
        ? query.eq("id", String(input.statementId))
        : query.ilike("student_name", exactIlikePattern(String(input.studentName)));
      query = query
        .in("status", ["published", "paid"])
        .order("period_start", { ascending: false })
        .order("issued_at", { ascending: false });
      if (input.periodStart) query = query.eq("period_start", String(input.periodStart));
      const { data, error } = await query.limit(3);
      dbError(error);
      const rows = (data ?? []) as Array<Record<string, unknown>>;
      if (rows.length === 0) throw new Error("fee_statement_not_found");
      if (rows.length > 1 && (input.periodStart || rows[0].period_start === rows[1].period_start)) {
        throw new Error("fee_statement_lookup_ambiguous");
      }

      const statement = rows[0];
      const publicLink = feeStatementPublicUrl(String(statement.client_request_id));
      if (publicLink.tokenHash !== statement.public_token_hash) {
        throw new Error("fee_statement_link_unrecoverable");
      }
      const studentName = String(statement.student_name);
      const periodStart = String(statement.period_start);
      const status = String(statement.status);
      const totalMinor = Number(statement.total_minor);
      const currency = String(statement.currency);
      const amount = formatMinorCurrency(totalMinor, currency);
      const paymentSummary = status === "paid"
        ? `The total is ${amount}, and it has been marked paid`
        : `The total due is ${amount}`;
      return {
        statementId: String(statement.id),
        statementReference: String(statement.statement_reference),
        studentName,
        billedToName: statement.billed_to_name ? String(statement.billed_to_name) : null,
        periodStart,
        periodEnd: String(statement.period_end),
        totalMinor,
        currency,
        status,
        publicUrl: publicLink.url,
        whatsappMessage: `Hi, here is ${studentName}'s fee statement for ${feeStatementMonthLabel(periodStart)}. ${paymentSummary}: ${publicLink.url}`,
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

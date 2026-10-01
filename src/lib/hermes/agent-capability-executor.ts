import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { formatMinorCurrency } from "../format-minor-currency";
import type { AgentActor } from "./agent-capability-types";
import { manageAgentRoutine } from "./agent-routines";
import { feeStatementPublicUrl } from "./fee-statement-link";
import { attachFeeStatementBalances } from "./fee-statement-admin";
import { feeStatementWhatsAppMessage } from "./fee-statement-whatsapp";
import { executeKittyClassTool } from "./kitty-class-tools";
import type { KittyClassActor } from "./kitty-class-service";

function dbError(error: { message?: string } | null) {
  if (!error) return;
  if (error.message?.includes("client_request_payload_mismatch")) throw new Error("client_request_payload_mismatch");
  throw new Error("capability_execution_unavailable");
}

function adjustmentError(error: { message?: string; code?: string }) {
  const message = error.message ?? "";
  if (/network|timeout|fetch/i.test(message)) throw new Error("capability_execution_uncertain");
  if (error.code === "23505") throw new Error("fee_statement_adjustment_duplicate_reference");
  const guards: Record<string, string> = {
    stale_fee_statement_adjustments: "fee_statement_adjustment_stale",
    advance_exceeds_current_due: "fee_statement_adjustment_exceeds_balance",
    fee_statement_ineligible: "fee_statement_adjustment_forbidden",
    ineligible_fee_statement_actor: "fee_statement_adjustment_forbidden",
    fee_statement_adjustment_limit: "fee_statement_adjustment_limit",
    invalid_fee_statement_balance: "invalid_fee_statement_balance",
    fee_statement_not_found: "fee_statement_not_found",
  };
  for (const [source, code] of Object.entries(guards)) if (message.includes(source)) throw new Error(code);
  dbError(error);
}

function adjustmentRequestUuid(actor: AgentActor, requestId: string) {
  const identity = actor.kind === "contact" ? actor.contactId : `${actor.channel}:${actor.profileId ?? actor.externalIdHash ?? "primary"}`;
  const bytes = createHash("sha256").update(`fee-statement-adjustment:v1:${identity}:${requestId}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
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
  }).format(new Date(periodStart.slice(0, 7) + "-01T00:00:00Z"));
}

function kittyActor(actor: AgentActor): KittyClassActor {
  if (actor.kind === "contact") return { kind: "contact", contactId: actor.contactId, channel: "whatsapp" };
  if (actor.channel === "agent_profile") throw new Error("capability_not_executable");
  return { kind: "admin", profileId: actor.profileId, channel: actor.channel };
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
  if (actor.kind === "admin" && actor.channel === "agent_profile"
    && !["fee_statement.create", "fee_statement.lookup", "fee_statement.adjust"].includes(action.capabilityName)) throw new Error("capability_not_executable");
  const input = action.normalizedInput;
  switch (action.capabilityName) {
    case "fee_statement.lookup": {
      if (actor.kind !== "admin") throw new Error("capability_not_executable");
      if (actor.channel === "agent_profile") {
        const { data, error } = await client.from("academy_fee_statements")
          .select("id, statement_reference, status, student_name, billed_to_name, period_start, period_end, currency, total_minor, client_request_id, public_token_hash, issued_at, adjustment_rows:academy_fee_statement_adjustments(id,kind,label,amount_minor,created_at)")
          .eq("student_name", String(input.studentName))
          .eq("period_start", String(input.periodStart))
          .order("issued_at", { ascending: false })
          .limit(11);
        dbError(error);
        const rows = attachFeeStatementBalances(data ?? []);
        return {
          statements: rows.slice(0, 10).map((row) => {
            const status = String(row.status);
            const published = status === "published" || status === "paid";
            const link = published ? feeStatementPublicUrl(String(row.client_request_id)) : null;
            if (link && link.tokenHash !== row.public_token_hash) throw new Error("fee_statement_link_unrecoverable");
            const periodStart = String(row.period_start);
            const currency = String(row.currency);
            const balance = row.balance;
            const amount = formatMinorCurrency(balance.amountDueMinor, currency);
            return ({
            statementId: String(row.id), statementReference: String(row.statement_reference),
            status, studentName: String(row.student_name),
            billedToName: row.billed_to_name == null ? null : String(row.billed_to_name),
            periodStart, periodEnd: String(row.period_end),
            currency, totalMinor: Number(row.total_minor), issuedAt: String(row.issued_at),
            amountDueMinor: balance.amountDueMinor, balance,
            ...(link ? { publicUrl: link.url, whatsappMessage: feeStatementWhatsAppMessage({ studentName: String(row.student_name), month: feeStatementMonthLabel(periodStart), amount, url: link.url, status, nothingToPay: balance.amountDueMinor === 0 }) } : {}),
          }); }),
          hasMore: rows.length > 10,
        };
      }
      let query = client.from("academy_fee_statements")
        .select("id, statement_reference, status, student_name, billed_to_name, period_start, period_end, currency, total_minor, client_request_id, public_token_hash, issued_at, adjustment_rows:academy_fee_statement_adjustments(id,kind,label,amount_minor,created_at)");
      query = input.statementId
        ? query.eq("id", String(input.statementId))
        : query.ilike("student_name", exactIlikePattern(String(input.studentName)));
      query = query.in("status", ["published", "paid"])
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
      if (publicLink.tokenHash !== statement.public_token_hash) throw new Error("fee_statement_link_unrecoverable");
      const studentName = String(statement.student_name);
      const periodStart = String(statement.period_start);
      const status = String(statement.status);
      const totalMinor = Number(statement.total_minor);
      const currency = String(statement.currency);
      const [{ balance }] = attachFeeStatementBalances([{ total_minor: totalMinor, adjustment_rows: statement.adjustment_rows as Record<string, unknown>[] | undefined }]);
      const amount = formatMinorCurrency(balance.amountDueMinor, currency);
      const paymentSummary = status === "paid"
        ? `The total is ${amount}, and it has been marked paid`
        : `The total due is ${amount}`;
      return {
        statementId: String(statement.id), statementReference: String(statement.statement_reference),
        studentName, billedToName: statement.billed_to_name ? String(statement.billed_to_name) : null,
        periodStart, periodEnd: String(statement.period_end), totalMinor, currency, status,
        publicUrl: publicLink.url,
        ...(balance.version ? { amountDueMinor: balance.amountDueMinor, balance } : {}),
        whatsappMessage: balance.version
          ? feeStatementWhatsAppMessage({ studentName, month: feeStatementMonthLabel(periodStart), amount, url: publicLink.url, status, nothingToPay: balance.amountDueMinor === 0 })
          : `Hi, here is ${studentName}'s fee statement for ${feeStatementMonthLabel(periodStart)}. ${paymentSummary}: ${publicLink.url}`,
      };
    }
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
    case "fee_statement.adjust": {
      if (actor.kind !== "admin") throw new Error("capability_not_executable");
      const profileId = actor.profileId ?? (["agent_profile", "imessage"].includes(actor.channel) ? process.env.HERMES_ADMIN_PROFILE_ID : undefined);
      if (!profileId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(profileId)) throw new Error("fee_statement_adjustment_forbidden");
      const requestId = adjustmentRequestUuid(actor, action.clientRequestId);
      let rpcResult: Awaited<ReturnType<typeof client.rpc>>;
      try {
        rpcResult = await client.rpc("add_academy_fee_statement_adjustment", {
          p_statement_id: String(input.statementId), p_kind: String(input.kind), p_label: String(input.label),
          p_amount_minor: Number(input.amountMinor), p_reference: String(input.reference), p_expected_version: Number(input.expectedVersion),
          p_client_request_id: requestId, p_actor_profile_id: profileId,
        });
      } catch {
        throw new Error("capability_execution_uncertain");
      }
      const { data, error } = rpcResult;
      if (error) adjustmentError(error);
      const adjustment = Array.isArray(data) ? data[0] : data;
      if (!adjustment || typeof adjustment.id !== "string") throw new Error("capability_execution_uncertain");
      const { data: verified, error: readError } = await client.from("academy_fee_statement_adjustments")
        .select("id,statement_id,kind,label,amount_minor,reference,actor_profile_id,client_request_id").eq("id", String(adjustment.id))
        .eq("statement_id", String(input.statementId)).eq("kind", String(input.kind))
        .eq("label", String(input.label)).eq("amount_minor", Number(input.amountMinor))
        .eq("reference", String(input.reference)).eq("actor_profile_id", profileId).eq("client_request_id", requestId).maybeSingle();
      if (readError || !verified) throw new Error("capability_execution_uncertain");
      const { data: statement, error: statementError } = await client.from("academy_fee_statements")
        .select("id,statement_reference,status,student_name,period_start,currency,total_minor,client_request_id,public_token_hash,adjustment_rows:academy_fee_statement_adjustments(id,kind,label,amount_minor,created_at)")
        .eq("id", String(input.statementId)).maybeSingle();
      if (statementError || !statement) throw new Error("capability_execution_uncertain");
      if (!["published", "paid"].includes(String(statement.status))) throw new Error("fee_statement_adjustment_forbidden");
      const link = feeStatementPublicUrl(String(statement.client_request_id));
      if (link.tokenHash !== statement.public_token_hash) throw new Error("fee_statement_link_unrecoverable");
      const [withBalance] = attachFeeStatementBalances([statement]);
      const balance = withBalance.balance;
      const amount = formatMinorCurrency(balance.amountDueMinor, String(statement.currency));
      return { statementId: String(input.statementId), adjustmentId: String(verified.id),
        statementReference: String(statement.statement_reference), kind: String(verified.kind),
        label: String(verified.label), amountMinor: Number(verified.amount_minor), currency: String(statement.currency),
        balance, amountDueMinor: balance.amountDueMinor, publicUrl: link.url,
        whatsappMessage: feeStatementWhatsAppMessage({ studentName: String(statement.student_name), month: feeStatementMonthLabel(String(statement.period_start)), amount, url: link.url, status: String(statement.status), nothingToPay: balance.amountDueMinor === 0 }) };
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
      const [{ balance }] = attachFeeStatementBalances([{ total_minor: totalMinor, adjustment_rows: statement.adjustment_rows as Record<string, unknown>[] | undefined }]);
      const amount = formatMinorCurrency(balance.amountDueMinor, currency);
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
        ...(balance.version ? { amountDueMinor: balance.amountDueMinor, balance } : {}),
        whatsappMessage: balance.version
          ? feeStatementWhatsAppMessage({ studentName, month: feeStatementMonthLabel(periodStart), amount, url: publicLink.url, status, nothingToPay: balance.amountDueMinor === 0 })
          : `Hi, here is ${studentName}'s fee statement for ${feeStatementMonthLabel(periodStart)}. ${paymentSummary}: ${publicLink.url}`,
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
      return executeKittyClassTool(client, kittyActor(actor), "record_class_attendance", {
        ...input,
        clientRequestId: action.clientRequestId,
      });
    case "class.reschedule.request":
      return executeKittyClassTool(client, kittyActor(actor), "request_class_change", {
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

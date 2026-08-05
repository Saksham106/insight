import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { expandKittySeries, parseKittyRecurrence } from "./kitty-classes";

export type KittyClassActor =
  | { kind: "admin"; profileId: string | null; channel: "dashboard" | "imessage" }
  | { kind: "contact"; contactId: string; channel: "whatsapp" };

export type KittyClassParticipantInput = {
  contactId: string;
  role: "teacher" | "student" | "parent_guardian" | "observer";
  receivesNotifications: boolean;
  confirmsCancellation: boolean;
  confirmsReschedule: boolean;
  decisionSide: "teacher" | "student" | null;
};

type Client = SupabaseClient;

function assertAdmin(actor: KittyClassActor): asserts actor is Extract<KittyClassActor, { kind: "admin" }> {
  if (actor.kind !== "admin") throw new Error("admin_required");
}

function dbError(error: { message?: string } | null) {
  if (error) throw new Error("kitty_class_operation_failed");
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

async function assertContactMembership(client: Client, occurrenceId: string, contactId: string) {
  const { data: occurrence, error } = await client
    .from("kitty_class_occurrences")
    .select("id, series_id")
    .eq("id", occurrenceId)
    .maybeSingle();
  dbError(error);
  if (!occurrence) throw new Error("class_not_found");
  let membership = client
    .from("kitty_class_participants")
    .select("contact_id, decision_side, confirms_cancellation, confirms_reschedule")
    .eq("contact_id", contactId)
    .eq("is_active", true);
  membership = occurrence.series_id
    ? membership.or(`occurrence_id.eq.${occurrenceId},series_id.eq.${occurrence.series_id}`)
    : membership.eq("occurrence_id", occurrenceId);
  const { data, error: memberError } = await membership.maybeSingle();
  dbError(memberError);
  if (!data) throw new Error("class_not_found");
  return data;
}

export async function listKittyClasses(client: Client, actor: KittyClassActor, options: {
  view?: "upcoming" | "attention" | "history";
  limit?: number;
} = {}) {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  let allowedOccurrenceIds: string[] | null = null;
  let allowedSeriesIds: string[] = [];
  if (actor.kind === "contact") {
    const { data, error } = await client
      .from("kitty_class_participants")
      .select("occurrence_id, series_id")
      .eq("contact_id", actor.contactId)
      .eq("is_active", true);
    dbError(error);
    allowedOccurrenceIds = (data ?? []).flatMap((row) => row.occurrence_id ? [row.occurrence_id] : []);
    allowedSeriesIds = (data ?? []).flatMap((row) => row.series_id ? [row.series_id] : []);
    if (!allowedOccurrenceIds.length && !allowedSeriesIds.length) return [];
  }

  let query = client
    .from("kitty_class_occurrences")
    .select("id, series_id, title, subject, starts_at, ends_at, local_date, timezone, status, version")
    .order("starts_at", { ascending: options.view !== "history" })
    .limit(limit);
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
  return (data ?? []).map((row) => projectOccurrence(row));
}

export async function getKittyClassOccurrence(client: Client, actor: KittyClassActor, occurrenceId: string) {
  if (actor.kind === "contact") await assertContactMembership(client, occurrenceId, actor.contactId);
  const { data, error } = await client
    .from("kitty_class_occurrences")
    .select("id, series_id, title, subject, starts_at, ends_at, local_date, timezone, status, version")
    .eq("id", occurrenceId)
    .maybeSingle();
  dbError(error);
  if (!data) throw new Error("class_not_found");
  const [participantsResult, changeResult] = await Promise.all([
    client.from("kitty_class_participants")
      .select("contact_id, participant_role, receives_notifications, confirms_cancellation, confirms_reschedule, decision_side, is_active")
      .or(data.series_id ? `occurrence_id.eq.${occurrenceId},series_id.eq.${data.series_id}` : `occurrence_id.eq.${occurrenceId}`),
    client.from("kitty_class_change_requests")
      .select("id, change_type, requester_side, proposed_starts_at, proposed_ends_at, proposed_timezone, status, payload_digest, version, created_at")
      .eq("occurrence_id", occurrenceId)
      .in("status", ["awaiting_requester_confirmation", "awaiting_counterparty", "collecting_alternatives", "ready_to_finalize"])
      .maybeSingle(),
  ]);
  dbError(participantsResult.error);
  dbError(changeResult.error);
  const visibleParticipants = actor.kind === "admin"
    ? participantsResult.data ?? []
    : (participantsResult.data ?? []).map((participant) => ({
        participant_role: participant.participant_role,
        decision_side: participant.decision_side,
        is_active: participant.is_active,
      }));
  return { ...projectOccurrence(data), participants: visibleParticipants, currentChangeRequest: changeResult.data };
}

export async function createKittyClass(client: Client, actor: KittyClassActor, input: {
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
  participants: KittyClassParticipantInput[];
}) {
  assertAdmin(actor);
  if (!input.title.trim() || input.participants.length < 2) throw new Error("invalid_class");
  if (input.kind === "one_off") {
    if (!input.startsAt || !input.endsAt || !input.localDate) throw new Error("invalid_class");
    const key = `one-off:${createHash("sha256").update(`${input.title}:${input.startsAt}`).digest("hex")}`;
    const { data, error } = await client.rpc("create_kitty_one_off_class", {
      p_title: input.title, p_subject: input.subject ?? null, p_starts_at: input.startsAt,
      p_ends_at: input.endsAt, p_local_date: input.localDate, p_timezone: input.timezone,
      p_origin_channel: actor.channel, p_created_by: actor.profileId, p_occurrence_key: key,
    });
    dbError(error);
    const occurrence = Array.isArray(data) ? data[0] : data;
    const { error: participantError } = await client.from("kitty_class_participants").insert(
      input.participants.map((participant) => participantRow(participant, { occurrence_id: occurrence.id })),
    );
    dbError(participantError);
    return projectOccurrence(occurrence);
  }

  const recurrence = parseKittyRecurrence(input.recurrence);
  if (!input.effectiveStart || !input.durationMinutes) throw new Error("invalid_class");
  const { data, error } = await client.rpc("create_kitty_class_series", {
    p_title: input.title, p_subject: input.subject ?? null, p_timezone: input.timezone,
    p_local_time: recurrence.localTime, p_duration_minutes: input.durationMinutes,
    p_weekdays: recurrence.weekdays, p_effective_start: input.effectiveStart,
    p_effective_end: input.effectiveEnd ?? null, p_origin_channel: actor.channel,
    p_created_by: actor.profileId,
  });
  dbError(error);
  const series = Array.isArray(data) ? data[0] : data;
  const { error: participantError } = await client.from("kitty_class_participants").insert(
    input.participants.map((participant) => participantRow(participant, { series_id: series.id })),
  );
  dbError(participantError);
  await expandSingleSeries(client, series, new Date());
  return { id: series.id, kind: "weekly", version: series.version };
}

function participantRow(participant: KittyClassParticipantInput, owner: { series_id?: string; occurrence_id?: string }) {
  return {
    ...owner,
    contact_id: participant.contactId,
    participant_role: participant.role,
    receives_notifications: participant.receivesNotifications,
    confirms_cancellation: participant.confirmsCancellation,
    confirms_reschedule: participant.confirmsReschedule,
    decision_side: participant.decisionSide,
  };
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
  return occurrence;
}

export async function beginKittyClassChange(client: Client, actor: KittyClassActor, input: {
  occurrenceId: string; occurrenceVersion: number; changeType: "cancel" | "reschedule";
  reason?: string; proposedStartsAt?: string; proposedEndsAt?: string; proposedTimezone?: string;
}) {
  if (actor.kind !== "contact") throw new Error("contact_required");
  const member = await assertContactMembership(client, input.occurrenceId, actor.contactId);
  const occurrence = await getKittyClassOccurrence(client, actor, input.occurrenceId);
  if (occurrence.version !== input.occurrenceVersion || occurrence.status !== "scheduled") throw new Error("stale_class");
  const confirms = input.changeType === "cancel" ? member.confirms_cancellation : member.confirms_reschedule;
  if (!confirms || !member.decision_side) throw new Error("change_not_permitted");
  const payload = [input.occurrenceId, input.occurrenceVersion, input.changeType, input.proposedStartsAt ?? "", input.proposedEndsAt ?? ""];
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
  requestId: string; requestVersion: number; payloadDigest: string; occurrenceId: string;
  decision: "approved" | "rejected"; providerMessageId?: string;
}) {
  if (actor.kind !== "contact") throw new Error("contact_required");
  const member = await assertContactMembership(client, input.occurrenceId, actor.contactId);
  if (!member.decision_side) throw new Error("change_not_permitted");
  const { data, error } = await client.rpc("decide_kitty_class_change", {
    p_request_id: input.requestId, p_request_version: input.requestVersion,
    p_payload_digest: input.payloadDigest, p_decision_side: member.decision_side,
    p_decided_by: actor.contactId, p_decision: input.decision,
    p_provider_message_id: input.providerMessageId ?? null,
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
  if (rows.length) {
    const { error } = await client.from("kitty_class_occurrences").upsert(rows.map((row) => ({
      series_id: row.seriesId, occurrence_key: row.occurrenceKey, title: row.title, subject: row.subject,
      starts_at: row.startsAt, ends_at: row.endsAt, local_date: row.localDate, timezone: row.timezone,
      origin_channel: "system",
    })), { onConflict: "occurrence_key", ignoreDuplicates: true });
    dbError(error);
  }
  await client.from("kitty_class_series").update({ expanded_through: through.toISOString().slice(0, 10) }).eq("id", series.id);
  return rows.length;
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

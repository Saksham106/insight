import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getCapability } from "./agent-capabilities";
import type { AgentActor } from "./agent-capability-types";
import { agentActorKey, type AgentActionProposal } from "./agent-actions";
import { buildClassReminderDeliveries } from "./class-reminders";
import { getKittyReminderFacts } from "./kitty-class-service";

type ReminderRoutineInput = {
  routineKey: string;
  capabilityName: string;
  capabilityVersion: number;
  seriesId: string;
  offsetMinutes: number;
  timezone: string;
};

type StoredRoutine = {
  id: string;
  routine_key: string;
  capability_name: string;
  capability_version: number;
  entity_references: { seriesId?: string };
  schedule: { kind?: string; offsetMinutes?: number };
  timezone: string;
  recipient_rule: { kind?: string };
  status: "disabled" | "active" | "paused";
  next_run_at: string | null;
  run_claim_token?: string | null;
};

function text(value: unknown, code: string, max = 200) {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\r\n]/.test(value)) throw new Error(code);
  return value.trim();
}

function validTimezone(value: unknown) {
  const timezone = text(value, "invalid_routine_timezone", 100);
  try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date(0)); } catch { throw new Error("invalid_routine_timezone"); }
  return timezone;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_routine");
  return value as Record<string, unknown>;
}

export function normalizeAgentRoutineInput(input: unknown) {
  const value = object(input) as unknown as ReminderRoutineInput;
  const capabilityName = text(value.capabilityName, "invalid_routine_capability", 120);
  const capabilityVersion = Number(value.capabilityVersion);
  if (!Number.isInteger(capabilityVersion) || capabilityVersion < 1) throw new Error("invalid_routine_capability");
  const capability = getCapability(capabilityName, capabilityVersion);
  if (!capability.manifest.schedulable) throw new Error("capability_not_schedulable");
  if (capabilityName !== "class.reminder.send") throw new Error("capability_not_schedulable");
  const offsetMinutes = Number(value.offsetMinutes);
  if (!Number.isInteger(offsetMinutes) || offsetMinutes > 0 || offsetMinutes < -10_080) throw new Error("invalid_routine_schedule");
  return {
    routineKey: text(value.routineKey, "invalid_routine_key"),
    capabilityName,
    capabilityVersion,
    entityReferences: { seriesId: text(value.seriesId, "invalid_routine_series") },
    schedule: { kind: "relative_to_occurrence" as const, offsetMinutes },
    timezone: validTimezone(value.timezone),
    recipientRule: { kind: "class_participants" as const },
    status: "disabled" as const,
  };
}

export function expandAgentReminderRoutine(
  facts: Awaited<ReturnType<typeof getKittyReminderFacts>>,
  routineId: string,
) {
  const deliveries = buildClassReminderDeliveries(facts);
  return {
    occurrenceId: facts.occurrence.id,
    startsAt: facts.occurrence.startsAt,
    actions: deliveries.map((delivery) => ({
      capabilityName: "class.reminder.send",
      capabilityVersion: 1,
      proposedInput: { occurrenceId: facts.occurrence.id, recipientId: delivery.contactId },
      clientRequestId: `routine:${routineId}:${facts.occurrence.id}:${delivery.contactId}`,
      classDescription: delivery.classDescription,
      scheduledDateTime: delivery.scheduledDateTime,
    })),
  };
}

function triggerTime(startsAt: string, offsetMinutes: number) {
  return new Date(new Date(startsAt).getTime() + offsetMinutes * 60_000).toISOString();
}

async function resolveNextOccurrence(client: SupabaseClient, routine: StoredRoutine, after: Date) {
  const seriesId = text(routine.entity_references?.seriesId, "invalid_routine_series");
  const offsetMinutes = Number(routine.schedule?.offsetMinutes);
  if (routine.schedule?.kind !== "relative_to_occurrence" || !Number.isInteger(offsetMinutes)) throw new Error("invalid_routine_schedule");
  const minimumStart = new Date(after.getTime() - offsetMinutes * 60_000).toISOString();
  const { data, error } = await client.from("kitty_class_occurrences")
    .select("id, starts_at")
    .eq("series_id", seriesId)
    .in("status", ["scheduled", "change_requested"])
    .gte("starts_at", minimumStart)
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("routine_store_unavailable");
  if (!data) return null;
  return { facts: await getKittyReminderFacts(client, String(data.id)), nextRunAt: triggerTime(String(data.starts_at), offsetMinutes) };
}

function storedRoutine(row: Record<string, unknown>) {
  return row as unknown as StoredRoutine;
}

async function loadRoutine(client: SupabaseClient, routineId: string) {
  const { data, error } = await client.from("academy_agent_routines").select("*").eq("id", routineId).maybeSingle();
  if (error) throw new Error("routine_store_unavailable");
  if (!data) throw new Error("routine_not_found");
  return storedRoutine(data);
}

export async function previewAgentRoutine(client: SupabaseClient, routine: StoredRoutine, now = new Date()) {
  const resolved = await resolveNextOccurrence(client, routine, now);
  if (!resolved) throw new Error("routine_occurrence_unavailable");
  return { ...expandAgentReminderRoutine(resolved.facts, routine.id), nextRunAt: resolved.nextRunAt };
}

export async function manageAgentRoutine(
  client: SupabaseClient,
  actor: AgentActor,
  input: Record<string, unknown>,
) {
  if (actor.kind !== "admin") throw new Error("admin_required");
  const operation = text(input.operation, "invalid_routine_operation", 20);
  if (operation === "create") {
    const normalized = normalizeAgentRoutineInput(input.routine);
    const row = {
      routine_key: normalized.routineKey,
      owner_actor_key: agentActorKey(actor),
      creator_actor_key: agentActorKey(actor),
      capability_name: normalized.capabilityName,
      capability_version: normalized.capabilityVersion,
      entity_references: normalized.entityReferences,
      schedule: normalized.schedule,
      timezone: normalized.timezone,
      recipient_rule: normalized.recipientRule,
      status: normalized.status,
      policy_version: "1",
    };
    const { data, error } = await client.from("academy_agent_routines").insert(row).select("*").single();
    if (error || !data) throw new Error(error?.code === "23505" ? "routine_key_conflict" : "routine_store_unavailable");
    return { routineId: String(data.id), status: String(data.status) };
  }

  const routineId = text(input.routineId, "routine_id_required");
  const current = await loadRoutine(client, routineId);
  if (operation === "preview") return { routineId, status: current.status, preview: await previewAgentRoutine(client, current) };
  if (operation === "disable") {
    const { error } = await client.from("academy_agent_routines").update({ status: "disabled", next_run_at: null, updated_at: new Date().toISOString() }).eq("id", routineId);
    if (error) throw new Error("routine_store_unavailable");
    return { routineId, status: "disabled" };
  }
  if (operation === "enable") {
    const preview = await previewAgentRoutine(client, current);
    const { error } = await client.from("academy_agent_routines").update({ status: "active", next_run_at: preview.nextRunAt, last_error_code: null, updated_at: new Date().toISOString() }).eq("id", routineId);
    if (error) throw new Error("routine_store_unavailable");
    return { routineId, status: "active", preview };
  }
  if (operation === "update") {
    const normalized = normalizeAgentRoutineInput(input.routine);
    const candidate = storedRoutine({ ...current, capability_name: normalized.capabilityName, capability_version: normalized.capabilityVersion, entity_references: normalized.entityReferences, schedule: normalized.schedule, timezone: normalized.timezone, recipient_rule: normalized.recipientRule });
    const preview = await previewAgentRoutine(client, candidate);
    const status = current.status === "active" ? "active" : "disabled";
    const { error } = await client.from("academy_agent_routines").update({
      routine_key: normalized.routineKey, capability_name: normalized.capabilityName, capability_version: normalized.capabilityVersion,
      entity_references: normalized.entityReferences, schedule: normalized.schedule, timezone: normalized.timezone,
      recipient_rule: normalized.recipientRule, status, next_run_at: status === "active" ? preview.nextRunAt : null,
      updated_at: new Date().toISOString(),
    }).eq("id", routineId);
    if (error) throw new Error(error.code === "23505" ? "routine_key_conflict" : "routine_store_unavailable");
    return { routineId, status, preview };
  }
  throw new Error("invalid_routine_operation");
}

export async function runDueAgentRoutines(
  client: SupabaseClient,
  execute: (proposal: AgentActionProposal) => Promise<unknown>,
  options: { now?: Date; limit?: number } = {},
) {
  const now = options.now ?? new Date();
  const claimToken = randomUUID();
  const { data, error } = await client.rpc("claim_due_academy_agent_routines", {
    p_claim_token: claimToken,
    p_limit: Math.min(Math.max(options.limit ?? 20, 1), 100),
    p_now: now.toISOString(),
    p_lease_seconds: 300,
  });
  if (error) throw new Error("routine_store_unavailable");
  const routines = (data ?? []).map((row: Record<string, unknown>) => storedRoutine(row));
  let actionsExecuted = 0;
  let routinesFailed = 0;
  for (const routine of routines) {
    try {
      const preview = await previewAgentRoutine(client, routine, new Date(now.getTime() - 1));
      for (const action of preview.actions) {
        await execute(action);
        actionsExecuted += 1;
      }
      const next = await resolveNextOccurrence(client, routine, new Date(new Date(preview.nextRunAt).getTime() + 1));
      const { error: updateError } = await client.from("academy_agent_routines").update({
        last_run_at: now.toISOString(), last_outcome: { occurrenceId: preview.occurrenceId, actionCount: preview.actions.length },
        last_error_code: null, next_run_at: next?.nextRunAt ?? null, run_claim_token: null, run_claimed_until: null,
        updated_at: new Date().toISOString(),
      }).eq("id", routine.id).eq("run_claim_token", claimToken);
      if (updateError) throw new Error("routine_store_unavailable");
    } catch {
      routinesFailed += 1;
      await client.from("academy_agent_routines").update({
        last_run_at: now.toISOString(), last_error_code: "routine_run_failed", run_claim_token: null, run_claimed_until: null,
        updated_at: new Date().toISOString(),
      }).eq("id", routine.id).eq("run_claim_token", claimToken);
    }
  }
  return { routinesClaimed: routines.length, routinesSucceeded: routines.length - routinesFailed, routinesFailed, actionsExecuted };
}

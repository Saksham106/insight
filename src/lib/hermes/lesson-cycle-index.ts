import type { createAdminClient } from "../supabase/admin";

import { projectLessonCycleIndex, sanitizeTutorContactIds } from "./lesson-ledger";
import { parseSettlementMonth } from "./settlements";

type AdminClient = ReturnType<typeof createAdminClient>;
type JsonObject = Record<string, unknown>;

interface LessonCycleIndexFilters {
  tutorContactId?: unknown;
  periodStart?: unknown;
  limit?: unknown;
}

function lessonCycleLimit(input: unknown): number {
  const value = input === undefined ? 12 : input;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 24) {
    throw new Error("invalid_lesson_cycle_limit");
  }
  return value;
}

export async function loadLessonCycleIndex(
  supabase: AdminClient,
  filters: LessonCycleIndexFilters,
) {
  const tutorContactId = filters.tutorContactId === undefined
    ? undefined
    : sanitizeTutorContactIds([filters.tutorContactId])[0];
  const periodStart = filters.periodStart === undefined
    ? undefined
    : parseSettlementMonth(filters.periodStart);
  const limit = lessonCycleLimit(filters.limit);

  if (tutorContactId) {
    let query = supabase.from("academy_lesson_cycles")
      .select("id, period_start, status, version, collections:academy_teacher_collections!inner(id, lesson_cycle_id, tutor_contact_id, status)")
      .eq("collections.tutor_contact_id", tutorContactId)
      .order("period_start", { ascending: false })
      .limit(limit);
    if (periodStart) query = query.eq("period_start", periodStart);
    const { data, error } = await query;
    if (error) throw error;

    const cycles = (data ?? []).map((cycle): JsonObject => ({
      id: cycle.id,
      period_start: cycle.period_start,
      status: cycle.status,
      version: cycle.version,
    }));
    const collections = (data ?? []).flatMap((cycle) => {
      const embedded = cycle.collections;
      return Array.isArray(embedded) ? embedded as JsonObject[] : [];
    });
    return projectLessonCycleIndex({ cycles, collections, tutorContactId });
  }

  let query = supabase.from("academy_lesson_cycles")
    .select("id, period_start, status, version")
    .order("period_start", { ascending: false })
    .limit(limit);
  if (periodStart) query = query.eq("period_start", periodStart);
  const { data, error } = await query;
  if (error) throw error;
  return projectLessonCycleIndex({ cycles: data ?? [], collections: [] });
}

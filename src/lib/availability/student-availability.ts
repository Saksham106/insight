import { mergeOverlappingIntervals, subtractBlocks } from "./slot-engine";
import type { Interval } from "./time";
import { dateKeysInZone, weekdayInZone, zonedTimeToUtc } from "./timezone";
import type { AvailabilitySlot, DateAvailabilityOverride, WeeklyAvailabilityRule } from "./types";

// A student is "restricted" iff they published any weekly available window or any
// date override. Otherwise they are unrestricted and their availability must NOT
// be used to filter bookable slots (preserves the original booking behavior).
export function studentHasAvailability(
  rules: WeeklyAvailabilityRule[],
  overrides: DateAvailabilityOverride[],
): boolean {
  return rules.some((r) => r.is_active && r.rule_type === "available") || overrides.length > 0;
}

// The student's available intervals across [from, to], interpreted in their zone.
// Mirrors the teacher engine's windowing: available rules/overrides form the base,
// blocked rules and unavailable overrides are subtracted; a whole-day-off override
// removes that date entirely.
export function studentAvailableIntervals(
  rules: WeeklyAvailabilityRule[],
  overrides: DateAvailabilityOverride[],
  timeZone: string,
  from: Date,
  to: Date,
): Interval[] {
  const intervals: Interval[] = [];

  for (const dateKey of dateKeysInZone(from, to, timeZone)) {
    const weekday = weekdayInZone(dateKey, timeZone);

    const base: Interval[] = [];
    for (const r of rules) {
      if (r.is_active && r.rule_type === "available" && r.weekday === weekday) {
        base.push({ start: zonedTimeToUtc(dateKey, r.start_time, timeZone), end: zonedTimeToUtc(dateKey, r.end_time, timeZone) });
      }
    }
    for (const o of overrides) {
      if (o.date === dateKey && o.is_available && o.start_time && o.end_time) {
        base.push({ start: zonedTimeToUtc(dateKey, o.start_time, timeZone), end: zonedTimeToUtc(dateKey, o.end_time, timeZone) });
      }
    }

    const blocks: Interval[] = [];
    let wholeDayOff = false;
    for (const o of overrides) {
      if (o.date !== dateKey || o.is_available) continue;
      if (!o.start_time || !o.end_time) wholeDayOff = true;
      else blocks.push({ start: zonedTimeToUtc(dateKey, o.start_time, timeZone), end: zonedTimeToUtc(dateKey, o.end_time, timeZone) });
    }
    for (const r of rules) {
      if (r.is_active && r.rule_type === "blocked" && r.weekday === weekday) {
        blocks.push({ start: zonedTimeToUtc(dateKey, r.start_time, timeZone), end: zonedTimeToUtc(dateKey, r.end_time, timeZone) });
      }
    }

    if (wholeDayOff) continue;
    intervals.push(...subtractBlocks(mergeOverlappingIntervals(base), blocks));
  }

  return mergeOverlappingIntervals(intervals);
}

// Keep only the slots that fall entirely within one of the student's available
// intervals. Call ONLY when `studentHasAvailability` is true.
export function filterSlotsByStudentAvailability(
  slots: AvailabilitySlot[],
  intervals: Interval[],
): AvailabilitySlot[] {
  if (intervals.length === 0) return [];
  return slots.filter((s) => {
    const start = new Date(s.starts_at).getTime();
    const end = new Date(s.ends_at).getTime();
    return intervals.some((iv) => iv.start.getTime() <= start && end <= iv.end.getTime());
  });
}

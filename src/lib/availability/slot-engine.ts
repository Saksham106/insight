import type { AvailabilitySlot, GenerateSlotsInput } from "@/lib/availability/types";
import { addMinutes, intervalsOverlap, type Interval } from "@/lib/availability/time";
import {
  dateKeysInZone,
  weekdayInZone,
  zonedTimeToUtc,
} from "@/lib/availability/timezone";

function mergeOverlappingIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.start.getTime() - b.start.getTime());
  // Clone so we never mutate the caller's interval objects.
  const merged: Interval[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];
    if (current.start.getTime() <= last.end.getTime()) {
      last.end = new Date(Math.max(last.end.getTime(), current.end.getTime()));
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
}

function subtractInterval(window: Interval, block: Interval): Interval[] {
  if (!intervalsOverlap(window, block)) return [window];
  const pieces: Interval[] = [];
  if (block.start > window.start) pieces.push({ start: window.start, end: block.start });
  if (block.end < window.end) pieces.push({ start: block.end, end: window.end });
  return pieces.filter((p) => p.end.getTime() - p.start.getTime() > 0);
}

function subtractBlocks(windows: Interval[], blocks: Interval[]): Interval[] {
  let result = windows;
  for (const block of blocks) {
    result = result.flatMap((w) => subtractInterval(w, block));
    if (result.length === 0) return [];
  }
  return result;
}

// Build the base bookable windows for one zone-local date, before subtractions.
function baseWindowsForDate(dateKey: string, input: GenerateSlotsInput): Interval[] {
  const tz = input.teacherTimeZone;
  const windows: Interval[] = [];

  if (input.settings.availability_mode === "open") {
    windows.push({
      start: zonedTimeToUtc(dateKey, input.settings.open_day_start, tz),
      end: zonedTimeToUtc(dateKey, input.settings.open_day_end, tz),
    });
  } else {
    const weekday = weekdayInZone(dateKey, tz);
    for (const rule of input.rules) {
      if (!rule.is_active || rule.rule_type !== "available" || rule.weekday !== weekday) continue;
      windows.push({
        start: zonedTimeToUtc(dateKey, rule.start_time, tz),
        end: zonedTimeToUtc(dateKey, rule.end_time, tz),
      });
    }
  }

  // Additions: available overrides on this date (may reach outside the envelope).
  for (const o of input.overrides) {
    if (o.date === dateKey && o.is_available && o.start_time && o.end_time) {
      windows.push({
        start: zonedTimeToUtc(dateKey, o.start_time, tz),
        end: zonedTimeToUtc(dateKey, o.end_time, tz),
      });
    }
  }

  return mergeOverlappingIntervals(windows);
}

// Subtractions that apply to one zone-local date: blocked rules, unavailable
// overrides (timed or whole-day). Busy sessions are applied globally afterward.
function subtractionsForDate(dateKey: string, input: GenerateSlotsInput): { blocks: Interval[]; wholeDayBlocked: boolean } {
  const tz = input.teacherTimeZone;
  const weekday = weekdayInZone(dateKey, tz);
  const blocks: Interval[] = [];
  let wholeDayBlocked = false;

  for (const rule of input.rules) {
    if (rule.is_active && rule.rule_type === "blocked" && rule.weekday === weekday) {
      blocks.push({
        start: zonedTimeToUtc(dateKey, rule.start_time, tz),
        end: zonedTimeToUtc(dateKey, rule.end_time, tz),
      });
    }
  }

  for (const o of input.overrides) {
    if (o.date !== dateKey || o.is_available) continue;
    if (!o.start_time || !o.end_time) {
      wholeDayBlocked = true;
    } else {
      blocks.push({
        start: zonedTimeToUtc(dateKey, o.start_time, tz),
        end: zonedTimeToUtc(dateKey, o.end_time, tz),
      });
    }
  }

  return { blocks, wholeDayBlocked };
}

function busyIntervals(input: GenerateSlotsInput): Interval[] {
  return input.busySessions.map((s) => ({
    start: addMinutes(new Date(s.scheduled_at), -input.settings.buffer_before_minutes),
    end: addMinutes(new Date(s.scheduled_at), s.duration_minutes + input.settings.buffer_after_minutes),
  }));
}

export function generateAvailabilitySlots(input: GenerateSlotsInput): AvailabilitySlot[] {
  if (!input.settings.allowed_durations.includes(input.durationMinutes)) return [];

  const earliest = addMinutes(input.now, input.settings.minimum_notice_hours * 60);
  const latest = addMinutes(input.now, input.settings.max_days_ahead * 24 * 60);
  const rangeStart = new Date(Math.max(input.from.getTime(), earliest.getTime()));
  const rangeEnd = new Date(Math.min(input.to.getTime(), latest.getTime()));
  if (rangeStart >= rangeEnd) return [];

  const step = input.settings.slot_increment_minutes;
  const busy = busyIntervals(input);
  const slots: AvailabilitySlot[] = [];

  for (const dateKey of dateKeysInZone(rangeStart, rangeEnd, input.teacherTimeZone)) {
    const { blocks, wholeDayBlocked } = subtractionsForDate(dateKey, input);
    if (wholeDayBlocked) continue;

    const base = baseWindowsForDate(dateKey, input);
    const windows = subtractBlocks(base, blocks);

    for (const window of windows) {
      for (
        let start = new Date(window.start);
        addMinutes(start, input.durationMinutes) <= window.end;
        start = addMinutes(start, step)
      ) {
        if (start < rangeStart) continue;
        const candidate = { start, end: addMinutes(start, input.durationMinutes) };
        if (candidate.end > rangeEnd) continue;
        if (busy.some((b) => intervalsOverlap(b, candidate))) continue;
        slots.push({
          starts_at: candidate.start.toISOString(),
          ends_at: candidate.end.toISOString(),
          duration_minutes: input.durationMinutes,
        });
      }
    }
  }

  // A slot can appear on two adjacent zone-dates only at exact midnight windows;
  // dedupe defensively so the UI never renders a duplicate key.
  const seen = new Set<string>();
  return slots
    .filter((s) => (seen.has(s.starts_at) ? false : (seen.add(s.starts_at), true)))
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
}

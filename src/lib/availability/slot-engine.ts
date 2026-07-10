import type { AvailabilitySlot, GenerateSlotsInput } from "@/lib/availability/types";
import {
  addMinutes,
  dateKey,
  eachDate,
  intervalsOverlap,
  parseTimeOnDate,
  weekdaySundayZero,
  type Interval,
} from "@/lib/availability/time";

const SLOT_STEP_MINUTES = 15;

function expandWindows(input: GenerateSlotsInput): Interval[] {
  const windows: Interval[] = [];

  for (const day of eachDate(input.from, input.to)) {
    const key = dateKey(day);
    const weekday = weekdaySundayZero(day);
    const dayRules = input.rules.filter((rule) => rule.is_active && rule.weekday === weekday);

    for (const rule of dayRules) {
      windows.push({
        start: parseTimeOnDate(day, rule.start_time),
        end: parseTimeOnDate(day, rule.end_time),
      });
    }

    for (const override of input.overrides.filter((item) => item.date === key && item.is_available)) {
      if (override.start_time && override.end_time) {
        windows.push({
          start: parseTimeOnDate(day, override.start_time),
          end: parseTimeOnDate(day, override.end_time),
        });
      }
    }
  }

  return windows;
}

function subtractInterval(window: Interval, block: Interval): Interval[] {
  if (!intervalsOverlap(window, block)) return [window];

  const pieces: Interval[] = [];

  if (block.start > window.start) {
    pieces.push({ start: window.start, end: block.start });
  }
  if (block.end < window.end) {
    pieces.push({ start: block.end, end: window.end });
  }

  return pieces.filter((piece) => piece.end.getTime() - piece.start.getTime() > 0);
}

function applyUnavailableOverrides(windows: Interval[], input: GenerateSlotsInput): Interval[] {
  return windows.flatMap((window) => {
    const key = dateKey(window.start);
    const unavailable = input.overrides.filter((item) => item.date === key && !item.is_available);

    let pieces: Interval[] = [window];

    for (const override of unavailable) {
      if (!override.start_time || !override.end_time) return [];

      const block = {
        start: parseTimeOnDate(window.start, override.start_time),
        end: parseTimeOnDate(window.start, override.end_time),
      };

      pieces = pieces.flatMap((piece) => subtractInterval(piece, block));
      if (pieces.length === 0) return [];
    }

    return pieces;
  });
}

function busyIntervals(input: GenerateSlotsInput): Interval[] {
  return input.busySessions.map((session) => {
    const start = addMinutes(new Date(session.scheduled_at), -input.settings.buffer_before_minutes);
    const end = addMinutes(new Date(session.scheduled_at), session.duration_minutes + input.settings.buffer_after_minutes);
    return { start, end };
  });
}

export function generateAvailabilitySlots(input: GenerateSlotsInput): AvailabilitySlot[] {
  if (!input.settings.allowed_durations.includes(input.durationMinutes)) return [];

  const earliest = addMinutes(input.now, input.settings.minimum_notice_hours * 60);
  const latest = addMinutes(input.now, input.settings.max_days_ahead * 24 * 60);
  const rangeStart = new Date(Math.max(input.from.getTime(), earliest.getTime()));
  const rangeEnd = new Date(Math.min(input.to.getTime(), latest.getTime()));
  if (rangeStart > rangeEnd) return [];

  const scopedInput = { ...input, from: rangeStart, to: rangeEnd };
  const windows = applyUnavailableOverrides(expandWindows(scopedInput), scopedInput);
  const busy = busyIntervals(scopedInput);
  const slots: AvailabilitySlot[] = [];

  for (const window of windows) {
    for (let start = new Date(Math.max(window.start.getTime(), rangeStart.getTime())); addMinutes(start, input.durationMinutes) <= window.end; start = addMinutes(start, SLOT_STEP_MINUTES)) {
      const candidate = { start, end: addMinutes(start, input.durationMinutes) };
      if (candidate.end > rangeEnd) continue;
      if (busy.some((interval) => intervalsOverlap(interval, candidate))) continue;
      slots.push({
        starts_at: candidate.start.toISOString(),
        ends_at: candidate.end.toISOString(),
        duration_minutes: input.durationMinutes,
      });
    }
  }

  return slots.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
}

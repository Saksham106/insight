import { createHash } from "node:crypto";

export {
  projectKittyClassRoster,
  requiredEnrollmentApprovalIds,
  validateKittyEnrollments,
} from "./kitty-class-enrollments";
export type {
  KittyEnrollmentContactInput,
  KittyEnrollmentInput,
  KittyEnrollmentProjection,
  KittyEnrollmentRosterActor,
} from "./kitty-class-enrollments";

export type KittyWeeklyRecurrence = {
  frequency: "weekly";
  weekdays: number[];
  localTime: string;
  intervalWeeks: 1;
};

export type KittyOccurrenceCandidate = {
  id: string;
  title: string;
  subject?: string | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
  status: "scheduled" | "change_requested" | "rescheduled" | "cancelled" | "completed";
};

type DecisionParticipant = {
  decisionSide: "teacher" | "student" | null;
  confirmsCancellation: boolean;
  confirmsReschedule: boolean;
  isActive: boolean;
};

function invalidRecurrence(): never {
  throw new Error("invalid_recurrence");
}

export function parseKittyRecurrence(input: unknown): KittyWeeklyRecurrence {
  if (!input || typeof input !== "object" || Array.isArray(input)) return invalidRecurrence();
  const value = input as Record<string, unknown>;
  if (value.frequency !== "weekly" || value.intervalWeeks !== 1) return invalidRecurrence();
  if (!Array.isArray(value.weekdays) || value.weekdays.length === 0 || value.weekdays.length > 7) return invalidRecurrence();
  const weekdays = [...new Set(value.weekdays)].sort((a, b) => Number(a) - Number(b));
  if (weekdays.some((day) => !Number.isInteger(day) || Number(day) < 0 || Number(day) > 6)) return invalidRecurrence();
  if (typeof value.localTime !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value.localTime)) return invalidRecurrence();
  return { frequency: "weekly", weekdays: weekdays.map(Number), localTime: value.localTime, intervalWeeks: 1 };
}

function isoDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("invalid_date");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("invalid_date");
  return date;
}

function laterDate(a: string, b: string) {
  return a > b ? a : b;
}

function earlierDate(a: string, b: string) {
  return a < b ? a : b;
}

function zonedLocalToUtc(localDate: string, localTime: string, timezone: string): Date {
  const [year, month, day] = localDate.split("-").map(Number);
  const [hour, minute] = localTime.split(":").map(Number);
  const desiredWallClock = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = desiredWallClock;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(candidate)).map((part) => [part.type, part.value]));
    const representedWallClock = Date.UTC(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour), Number(parts.minute), Number(parts.second),
    );
    candidate += desiredWallClock - representedWallClock;
  }
  const result = new Date(candidate);
  const local = formatter.formatToParts(result);
  const parts = Object.fromEntries(local.map((part) => [part.type, part.value]));
  if (`${parts.year}-${parts.month}-${parts.day}` !== localDate || `${parts.hour}:${parts.minute}` !== localTime) {
    throw new Error("invalid_local_time");
  }
  return result;
}

export function kittyLocalDateTimeToUtc(value: string, timezone: string) {
  const match = /^(\d{4}-\d{2}-\d{2})T((?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value);
  if (!match) throw new Error("invalid_local_time");
  return zonedLocalToUtc(match[1], match[2], timezone).toISOString();
}

export function expandKittySeries(input: {
  seriesId: string;
  title: string;
  subject?: string | null;
  timezone: string;
  recurrence: KittyWeeklyRecurrence;
  durationMinutes: number;
  effectiveStart: string;
  effectiveEnd: string | null;
  fromDate: string;
  throughDate: string;
}) {
  const recurrence = parseKittyRecurrence(input.recurrence);
  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 5 || input.durationMinutes > 1440) throw new Error("invalid_duration");
  const startText = laterDate(input.effectiveStart, input.fromDate);
  const endText = input.effectiveEnd ? earlierDate(input.effectiveEnd, input.throughDate) : input.throughDate;
  const cursor = isoDate(startText);
  const end = isoDate(endText);
  if (cursor > end) return [];
  const rows: Array<{
    seriesId: string;
    occurrenceKey: string;
    title: string;
    subject: string | null;
    startsAt: string;
    endsAt: string;
    localDate: string;
    timezone: string;
  }> = [];
  while (cursor <= end) {
    const localDate = cursor.toISOString().slice(0, 10);
    if (recurrence.weekdays.includes(cursor.getUTCDay())) {
      const startsAt = zonedLocalToUtc(localDate, recurrence.localTime, input.timezone);
      rows.push({
        seriesId: input.seriesId,
        occurrenceKey: `series:${input.seriesId}:${localDate}`,
        title: input.title,
        subject: input.subject ?? null,
        startsAt: startsAt.toISOString(),
        endsAt: new Date(startsAt.getTime() + input.durationMinutes * 60_000).toISOString(),
        localDate,
        timezone: input.timezone,
      });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return rows;
}

export function matchKittyOccurrences(input: {
  candidates: KittyOccurrenceCandidate[];
  referenceDate: string;
  query?: string;
  limit?: number;
}) {
  isoDate(input.referenceDate);
  const words = (input.query ?? "").toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 2 && word !== "class" && word !== "today");
  const scored = input.candidates
    .filter((candidate) => candidate.status === "scheduled" || candidate.status === "change_requested")
    .map((candidate) => {
      const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: candidate.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(candidate.startsAt));
      const haystack = `${candidate.title} ${candidate.subject ?? ""}`.toLocaleLowerCase();
      const contextScore = words.reduce((score, word) => score + (haystack.includes(word) ? 10 : 0), 0);
      return { candidate, score: contextScore + (localDate === input.referenceDate ? 5 : 0) };
    })
    .sort((a, b) => b.score - a.score || a.candidate.startsAt.localeCompare(b.candidate.startsAt));
  return scored.slice(0, Math.min(Math.max(input.limit ?? 5, 1), 10)).map(({ candidate }) => candidate);
}

export function requiredDecisionSides(participants: DecisionParticipant[], changeType: "cancel" | "reschedule") {
  const field = changeType === "cancel" ? "confirmsCancellation" : "confirmsReschedule";
  return (["teacher", "student"] as const).filter((side) =>
    participants.some((participant) => participant.isActive && participant.decisionSide === side && participant[field]),
  );
}

export function kittyClassIdempotencyKey(parts: Array<string | number>) {
  const digest = createHash("sha256").update(JSON.stringify(parts.map(String))).digest("hex");
  return `kitty-class:${digest}`;
}

import { createHash } from "node:crypto";

export interface FreeBusyWindow {
  start: string;
  end: string;
}

export interface FreeBusyPayload {
  windows: FreeBusyWindow[];
  timezone?: string;
}

export interface FreeBusyResult {
  busy: FreeBusyWindow[];
  checkedAt: string;
}

export interface CalendarEventPayload {
  start: string;
  end: string;
  timezone: string;
  summary: string;
  eventId: string;
  proposalVersion: number;
}

export interface CalendarEventResult {
  eventId: string;
  etag: string;
  createdAt: string;
}

function objectValue(input: unknown, error: string): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error(error);
  return input as Record<string, unknown>;
}

function normalizeWindow(input: unknown, error: string): FreeBusyWindow {
  const value = objectValue(input, error);
  const start = typeof value.start === "string" ? new Date(value.start) : new Date(Number.NaN);
  const end = typeof value.end === "string" ? new Date(value.end) : new Date(Number.NaN);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) throw new Error(error);
  return { start: start.toISOString(), end: end.toISOString() };
}

function normalizeTimezone(input: unknown) {
  const timezone = typeof input === "string" ? input.trim() : "";
  if (!timezone || timezone.length > 100 || (timezone !== "UTC" && !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)+$/.test(timezone))) {
    throw new Error("invalid_timezone");
  }
  return timezone;
}

export function parseFreeBusyPayload(input: unknown): FreeBusyPayload {
  const value = objectValue(input, "invalid_freebusy_payload");
  if (!Array.isArray(value.windows) || value.windows.length < 1 || value.windows.length > 50) {
    throw new Error("invalid_freebusy_windows");
  }
  const windows = value.windows.map((window) => normalizeWindow(window, "invalid_freebusy_window"));
  const starts = windows.map((window) => new Date(window.start).getTime());
  const ends = windows.map((window) => new Date(window.end).getTime());
  if (Math.max(...ends) - Math.min(...starts) > 31 * 24 * 60 * 60 * 1000) {
    throw new Error("freebusy_range_too_large");
  }
  const timezone = value.timezone === undefined ? "" : normalizeTimezone(value.timezone);
  return { windows, ...(timezone ? { timezone } : {}) };
}

export function parseFreeBusyResult(input: unknown): FreeBusyResult {
  const value = objectValue(input, "invalid_freebusy_result");
  if (!Array.isArray(value.busy) || value.busy.length > 200 || typeof value.checkedAt !== "string") {
    throw new Error("invalid_freebusy_result");
  }
  const checkedAt = new Date(value.checkedAt);
  if (!Number.isFinite(checkedAt.getTime())) throw new Error("invalid_freebusy_result");
  return {
    busy: value.busy.map((window) => normalizeWindow(window, "invalid_freebusy_result")),
    checkedAt: checkedAt.toISOString(),
  };
}

export function workspaceJobIdempotencyKey(caseId: string, payload: FreeBusyPayload): string {
  const windows = [...payload.windows].sort((left, right) =>
    left.start.localeCompare(right.start) || left.end.localeCompare(right.end));
  const canonical = JSON.stringify({ caseId, windows, timezone: payload.timezone ?? null });
  return `freebusy:${createHash("sha256").update(canonical).digest("hex")}`;
}

export function parseCalendarEventPayload(input: unknown): CalendarEventPayload {
  const value = objectValue(input, "invalid_calendar_event_payload");
  const window = normalizeWindow({ start: value.start, end: value.end }, "invalid_calendar_event_window");
  if (new Date(window.end).getTime() - new Date(window.start).getTime() > 24 * 60 * 60 * 1000) {
    throw new Error("invalid_calendar_event_window");
  }
  const summary = typeof value.summary === "string" ? value.summary.trim() : "";
  if (!summary || summary.length > 240 || /[\u0000-\u001f\u007f]/.test(summary)) throw new Error("invalid_calendar_event_summary");
  if (typeof value.eventId !== "string" || !/^[a-v0-9]{5,1024}$/.test(value.eventId)) throw new Error("invalid_calendar_event_id");
  if (!Number.isInteger(value.proposalVersion) || Number(value.proposalVersion) < 1) throw new Error("invalid_proposal_version");
  return {
    ...window,
    timezone: normalizeTimezone(value.timezone),
    summary,
    eventId: value.eventId,
    proposalVersion: Number(value.proposalVersion),
  };
}

export function parseCalendarEventResult(input: unknown): CalendarEventResult {
  const value = objectValue(input, "invalid_calendar_event_result");
  const createdAt = typeof value.createdAt === "string" ? new Date(value.createdAt) : new Date(Number.NaN);
  if (
    typeof value.eventId !== "string" || !/^[a-v0-9]{5,1024}$/.test(value.eventId)
    || typeof value.etag !== "string" || value.etag.length < 1 || value.etag.length > 500 || /[\r\n]/.test(value.etag)
    || !Number.isFinite(createdAt.getTime())
  ) throw new Error("invalid_calendar_event_result");
  return { eventId: value.eventId, etag: value.etag, createdAt: createdAt.toISOString() };
}

export function calendarEventJobIdempotencyKey(caseId: string, payload: CalendarEventPayload): string {
  const canonical = JSON.stringify({ caseId, ...payload });
  return `event:${createHash("sha256").update(canonical).digest("hex")}`;
}

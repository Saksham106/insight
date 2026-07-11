// Dependency-free wall-clock <-> instant conversion built on Intl.DateTimeFormat.
// Every availability rule and override stores its own IANA timezone; this module
// is the single place that interprets those wall-clock strings as real instants.

const partsCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let fmt = partsCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      weekday: "short",
    });
    partsCache.set(timeZone, fmt);
  }
  return fmt;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

interface ZonedParts {
  year: number;
  month: number; // 1-based
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0 = Sunday
}

export function utcToZonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const lookup = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  let hour = parseInt(lookup("hour"), 10);
  if (hour === 24) hour = 0; // some engines emit "24" for midnight
  return {
    year: parseInt(lookup("year"), 10),
    month: parseInt(lookup("month"), 10),
    day: parseInt(lookup("day"), 10),
    hour,
    minute: parseInt(lookup("minute"), 10),
    weekday: WEEKDAY_INDEX[lookup("weekday")] ?? 0,
  };
}

// Minutes east of UTC for a given instant in a zone.
export function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const p = utcToZonedParts(instant, timeZone);
  // The wall-clock time in the zone, reinterpreted as if it were UTC.
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0, 0);
  // Round to the minute to erase the sub-minute remainder of `instant`.
  const instantMinutes = Math.floor(instant.getTime() / 60000) * 60000;
  return Math.round((asUtc - instantMinutes) / 60000);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// Resolve a wall-clock date+time in a zone to the correct UTC instant.
// Probe the zone offset a day before and a day after the target wall time; on a
// DST-transition day these differ and bracket the two candidate offsets. A
// candidate instant is "real" if reinterpreting it in the zone reproduces the
// requested wall clock. Ambiguous fall-back times (both candidates real) resolve
// to the EARLIER instant; nonexistent spring-forward gap times (neither real)
// resolve FORWARD past the transition.
export function zonedTimeToUtc(dateKey: string, time: string, timeZone: string): Date {
  const [y, mo, d] = dateKey.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const naiveUtc = Date.UTC(y, mo - 1, d, h, mi, 0, 0);

  const offBefore = zoneOffsetMinutes(new Date(naiveUtc - 86_400_000), timeZone);
  const offAfter = zoneOffsetMinutes(new Date(naiveUtc + 86_400_000), timeZone);
  if (offBefore === offAfter) return new Date(naiveUtc - offBefore * 60000);

  const candBefore = naiveUtc - offBefore * 60000;
  const candAfter = naiveUtc - offAfter * 60000;
  const beforeValid = zoneOffsetMinutes(new Date(candBefore), timeZone) === offBefore;
  const afterValid = zoneOffsetMinutes(new Date(candAfter), timeZone) === offAfter;

  if (beforeValid && afterValid) return new Date(Math.min(candBefore, candAfter)); // fall-back: earlier
  if (beforeValid) return new Date(candBefore);
  if (afterValid) return new Date(candAfter);
  return new Date(Math.max(candBefore, candAfter)); // spring-forward gap: resolve forward
}

export function dateKeyInZone(instant: Date, timeZone: string): string {
  const p = utcToZonedParts(instant, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function dateKeysInZone(from: Date, to: Date, timeZone: string): string[] {
  const keys: string[] = [];
  const startKey = dateKeyInZone(from, timeZone);
  const endKey = dateKeyInZone(to, timeZone);
  // Walk day by day using noon UTC anchors to avoid DST-edge skips.
  const [sy, sm, sd] = startKey.split("-").map(Number);
  let cursor = Date.UTC(sy, sm - 1, sd, 12, 0, 0, 0);
  for (let guard = 0; guard < 400; guard++) {
    const key = dateKeyInZone(new Date(cursor), timeZone);
    keys.push(key);
    if (key >= endKey) break;
    cursor += 24 * 60 * 60 * 1000;
  }
  return keys;
}

export function weekdayInZone(dateKey: string, timeZone: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return utcToZonedParts(new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0)), timeZone).weekday;
}

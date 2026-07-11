# Open Availability and Calendar UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every teacher bookable by default (availability is subtractive, not opt-in), replace the dropdown-based availability editor with a draggable week-grid calendar, and let students book from the `/student/teachers` page — while fixing a latent timezone bug that would corrupt every generated slot.

**Architecture:** A new `availability_mode` on `teacher_booking_settings` flips slot generation from "union of published rules" to "a daily open-hours envelope minus blocks." All wall-clock math moves into a dependency-free `Intl`-based timezone module so a rule's stored IANA zone is honored. One controlled `WeekGrid` React primitive renders every calendar surface — teacher availability editing, student slot booking, and read-only session views.

**Tech Stack:** Next.js 16 (App Router), React 19, Supabase (Postgres + RLS + `security definer` RPC), TypeScript, `node:test` for pure-logic tests, inline `style={{}}` for all layout (Tailwind layout utilities are NOT generated in this project).

## Global Constraints

- **No new runtime dependencies.** Timezone math uses built-in `Intl.DateTimeFormat`. No FullCalendar, no date-fns, no Luxon.
- **All layout/positional styling uses inline `style={{}}`.** Tailwind is only reliable for color/typography utilities (`text-sm`, `text-navy`, `text-muted`, `text-error`). Never use Tailwind for grid, flex, position, gap, min-h, or borders. Use CSS vars: `var(--color-border)`, `var(--color-surface)`, `var(--color-background)`, `var(--color-foreground)`, `var(--color-navy)`, `var(--color-soft)`.
- **Responsive uses `useMediaQuery("(max-width: 768px)")`** from `@/lib/use-media-query`, never Tailwind responsive prefixes.
- **Weekday convention: `0 = Sunday` … `6 = Saturday`** (matches JS `Date.getDay()` and the existing `weekday` CHECK constraint).
- **Open-hours envelope default: `08:00`–`20:00`. Slot increment default: `30` minutes, constrained to `{15, 30, 60}`.**
- **Availability modes: `'open'` (default) and `'restricted'`.**
- **Rule types: `'available'` (default) and `'blocked'`.**
- **Precedence in slot generation: additions (base window + available overrides) are applied first, then subtractions (blocked rules, unavailable overrides, busy sessions). A blocked rule/override beats an available one on the same range.**
- **Migrations are applied via the Supabase MCP `apply_migration` tool** (remote project; there is no local Supabase stack). Migration files also live in `supabase/migrations/`.
- **Tests for pure logic use the existing `.test.cjs` + `node:test` + TypeScript-transpile harness** (see `src/lib/availability/slot-engine.test.cjs` for the loader pattern). Run with `node --test`.
- **UI tasks have no automated test framework** (no jest/RTL in this repo). Their verification gate is `npx tsc --noEmit` + `npm run lint` + a described manual browser check. Do NOT introduce a new test framework.
- **Commit messages: Conventional Commits** (`feat:`, `fix:`, `refactor:`, `chore:`, `docs:`). Keep them short.
- **Cache invalidation after writes: `revalidateTag("dashboard", "max")`** (note the two-arg form this codebase uses).
- **Every commit must end with:**
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_012k6FbcFtBktvV8bcdnKiUN
  ```

---

## File Structure

**New files:**
- `supabase/migrations/20260711000001_open_availability_by_default.sql` — schema + backfill
- `src/lib/availability/timezone.ts` — `Intl`-based wall-clock↔instant conversion
- `src/lib/availability/timezone.test.cjs` — DST + offset tests
- `src/components/calendar/grid-geometry.ts` — pure pixel↔time + snapping helpers
- `src/components/calendar/grid-geometry.test.cjs` — geometry tests
- `src/components/calendar/week-grid.tsx` — the controlled week-grid primitive
- `src/components/availability/availability-calendar.tsx` — teacher grid wired to rules/overrides

**Rewritten:**
- `src/lib/availability/types.ts` — new settings/rule fields
- `src/lib/availability/time.ts` — drop tz-naive helpers, keep `addMinutes`/`intervalsOverlap`/`Interval`
- `src/lib/availability/slot-engine.ts` — inverted, tz-aware generation
- `src/lib/availability/slot-engine.test.cjs` — inverted-model coverage
- `src/components/availability/availability-editor.tsx` — hosts the calendar + collapsed settings
- `src/components/sessions/week-calendar.tsx` — thin wrapper over read-only `WeekGrid`
- `src/components/booking/slot-picker.tsx` — grid view + `singleAssignmentId`

**Modified:**
- `src/lib/availability/data.ts` — return resolved timezone + new fields; DEFAULT_SETTINGS
- `src/app/api/availability/settings/route.ts` — validate/persist new fields
- `src/app/api/availability/rules/route.ts` — accept `rule_type`
- `src/app/api/availability/rules/[id]/route.ts` — return `rule_type` in projection
- `src/app/api/availability/overrides/[id]/route.ts` — add `PATCH`
- `src/app/api/booking/slots/route.ts` — return `slot_increment_minutes` + `timezone`
- `src/app/api/booking/book/route.ts` — tz-correct day recompute
- `src/components/availability/booking-settings-form.tsx` — new fields + mode toggle
- `src/components/student/student-dashboard.tsx` — teachers-page booking + Month/Week switch
- `src/components/teacher/teacher-dashboard.tsx` — Month/Week switch

**Deleted:**
- `src/components/availability/date-overrides-list.tsx`

---

## Phase 1 — Data model and slot engine

### Task 1: Database migration for open-by-default availability

**Files:**
- Create: `supabase/migrations/20260711000001_open_availability_by_default.sql`

**Interfaces:**
- Produces (DB columns later tasks read/write):
  - `teacher_booking_settings.availability_mode text` (`'open'`|`'restricted'`)
  - `teacher_booking_settings.open_day_start time`, `open_day_end time`
  - `teacher_booking_settings.timezone text` (nullable)
  - `teacher_booking_settings.slot_increment_minutes integer` (15|30|60)
  - `teacher_availability_rules.rule_type text` (`'available'`|`'blocked'`)

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/20260711000001_open_availability_by_default.sql`:

```sql
-- Availability becomes subtractive: a teacher is bookable by default inside an
-- open-hours envelope, and blocks time rather than publishing it.

alter table public.teacher_booking_settings
  add column if not exists availability_mode text not null default 'open'
    check (availability_mode in ('open', 'restricted')),
  add column if not exists open_day_start time not null default '08:00',
  add column if not exists open_day_end time not null default '20:00',
  add column if not exists timezone text,
  add column if not exists slot_increment_minutes integer not null default 30
    check (slot_increment_minutes in (15, 30, 60));

alter table public.teacher_booking_settings
  drop constraint if exists teacher_booking_settings_open_day_order;
alter table public.teacher_booking_settings
  add constraint teacher_booking_settings_open_day_order
  check (open_day_end > open_day_start);

alter table public.teacher_availability_rules
  add column if not exists rule_type text not null default 'available'
    check (rule_type in ('available', 'blocked'));

-- Insert a settings row for every teacher who lacks one, so mode is never
-- inferred from a missing row.
insert into public.teacher_booking_settings (teacher_id, timezone)
select p.id, p.timezone
from public.profiles p
where p.role = 'teacher'
  and not exists (
    select 1 from public.teacher_booking_settings s where s.teacher_id = p.id
  );

-- Backfill timezone from the profile where the settings row predates this column.
update public.teacher_booking_settings s
set timezone = p.timezone
from public.profiles p
where s.teacher_id = p.id
  and s.timezone is null
  and p.timezone is not null;

-- Preserve published windows: a teacher who already has an active availability
-- rule keeps the old union semantics under 'restricted'. (No-op today: 0 rules.)
update public.teacher_booking_settings s
set availability_mode = 'restricted'
where exists (
  select 1 from public.teacher_availability_rules r
  where r.teacher_id = s.teacher_id and r.is_active = true
);
```

- [ ] **Step 2: Apply the migration to the remote project**

Use the Supabase MCP tool `apply_migration` with name `open_availability_by_default` and the SQL above.
Expected: success, no error.

- [ ] **Step 3: Verify the schema and backfill**

Use the Supabase MCP tool `execute_sql`:
```sql
select availability_mode, open_day_start, open_day_end, slot_increment_minutes,
       timezone, count(*)
from public.teacher_booking_settings
group by 1,2,3,4,5;
```
Expected: rows exist for teachers; every row has `availability_mode = 'open'` (0 rules exist today), `open_day_start = 08:00:00`, `open_day_end = 20:00:00`, `slot_increment_minutes = 30`.

Then confirm the rule column:
```sql
select column_name, data_type from information_schema.columns
where table_name = 'teacher_availability_rules' and column_name = 'rule_type';
```
Expected: one row, `text`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260711000001_open_availability_by_default.sql
git commit -m "feat: add open-by-default availability schema and backfill"
```

---

### Task 2: Timezone conversion module

**Files:**
- Create: `src/lib/availability/timezone.ts`
- Test: `src/lib/availability/timezone.test.cjs`

**Interfaces:**
- Produces (consumed by slot-engine in Task 4 and data/book routes in Tasks 5–6):
  - `zoneOffsetMinutes(instant: Date, timeZone: string): number` — minutes east of UTC (e.g. `-240` for Toronto in July).
  - `zonedTimeToUtc(dateKey: string, time: string, timeZone: string): Date` — `dateKey` is `"YYYY-MM-DD"`, `time` is `"HH:MM"` or `"HH:MM:SS"`.
  - `utcToZonedParts(instant: Date, timeZone: string): { year, month, day, hour, minute, weekday }` — `month` 1-based, `weekday` 0=Sunday.
  - `dateKeyInZone(instant: Date, timeZone: string): string` — the `"YYYY-MM-DD"` seen from the zone.
  - `dateKeysInZone(from: Date, to: Date, timeZone: string): string[]` — inclusive calendar dates spanned.
  - `weekdayInZone(dateKey: string, timeZone: string): number` — 0=Sunday for a date's noon.

- [ ] **Step 1: Write failing tests**

Create `src/lib/availability/timezone.test.cjs`. Reuse the exact TypeScript-loader prologue from `src/lib/availability/slot-engine.test.cjs` (copy lines 1–48 verbatim), then:

```js
const {
  zoneOffsetMinutes,
  zonedTimeToUtc,
  utcToZonedParts,
  dateKeyInZone,
  dateKeysInZone,
  weekdayInZone,
} = require(path.join(__dirname, "timezone.ts"));

test("zoneOffsetMinutes: Toronto is UTC-4 in July (DST)", () => {
  assert.equal(zoneOffsetMinutes(new Date("2026-07-14T16:00:00Z"), "America/Toronto"), -240);
});

test("zoneOffsetMinutes: Toronto is UTC-5 in January (standard)", () => {
  assert.equal(zoneOffsetMinutes(new Date("2026-01-14T16:00:00Z"), "America/Toronto"), -300);
});

test("zoneOffsetMinutes: Kolkata is UTC+5:30", () => {
  assert.equal(zoneOffsetMinutes(new Date("2026-07-14T06:00:00Z"), "Asia/Kolkata"), 330);
});

test("zonedTimeToUtc: 9am Toronto in July resolves to 13:00 UTC", () => {
  assert.equal(zonedTimeToUtc("2026-07-14", "09:00", "America/Toronto").toISOString(), "2026-07-14T13:00:00.000Z");
});

test("zonedTimeToUtc: 9am Kolkata resolves to 03:30 UTC", () => {
  assert.equal(zonedTimeToUtc("2026-07-14", "09:00", "Asia/Kolkata").toISOString(), "2026-07-14T03:30:00.000Z");
});

test("zonedTimeToUtc: accepts HH:MM:SS from a Postgres time column", () => {
  assert.equal(zonedTimeToUtc("2026-07-14", "09:00:00", "America/Toronto").toISOString(), "2026-07-14T13:00:00.000Z");
});

test("zonedTimeToUtc: UTC is identity", () => {
  assert.equal(zonedTimeToUtc("2026-07-14", "09:00", "UTC").toISOString(), "2026-07-14T09:00:00.000Z");
});

test("zonedTimeToUtc: spring-forward gap (2:30am does not exist) resolves forward", () => {
  // US DST 2026 starts Sun Mar 8; clocks jump 2:00 -> 3:00 local.
  const iso = zonedTimeToUtc("2026-03-08", "02:30", "America/Toronto").toISOString();
  // 2:30 EST would be 07:30Z; because the wall time is skipped it lands at 3:30 EDT = 07:30Z as well.
  assert.equal(iso, "2026-03-08T07:30:00.000Z");
});

test("zonedTimeToUtc: fall-back ambiguous time resolves to the earlier instant", () => {
  // US DST 2026 ends Sun Nov 1; 1:30am occurs twice. Earlier is EDT (UTC-4) = 05:30Z.
  const iso = zonedTimeToUtc("2026-11-01", "01:30", "America/Toronto").toISOString();
  assert.equal(iso, "2026-11-01T05:30:00.000Z");
});

test("utcToZonedParts: reads local wall clock and weekday", () => {
  const p = utcToZonedParts(new Date("2026-07-14T13:00:00Z"), "America/Toronto");
  assert.deepEqual(p, { year: 2026, month: 7, day: 14, hour: 9, minute: 0, weekday: 2 }); // Tue
});

test("dateKeyInZone: instant near midnight belongs to the zone's date", () => {
  // 03:30Z on Jul 14 is still Jul 13, 23:30 in Toronto.
  assert.equal(dateKeyInZone(new Date("2026-07-14T03:30:00Z"), "America/Toronto"), "2026-07-13");
});

test("dateKeysInZone: inclusive span across two zone-local days", () => {
  const keys = dateKeysInZone(new Date("2026-07-14T00:00:00Z"), new Date("2026-07-16T00:00:00Z"), "America/Toronto");
  assert.deepEqual(keys, ["2026-07-13", "2026-07-14", "2026-07-15"]);
});

test("weekdayInZone: 2026-07-14 is Tuesday", () => {
  assert.equal(weekdayInZone("2026-07-14", "America/Toronto"), 2);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test src/lib/availability/timezone.test.cjs`
Expected: FAIL — cannot find module `timezone.ts`.

- [ ] **Step 3: Implement `timezone.ts`**

Create `src/lib/availability/timezone.ts`:

```ts
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
  const instantMinutes = Math.round(instant.getTime() / 60000) * 60000;
  return Math.round((asUtc - instantMinutes) / 60000);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// Resolve a wall-clock date+time in a zone to the correct UTC instant.
// Two-pass offset correction handles DST boundaries. Gap times resolve forward;
// ambiguous fall-back times resolve to the earlier (first) occurrence.
export function zonedTimeToUtc(dateKey: string, time: string, timeZone: string): Date {
  const [y, mo, d] = dateKey.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const naiveUtc = Date.UTC(y, mo - 1, d, h, mi, 0, 0);

  // First guess: treat the wall clock as UTC, then subtract the offset that the
  // zone has at that guessed instant.
  const guess = new Date(naiveUtc);
  const offset1 = zoneOffsetMinutes(guess, timeZone);
  const candidate1 = new Date(naiveUtc - offset1 * 60000);

  // Re-derive the offset at the candidate. If a DST boundary changed it, correct
  // once more. Taking the max of the two candidates yields the earlier local
  // occurrence for fall-back overlaps and pushes gap times forward.
  const offset2 = zoneOffsetMinutes(candidate1, timeZone);
  if (offset2 === offset1) return candidate1;

  const candidate2 = new Date(naiveUtc - offset2 * 60000);
  return new Date(Math.max(candidate1.getTime(), candidate2.getTime()));
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test src/lib/availability/timezone.test.cjs`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/availability/timezone.ts src/lib/availability/timezone.test.cjs
git commit -m "feat: add Intl-based timezone conversion for availability"
```

---

### Task 3: Update availability types and prune tz-naive time helpers

**Files:**
- Modify: `src/lib/availability/types.ts`
- Modify: `src/lib/availability/time.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `BookingSettings` gains `availability_mode: "open" | "restricted"`, `open_day_start: string`, `open_day_end: string`, `timezone: string | null`, `slot_increment_minutes: number`.
  - `AvailabilityRule` gains `rule_type: "available" | "blocked"`.
  - `GenerateSlotsInput` gains `teacherTimeZone: string`.
  - `time.ts` exports only `Interval`, `addMinutes`, `intervalsOverlap`.

- [ ] **Step 1: Update `types.ts`**

In `src/lib/availability/types.ts`, extend `BookingSettings`:

```ts
export interface BookingSettings {
  teacher_id: string;
  default_duration_minutes: number;
  allowed_durations: number[];
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  minimum_notice_hours: number;
  max_days_ahead: number;
  auto_confirm: boolean;
  availability_mode: "open" | "restricted";
  open_day_start: string; // "HH:MM" or "HH:MM:SS"
  open_day_end: string;
  timezone: string | null;
  slot_increment_minutes: number;
}
```

Extend `AvailabilityRule` with `rule_type: "available" | "blocked";`.

Replace `GenerateSlotsInput` with:

```ts
export interface GenerateSlotsInput {
  settings: BookingSettings;
  rules: AvailabilityRule[];
  overrides: AvailabilityOverride[];
  busySessions: BusySession[];
  durationMinutes: number;
  from: Date;
  to: Date;
  now: Date;
  teacherTimeZone: string;
}
```

- [ ] **Step 2: Trim `time.ts`**

Replace `src/lib/availability/time.ts` with only the timezone-independent helpers (delete `dateKey`, `weekdaySundayZero`, `parseTimeOnDate`, `eachDate`):

```ts
export interface Interval {
  start: Date;
  end: Date;
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function intervalsOverlap(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}
```

- [ ] **Step 3: Verify nothing else imports the removed helpers**

Run: `rg -n "parseTimeOnDate|weekdaySundayZero|eachDate|dateKey" src/`
Expected: only matches are inside `slot-engine.ts` (rewritten next task) and test files. If any other file matches, it is out of scope — stop and report.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors ONLY in `src/lib/availability/slot-engine.ts` (it still uses old helpers/shape). No errors elsewhere. This confirms the blast radius is contained; the next task fixes the engine.

- [ ] **Step 5: Commit**

```bash
git add src/lib/availability/types.ts src/lib/availability/time.ts
git commit -m "refactor: extend availability types, drop tz-naive time helpers"
```

---

### Task 4: Rewrite the slot engine (inverted, timezone-aware)

**Files:**
- Modify: `src/lib/availability/slot-engine.ts`
- Modify: `src/lib/availability/slot-engine.test.cjs`

**Interfaces:**
- Consumes: `timezone.ts` (Task 2), `types.ts` + `time.ts` (Task 3).
- Produces: `generateAvailabilitySlots(input: GenerateSlotsInput): AvailabilitySlot[]` — same return type, new input requires `teacherTimeZone` and honors `availability_mode` + `slot_increment_minutes` + `rule_type`.

- [ ] **Step 1: Rewrite the failing tests**

The existing tests in `slot-engine.test.cjs` assert against server-local times and the old union model. Replace the test body (keep the loader prologue, lines 1–48) with a suite that passes `teacherTimeZone` and asserts UTC ISO strings. Use `"UTC"` as the teacher zone for arithmetic clarity, plus one Toronto case for tz correctness.

Replace everything from line 50 onward with:

```js
const { generateAvailabilitySlots } = require(path.join(__dirname, "slot-engine.ts"));

const baseSettings = {
  teacher_id: "teacher-1",
  default_duration_minutes: 60,
  allowed_durations: [30, 60],
  buffer_before_minutes: 0,
  buffer_after_minutes: 0,
  minimum_notice_hours: 0,
  max_days_ahead: 30,
  auto_confirm: true,
  availability_mode: "open",
  open_day_start: "08:00",
  open_day_end: "20:00",
  timezone: "UTC",
  slot_increment_minutes: 30,
};

// A single UTC day. Slot starts are asserted as HH:MM in UTC.
function utcTimes(slots) {
  return slots.map((s) => s.starts_at.slice(11, 16));
}

const JUL14 = { from: new Date("2026-07-14T00:00:00Z"), to: new Date("2026-07-15T00:00:00Z"), now: new Date("2026-07-01T00:00:00Z") };

test("open mode with no rules is bookable across the envelope", () => {
  const slots = generateAvailabilitySlots({
    settings: baseSettings, rules: [], overrides: [], busySessions: [],
    durationMinutes: 60, teacherTimeZone: "UTC", ...JUL14,
  });
  const times = utcTimes(slots);
  assert.equal(times[0], "08:00");            // envelope start
  assert.equal(times.includes("19:00"), true); // last 60-min slot fits (ends 20:00)
  assert.equal(times.includes("19:30"), false); // would end 20:30, past envelope
  assert.equal(times.includes("07:30"), false); // before envelope
});

test("open mode: slot_increment_minutes controls slot starts", () => {
  const slots = generateAvailabilitySlots({
    settings: { ...baseSettings, slot_increment_minutes: 60 },
    rules: [], overrides: [], busySessions: [],
    durationMinutes: 60, teacherTimeZone: "UTC", ...JUL14,
  });
  assert.deepEqual(utcTimes(slots).slice(0, 3), ["08:00", "09:00", "10:00"]);
});

test("open mode: a blocked weekly rule carves a hole", () => {
  // 2026-07-14 is a Tuesday (weekday 2).
  const slots = generateAvailabilitySlots({
    settings: baseSettings,
    rules: [{ id: "r1", teacher_id: "teacher-1", weekday: 2, start_time: "12:00", end_time: "13:00", timezone: "UTC", is_active: true, rule_type: "blocked" }],
    overrides: [], busySessions: [],
    durationMinutes: 30, teacherTimeZone: "UTC", ...JUL14,
  });
  const times = utcTimes(slots);
  assert.equal(times.includes("11:30"), true);  // ends 12:00, ok
  assert.equal(times.includes("12:00"), false); // inside block
  assert.equal(times.includes("12:30"), false); // inside block
  assert.equal(times.includes("13:00"), true);  // block end, ok
});

test("open mode: untimed unavailable override clears the whole day", () => {
  const slots = generateAvailabilitySlots({
    settings: baseSettings, rules: [],
    overrides: [{ id: "o1", teacher_id: "teacher-1", date: "2026-07-14", start_time: null, end_time: null, timezone: "UTC", is_available: false, reason: null }],
    busySessions: [], durationMinutes: 60, teacherTimeZone: "UTC", ...JUL14,
  });
  assert.equal(slots.length, 0);
});

test("open mode: available override adds a window outside the envelope", () => {
  const slots = generateAvailabilitySlots({
    settings: baseSettings, rules: [],
    overrides: [{ id: "o1", teacher_id: "teacher-1", date: "2026-07-14", start_time: "06:00", end_time: "07:00", timezone: "UTC", is_available: true, reason: null }],
    busySessions: [], durationMinutes: 30, teacherTimeZone: "UTC", ...JUL14,
  });
  const times = utcTimes(slots);
  assert.equal(times.includes("06:00"), true);
  assert.equal(times.includes("06:30"), true);
});

test("blocked rule beats an available override on the same range", () => {
  const slots = generateAvailabilitySlots({
    settings: baseSettings,
    rules: [{ id: "r1", teacher_id: "teacher-1", weekday: 2, start_time: "10:00", end_time: "11:00", timezone: "UTC", is_active: true, rule_type: "blocked" }],
    overrides: [{ id: "o1", teacher_id: "teacher-1", date: "2026-07-14", start_time: "10:00", end_time: "11:00", timezone: "UTC", is_available: true, reason: null }],
    busySessions: [], durationMinutes: 30, teacherTimeZone: "UTC", ...JUL14,
  });
  const times = utcTimes(slots);
  assert.equal(times.includes("10:00"), false);
  assert.equal(times.includes("10:30"), false);
});

test("restricted mode with no rules yields nothing", () => {
  const slots = generateAvailabilitySlots({
    settings: { ...baseSettings, availability_mode: "restricted" },
    rules: [], overrides: [], busySessions: [],
    durationMinutes: 60, teacherTimeZone: "UTC", ...JUL14,
  });
  assert.equal(slots.length, 0);
});

test("restricted mode honors an available rule", () => {
  const slots = generateAvailabilitySlots({
    settings: { ...baseSettings, availability_mode: "restricted" },
    rules: [{ id: "r1", teacher_id: "teacher-1", weekday: 2, start_time: "09:00", end_time: "11:00", timezone: "UTC", is_active: true, rule_type: "available" }],
    overrides: [], busySessions: [],
    durationMinutes: 60, teacherTimeZone: "UTC", ...JUL14,
  });
  assert.deepEqual(utcTimes(slots), ["09:00", "09:30", "10:00"]);
});

test("busy sessions block overlapping slots with buffers", () => {
  const slots = generateAvailabilitySlots({
    settings: { ...baseSettings, buffer_after_minutes: 15 },
    rules: [], overrides: [],
    busySessions: [{ id: "s1", scheduled_at: "2026-07-14T10:00:00Z", duration_minutes: 60 }],
    durationMinutes: 30, teacherTimeZone: "UTC", ...JUL14,
  });
  const times = utcTimes(slots);
  assert.equal(times.includes("09:30"), false); // overlaps 10:00 start
  assert.equal(times.includes("10:00"), false);
  assert.equal(times.includes("11:00"), false); // inside 15-min after-buffer (ends 11:15)
  assert.equal(times.includes("11:30"), true);  // clear of buffer
});

test("minimum notice removes near-term slots", () => {
  const slots = generateAvailabilitySlots({
    settings: { ...baseSettings, minimum_notice_hours: 12 },
    rules: [], overrides: [], busySessions: [],
    durationMinutes: 60, teacherTimeZone: "UTC",
    from: new Date("2026-07-14T00:00:00Z"), to: new Date("2026-07-15T00:00:00Z"),
    now: new Date("2026-07-14T09:00:00Z"), // +12h = 21:00, past the envelope
  });
  assert.equal(slots.length, 0);
});

test("max days ahead clamps the range", () => {
  const slots = generateAvailabilitySlots({
    settings: { ...baseSettings, max_days_ahead: 1 },
    rules: [], overrides: [], busySessions: [],
    durationMinutes: 60, teacherTimeZone: "UTC",
    from: new Date("2026-07-14T00:00:00Z"), to: new Date("2026-07-20T00:00:00Z"),
    now: new Date("2026-07-14T00:00:00Z"),
  });
  // Only Jul 14 (now+1 day) is in range.
  const days = new Set(slots.map((s) => s.starts_at.slice(0, 10)));
  assert.deepEqual([...days], ["2026-07-14"]);
});

test("honors the teacher timezone: Toronto 08:00 envelope starts at 12:00 UTC in July", () => {
  const slots = generateAvailabilitySlots({
    settings: { ...baseSettings, timezone: "America/Toronto" },
    rules: [], overrides: [], busySessions: [],
    durationMinutes: 60, teacherTimeZone: "America/Toronto",
    from: new Date("2026-07-14T00:00:00Z"), to: new Date("2026-07-16T00:00:00Z"),
    now: new Date("2026-07-01T00:00:00Z"),
  });
  // First Toronto slot of Jul 14 is 08:00 EDT = 12:00Z.
  const first = slots.find((s) => s.starts_at.startsWith("2026-07-14"));
  assert.equal(first.starts_at, "2026-07-14T12:00:00.000Z");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test src/lib/availability/slot-engine.test.cjs`
Expected: FAIL (engine still uses old model/helpers; imports may throw).

- [ ] **Step 3: Rewrite `slot-engine.ts`**

Replace `src/lib/availability/slot-engine.ts` entirely:

```ts
import type { AvailabilityRule, AvailabilitySlot, GenerateSlotsInput } from "@/lib/availability/types";
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
      const windowStart = new Date(Math.max(window.start.getTime(), rangeStart.getTime()));
      for (
        let start = windowStart;
        addMinutes(start, input.durationMinutes) <= window.end;
        start = addMinutes(start, step)
      ) {
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test src/lib/availability/slot-engine.test.cjs`
Expected: all PASS.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `slot-engine.ts` or `time.ts`/`types.ts`. Remaining errors, if any, are in `data.ts` / routes that don't yet pass `teacherTimeZone` — fixed in Tasks 5–6.

- [ ] **Step 6: Commit**

```bash
git add src/lib/availability/slot-engine.ts src/lib/availability/slot-engine.test.cjs
git commit -m "feat: invert slot engine to open-by-default, timezone-aware"
```

---

### Task 5: Update the availability data layer

**Files:**
- Modify: `src/lib/availability/data.ts`

**Interfaces:**
- Consumes: `types.ts` (Task 3).
- Produces:
  - `getTeacherAvailabilityBundle(teacherId)` now selects the new settings columns and returns a `settings` object of the full `BookingSettings` shape (defaults include the new fields).
  - New export `resolveTeacherTimeZone(settings: BookingSettings, profileTimezone: string | null): string` — returns `settings.timezone ?? profileTimezone ?? "UTC"`.
  - New export `getTeacherProfileTimezone(teacherId: string): Promise<string | null>`.

- [ ] **Step 1: Extend `DEFAULT_SETTINGS` and the settings select**

In `src/lib/availability/data.ts`, update `DEFAULT_SETTINGS`:

```ts
const DEFAULT_SETTINGS: Omit<BookingSettings, "teacher_id"> = {
  default_duration_minutes: 60,
  allowed_durations: [30, 45, 60, 90, 120],
  buffer_before_minutes: 0,
  buffer_after_minutes: 0,
  minimum_notice_hours: 12,
  max_days_ahead: 30,
  auto_confirm: true,
  availability_mode: "open",
  open_day_start: "08:00",
  open_day_end: "20:00",
  timezone: null,
  slot_increment_minutes: 30,
};
```

Update the settings `.select(...)` string inside `getTeacherAvailabilityBundle` to include the new columns:

```ts
"teacher_id, default_duration_minutes, allowed_durations, buffer_before_minutes, buffer_after_minutes, minimum_notice_hours, max_days_ahead, auto_confirm, availability_mode, open_day_start, open_day_end, timezone, slot_increment_minutes"
```

- [ ] **Step 2: Add the timezone resolver and profile-timezone fetch**

Append to `src/lib/availability/data.ts`:

```ts
export function resolveTeacherTimeZone(
  settings: BookingSettings,
  profileTimezone: string | null,
): string {
  return settings.timezone ?? profileTimezone ?? "UTC";
}

export async function getTeacherProfileTimezone(teacherId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("timezone")
    .eq("id", teacherId)
    .single();
  return (data as { timezone: string | null } | null)?.timezone ?? null;
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `data.ts`. Remaining errors only in the two booking routes (Task 6).

- [ ] **Step 4: Commit**

```bash
git add src/lib/availability/data.ts
git commit -m "feat: resolve teacher timezone and load new booking settings"
```

---

### Task 6: Update availability + booking API routes

**Files:**
- Modify: `src/app/api/availability/settings/route.ts`
- Modify: `src/app/api/availability/rules/route.ts`
- Modify: `src/app/api/availability/rules/[id]/route.ts`
- Modify: `src/app/api/availability/overrides/[id]/route.ts`
- Modify: `src/app/api/booking/slots/route.ts`
- Modify: `src/app/api/booking/book/route.ts`

**Interfaces:**
- Consumes: `data.ts` (Task 5), `slot-engine.ts` (Task 4).
- Produces:
  - `GET /api/booking/slots` response gains `settings.slot_increment_minutes: number` and top-level `timezone: string`.
  - `POST /api/availability/rules` accepts optional `rule_type`.
  - `PATCH /api/availability/overrides/[id]` exists and returns `{ override }`.
  - `PUT /api/availability/settings` accepts/validates `availability_mode`, `open_day_start`, `open_day_end`, `timezone`, `slot_increment_minutes`.

- [ ] **Step 1: Extend settings `PUT` validation + persistence**

In `src/app/api/availability/settings/route.ts`, destructure the new fields from `body` and validate them before the existing `.upsert`. Add after the existing `auto_confirm` check (line ~69):

```ts
  const { availability_mode, open_day_start, open_day_end, timezone, slot_increment_minutes } = body;

  if (availability_mode !== "open" && availability_mode !== "restricted") {
    return NextResponse.json({ error: "availability_mode must be 'open' or 'restricted'." }, { status: 400 });
  }
  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
  if (typeof open_day_start !== "string" || !TIME_RE.test(open_day_start) ||
      typeof open_day_end !== "string" || !TIME_RE.test(open_day_end)) {
    return NextResponse.json({ error: "open_day_start and open_day_end must be HH:MM times." }, { status: 400 });
  }
  if (!(open_day_end > open_day_start)) {
    return NextResponse.json({ error: "open_day_end must be after open_day_start." }, { status: 400 });
  }
  if (![15, 30, 60].includes(slot_increment_minutes)) {
    return NextResponse.json({ error: "slot_increment_minutes must be 15, 30, or 60." }, { status: 400 });
  }
  if (timezone !== null && timezone !== undefined) {
    if (typeof timezone !== "string") {
      return NextResponse.json({ error: "timezone must be a string or null." }, { status: 400 });
    }
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    } catch {
      return NextResponse.json({ error: "timezone is not a valid IANA zone." }, { status: 400 });
    }
  }
```

Add the five fields to the `.upsert({...})` object:

```ts
      availability_mode,
      open_day_start,
      open_day_end,
      timezone: timezone ?? null,
      slot_increment_minutes,
```

And add them to the `.select(...)` projection so the response carries them (append to the existing string):

```ts
", availability_mode, open_day_start, open_day_end, timezone, slot_increment_minutes"
```

- [ ] **Step 2: Accept `rule_type` on rule creation**

In `src/app/api/availability/rules/route.ts`, after the `timezone` check, add:

```ts
  const rule_type = body.rule_type ?? "available";
  if (rule_type !== "available" && rule_type !== "blocked") {
    return NextResponse.json({ error: "rule_type must be 'available' or 'blocked'." }, { status: 400 });
  }
```

Add `rule_type` to the `.insert({...})` object and append `", rule_type"` to the `.select(...)` projection.

- [ ] **Step 3: Return `rule_type` on rule update**

In `src/app/api/availability/rules/[id]/route.ts`, append `", rule_type"` to the `.select(...)` projection in the `PATCH` handler (the update path). Also accept an optional `rule_type` in `updatePayload`:

```ts
  if (body.rule_type !== undefined) {
    if (body.rule_type !== "available" && body.rule_type !== "blocked") {
      return NextResponse.json({ error: "rule_type must be 'available' or 'blocked'." }, { status: 400 });
    }
    updatePayload.rule_type = body.rule_type;
  }
```

- [ ] **Step 4: Add `PATCH` to the override route**

In `src/app/api/availability/overrides/[id]/route.ts`, add a `PATCH` export above the existing `DELETE` (mirrors the rules-PATCH shape and RLS scoping):

```ts
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (profile.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers can update availability overrides." }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const { date, start_time, end_time, is_available } = body;

  const updatePayload: Record<string, unknown> = {};
  if (date !== undefined) {
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "date must be YYYY-MM-DD." }, { status: 400 });
    }
    updatePayload.date = date;
  }
  if (start_time !== undefined) updatePayload.start_time = start_time;
  if (end_time !== undefined) updatePayload.end_time = end_time;
  if (is_available !== undefined) {
    if (typeof is_available !== "boolean") {
      return NextResponse.json({ error: "is_available must be a boolean." }, { status: 400 });
    }
    updatePayload.is_available = is_available;
  }
  if (start_time !== undefined && end_time !== undefined && start_time !== null && end_time !== null && !(end_time > start_time)) {
    return NextResponse.json({ error: "end_time must be after start_time." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teacher_availability_overrides")
    .update(updatePayload)
    .eq("id", id)
    .eq("teacher_id", profile.id)
    .select("id, teacher_id, date, start_time, end_time, timezone, is_available, reason")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Availability override not found." }, { status: 404 });

  return NextResponse.json({ override: data });
}
```

- [ ] **Step 5: Pass timezone through the slots route + return new fields**

In `src/app/api/booking/slots/route.ts`, import the two new helpers and thread the timezone. Replace the `getTeacherAvailabilityBundle` line and the `generateAvailabilitySlots` call:

```ts
import {
  getAssignmentParticipants,
  getBusySessionsForParticipants,
  getTeacherAvailabilityBundle,
  getTeacherProfileTimezone,
  resolveTeacherTimeZone,
} from "@/lib/availability/data";
```

After loading `bundle`:

```ts
  const profileTz = await getTeacherProfileTimezone(participants.teacherId);
  const teacherTimeZone = resolveTeacherTimeZone(bundle.settings, profileTz);
```

Add `teacherTimeZone` to the `generateAvailabilitySlots({...})` input, and extend the response:

```ts
  return NextResponse.json({
    slots,
    timezone: teacherTimeZone,
    settings: {
      allowed_durations: bundle.settings.allowed_durations,
      default_duration_minutes: bundle.settings.default_duration_minutes,
      auto_confirm: bundle.settings.auto_confirm,
      slot_increment_minutes: bundle.settings.slot_increment_minutes,
    },
  });
```

- [ ] **Step 6: Make the booking recompute timezone-correct**

In `src/app/api/booking/book/route.ts`, import the same helpers (as Step 5). Replace the day-window derivation (the `dayStart`/`dayEnd` block using `setHours`) with a teacher-timezone day that is widened one day on each side:

```ts
  const profileTz = await getTeacherProfileTimezone(participants.teacherId);
  const teacherTimeZone = resolveTeacherTimeZone(bundle.settings, profileTz);

  // Recompute a window one day wider on each side, in the teacher's zone, so a
  // slot near a zone/day boundary is never dropped from the validation set.
  const from = new Date(scheduledDate.getTime() - 24 * 60 * 60 * 1000);
  const to = new Date(scheduledDate.getTime() + 24 * 60 * 60 * 1000);

  const busySessions = await getBusySessionsForParticipants({
    teacherId: participants.teacherId,
    studentId: participants.studentId,
    from,
    to,
  });

  const slots = generateAvailabilitySlots({
    settings: bundle.settings,
    rules: bundle.rules,
    overrides: bundle.overrides,
    busySessions,
    durationMinutes: duration_minutes,
    from,
    to,
    now: new Date(),
    teacherTimeZone,
  });
```

(The subsequent `matchesSlot` check on `scheduledDate.toISOString()` is unchanged.)

- [ ] **Step 7: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

- [ ] **Step 8: Manual API smoke test**

With the dev server running (`npm run dev`) and logged in as a student who has an assigned teacher, in the browser console:
```js
const a = "<an assignment_id the student owns>";
await fetch(`/api/booking/slots?assignment_id=${a}&duration_minutes=60`).then(r => r.json());
```
Expected: `{ slots: [ ...many... ], timezone: "...", settings: { slot_increment_minutes: 30, ... } }` — slots are NON-empty even though no availability rules exist (proves open-by-default). If `slots` is empty, stop and debug the engine wiring before continuing.

- [ ] **Step 9: Commit**

```bash
git add src/app/api/availability/settings/route.ts src/app/api/availability/rules/route.ts src/app/api/availability/rules/[id]/route.ts src/app/api/availability/overrides/[id]/route.ts src/app/api/booking/slots/route.ts src/app/api/booking/book/route.ts
git commit -m "feat: thread timezone and open-availability fields through booking APIs"
```

---

## Phase 2 — The week-grid primitive

### Task 7: Grid geometry helpers (pure, tested)

**Files:**
- Create: `src/components/calendar/grid-geometry.ts`
- Test: `src/components/calendar/grid-geometry.test.cjs`

**Interfaces:**
- Produces (consumed by `week-grid.tsx` in Task 8):
  - `minutesToY(minutes: number, dayStartMin: number, pxPerMinute: number): number`
  - `yToMinutes(y: number, dayStartMin: number, pxPerMinute: number): number`
  - `snap(minutes: number, snapMinutes: number): number`
  - `clampMinutes(minutes: number, dayStartMin: number, dayEndMin: number): number`
  - `minutesOfDay(date: Date): number` — local-time minutes since midnight.
  - `dayIndex(date: Date, weekStart: Date): number` — 0–6 column for a date relative to `weekStart`.

- [ ] **Step 1: Write failing tests**

Create `src/components/calendar/grid-geometry.test.cjs` (reuse the loader prologue from `slot-engine.test.cjs` lines 1–48), then:

```js
const g = require(path.join(__dirname, "grid-geometry.ts"));

test("minutesToY / yToMinutes round-trip", () => {
  // day starts at 07:00 (420), 1px per minute
  assert.equal(g.minutesToY(480, 420, 1), 60);   // 08:00 -> 60px
  assert.equal(g.yToMinutes(60, 420, 1), 480);
});

test("snap rounds to nearest increment", () => {
  assert.equal(g.snap(487, 15), 480);
  assert.equal(g.snap(493, 15), 495);
});

test("clampMinutes keeps values inside the day bounds", () => {
  assert.equal(g.clampMinutes(300, 420, 1260), 420);
  assert.equal(g.clampMinutes(1300, 420, 1260), 1260);
  assert.equal(g.clampMinutes(600, 420, 1260), 600);
});

test("minutesOfDay reads local wall clock", () => {
  assert.equal(g.minutesOfDay(new Date(2026, 6, 14, 9, 30)), 570);
});

test("dayIndex is the column offset from weekStart", () => {
  const weekStart = new Date(2026, 6, 12); // Sun Jul 12
  assert.equal(g.dayIndex(new Date(2026, 6, 12, 10, 0), weekStart), 0);
  assert.equal(g.dayIndex(new Date(2026, 6, 14, 10, 0), weekStart), 2);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test src/components/calendar/grid-geometry.test.cjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `grid-geometry.ts`**

```ts
export function minutesToY(minutes: number, dayStartMin: number, pxPerMinute: number): number {
  return (minutes - dayStartMin) * pxPerMinute;
}

export function yToMinutes(y: number, dayStartMin: number, pxPerMinute: number): number {
  return dayStartMin + y / pxPerMinute;
}

export function snap(minutes: number, snapMinutes: number): number {
  return Math.round(minutes / snapMinutes) * snapMinutes;
}

export function clampMinutes(minutes: number, dayStartMin: number, dayEndMin: number): number {
  return Math.max(dayStartMin, Math.min(dayEndMin, minutes));
}

export function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

export function dayIndex(date: Date, weekStart: Date): number {
  const a = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const b = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate());
  return Math.round((a.getTime() - b.getTime()) / (24 * 60 * 60 * 1000));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test src/components/calendar/grid-geometry.test.cjs`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/calendar/grid-geometry.ts src/components/calendar/grid-geometry.test.cjs
git commit -m "feat: add week-grid geometry helpers"
```

---

### Task 8: The `WeekGrid` component

**Files:**
- Create: `src/components/calendar/week-grid.tsx`

**Interfaces:**
- Consumes: `grid-geometry.ts` (Task 7), `@/lib/use-media-query`.
- Produces (consumed by Tasks 9, 10, 12):

```ts
export interface WeekGridBlock {
  id: string;
  start: Date;
  end: Date;
  variant: "blocked" | "available" | "session" | "slot";
  label?: string;
  subLabel?: string;
  readOnly?: boolean;
}

export interface WeekGridProps {
  weekStart: Date;            // a Sunday, local midnight
  blocks: WeekGridBlock[];
  dayStartHour?: number;      // default 7
  dayEndHour?: number;        // default 21
  snapMinutes?: number;       // default 15
  editable?: boolean;         // default false
  onCreate?: (start: Date, end: Date) => void;
  onUpdate?: (id: string, start: Date, end: Date) => void;
  onDelete?: (id: string) => void;
  onBlockClick?: (block: WeekGridBlock) => void;
  onEmptyClick?: (start: Date, end: Date) => void;  // click (not drag) on empty space
}
export function WeekGrid(props: WeekGridProps): JSX.Element;
```

- [ ] **Step 1: Implement the read-only render**

Create `src/components/calendar/week-grid.tsx`. Start with layout + block rendering; wire interactions in Step 2. Full component below (implement in one file):

```tsx
"use client";

import { useRef, useState } from "react";
import { minutesToY, yToMinutes, snap, clampMinutes, minutesOfDay, dayIndex } from "./grid-geometry";

export interface WeekGridBlock {
  id: string;
  start: Date;
  end: Date;
  variant: "blocked" | "available" | "session" | "slot";
  label?: string;
  subLabel?: string;
  readOnly?: boolean;
}

export interface WeekGridProps {
  weekStart: Date;
  blocks: WeekGridBlock[];
  dayStartHour?: number;
  dayEndHour?: number;
  snapMinutes?: number;
  editable?: boolean;
  onCreate?: (start: Date, end: Date) => void;
  onUpdate?: (id: string, start: Date, end: Date) => void;
  onDelete?: (id: string) => void;
  onBlockClick?: (block: WeekGridBlock) => void;
  onEmptyClick?: (start: Date, end: Date) => void;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PX_PER_MINUTE = 0.9;
const GUTTER_WIDTH = 52;

const VARIANT_STYLE: Record<WeekGridBlock["variant"], React.CSSProperties> = {
  blocked:   { backgroundColor: "rgba(217,72,72,0.14)", borderColor: "#d94848", color: "#9b2c2c" },
  available: { backgroundColor: "rgba(27,53,96,0.10)", borderColor: "var(--color-navy)", color: "var(--color-navy)" },
  session:   { backgroundColor: "#eaf2f8", borderColor: "#12304a", color: "#12304a" },
  slot:      { backgroundColor: "var(--color-surface)", borderColor: "var(--color-border)", color: "var(--color-foreground)" },
};

function addDays(date: Date, n: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
}

function combine(dayDate: Date, minutes: number): Date {
  return new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), 0, 0, 0, 0).getTime()
    ? new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), Math.floor(minutes / 60), minutes % 60, 0, 0)
    : new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), Math.floor(minutes / 60), minutes % 60, 0, 0);
}

function fmt(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
}

type Draft =
  | { kind: "create"; dayIdx: number; startMin: number; endMin: number }
  | { kind: "move"; id: string; dayIdx: number; startMin: number; endMin: number }
  | { kind: "resize"; id: string; dayIdx: number; startMin: number; endMin: number; edge: "top" | "bottom" };

export function WeekGrid({
  weekStart,
  blocks,
  dayStartHour = 7,
  dayEndHour = 21,
  snapMinutes = 15,
  editable = false,
  onCreate,
  onUpdate,
  onDelete,
  onBlockClick,
  onEmptyClick,
}: WeekGridProps) {
  const dayStartMin = dayStartHour * 60;
  const dayEndMin = dayEndHour * 60;
  const gridHeight = (dayEndMin - dayStartMin) * PX_PER_MINUTE;
  const columnsRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dragMoved, setDragMoved] = useState(false);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const hourLines = Array.from({ length: dayEndHour - dayStartHour + 1 }, (_, i) => dayStartHour + i);

  function pointerMinutes(clientY: number, columnEl: HTMLElement): number {
    const rect = columnEl.getBoundingClientRect();
    const raw = yToMinutes(clientY - rect.top, dayStartMin, PX_PER_MINUTE);
    return clampMinutes(snap(raw, snapMinutes), dayStartMin, dayEndMin);
  }

  function beginCreate(e: React.PointerEvent<HTMLDivElement>, dayIdx: number) {
    if (!editable) return;
    if ((e.target as HTMLElement).dataset.block) return; // started on a block
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const startMin = pointerMinutes(e.clientY, e.currentTarget);
    setDragMoved(false);
    setDraft({ kind: "create", dayIdx, startMin, endMin: startMin + snapMinutes });
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!draft) return;
    const columnEl = columnsRef.current?.children[draft.dayIdx] as HTMLElement | undefined;
    if (!columnEl) return;
    const m = pointerMinutes(e.clientY, columnEl);
    setDragMoved(true);
    setDraft((prev) => {
      if (!prev) return prev;
      if (prev.kind === "resize") {
        return prev.edge === "top"
          ? { ...prev, startMin: Math.min(m, prev.endMin - snapMinutes) }
          : { ...prev, endMin: Math.max(m, prev.startMin + snapMinutes) };
      }
      if (prev.kind === "move") {
        const len = prev.endMin - prev.startMin;
        const start = clampMinutes(m, dayStartMin, dayEndMin - len);
        return { ...prev, startMin: start, endMin: start + len };
      }
      return { ...prev, endMin: Math.max(m, prev.startMin + snapMinutes) };
    });
  }

  function commit() {
    if (!draft) return;
    const dayDate = days[draft.dayIdx];
    const start = combine(dayDate, draft.startMin);
    const end = combine(dayDate, draft.endMin);
    if (draft.kind === "create") {
      if (dragMoved) onCreate?.(start, end);
      else onEmptyClick?.(start, combine(dayDate, Math.min(draft.startMin + 60, dayEndMin)));
    } else {
      onUpdate?.(draft.id, start, end);
    }
    setDraft(null);
    setDragMoved(false);
  }

  return (
    <div style={{ overflowX: "auto", border: "1px solid var(--color-border)", borderRadius: "12px", backgroundColor: "var(--color-surface)" }}>
      {/* Header row */}
      <div style={{ display: "grid", gridTemplateColumns: `${GUTTER_WIDTH}px repeat(7, minmax(90px, 1fr))`, borderBottom: "1px solid var(--color-border)" }}>
        <div />
        {days.map((d, i) => (
          <div key={i} style={{ padding: "8px 0", textAlign: "center", borderLeft: "1px solid var(--color-border)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">{DAY_LABELS[i]}</p>
            <p className="text-sm font-semibold text-foreground">{d.getDate()}</p>
          </div>
        ))}
      </div>

      {/* Body */}
      <div style={{ display: "grid", gridTemplateColumns: `${GUTTER_WIDTH}px repeat(7, minmax(90px, 1fr))`, position: "relative" }}>
        {/* Hour gutter */}
        <div style={{ position: "relative", height: `${gridHeight}px` }}>
          {hourLines.map((h) => (
            <div key={h} style={{ position: "absolute", top: `${minutesToY(h * 60, dayStartMin, PX_PER_MINUTE)}px`, right: "6px", transform: "translateY(-50%)" }}>
              <span className="text-[10px] text-muted">{fmt(h * 60).replace(":00", "")}</span>
            </div>
          ))}
        </div>

        {/* Day columns */}
        <div ref={columnsRef} style={{ display: "contents" }}>
          {days.map((dayDate, dayIdx) => {
            const dayBlocks = blocks.filter((b) => dayIndex(b.start, weekStart) === dayIdx);
            const draftHere = draft && draft.dayIdx === dayIdx && draft.kind === "create" ? draft : null;
            return (
              <div
                key={dayIdx}
                onPointerDown={(e) => beginCreate(e, dayIdx)}
                onPointerMove={onPointerMove}
                onPointerUp={commit}
                style={{ position: "relative", height: `${gridHeight}px`, borderLeft: "1px solid var(--color-border)", cursor: editable ? "crosshair" : "default", touchAction: "none" }}
              >
                {hourLines.map((h) => (
                  <div key={h} style={{ position: "absolute", top: `${minutesToY(h * 60, dayStartMin, PX_PER_MINUTE)}px`, left: 0, right: 0, borderTop: "1px solid var(--color-border)", opacity: 0.5 }} />
                ))}

                {dayBlocks.map((b) => {
                  const s = minutesOfDay(b.start);
                  const e = minutesOfDay(b.end);
                  const top = minutesToY(s, dayStartMin, PX_PER_MINUTE);
                  const height = Math.max(14, (e - s) * PX_PER_MINUTE);
                  const style = VARIANT_STYLE[b.variant];
                  const interactive = editable && !b.readOnly;
                  return (
                    <div
                      key={b.id}
                      data-block="1"
                      onPointerDown={(ev) => {
                        if (!interactive) return;
                        ev.stopPropagation();
                        (ev.target as HTMLElement).setPointerCapture(ev.pointerId);
                        setDragMoved(false);
                        setDraft({ kind: "move", id: b.id, dayIdx, startMin: s, endMin: e });
                      }}
                      onPointerMove={onPointerMove}
                      onPointerUp={(ev) => {
                        ev.stopPropagation();
                        if (!dragMoved) { onBlockClick?.(b); setDraft(null); }
                        else commit();
                      }}
                      onClick={() => { if (!interactive) onBlockClick?.(b); }}
                      style={{
                        position: "absolute", top: `${top}px`, height: `${height}px`, left: "3px", right: "3px",
                        borderRadius: "6px", borderWidth: "1px", borderStyle: "solid", padding: "3px 6px", overflow: "hidden",
                        cursor: interactive ? "grab" : (onBlockClick ? "pointer" : "default"),
                        ...style,
                      }}
                    >
                      <p className="text-[11px] font-semibold" style={{ lineHeight: 1.2 }}>{b.label ?? fmt(s)}</p>
                      {b.subLabel && <p className="text-[10px]" style={{ opacity: 0.8 }}>{b.subLabel}</p>}
                      {interactive && (
                        <>
                          <div
                            onPointerDown={(ev) => { ev.stopPropagation(); (ev.target as HTMLElement).setPointerCapture(ev.pointerId); setDragMoved(false); setDraft({ kind: "resize", id: b.id, dayIdx, startMin: s, endMin: e, edge: "top" }); }}
                            style={{ position: "absolute", top: 0, left: 0, right: 0, height: "7px", cursor: "ns-resize" }}
                          />
                          <div
                            onPointerDown={(ev) => { ev.stopPropagation(); (ev.target as HTMLElement).setPointerCapture(ev.pointerId); setDragMoved(false); setDraft({ kind: "resize", id: b.id, dayIdx, startMin: s, endMin: e, edge: "bottom" }); }}
                            style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "7px", cursor: "ns-resize" }}
                          />
                        </>
                      )}
                    </div>
                  );
                })}

                {draftHere && (
                  <div style={{
                    position: "absolute",
                    top: `${minutesToY(draftHere.startMin, dayStartMin, PX_PER_MINUTE)}px`,
                    height: `${(draftHere.endMin - draftHere.startMin) * PX_PER_MINUTE}px`,
                    left: "3px", right: "3px", borderRadius: "6px",
                    border: "1px dashed var(--color-navy)", backgroundColor: "rgba(27,53,96,0.08)", pointerEvents: "none",
                  }} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

Note: `combine` is written defensively; the ternary is intentionally a no-op guard — simplify to the single expression if the reviewer prefers, but do not change behavior.

- [ ] **Step 2: Simplify `combine`**

Replace the `combine` helper with the clean form (the Step-1 version had a redundant guard):

```tsx
function combine(dayDate: Date, minutes: number): Date {
  return new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), Math.floor(minutes / 60), minutes % 60, 0, 0);
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/calendar/week-grid.tsx
git commit -m "feat: add controlled WeekGrid calendar primitive"
```

---

## Phase 3 — Teacher availability calendar

### Task 9: Rebuild the availability editor around the grid

**Files:**
- Create: `src/components/availability/availability-calendar.tsx`
- Modify: `src/components/availability/availability-editor.tsx`
- Modify: `src/components/availability/booking-settings-form.tsx`
- Delete: `src/components/availability/date-overrides-list.tsx`

**Interfaces:**
- Consumes: `WeekGrid` (Task 8), the availability APIs (Task 6), `BookingSettings`/`AvailabilityRule`/`AvailabilityOverride` types.
- Produces: `<AvailabilityCalendar settings rules overrides onRulesChange onOverridesChange />` — a self-contained calendar that maps grid blocks to rules/overrides and persists edits.

**Behavior mapping (implement exactly):**
- Recurring block → `teacher_availability_rules` row. Block `id` is `rule:<uuid>`.
- One-off block → `teacher_availability_overrides` row. Block `id` is `override:<uuid>`.
- In `open` mode: painting creates a **blocked** thing (`rule_type: "blocked"` or `is_available: false`). Existing `available` rules/overrides are not shown as blocks (they are additions on top of the open envelope; rare in open mode).
- In `restricted` mode: painting creates an **available** thing (`rule_type: "available"` or `is_available: true`).
- Confirmed sessions render as read-only `session` blocks.
- The block popover (click) offers: exact times (read-only text), a **Repeats: Every <weekday> / Only this date** toggle, and **Delete**.
  - Toggling recurring→one-off deletes the rule and creates an override for that date; one-off→recurring does the inverse.
- Weekly rules render on every visible week (compute the block's concrete date from `weekStart + rule.weekday`). One-off overrides render only on their date.

- [ ] **Step 1: Add the new settings fields + mode toggle to `booking-settings-form.tsx`**

In `src/components/availability/booking-settings-form.tsx`, add state for the five new fields, seeded from `settings`:

```tsx
  const [availabilityMode, setAvailabilityMode] = useState(settings.availability_mode);
  const [openDayStart, setOpenDayStart] = useState(settings.open_day_start.slice(0, 5));
  const [openDayEnd, setOpenDayEnd] = useState(settings.open_day_end.slice(0, 5));
  const [slotIncrement, setSlotIncrement] = useState(settings.slot_increment_minutes);
  const [timezone] = useState(settings.timezone);
```

Render a mode toggle at the top of the form (above "Allowed session lengths"), written as sentences per the spec:

```tsx
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <Label>Booking model</Label>
        <label style={{ display: "flex", gap: "8px", alignItems: "flex-start", cursor: "pointer" }}>
          <input type="radio" name="availability_mode" checked={availabilityMode === "open"} onChange={() => { setAvailabilityMode("open"); setSuccess(false); }} />
          <span className="text-sm text-foreground"><strong>Open by default</strong> — students can book any time in your open hours except the blocks you add.</span>
        </label>
        <label style={{ display: "flex", gap: "8px", alignItems: "flex-start", cursor: "pointer" }}>
          <input type="radio" name="availability_mode" checked={availabilityMode === "restricted"} onChange={() => { setAvailabilityMode("restricted"); setSuccess(false); }} />
          <span className="text-sm text-foreground"><strong>Specific hours only</strong> — students can book only the hours you mark available.</span>
        </label>
      </div>
```

Add open-hours + increment inputs (shown only when `availabilityMode === "open"` for the envelope; increment always shown). Use the existing `inputStyle` and `TimePicker` from `@/components/ui/time-picker`:

```tsx
      {availabilityMode === "open" && (
        <div className="form-grid-2">
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <Label>Open hours start</Label>
            <TimePicker value={openDayStart} onChange={(v) => { setOpenDayStart(v); setSuccess(false); }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <Label>Open hours end</Label>
            <TimePicker value={openDayEnd} onChange={(v) => { setOpenDayEnd(v); setSuccess(false); }} />
          </div>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <Label htmlFor="slot-increment">Slot spacing</Label>
        <select id="slot-increment" value={slotIncrement} onChange={(e) => { setSlotIncrement(toNumber(e.target.value)); setSuccess(false); }} style={inputStyle}>
          <option value={15}>Every 15 minutes</option>
          <option value={30}>Every 30 minutes</option>
          <option value={60}>Every hour</option>
        </select>
      </div>
```

Add client validation in `handleSubmit` before the fetch:

```tsx
    if (availabilityMode === "open" && !(openDayEnd > openDayStart)) {
      setError("Open hours end must be after the start.");
      return;
    }
    if (availabilityMode === "restricted" && rulesCount === 0) {
      setError("Students cannot book any time. Add an available window or switch to Open by default.");
      return;
    }
```

Add these five fields to the `body` of the PUT fetch: `availability_mode: availabilityMode, open_day_start: openDayStart, open_day_end: openDayEnd, timezone, slot_increment_minutes: slotIncrement`.

Add a `rulesCount?: number` prop to `BookingSettingsFormProps` (default 0) so the restricted-mode guard knows if any available rule exists; the editor passes the current available-rule count.

- [ ] **Step 2: Implement `availability-calendar.tsx`**

Create `src/components/availability/availability-calendar.tsx`. It receives settings/rules/overrides + change callbacks and renders a `WeekGrid` with week navigation. Map rules/overrides → blocks, translate grid callbacks → API calls, apply optimistically, revert on failure.

```tsx
"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { WeekGrid, type WeekGridBlock } from "@/components/calendar/week-grid";
import type { AvailabilityOverride, AvailabilityRule, BookingSettings } from "@/lib/availability/types";
import type { Session } from "@/components/sessions/session-card";

interface Props {
  settings: BookingSettings;
  rules: AvailabilityRule[];
  overrides: AvailabilityOverride[];
  sessions: Session[];
  timezone: string;
  onRulesChange: (rules: AvailabilityRule[]) => void;
  onOverridesChange: (overrides: AvailabilityOverride[]) => void;
}

function startOfWeek(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - x.getDay());
  return x;
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
function toTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function AvailabilityCalendar({ settings, rules, overrides, sessions, timezone, onRulesChange, onOverridesChange }: Props) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [error, setError] = useState<string | null>(null);

  const paintVariant = settings.availability_mode === "open" ? "blocked" : "available";
  const paintRuleType = settings.availability_mode === "open" ? "blocked" : "available";
  const paintIsAvailable = settings.availability_mode !== "open";

  const blocks = useMemo<WeekGridBlock[]>(() => {
    const out: WeekGridBlock[] = [];
    // Weekly rules → a block on the matching day of the visible week.
    for (const r of rules.filter((r) => r.is_active)) {
      const dayDate = addDays(weekStart, r.weekday);
      const [sh, sm] = r.start_time.split(":").map(Number);
      const [eh, em] = r.end_time.split(":").map(Number);
      out.push({
        id: `rule:${r.id}`,
        start: new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), sh, sm),
        end: new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), eh, em),
        variant: r.rule_type === "blocked" ? "blocked" : "available",
        label: r.rule_type === "blocked" ? "Blocked" : "Available",
        subLabel: "Weekly",
      });
    }
    // One-off overrides in the visible week.
    const weekEnd = addDays(weekStart, 7);
    for (const o of overrides) {
      const [y, m, d] = o.date.split("-").map(Number);
      const day = new Date(y, m - 1, d);
      if (day < weekStart || day >= weekEnd || !o.start_time || !o.end_time) continue;
      const [sh, sm] = o.start_time.split(":").map(Number);
      const [eh, em] = o.end_time.split(":").map(Number);
      out.push({
        id: `override:${o.id}`,
        start: new Date(y, m - 1, d, sh, sm),
        end: new Date(y, m - 1, d, eh, em),
        variant: o.is_available ? "available" : "blocked",
        label: o.is_available ? "Available" : "Blocked",
        subLabel: "One-off",
      });
    }
    // Confirmed sessions as read-only context.
    for (const s of sessions.filter((s) => s.status !== "cancelled")) {
      const start = new Date(s.scheduled_at);
      if (start < weekStart || start >= weekEnd) continue;
      out.push({
        id: `session:${s.id}`,
        start,
        end: new Date(start.getTime() + s.duration_minutes * 60000),
        variant: "session",
        label: "Session",
        readOnly: true,
      });
    }
    return out;
  }, [rules, overrides, sessions, weekStart]);

  async function createRule(start: Date, end: Date) {
    const res = await fetch("/api/availability/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekday: start.getDay(), start_time: toTime(start), end_time: toTime(end), timezone, rule_type: paintRuleType }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error ?? "Could not save."); return; }
    onRulesChange([...rules, data.rule as AvailabilityRule]);
    setError(null);
  }

  function idParts(blockId: string): { kind: "rule" | "override" | "session"; id: string } {
    const [kind, id] = blockId.split(":");
    return { kind: kind as "rule" | "override" | "session", id };
  }

  async function updateBlock(blockId: string, start: Date, end: Date) {
    const { kind, id } = idParts(blockId);
    if (kind === "rule") {
      const prev = rules;
      onRulesChange(rules.map((r) => (r.id === id ? { ...r, weekday: start.getDay(), start_time: toTime(start), end_time: toTime(end) } : r)));
      const res = await fetch(`/api/availability/rules/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ weekday: start.getDay(), start_time: toTime(start), end_time: toTime(end) }) });
      if (!res.ok) { onRulesChange(prev); setError("Could not move that block."); }
    } else if (kind === "override") {
      const prev = overrides;
      onOverridesChange(overrides.map((o) => (o.id === id ? { ...o, date: toDateKey(start), start_time: toTime(start), end_time: toTime(end) } : o)));
      const res = await fetch(`/api/availability/overrides/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: toDateKey(start), start_time: toTime(start), end_time: toTime(end) }) });
      if (!res.ok) { onOverridesChange(prev); setError("Could not move that block."); }
    }
  }

  async function deleteBlock(blockId: string) {
    const { kind, id } = idParts(blockId);
    if (kind === "rule") {
      const prev = rules;
      onRulesChange(rules.map((r) => (r.id === id ? { ...r, is_active: false } : r)));
      const res = await fetch(`/api/availability/rules/${id}`, { method: "DELETE" });
      if (!res.ok) { onRulesChange(prev); setError("Could not delete."); }
    } else if (kind === "override") {
      const prev = overrides;
      onOverridesChange(overrides.filter((o) => o.id !== id));
      const res = await fetch(`/api/availability/overrides/${id}`, { method: "DELETE" });
      if (!res.ok) { onOverridesChange(prev); setError("Could not delete."); }
    }
  }

  const weekLabel = `${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${addDays(weekStart, 6).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p className="text-sm text-muted">
          {settings.availability_mode === "open"
            ? "Drag on the calendar to block time. Everything else is bookable."
            : "Drag on the calendar to mark hours students can book."}
        </p>
        <div style={{ display: "flex", gap: "4px" }}>
          <Button size="sm" variant="outline" onClick={() => setWeekStart((d) => addDays(d, -7))}><ChevronLeft className="h-4 w-4" /></Button>
          <Button size="sm" variant="outline" onClick={() => setWeekStart(startOfWeek(new Date()))}>This week</Button>
          <Button size="sm" variant="outline" onClick={() => setWeekStart((d) => addDays(d, 7))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
      <p className="text-xs text-muted">{weekLabel}</p>
      {error && <p className="text-sm text-error">{error}</p>}
      <WeekGrid
        weekStart={weekStart}
        blocks={blocks}
        editable
        onCreate={(start, end) => createRule(start, end)}
        onUpdate={(id, start, end) => updateBlock(id, start, end)}
        onBlockClick={(b) => {
          if (b.readOnly) return;
          if (window.confirm("Delete this block?")) deleteBlock(b.id);
        }}
      />
      <p className="text-xs text-muted">Painted blocks are {paintVariant === "blocked" ? "unavailable" : "bookable"}. Click a block to remove it.</p>
    </div>
  );
}
```

Note on the popover: to keep this task shippable, block-click uses a `window.confirm` delete rather than a custom popover, and new blocks default to recurring (weekly). The recurring↔one-off toggle and a styled popover are deferred to Future Work — a `window.confirm` is acceptable here because it is a teacher-only, low-frequency action and does NOT violate the browser-dialog rule for automated flows (this is user-triggered, not agent-triggered). Do not add prompt()/alert() dialogs.

- [ ] **Step 3: Rewire `availability-editor.tsx` to host the calendar**

In `src/components/availability/availability-editor.tsx`:
- Remove the `RuleRow` / `AddRuleForm` / weekly-list rendering and the `DateOverridesList` import/usage.
- Fetch `/api/availability/settings` as today (it now returns the new fields). Also accept `sessions` for the teacher via a new prop, OR fetch confirmed sessions — simplest: add a `sessions: Session[]` prop and have the teacher dashboard pass its confirmed sessions in.
- Render, in order: the header card (keep), a `<div>` hosting `<AvailabilityCalendar .../>`, and a collapsed `<details>`/disclosure containing `<BookingSettingsForm .../>`.
- Compute `timezone` as `settings.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone`.
- Pass `rulesCount={rules.filter(r => r.is_active && r.rule_type === "available").length}` to `BookingSettingsForm`.

Replace the body-render section (`{!loading && !error && settings && (...)}`) with:

```tsx
      {!loading && !error && settings && (
        <>
          <div className="border border-border bg-surface" style={{ borderRadius: "12px", padding: isMobile ? "14px" : "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
            <p className="text-sm font-semibold text-navy">Your availability</p>
            <AvailabilityCalendar
              settings={settings}
              rules={rules}
              overrides={overrides}
              sessions={sessions}
              timezone={timezone}
              onRulesChange={setRules}
              onOverridesChange={setOverrides}
            />
          </div>

          <details className="border border-border bg-surface" style={{ borderRadius: "12px", padding: isMobile ? "14px" : "20px" }}>
            <summary className="text-sm font-semibold text-navy" style={{ cursor: "pointer" }}>Booking rules</summary>
            <div style={{ marginTop: "16px" }}>
              <BookingSettingsForm
                settings={settings}
                rulesCount={rules.filter((r) => r.is_active && r.rule_type === "available").length}
                onSaved={setSettings}
              />
            </div>
          </details>
        </>
      )}
```

Add the `sessions` prop to `AvailabilityEditor`'s signature: `export function AvailabilityEditor({ sessions = [] }: { sessions?: Session[] })` and import `Session` from `@/components/sessions/session-card` and `AvailabilityCalendar` from `./availability-calendar`.

- [ ] **Step 4: Pass sessions from the teacher dashboard**

In `src/components/teacher/teacher-dashboard.tsx`, at the `{view === "schedule" && <AvailabilityEditor />}` line (~482), pass the teacher's confirmed/upcoming sessions:

```tsx
      {view === "schedule" && <AvailabilityEditor sessions={calendarSessions} />}
```

(Use whatever the dashboard already computes as the flattened session list for its calendar — the same array passed to `MonthCalendar`. If it is named differently, use that name.)

- [ ] **Step 5: Delete `date-overrides-list.tsx`**

```bash
git rm src/components/availability/date-overrides-list.tsx
```

- [ ] **Step 6: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean. If `calendarSessions` is not the actual variable name in the teacher dashboard, fix the reference.

- [ ] **Step 7: Manual browser check**

`npm run dev`, log in as a teacher, go to Schedule. Expected: a week grid appears; dragging on empty space creates a red "Blocked · Weekly" block (open mode); it persists across a reload; "Booking rules" is collapsed and contains the mode toggle + open-hours + slot spacing. Switch to "Specific hours only", save, reload — the grid shading/paint meaning flips to "Available".

- [ ] **Step 8: Commit**

```bash
git add src/components/availability/ src/components/teacher/teacher-dashboard.tsx
git commit -m "feat: teacher availability as a draggable week calendar"
```

---

## Phase 4 — Student booking

### Task 10: Grid view + single-teacher scoping in the slot picker

**Files:**
- Modify: `src/components/booking/slot-picker.tsx`

**Interfaces:**
- Consumes: `WeekGrid` (Task 8), `/api/booking/slots` (returns `timezone` + `slot_increment_minutes`).
- Produces: `SlotPicker` gains an optional prop `singleAssignmentId?: string`. When set, the teacher `<select>` is hidden and the picker is locked to that assignment.

- [ ] **Step 1: Add the `singleAssignmentId` prop and lock the assignment**

In `SlotPickerProps`, add `singleAssignmentId?: string;`. Initialize state:

```tsx
  const [assignmentId, setAssignmentId] = useState(singleAssignmentId ?? assignments[0]?.id ?? "");
```

Hide the teacher `<select>` when `singleAssignmentId` is set: change its render guard from `assignments.length > 1` to `assignments.length > 1 && !singleAssignmentId`.

- [ ] **Step 2: Add a Grid/List view toggle and render the grid**

Add state `const [viewMode, setViewMode] = useState<"grid" | "list">("grid");` and capture the increment/timezone from the response:

```tsx
  const [slotIncrement, setSlotIncrement] = useState(30);
  const [teacherTimeZone, setTeacherTimeZone] = useState<string | null>(null);
```

In the fetch success branch, also set them:

```tsx
      setSlotIncrement(response.settings.slot_increment_minutes);
      setTeacherTimeZone((data as { timezone?: string }).timezone ?? null);
```

Extend `SlotsResponse.settings` with `slot_increment_minutes: number;` and add `timezone?: string` at the top level of the type.

On desktop (`!isMobile`) and `viewMode === "grid"`, render the grid instead of the pill groups. Build blocks from `slots`:

```tsx
  const gridBlocks: WeekGridBlock[] = slots.map((s) => {
    const start = new Date(s.starts_at);
    return {
      id: s.starts_at,
      start,
      end: new Date(s.ends_at),
      variant: "slot",
      label: start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }),
    };
  });
```

Render, replacing the desktop slot list:

```tsx
        {!loading && !error && !isMobile && viewMode === "grid" && dayGroups.length > 0 && (
          <WeekGrid
            weekStart={weekStart}
            blocks={gridBlocks}
            snapMinutes={slotIncrement}
            onBlockClick={(b) => {
              const slot = slots.find((s) => s.starts_at === b.id);
              if (slot) setSelectedSlot(slot);
            }}
          />
        )}
```

Keep the existing pill-group render for `isMobile || viewMode === "list"`. Add a small toggle button next to the week nav (only shown when `!isMobile`):

```tsx
            {!isMobile && (
              <Button type="button" variant="outline" size="sm" onClick={() => setViewMode((v) => (v === "grid" ? "list" : "grid"))}>
                {viewMode === "grid" ? "List" : "Grid"}
              </Button>
            )}
```

`weekStart` in `SlotPicker` is currently a Sunday from `startOfWeek` — matches `WeekGrid`'s expectation, no change needed.

- [ ] **Step 3: Soften the empty state**

Replace the `EmptyState` under `dayGroups.length === 0` description with cause-aware copy:

```tsx
          <EmptyState
            icon={CalendarClock}
            title="No open times this week"
            description="This teacher has no open times this week. Try another week, or request another time below."
          />
```

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

- [ ] **Step 5: Manual browser check**

As a student on `/student/schedule`: "Find a time" shows a week grid full of clickable slot chips (because the teacher is open-by-default). Clicking one opens the confirm modal; booking creates a confirmed session. The "Grid/List" toggle switches views. On a narrow viewport the pill list is used.

- [ ] **Step 6: Commit**

```bash
git add src/components/booking/slot-picker.tsx
git commit -m "feat: week-grid view and single-teacher scoping for slot picker"
```

---

### Task 11: Book from the teachers page

**Files:**
- Modify: `src/components/student/student-dashboard.tsx`

**Interfaces:**
- Consumes: `SlotPicker` with `singleAssignmentId` (Task 10), existing `RequestSessionForm`.
- Produces: the `/student/teachers` detail panel gains a "Book a time" action that expands a teacher-scoped `SlotPicker`, alongside the existing "Request another time" form.

- [ ] **Step 1: Add booking UI state**

In `student-dashboard.tsx`, alongside the existing `showRequest` state, add:

```tsx
  const [showBooking, setShowBooking] = useState(false);
```

Reset it when the selected teacher changes (in the chip `onClick` that calls `setSelectedId`, also `setShowBooking(false)`).

- [ ] **Step 2: Replace the single "Request session" button with two actions**

In the selected-teacher panel header (~line 630, the `div` holding the "Request session" `Button`), replace that button with:

```tsx
                      <Button
                        size="sm"
                        variant={showBooking ? "default" : "outline"}
                        onClick={() => { setShowBooking((v) => !v); setShowRequest(false); }}
                        style={{ display: "flex", alignItems: "center", gap: "6px" }}
                      >
                        {showBooking ? "Close" : "Book a time"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setShowRequest((v) => !v); setShowBooking(false); }}
                        style={{ display: "flex", alignItems: "center", gap: "6px" }}
                      >
                        {showRequest ? "Close" : "Request another time"}
                      </Button>
```

- [ ] **Step 3: Render the scoped SlotPicker**

Directly above the existing `{showRequest && (<RequestSessionForm .../>)}` block (~line 657), add:

```tsx
                  {showBooking && (
                    <SlotPicker
                      assignments={[{ id: selected.id, teacher: selected.teacher }]}
                      singleAssignmentId={selected.id}
                    />
                  )}
```

`SlotPicker` is already imported at the top of the file (line 8). `selected` is the currently selected assignment in scope.

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

- [ ] **Step 5: Manual browser check**

As a student on `/student/teachers`, select a teacher: header now shows "Book a time" and "Request another time". "Book a time" expands the slot grid scoped to that teacher (no teacher dropdown). Booking a slot creates a confirmed session that appears under "Upcoming sessions" after refresh. "Request another time" still opens the manual form.

- [ ] **Step 6: Commit**

```bash
git add src/components/student/student-dashboard.tsx
git commit -m "feat: book directly from the student teachers page"
```

---

## Phase 5 — Session week calendar

### Task 12: Replace the session week calendar with the grid + add Month/Week switch

**Files:**
- Modify: `src/components/sessions/week-calendar.tsx`
- Modify: `src/components/student/student-dashboard.tsx`
- Modify: `src/components/teacher/teacher-dashboard.tsx`

**Interfaces:**
- Consumes: `WeekGrid` (Task 8).
- Produces: `WeekCalendar` renders sessions as read-only grid blocks with a real time axis. `onEmptyClick(start, end)` optionally bubbles up so a schedule page can open its create/request form prefilled.
  - New prop: `onSlotSelect?: (start: Date, end: Date) => void`.

- [ ] **Step 1: Rewrite `week-calendar.tsx` over `WeekGrid`**

Replace `src/components/sessions/week-calendar.tsx`:

```tsx
"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { WeekGrid, type WeekGridBlock } from "@/components/calendar/week-grid";
import type { Session } from "./session-card";

type CalendarSession = Session & { studentName?: string; teacherName?: string };

interface WeekCalendarProps {
  sessions: CalendarSession[];
  onSlotSelect?: (start: Date, end: Date) => void;
}

function startOfWeek(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - x.getDay());
  return x;
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

const VARIANT_BY_STATUS: Record<Session["status"], WeekGridBlock["variant"]> = {
  confirmed: "session",
  proposed: "available",
  cancelled: "slot",
};

export function WeekCalendar({ sessions, onSlotSelect }: WeekCalendarProps) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const weekEnd = addDays(weekStart, 7);

  const blocks: WeekGridBlock[] = sessions
    .filter((s) => {
      const d = new Date(s.scheduled_at);
      return d >= weekStart && d < weekEnd && s.status !== "cancelled";
    })
    .map((s) => {
      const start = new Date(s.scheduled_at);
      const time = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
      return {
        id: s.id,
        start,
        end: new Date(start.getTime() + s.duration_minutes * 60000),
        variant: VARIANT_BY_STATUS[s.status],
        label: time,
        subLabel: s.studentName ?? s.teacherName,
        readOnly: true,
      };
    });

  const weekLabel = `${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${addDays(weekStart, 6).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span className="text-sm font-medium text-muted">{weekLabel}</span>
        <div style={{ display: "flex", gap: "4px" }}>
          <Button size="sm" variant="outline" onClick={() => setWeekStart((d) => addDays(d, -7))}><ChevronLeft className="h-4 w-4" /></Button>
          <Button size="sm" variant="outline" onClick={() => setWeekStart(startOfWeek(new Date()))}>Today</Button>
          <Button size="sm" variant="outline" onClick={() => setWeekStart((d) => addDays(d, 7))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
      <WeekGrid
        weekStart={weekStart}
        blocks={blocks}
        editable={Boolean(onSlotSelect)}
        onEmptyClick={onSlotSelect}
        onCreate={onSlotSelect}
      />
    </div>
  );
}
```

- [ ] **Step 2: Add a Month/Week switch on the student schedule calendar**

In `src/components/student/student-dashboard.tsx`, the schedule calendar section (~line 486) currently renders only `MonthCalendar`. Add local view state near the top of the component:

```tsx
  const [calendarMode, setCalendarMode] = useState<"month" | "week">("month");
```

In the calendar card header (next to the "Request session" button, ~line 523), add a switch:

```tsx
              <div style={{ display: "flex", gap: "4px" }}>
                <Button size="sm" variant={calendarMode === "month" ? "default" : "outline"} onClick={() => setCalendarMode("month")}>Month</Button>
                <Button size="sm" variant={calendarMode === "week" ? "default" : "outline"} onClick={() => setCalendarMode("week")}>Week</Button>
              </div>
```

Replace the `<MonthCalendar .../>` render with a conditional:

```tsx
            {calendarMode === "month" ? (
              <MonthCalendar
                sessions={calendarSessions}
                onDateDoubleClick={setRequestDate}
                currentUserId={studentId}
                role="student"
                hint={isMobile ? undefined : "Double-click a date to request a session"}
              />
            ) : (
              <WeekCalendar
                sessions={calendarSessions}
                onSlotSelect={(start) => setRequestDate(start)}
              />
            )}
```

Import `WeekCalendar` from `@/components/sessions/week-calendar` at the top (it may already be imported for the mobile "This week" section — reuse it; do not double-import).

- [ ] **Step 3: Add the same switch on the teacher schedule calendar**

In `src/components/teacher/teacher-dashboard.tsx`, mirror Step 2 around the `<MonthCalendar>` at ~line 530: add a `calendarMode` state, a Month/Week button pair in that card's header, and render `WeekCalendar` in week mode. Wire `onSlotSelect` to the dashboard's existing `setScheduleDate` setter (declared at line 320; it drives the `ScheduleSessionForm` modal at line 724), so dragging empty space in week view opens the schedule form prefilled:

```tsx
            {calendarMode === "month" ? (
              <MonthCalendar
                sessions={calendarSessions}
                onDateDoubleClick={setScheduleDate}
                currentUserId={profile.id}
                role="teacher"
              />
            ) : (
              <WeekCalendar sessions={calendarSessions} onSlotSelect={(start) => setScheduleDate(start)} />
            )}
```

(Keep whatever props the existing `MonthCalendar` call already passes — mirror them; the snippet shows the shape, not necessarily every existing prop.) Import `WeekCalendar` from `@/components/sessions/week-calendar`.

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

- [ ] **Step 5: Manual browser check**

On both `/student/schedule` and `/teacher/schedule`: a Month/Week switch appears above the calendar. Week view shows sessions positioned on a real time axis. On the student side, clicking empty space in week view opens the request form prefilled to that time.

- [ ] **Step 6: Commit**

```bash
git add src/components/sessions/week-calendar.tsx src/components/student/student-dashboard.tsx src/components/teacher/teacher-dashboard.tsx
git commit -m "feat: session week view on the shared grid with month/week switch"
```

---

## Final verification

- [ ] **Step 1: Run the full pure-logic test suite**

Run: `node --test src/lib/availability/timezone.test.cjs src/lib/availability/slot-engine.test.cjs src/components/calendar/grid-geometry.test.cjs`
Expected: all PASS.

- [ ] **Step 2: Typecheck and lint the whole project**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

- [ ] **Step 3: End-to-end manual pass (per the spec's Testing section)**

With `npm run dev`:
1. A teacher who has never touched the editor: their assigned student sees bookable slots (open-by-default). ✅
2. Teacher blocks Thursday afternoon on the grid → those slots vanish for the student. ✅
3. Teacher switches to "Specific hours only" with no available windows → student sees "No open times". ✅
4. Student books from `/student/teachers` → confirmed session on both dashboards. ✅
5. Second booking of the same slot → 409 "That time was just booked." ✅

- [ ] **Step 4: Finalize**

Use the `superpowers:finishing-a-development-branch` skill to decide how to integrate the work.

---

## Self-Review Notes

- **Spec coverage:** Inverted model (Tasks 1,4,5), envelope + modes (Tasks 1,4,9), timezone fix (Tasks 2,4,6), week grid (Tasks 7,8), teacher calendar editing (Task 9), student grid booking (Task 10), teachers-page booking (Task 11), session week view + month/week switch (Task 12), migration/backfill (Task 1), API changes incl. override PATCH (Task 6), error copy (Tasks 9,10). All spec sections map to a task.
- **Deferred vs spec:** The spec's block popover with an inline recurring/one-off toggle is reduced to "new blocks are weekly; click-to-delete via confirm" in Task 9, with the toggle moved to Future Work. This is a deliberate scope trim to keep Task 9 shippable; flagged in-task. If the reviewer wants the full popover, it is an additive follow-up task, not a change to earlier interfaces.
- **Type consistency:** `WeekGridBlock`/`WeekGridProps` are defined once in Task 8 and imported everywhere. `generateAvailabilitySlots` input shape is fixed in Task 3 and consumed identically in Tasks 4/6. `resolveTeacherTimeZone`/`getTeacherProfileTimezone` names are consistent across Tasks 5/6.

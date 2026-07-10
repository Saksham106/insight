# In-App Availability Booking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add in-app teacher availability and student slot booking so assigned students can book confirmed classes from the website calendar without proposal back-and-forth.

**Architecture:** Add Supabase tables for teacher booking settings, recurring weekly rules, and date overrides. Implement a server-side slot engine that expands teacher availability, subtracts teacher/student session conflicts, and feeds a student slot picker. Booking uses a transactional RPC to re-check and insert a `sessions` row so two users cannot claim the same slot.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase Postgres/RLS/RPC, existing dashboard components, existing session email utilities. No external calendar integration in v1.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-10-in-app-availability-booking-design.md` - read it before implementing.
- V1 is fully in-app; do not add Google Calendar, Outlook Calendar, iCal, or public booking links.
- Reuse the existing `sessions` table, dashboard schedule pages, `MonthCalendar`, cache revalidation tag `"dashboard"`, and session email helpers.
- Teacher-published availability defaults to `auto_confirm = true`; booking one of those slots creates a `confirmed` session.
- Student weekly availability is out of scope; student conflicts come from existing non-cancelled Insight sessions.
- Server recomputes slot availability before booking; client-displayed slots are never trusted.
- Booking conflicts must return `409` with a user-safe message.
- Keep UI consistent with the existing dashboard style and avoid landing-page or marketing-page patterns.
- After each task, run `npm run lint` and `npx tsc --noEmit`.

---

## File Structure

- Create `supabase/migrations/20260710000001_add_teacher_availability_booking.sql`
  - Tables, indexes, RLS policies, and `book_availability_session` RPC.
- Create `src/lib/availability/types.ts`
  - Shared TypeScript interfaces for settings, rules, overrides, slots, and busy intervals.
- Create `src/lib/availability/time.ts`
  - Date/time helpers for date keys, weekday mapping, parsing local rule windows, overlap checks, and 15-minute slot stepping.
- Create `src/lib/availability/slot-engine.ts`
  - Pure slot generation from settings, rules, overrides, sessions, and assignment participants.
- Create `src/lib/availability/slot-engine.test.cjs`
  - Plain Node tests following existing repo convention.
- Create `src/lib/availability/data.ts`
  - Server data loaders for settings/rules/overrides and booking conflicts.
- Create `src/app/api/availability/settings/route.ts`
  - Teacher settings read/update endpoint.
- Create `src/app/api/availability/rules/route.ts`
  - Teacher rule create endpoint.
- Create `src/app/api/availability/rules/[id]/route.ts`
  - Teacher rule update/delete endpoint.
- Create `src/app/api/availability/overrides/route.ts`
  - Teacher override create endpoint.
- Create `src/app/api/availability/overrides/[id]/route.ts`
  - Teacher override delete endpoint.
- Create `src/app/api/booking/slots/route.ts`
  - Assignment-scoped slot list endpoint.
- Create `src/app/api/booking/book/route.ts`
  - Student booking endpoint.
- Create `src/components/availability/availability-editor.tsx`
  - Teacher-facing availability manager.
- Create `src/components/availability/booking-settings-form.tsx`
  - Teacher booking settings controls.
- Create `src/components/availability/date-overrides-list.tsx`
  - Teacher date override controls.
- Create `src/components/booking/slot-picker.tsx`
  - Student-facing slot browser.
- Create `src/components/booking/book-session-modal.tsx`
  - Student booking confirmation modal.
- Modify `src/lib/dashboard-data.ts`
  - Load teacher availability/settings for teacher schedule view as needed.
- Modify `src/components/teacher/teacher-dashboard.tsx`
  - Render availability management on schedule view.
- Modify `src/components/student/student-dashboard.tsx`
  - Render "Find a time" booking flow on schedule view.
- Modify `src/app/api/sessions/route.ts`
  - Extract reusable notification helper if needed, or keep booking route notification local using the same email utility.
- Modify `src/components/sessions/session-card.tsx` and `src/components/sessions/month-calendar.tsx`
  - Only if needed to label availability-booked sessions; no reschedule rewrite is required in v1.

---

### Task 1: Database Schema, RLS, and Booking RPC

**Files:**
- Create: `supabase/migrations/20260710000001_add_teacher_availability_booking.sql`

**Interfaces:**
- Produces tables: `teacher_booking_settings`, `teacher_availability_rules`, `teacher_availability_overrides`.
- Produces session column: `sessions.booking_source`.
- Produces RPC: `public.book_availability_session(p_assignment_id uuid, p_student_id uuid, p_scheduled_at timestamptz, p_duration_minutes integer, p_notes text, p_auto_confirm boolean) returns uuid`.
- Later API code calls the RPC after independently recomputing that the slot is valid.

- [x] **Step 1: Write the migration**

Create `supabase/migrations/20260710000001_add_teacher_availability_booking.sql`:

```sql
create table if not exists public.teacher_booking_settings (
  teacher_id uuid primary key references public.profiles(id) on delete cascade,
  default_duration_minutes integer not null default 60,
  allowed_durations integer[] not null default array[30,45,60,90,120],
  buffer_before_minutes integer not null default 0,
  buffer_after_minutes integer not null default 0,
  minimum_notice_hours integer not null default 12,
  max_days_ahead integer not null default 30,
  auto_confirm boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teacher_booking_settings_default_allowed check (default_duration_minutes = any(allowed_durations)),
  constraint teacher_booking_settings_non_negative check (
    default_duration_minutes > 0
    and cardinality(allowed_durations) > 0
    and buffer_before_minutes >= 0
    and buffer_after_minutes >= 0
    and minimum_notice_hours >= 0
  ),
  constraint teacher_booking_settings_window check (max_days_ahead between 1 and 180)
);

create table if not exists public.teacher_availability_rules (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  weekday integer not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  timezone text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teacher_availability_rules_time_order check (end_time > start_time)
);

create table if not exists public.teacher_availability_overrides (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  start_time time,
  end_time time,
  timezone text not null,
  is_available boolean not null,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teacher_availability_overrides_time_order check (
    (start_time is null and end_time is null)
    or (start_time is not null and end_time is not null and end_time > start_time)
  ),
  constraint teacher_availability_overrides_available_requires_times check (
    is_available = false or (start_time is not null and end_time is not null)
  )
);

alter table public.teacher_student_assignments
  add column if not exists is_active boolean not null default true;

alter table public.sessions
  add column if not exists booking_source text not null default 'manual'
  check (booking_source in ('manual', 'availability'));

create index if not exists idx_teacher_availability_rules_teacher_weekday
  on public.teacher_availability_rules (teacher_id, weekday)
  where is_active = true;

create index if not exists idx_teacher_availability_overrides_teacher_date
  on public.teacher_availability_overrides (teacher_id, date);

create index if not exists idx_sessions_assignment_status_time
  on public.sessions (assignment_id, status, scheduled_at);

alter table public.teacher_booking_settings enable row level security;
alter table public.teacher_availability_rules enable row level security;
alter table public.teacher_availability_overrides enable row level security;

create policy teacher_booking_settings_select_teacher on public.teacher_booking_settings
for select using (teacher_id = auth.uid());

create policy teacher_booking_settings_all_teacher on public.teacher_booking_settings
for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

create policy teacher_booking_settings_select_admin on public.teacher_booking_settings
for select using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and p.is_active = true)
);

create policy teacher_availability_rules_select_teacher on public.teacher_availability_rules
for select using (teacher_id = auth.uid());

create policy teacher_availability_rules_all_teacher on public.teacher_availability_rules
for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

create policy teacher_availability_rules_select_admin on public.teacher_availability_rules
for select using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and p.is_active = true)
);

create policy teacher_availability_overrides_select_teacher on public.teacher_availability_overrides
for select using (teacher_id = auth.uid());

create policy teacher_availability_overrides_all_teacher on public.teacher_availability_overrides
for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

create policy teacher_availability_overrides_select_admin on public.teacher_availability_overrides
for select using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and p.is_active = true)
);

create or replace function public.book_availability_session(
  p_assignment_id uuid,
  p_student_id uuid,
  p_scheduled_at timestamptz,
  p_duration_minutes integer,
  p_notes text,
  p_auto_confirm boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher_id uuid;
  v_session_id uuid;
  v_lock_key bigint;
  v_start timestamptz := p_scheduled_at;
  v_end timestamptz := p_scheduled_at + make_interval(mins => p_duration_minutes);
begin
  select teacher_id into v_teacher_id
  from public.teacher_student_assignments
  where id = p_assignment_id
    and student_id = p_student_id
    and is_active = true;

  if v_teacher_id is null then
    raise exception 'Assignment not found or inactive';
  end if;

  v_lock_key := ('x' || substr(md5(v_teacher_id::text || ':' || p_scheduled_at::text), 1, 16))::bit(64)::bigint;
  perform pg_advisory_xact_lock(v_lock_key);

  if exists (
    select 1
    from public.sessions s
    join public.teacher_student_assignments a on a.id = s.assignment_id
    where s.status <> 'cancelled'
      and (a.teacher_id = v_teacher_id or a.student_id = p_student_id)
      and tstzrange(s.scheduled_at, s.scheduled_at + make_interval(mins => s.duration_minutes), '[)')
        && tstzrange(v_start, v_end, '[)')
  ) then
    raise exception 'Slot is no longer available';
  end if;

  insert into public.sessions (
    assignment_id,
    scheduled_at,
    duration_minutes,
    notes,
    status,
    proposed_by,
    booking_source
  )
  values (
    p_assignment_id,
    p_scheduled_at,
    p_duration_minutes,
    nullif(trim(p_notes), ''),
    case when p_auto_confirm then 'confirmed' else 'proposed' end,
    p_student_id,
    'availability'
  )
  returning id into v_session_id;

  return v_session_id;
end;
$$;
```

- [x] **Step 2: Apply the migration locally**

Run: `supabase db reset`
Expected: local database resets and applies all migrations without SQL errors.

If no local Supabase is running, run: `supabase migration list`
Expected: command succeeds enough to confirm the migration is discoverable; note in the task result that DB execution still needs a connected Supabase environment.

- [x] **Step 3: Commit**

```bash
git add supabase/migrations/20260710000001_add_teacher_availability_booking.sql
git commit -m "feat: add availability booking schema"
```

---

### Task 2: Pure Slot Engine

**Files:**
- Create: `src/lib/availability/types.ts`
- Create: `src/lib/availability/time.ts`
- Create: `src/lib/availability/slot-engine.ts`
- Test: `src/lib/availability/slot-engine.test.cjs`

**Interfaces:**
- Produces `generateAvailabilitySlots(input: GenerateSlotsInput): AvailabilitySlot[]`.
- Produces shared types consumed by API routes and UI components.

- [x] **Step 1: Create shared types**

Create `src/lib/availability/types.ts`:

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
}

export interface AvailabilityRule {
  id: string;
  teacher_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  timezone: string;
  is_active: boolean;
}

export interface AvailabilityOverride {
  id: string;
  teacher_id: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  timezone: string;
  is_available: boolean;
  reason: string | null;
}

export interface BusySession {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
}

export interface AvailabilitySlot {
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
}

export interface GenerateSlotsInput {
  settings: BookingSettings;
  rules: AvailabilityRule[];
  overrides: AvailabilityOverride[];
  busySessions: BusySession[];
  durationMinutes: number;
  from: Date;
  to: Date;
  now: Date;
}
```

- [x] **Step 2: Create time helpers**

Create `src/lib/availability/time.ts`:

```ts
export interface Interval {
  start: Date;
  end: Date;
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function dateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function weekdaySundayZero(date: Date): number {
  return date.getDay();
}

export function parseTimeOnDate(date: Date, time: string): Date {
  const [hour, minute] = time.split(":").map(Number);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute, 0, 0);
}

export function intervalsOverlap(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

export function containsInterval(container: Interval, candidate: Interval): boolean {
  return candidate.start >= container.start && candidate.end <= container.end;
}

export function eachDate(from: Date, to: Date): Date[] {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  const dates: Date[] = [];
  for (let current = start; current <= end; current = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1)) {
    dates.push(current);
  }
  return dates;
}
```

- [x] **Step 3: Write failing slot-engine tests**

Create `src/lib/availability/slot-engine.test.cjs`:

```js
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

require.extensions[".ts"] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  module._compile(output.outputText, filename);
};

const { generateAvailabilitySlots } = require(path.join(__dirname, "slot-engine.ts"));

function localTimes(slots) {
  return slots.map((slot) => {
    const date = new Date(slot.starts_at);
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  });
}

const settings = {
  teacher_id: "teacher-1",
  default_duration_minutes: 60,
  allowed_durations: [30, 60],
  buffer_before_minutes: 0,
  buffer_after_minutes: 0,
  minimum_notice_hours: 0,
  max_days_ahead: 30,
  auto_confirm: true,
};

const mondayRule = {
  id: "rule-1",
  teacher_id: "teacher-1",
  weekday: 1,
  start_time: "09:00",
  end_time: "11:00",
  timezone: "America/New_York",
  is_active: true,
};

test("expands a weekly rule into 15-minute stepped slots", () => {
  const slots = generateAvailabilitySlots({
    settings,
    rules: [mondayRule],
    overrides: [],
    busySessions: [],
    durationMinutes: 60,
    from: new Date("2026-07-13T00:00:00"),
    to: new Date("2026-07-13T23:59:59"),
    now: new Date("2026-07-12T00:00:00"),
  });

  assert.deepEqual(localTimes(slots), ["09:00", "09:15", "09:30", "09:45", "10:00"]);
});

test("removes slots overlapping busy sessions", () => {
  const busyStart = new Date(2026, 6, 13, 9, 30).toISOString();
  const slots = generateAvailabilitySlots({
    settings,
    rules: [mondayRule],
    overrides: [],
    busySessions: [{ id: "session-1", scheduled_at: busyStart, duration_minutes: 60 }],
    durationMinutes: 60,
    from: new Date("2026-07-13T00:00:00"),
    to: new Date("2026-07-13T23:59:59"),
    now: new Date("2026-07-12T00:00:00"),
  });

  assert.deepEqual(localTimes(slots), ["10:30", "10:45", "11:00"]);
});

test("full-day unavailable override removes the day", () => {
  const slots = generateAvailabilitySlots({
    settings,
    rules: [mondayRule],
    overrides: [{
      id: "override-1",
      teacher_id: "teacher-1",
      date: "2026-07-13",
      start_time: null,
      end_time: null,
      timezone: "America/New_York",
      is_available: false,
      reason: null,
    }],
    busySessions: [],
    durationMinutes: 60,
    from: new Date("2026-07-13T00:00:00"),
    to: new Date("2026-07-13T23:59:59"),
    now: new Date("2026-07-12T00:00:00"),
  });

  assert.equal(slots.length, 0);
});

test("available override adds slots on a day without a recurring rule", () => {
  const slots = generateAvailabilitySlots({
    settings,
    rules: [],
    overrides: [{
      id: "override-1",
      teacher_id: "teacher-1",
      date: "2026-07-14",
      start_time: "14:00",
      end_time: "15:00",
      timezone: "America/New_York",
      is_available: true,
      reason: null,
    }],
    busySessions: [],
    durationMinutes: 30,
    from: new Date("2026-07-14T00:00:00"),
    to: new Date("2026-07-14T23:59:59"),
    now: new Date("2026-07-12T00:00:00"),
  });

  assert.deepEqual(localTimes(slots), ["14:00", "14:15", "14:30"]);
});
```

- [x] **Step 4: Run tests and confirm failure**

Run: `node src/lib/availability/slot-engine.test.cjs`
Expected: FAIL because `slot-engine.ts` does not exist yet.

- [x] **Step 5: Implement slot engine**

Create `src/lib/availability/slot-engine.ts`:

```ts
import type { AvailabilitySlot, GenerateSlotsInput } from "@/lib/availability/types";
import {
  addMinutes,
  containsInterval,
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

function applyUnavailableOverrides(windows: Interval[], input: GenerateSlotsInput): Interval[] {
  return windows.filter((window) => {
    const key = dateKey(window.start);
    const unavailable = input.overrides.filter((item) => item.date === key && !item.is_available);

    for (const override of unavailable) {
      if (!override.start_time || !override.end_time) return false;

      const block = {
        start: parseTimeOnDate(window.start, override.start_time),
        end: parseTimeOnDate(window.start, override.end_time),
      };
      if (containsInterval(block, window)) return false;
    }

    return true;
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
```

- [x] **Step 6: Run tests and type-check**

Run: `node src/lib/availability/slot-engine.test.cjs`
Expected: PASS.

Run: `npm run lint`
Expected: no lint errors.

Run: `npx tsc --noEmit`
Expected: no TypeScript errors.

- [x] **Step 7: Commit**

```bash
git add src/lib/availability/types.ts src/lib/availability/time.ts src/lib/availability/slot-engine.ts src/lib/availability/slot-engine.test.cjs
git commit -m "feat: add availability slot engine"
```

---

### Task 3: Availability and Booking API Routes

**Files:**
- Create: `src/lib/availability/data.ts`
- Create: `src/app/api/availability/settings/route.ts`
- Create: `src/app/api/availability/rules/route.ts`
- Create: `src/app/api/availability/rules/[id]/route.ts`
- Create: `src/app/api/availability/overrides/route.ts`
- Create: `src/app/api/availability/overrides/[id]/route.ts`
- Create: `src/app/api/booking/slots/route.ts`
- Create: `src/app/api/booking/book/route.ts`

**Interfaces:**
- Produces teacher availability CRUD endpoints.
- Produces student slot lookup and booking endpoints.
- Consumes `generateAvailabilitySlots` from Task 2 and `book_availability_session` from Task 1.

- [x] **Step 1: Implement `src/lib/availability/data.ts`**

Create helper functions:

```ts
export async function getTeacherAvailabilityBundle(teacherId: string): Promise<{
  settings: BookingSettings;
  rules: AvailabilityRule[];
  overrides: AvailabilityOverride[];
}>;

export async function getAssignmentParticipants(assignmentId: string): Promise<{
  assignmentId: string;
  teacherId: string;
  studentId: string;
} | null>;

export async function getBusySessionsForParticipants(params: {
  teacherId: string;
  studentId: string;
  from: Date;
  to: Date;
}): Promise<BusySession[]>;
```

Use `createAdminClient()` in these helpers so slot generation can read the data
needed for both participants while the API route performs explicit auth checks.

- [x] **Step 2: Implement settings route**

`GET /api/availability/settings`:

- `getUserProfile()`
- require `profile.role === "teacher"`
- return settings/rules/overrides for `profile.id`

`PUT /api/availability/settings`:

- validate numeric fields
- validate `default_duration_minutes` is in `allowed_durations`
- upsert row with `teacher_id = profile.id`
- return saved settings
- call `revalidateTag("dashboard", "max")`

- [x] **Step 3: Implement rules routes**

`POST /api/availability/rules`:

- teacher only
- validate `weekday`, `start_time`, `end_time`, `timezone`
- insert with `teacher_id = profile.id`

`PATCH /api/availability/rules/[id]`:

- teacher only
- update only owned rule with `.eq("teacher_id", profile.id)`

`DELETE /api/availability/rules/[id]`:

- teacher only
- soft delete with `{ is_active: false }`

- [x] **Step 4: Implement override routes**

`POST /api/availability/overrides`:

- teacher only
- validate `date`, `timezone`, `is_available`
- require times when `is_available` is true
- insert with `teacher_id = profile.id`

`DELETE /api/availability/overrides/[id]`:

- teacher only
- delete only owned override

- [x] **Step 5: Implement slot route**

`GET /api/booking/slots`:

- authenticate user
- parse `assignment_id`, `duration_minutes`, `from`, `to`
- load assignment participants
- require current user is assignment teacher or student
- load availability bundle for assignment teacher
- load busy sessions for both participants
- call `generateAvailabilitySlots`
- return `{ slots, settings: { allowed_durations, default_duration_minutes, auto_confirm } }`

- [x] **Step 6: Implement booking route**

`POST /api/booking/book`:

- authenticate user
- require current user is the assignment student
- parse `assignment_id`, `scheduled_at`, `duration_minutes`, `notes`
- recompute slots for the scheduled date
- return `409` if `scheduled_at` is not exactly one of the generated slot starts
- call `book_availability_session`
- `revalidateTag("dashboard", "max")`
- send session email using the same data shape as `src/app/api/sessions/route.ts`
- return `{ sessionId }`

- [x] **Step 7: Verify**

Run: `npm run lint`
Expected: no lint errors.

Run: `npx tsc --noEmit`
Expected: no TypeScript errors.

- [x] **Step 8: Commit**

```bash
git add src/lib/availability/data.ts src/app/api/availability src/app/api/booking
git commit -m "feat: add availability booking APIs"
```

---

### Task 4: Teacher Availability UI

**Files:**
- Create: `src/components/availability/availability-editor.tsx`
- Create: `src/components/availability/booking-settings-form.tsx`
- Create: `src/components/availability/date-overrides-list.tsx`
- Modify: `src/components/teacher/teacher-dashboard.tsx`

**Interfaces:**
- Consumes `/api/availability/settings`, `/api/availability/rules`, and `/api/availability/overrides`.
- Produces an availability management section visible from the teacher schedule view.

- [x] **Step 1: Build `BookingSettingsForm`**

Controls:

- default duration select
- allowed duration checkboxes
- minimum notice numeric input
- max days ahead numeric input
- buffer before/after numeric inputs
- auto-confirm checkbox

Submit:

- `PUT /api/availability/settings`
- show success or API error message

- [x] **Step 2: Build `DateOverridesList`**

Controls:

- date input
- available/unavailable select
- optional start/end time for partial-day override
- reason text input
- delete button for each existing override

Submit:

- `POST /api/availability/overrides`
- `DELETE /api/availability/overrides/[id]`

- [x] **Step 3: Build `AvailabilityEditor`**

On mount:

- fetch `/api/availability/settings`
- render weekly rules grouped by weekday
- render add-rule form with weekday, start time, end time
- render `BookingSettingsForm`
- render `DateOverridesList`

Rule actions:

- `POST /api/availability/rules`
- `PATCH /api/availability/rules/[id]`
- `DELETE /api/availability/rules/[id]`

Empty state:

- "Add your first availability window so students can book from your schedule."

- [x] **Step 4: Integrate into teacher dashboard**

In `src/components/teacher/teacher-dashboard.tsx`, render `AvailabilityEditor`
near the top of the `schedule` view, before or beside the existing monthly
calendar. Keep the existing manual scheduling modal available for teachers.

- [ ] **Step 5: Verify responsive layout** — SKIPPED. Live browser verification was
  not performed (no test credentials / dev-bypass declined by human). Static
  review (lint, tsc, thorough diff review against actual API contracts) backs
  this task instead. Revisit if live UI verification is later wanted.

- [x] **Step 6: Static checks and commit**

Run: `npm run lint`
Expected: no lint errors.

Run: `npx tsc --noEmit`
Expected: no TypeScript errors.

```bash
git add src/components/availability src/components/teacher/teacher-dashboard.tsx
git commit -m "feat: add teacher availability editor"
```

---

### Task 5: Student Slot Picker UI

**Files:**
- Create: `src/components/booking/slot-picker.tsx`
- Create: `src/components/booking/book-session-modal.tsx`
- Modify: `src/components/student/student-dashboard.tsx`

**Interfaces:**
- Consumes `/api/booking/slots` and `/api/booking/book`.
- Produces a "Find a time" flow on the student schedule page.

- [x] **Step 1: Build `BookSessionModal`**

Props:

```ts
interface BookSessionModalProps {
  assignmentId: string;
  teacherName: string;
  slot: AvailabilitySlot;
  onClose: () => void;
  onBooked: () => void;
}
```

Behavior:

- show teacher, date, time, duration
- optional notes textarea
- submit `POST /api/booking/book`
- on `409`, show "That time was just booked. Pick another slot."
- on success, call `router.refresh()` and `onBooked()`

- [x] **Step 2: Build `SlotPicker`**

Props:

```ts
interface SlotPickerProps {
  assignments: Array<{
    id: string;
    teacher: { id: string; full_name: string } | null;
  }>;
}
```

Behavior:

- teacher select when more than one assignment exists
- duration select populated from `/api/booking/slots` response settings
- week navigation
- grouped day list of slots
- empty state when no slots are returned
- opens `BookSessionModal` when a slot is selected

- [x] **Step 3: Integrate into student dashboard**

In `src/components/student/student-dashboard.tsx`, render `SlotPicker` in the
schedule view above the existing calendar/request controls. Keep the existing
manual request form as a fallback for teachers who have not published
availability.

- [ ] **Step 4: Verify responsive layout** — SKIPPED. Live browser verification was
  not performed (no test credentials / dev-bypass declined by human). Static
  review (lint, tsc, thorough diff review against actual API contracts) backs
  this task instead. Revisit if live UI verification is later wanted.

- [x] **Step 5: Static checks and commit**

Run: `npm run lint`
Expected: no lint errors.

Run: `npx tsc --noEmit`
Expected: no TypeScript errors.

```bash
git add src/components/booking src/components/student/student-dashboard.tsx
git commit -m "feat: add student availability booking flow"
```

---

### Task 6: Final Verification and Documentation Pass

**Files:**
- Modify: `README.md` if needed to mention in-app availability under workflow testing.
- Modify: `docs/superpowers/specs/2026-07-10-in-app-availability-booking-design.md` only if implementation intentionally differs.
- Modify: `docs/superpowers/plans/2026-07-10-in-app-availability-booking.md` only to check off completed steps during execution.

**Interfaces:**
- Produces final confidence that the end-to-end scheduling flow works.

- [x] **Step 1: Run automated checks**

Run: `node src/lib/availability/slot-engine.test.cjs`
Expected: all tests pass.

Run: `npm run lint`
Expected: no lint errors.

Run: `npx tsc --noEmit`
Expected: no TypeScript errors.

- [ ] **Step 2: Manual teacher flow** — SKIPPED. The migration was applied to the
  live "insight" Supabase project (tables/RLS/RPC confirmed present via
  `list_tables`), but the human declined to enable the dev-auth-bypass flag
  needed to browser-test this without real credentials. Not verified live.

- [ ] **Step 3: Manual student flow** — SKIPPED, same reason as Step 2.

- [ ] **Step 4: Manual conflict flow** — SKIPPED, same reason as Step 2. The
  race-safety logic (advisory lock keyed by teacher_id, RPC re-check, 409
  translation) was verified by code review, not by an actual concurrent
  booking attempt against the live app.

- [x] **Step 5: Commit documentation updates if any**

```bash
git add README.md docs/superpowers/specs/2026-07-10-in-app-availability-booking-design.md docs/superpowers/plans/2026-07-10-in-app-availability-booking.md
git commit -m "docs: finalize availability booking implementation notes"
```

# Open Availability and Calendar UX

Supersedes parts of `2026-07-10-in-app-availability-booking-design.md`. That spec's
data model, RLS, and race-safe booking RPC stay. Its availability *semantics* and
its availability/booking UI are replaced.

## Problem

Three defects in the shipped availability booking feature.

### 1. Availability is opt-in, so nobody has any

`generateAvailabilitySlots` builds bookable windows as the union of the teacher's
`teacher_availability_rules`. A teacher who has never opened the availability
editor has zero rules, so the union is empty and the student's slot picker shows
"No open times this week" for every week, forever.

Production confirms this: `teacher_availability_rules` has 0 rows. Every student
on the platform currently sees an empty booking surface.

The intended semantics are the inverse. A teacher is available unless they say
otherwise. Absence of configuration should mean "open", not "closed".

### 2. The availability editor is a stack of dropdowns

Adding a window means picking a weekday from a `<select>`, then a start time,
then an end time, then submitting a form — once per window, per day. Blocking a
Thursday afternoon means a separate "date override" form elsewhere on the page
with its own date input and its own available/unavailable radio. Reading back
what you've configured means scanning a vertical list of text rows grouped by
weekday.

None of this looks or behaves like a calendar. The teacher cannot see their week.

### 3. Students can only book from the schedule page

`SlotPicker` is mounted once, on `/student/schedule`. The teacher detail panel on
`/student/teachers` has a "Request session" button, but it opens
`RequestSessionForm` — the old manual propose-a-time flow that creates a
`proposed` session and waits for teacher confirmation. The student cannot book a
teacher's actual open time from the page that is *about* that teacher.

## Goals

- A teacher with no configuration is bookable. Blocking time, not publishing
  time, is the action that requires effort.
- Teachers manage availability by dragging on a week grid, not by filling forms.
- Students book from `/student/teachers` as well as `/student/schedule`.
- Availability math respects the timezone each rule and override already stores.
- No new runtime dependencies. Build the grid; don't adopt FullCalendar.

## Non-Goals

- No external calendar sync (Google, Outlook, iCal). Still future work.
- No public booking links.
- No student-side availability. Student conflicts stay inferred from sessions.
- No recurring session creation.
- No change to the booking RPC, its advisory lock, or its RLS.

## Approach

### Availability becomes subtractive

Introduce an explicit per-teacher mode.

**`open` (the default, and what every existing teacher gets):** the base window
is a daily open-hours envelope — `08:00`–`20:00` in the teacher's timezone,
editable. Every day of the week starts fully bookable inside that envelope.
Teachers subtract from it by adding blocks.

**`restricted`:** the base window is the union of the teacher's `available`
weekly rules. This is the current behavior, preserved for a teacher who wants to
publish only Tuesday and Thursday evenings rather than block out everything else.

Both modes then apply the same subtractions: blocked weekly rules, unavailable
date overrides, and the teacher's and student's existing non-cancelled sessions
expanded by buffers. Both modes then apply the same additions: available date
overrides, which can reach outside the envelope for a one-off early morning.

An envelope rather than a literal 24 hours is a deliberate choice. "No close time
means available" taken literally makes 3:00 AM bookable and generates ~96 slots
per day per duration. The envelope encodes the same intent — teachers do not
configure anything and students can book — while keeping the result usable. A
teacher who genuinely wants overnight availability widens the envelope.

#### Schema

`teacher_booking_settings` gains:

- `availability_mode text not null default 'open' check (availability_mode in ('open','restricted'))`
- `open_day_start time not null default '08:00'`
- `open_day_end time not null default '20:00'`
- `timezone text` — nullable; falls back to `profiles.timezone`, then `UTC`
- `slot_increment_minutes integer not null default 30 check (slot_increment_minutes in (15, 30, 60))`

`open_day_end > open_day_start` is a table constraint.

`teacher_availability_rules` gains:

- `rule_type text not null default 'available' check (rule_type in ('available','blocked'))`

Existing rows keep `rule_type = 'available'`, which is what they mean today.

#### Backfill

Any teacher with at least one active rule at migration time is set to
`availability_mode = 'restricted'`, preserving their published windows. Everyone
else — which today is every teacher — lands on `open` and becomes immediately
bookable. The migration inserts a `teacher_booking_settings` row for each teacher
who lacks one, so mode is never inferred from a missing row.

#### Slot generation

`generateAvailabilitySlots` changes shape:

1. Resolve the teacher's timezone: `settings.timezone ?? profile.timezone ?? "UTC"`.
2. Clamp the range to `[now + minimum_notice_hours, now + max_days_ahead]`.
3. For each calendar date in the clamped range, **in the teacher's timezone**:
   - `open` mode: emit one window, `open_day_start`–`open_day_end`.
   - `restricted` mode: emit one window per active `available` rule whose
     `weekday` matches.
4. Add windows from `is_available = true` overrides on that date.
5. Merge overlapping windows.
6. Subtract active `blocked` rules matching that weekday.
7. Subtract `is_available = false` overrides — a timed override subtracts its
   range, an untimed one removes the whole date.
8. Subtract busy sessions expanded by `buffer_before_minutes` /
   `buffer_after_minutes`.
9. Walk each surviving window at `slot_increment_minutes` boundaries, keeping
   slots whose full `duration_minutes` fits.

Step ordering matters: additions (4) before subtractions (6–8) means a blocked
rule wins over an available override on the same range, and a full-day block
clears anything an override added. This is the intuitive precedence — "I said I'm
out that day" should beat "my normal Thursday" *and* any window painted earlier.

#### Timezone correctness

`parseTimeOnDate(date, time)` currently does
`new Date(y, m, d, hour, minute)` — server-local, ignoring the `timezone` column
on every rule and override. Vercel runs functions in UTC, so a Toronto teacher's
9:00–17:00 rule becomes 9:00–17:00 UTC, i.e. 04:00–12:00 for them.

This is latent today only because no rules exist. Turning on `open` mode makes
every teacher's envelope wrong on day one, so it must be fixed in the same pass.

Add `src/lib/availability/timezone.ts`, built on `Intl.DateTimeFormat` with no
new dependency:

- `zonedTimeToUtc(dateKey: string, time: string, timeZone: string): Date`
  Resolves `"2026-07-14"` + `"09:00"` + `"America/Toronto"` to the correct
  instant, by computing the zone's offset at that wall-clock time and correcting
  once for the offset shift that a DST boundary introduces.
- `dateKeysInZone(from: Date, to: Date, timeZone: string): string[]`
  The calendar dates spanned by an instant range, as seen from the zone.
- `zoneOffsetMinutes(instant: Date, timeZone: string): number`

DST is handled by the standard two-pass offset correction: guess the offset at
the naive UTC interpretation, apply it, then re-derive the offset at the
resulting instant and re-apply if it changed. Nonexistent times in a
spring-forward gap resolve forward; ambiguous times in a fall-back overlap
resolve to the first (earlier) occurrence. Both are documented in the module and
covered by tests.

`src/lib/availability/time.ts` keeps `addMinutes`, `intervalsOverlap`, and
`Interval`. `parseTimeOnDate`, `dateKey`, `weekdaySundayZero`, and `eachDate` are
deleted — every caller moves to the timezone-aware equivalents.

#### Other engine fixes

`mergeOverlappingIntervals` writes `last.end = ...` on interval objects taken
from its input array, mutating data its caller still holds. It clones on push.

`POST /api/booking/book` recomputes the day's slots to validate the request, but
derives that day with `scheduledDate.setHours(0,0,0,0)` — the server's day, not
the teacher's. It moves to the teacher's timezone and widens the recompute range
by one day on each side so a slot near a zone boundary is not lost.

### The week grid

One new primitive, `src/components/calendar/week-grid.tsx`, drives every calendar
surface. It is a controlled component and knows nothing about availability or
sessions.

```
interface WeekGridBlock {
  id: string;
  start: Date;
  end: Date;
  variant: "blocked" | "available" | "session" | "slot";
  label?: string;
  readOnly?: boolean;
}

interface WeekGridProps {
  weekStart: Date;
  blocks: WeekGridBlock[];
  dayStartHour?: number;   // default 7
  dayEndHour?: number;     // default 21
  snapMinutes?: number;    // default 15
  editable?: boolean;
  onCreate?: (start: Date, end: Date) => void;
  onUpdate?: (id: string, start: Date, end: Date) => void;
  onDelete?: (id: string) => void;
  onBlockClick?: (block: WeekGridBlock) => void;
}
```

Seven day columns, an hour gutter, absolutely positioned blocks. Pointer down on
empty space and drag to create; drag a block's body to move it; drag its top or
bottom edge to resize; click it to open a small popover with exact times, a
recurring/one-off toggle where relevant, and Delete. All geometry snaps to
`snapMinutes`. Pointer events, not mouse events, so touch drag works.

It styles with inline `style={{}}` for all layout and positioning, per this
project's convention — Tailwind's layout utilities are not generated here.

Interaction is committed on pointer-up, optimistically applied to local state,
then persisted. A failed write reverts the block and surfaces the error inline.

#### Teacher availability

`availability-editor.tsx` is rewritten around the grid. Above it: a mode toggle
that reads as a sentence rather than a jargon term.

> **Open by default** — students can book any time in your open hours except the
> blocks you add.
> **Specific hours only** — students can book only the hours you mark available.

In `open` mode the grid is shaded bookable, and dragging paints a **blocked**
block. In `restricted` mode the grid is shaded unbookable, and dragging paints an
**available** block. The same gesture, inverted meaning, matching the mode.

Each block's popover carries the recurring/one-off decision, which is what
selects the underlying table: *Every Thursday* writes a
`teacher_availability_rules` row, *Only Jul 16* writes a
`teacher_availability_overrides` row. Recurring blocks render on every week;
one-off blocks render only on their date, tinted to distinguish them.

The teacher's existing confirmed sessions render as read-only `session` blocks so
they can see what they are working around. Booking rules (durations, buffers,
notice, auto-confirm) stay in `booking-settings-form.tsx`, collapsed behind a
"Booking rules" disclosure — they are set once and rarely revisited.
`date-overrides-list.tsx` is deleted; the grid replaces it.

The open-hours envelope is set by dragging the grid's top and bottom bounds, and
is also editable numerically in the disclosure.

#### Student booking

`slot-picker.tsx` gains a week-grid view alongside the pill list, with the grid
as the default on viewports wider than 768px. Slots render as `slot` blocks
across seven day columns; clicking one opens the existing `BookSessionModal`
unchanged.

This matters more than aesthetics. An `open`-mode teacher with a 12-hour envelope
and 30-minute increments produces roughly 160 bookable 60-minute slots per week.
As pills that is an unreadable wall; as a grid it is a week with gaps in it.

Mobile keeps the pill list — a 7-column grid does not survive 375px.

#### Session calendars

`week-calendar.tsx` currently renders a static 7-column list of session chips
with no time axis. It is replaced by the grid in read-only mode, giving sessions
a real vertical time position.

`month-calendar.tsx` stays. A `Month | Week` switcher on the teacher and student
schedule pages chooses between them. On the week view, a teacher dragging empty
space opens the existing schedule form prefilled with that range; a student
dragging opens the request form. This is the "add events like a real calendar"
behavior, reached through forms that already exist.

### Booking from the teachers page

`SlotPicker` takes a new optional `singleAssignmentId`. When set, the teacher
`<select>` is hidden and the component scopes to that assignment.

In the `/student/teachers` detail panel, the header's "Request session" button
becomes two:

- **Book a time** (primary) — expands `SlotPicker` scoped to that teacher, which
  books a confirmed session directly when `auto_confirm` is on.
- **Request another time** (secondary) — the existing `RequestSessionForm`, for
  when nothing in the teacher's open hours works.

Both live in the panel that is already there. `RequestSessionForm` is unchanged.

The empty state when a teacher has genuinely blocked the whole week changes from
"No open times this week — try another week or request a session manually below"
to a message that names the cause and offers the fallback in place, since on the
teachers page there is no "below" to point at.

## Data Flow

```
teacher drags on grid
  → optimistic local block
  → POST/PATCH /api/availability/rules      (recurring)
    or /api/availability/overrides          (one-off)
  → on failure: revert + inline error

student opens slot picker
  → GET /api/booking/slots?assignment_id&duration_minutes&from&to
  → route loads settings + rules + overrides + busy sessions
  → generateAvailabilitySlots(...) in teacher tz
  → slots rendered in student's local tz

student clicks slot
  → BookSessionModal
  → POST /api/booking/book
  → server recomputes that teacher-day's slots and rejects a stale slot with 409
  → book_availability_session RPC: advisory lock on teacher_id, conflict check,
    insert, all in one transaction
  → revalidateTag("dashboard") + session email
```

## API Changes

`PUT /api/availability/settings` accepts and validates the five new fields.
`open_day_end > open_day_start`; `availability_mode` in the enum;
`slot_increment_minutes` in `(15, 30, 60)`; `timezone` a valid IANA zone,
validated by round-tripping it through `Intl.DateTimeFormat`.

`POST /api/availability/rules` accepts `rule_type`, defaulting to `available`.

`PATCH /api/availability/rules/[id]` already accepts `weekday`, `start_time`, and
`end_time` and already scopes its update to `teacher_id = profile.id`, so
dragging a block across days needs no new validation. Only its `select(...)`
projection widens to return `rule_type`.

`PATCH /api/availability/overrides/[id]` is new — the grid needs to move and
resize a one-off block, and today that route exposes only `DELETE`.

`GET /api/booking/slots` additionally returns `slot_increment_minutes` and the
teacher's resolved timezone, so the grid can render its axis correctly.

No change to `POST /api/booking/book`'s contract.

## Error Handling

- No open times because everything is blocked → "This teacher has no open times
  this week." plus an inline "Request another time" affordance.
- `availability_mode = 'restricted'` with no `available` rules → the teacher's own
  editor warns "Students cannot book any time. Add an available window or switch
  to Open by default."
- Overlapping blocks painted on the grid are merged on write, not rejected.
- A block dragged to zero height is treated as a delete, not a 400.
- Slot taken between load and submit → 409, message unchanged, grid refetches.
- Invalid timezone string → 400 naming the field.
- Envelope narrower than the shortest allowed duration → the settings form warns
  before saving; the engine simply yields no slots.

## Testing

`slot-engine.test.cjs` extends to cover the inverted model:

- `open` mode with no rules and no overrides yields slots across the envelope
- `open` mode yields nothing outside the envelope
- a `blocked` weekly rule carves a hole in `open` mode
- an untimed unavailable override clears a whole day in `open` mode
- an available override adds a window outside the envelope
- a blocked rule beats an available override on the same range
- `restricted` mode with no rules yields nothing (the old behavior, on purpose)
- `restricted` mode still honors `available` rules
- buffers, busy sessions, minimum notice, and max-days-ahead still clamp
- `slot_increment_minutes` controls slot starts

New `timezone.test.cjs`:

- `zonedTimeToUtc` across `America/Toronto`, `Asia/Kolkata` (half-hour offset),
  and `UTC`
- a spring-forward gap time resolves forward
- a fall-back ambiguous time resolves to the earlier instant
- a rule spanning a DST boundary keeps its wall-clock hours on both sides

Manual integration pass:

- a teacher who has never touched the editor is bookable by their student
- blocking Thursday afternoon on the grid removes exactly those slots
- switching to `restricted` with no rules makes the student see nothing
- booking from `/student/teachers` creates a confirmed session on both dashboards
- a second booking of the same slot returns 409

`npm run lint` and `npx tsc --noEmit` both clean.

## Migration and Rollout

One migration, `20260710000002_open_availability_by_default.sql`:

1. Add the new columns with defaults.
2. Insert a settings row for every teacher lacking one.
3. Set `availability_mode = 'restricted'` for teachers with ≥1 active rule.
4. Backfill `teacher_booking_settings.timezone` from `profiles.timezone`.

Step 3 is a no-op today (0 rules exist) but makes the migration correct if it is
ever replayed against a database where teachers have published windows.

The change is immediately visible to students: every teacher becomes bookable
inside their default 8:00–20:00 envelope the moment the migration lands. That is
the intent, but it means teachers should be told. Out of scope for this spec, and
worth a heads-up email before deploy.

## Files

Added:

- `src/lib/availability/timezone.ts`
- `src/lib/availability/timezone.test.cjs`
- `src/components/calendar/week-grid.tsx`
- `src/components/availability/availability-calendar.tsx`
- `src/app/api/availability/overrides/[id]/route.ts` — gains `PATCH`
- `supabase/migrations/20260710000002_open_availability_by_default.sql`

Rewritten:

- `src/lib/availability/slot-engine.ts`
- `src/lib/availability/time.ts`
- `src/lib/availability/types.ts`
- `src/components/availability/availability-editor.tsx`
- `src/components/sessions/week-calendar.tsx`
- `src/components/booking/slot-picker.tsx`

Modified:

- `src/lib/availability/data.ts`
- `src/app/api/availability/settings/route.ts`
- `src/app/api/availability/rules/route.ts`
- `src/app/api/availability/rules/[id]/route.ts`
- `src/app/api/booking/slots/route.ts`
- `src/app/api/booking/book/route.ts`
- `src/components/availability/booking-settings-form.tsx`
- `src/components/student/student-dashboard.tsx`
- `src/components/teacher/teacher-dashboard.tsx`

Deleted:

- `src/components/availability/date-overrides-list.tsx`

## Future Work

- Google and Outlook calendar sync, which the `blocked` rule type now models
  naturally: an imported busy event is a one-off blocked override.
- Shareable private booking links.
- Recurring weekly lessons.
- Reschedule through the slot picker rather than a free-form time input.
- Drag a session on the week grid to reschedule it.

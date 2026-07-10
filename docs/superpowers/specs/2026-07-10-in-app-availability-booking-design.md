# In-App Availability Booking

## Problem

Teachers and students currently schedule classes by proposing one exact time at a
time. If that time does not work, the other person must decline or reschedule
with another single proposed time. This creates avoidable back-and-forth for a
workflow that should feel simple: find a time that works and book it.

The product already has schedule pages, an in-app calendar, session proposal
state, role-based teacher/student assignments, timezone capture, and email
notifications. The missing layer is teacher availability: a teacher should be
able to publish recurring times they are willing to teach, and students should
be able to book from those generated openings.

## Goals

- Make scheduling a class between assigned teachers and students require one
  successful action instead of a proposal/counterproposal loop.
- Let teachers define recurring weekly availability and simple one-off date
  overrides inside the existing website.
- Let students book available slots from the existing student schedule surface.
- Reuse the current `sessions` table, dashboard calendar, session emails, and
  role/assignment model instead of building a separate scheduling product.
- Prevent double booking when two people try to claim the same slot.
- Keep v1 entirely in-app. Google Calendar, Outlook Calendar, and public
  Calendly-style links are future features, not part of the first build.

## Non-Goals

- No Google Calendar, Outlook Calendar, iCal, or external calendar sync in v1.
- No public booking pages discoverable outside authenticated Insight users.
- No shareable public scheduling links in v1.
- No student-managed weekly availability in v1. Student conflicts are inferred
  from the student's existing non-cancelled Insight sessions.
- No recurring session creation. A student books one class at a time.
- No payment, location, meeting-link, or lesson-material workflows.

## Product Shape

### Teacher Experience

Teachers use the existing `/teacher/schedule` area and gain an availability
management section. They can:

- Add weekly availability windows by weekday, start time, end time, and timezone.
- Add more than one window per day, such as Monday 3:00-5:00 PM and Monday
  7:00-8:00 PM.
- Set booking preferences:
  - default duration: 60 minutes
  - allowed durations: 30, 45, 60, 90, 120 minutes
  - minimum notice: 12 hours
  - max days ahead: 30 days
  - buffer before: 0 minutes
  - buffer after: 0 minutes
  - auto-confirm: true
- Add date overrides for one-off unavailable or available blocks.
- See a preview of upcoming bookable slots.

Teacher-published slots are considered pre-approved. When `auto_confirm` is
true, a student booking one of those slots creates a confirmed session rather
than a pending proposal.

### Student Experience

Students use the existing `/student/schedule` area and gain a "Find a time"
flow. They can:

- Select one of their assigned teachers.
- Select a session duration from the teacher's allowed durations.
- Browse generated available slots grouped by day.
- Book one slot after reviewing the teacher, date, time, duration, and optional
  notes.

After booking, the student and teacher dashboards refresh and the session
appears on their calendars. The existing email system sends the teacher a
booking notification.

### Rescheduling

The existing reschedule flow should move toward the same slot picker over time.
For v1, the required behavior is:

- Creating a new booking uses the slot picker.
- Existing manual reschedule controls may remain in place during the first
  implementation.
- If the implementation touches rescheduling, use available slots instead of a
  free-form time input for teacher-published availability.

## Data Model

### `teacher_booking_settings`

One row per teacher.

- `teacher_id uuid primary key references public.profiles(id) on delete cascade`
- `default_duration_minutes integer not null default 60`
- `allowed_durations integer[] not null default array[30,45,60,90,120]`
- `buffer_before_minutes integer not null default 0`
- `buffer_after_minutes integer not null default 0`
- `minimum_notice_hours integer not null default 12`
- `max_days_ahead integer not null default 30`
- `auto_confirm boolean not null default true`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Constraints:

- `default_duration_minutes = any(allowed_durations)`
- all duration/buffer/notice values are non-negative
- `max_days_ahead` is between 1 and 180

### `teacher_availability_rules`

Recurring weekly availability.

- `id uuid primary key default gen_random_uuid()`
- `teacher_id uuid not null references public.profiles(id) on delete cascade`
- `weekday integer not null check (weekday between 0 and 6)`
- `start_time time not null`
- `end_time time not null`
- `timezone text not null`
- `is_active boolean not null default true`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Rules:

- `0 = Sunday`, `1 = Monday`, through `6 = Saturday`.
- `end_time > start_time`; overnight windows are out of scope for v1.
- Store the teacher's timezone on each rule so future timezone changes do not
  silently reinterpret existing rules.

### `teacher_availability_overrides`

One-off available or unavailable blocks on a specific date.

- `id uuid primary key default gen_random_uuid()`
- `teacher_id uuid not null references public.profiles(id) on delete cascade`
- `date date not null`
- `start_time time`
- `end_time time`
- `timezone text not null`
- `is_available boolean not null`
- `reason text`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Rules:

- If `is_available = true`, `start_time` and `end_time` are required.
- If `is_available = false` with null times, the full date is blocked.
- If `is_available = false` with times, only that block is removed.
- `end_time > start_time` when both times are present.

### `sessions` Changes

Add optional metadata to identify bookings that came from the availability flow:

- `booking_source text not null default 'manual' check (booking_source in ('manual', 'availability'))`

Existing session statuses remain:

- `proposed`
- `confirmed`
- `cancelled`

For v1, availability bookings create:

- `status = 'confirmed'` when teacher setting `auto_confirm = true`
- `status = 'proposed'` when `auto_confirm = false`
- `proposed_by = student_id`
- `booking_source = 'availability'`

## Slot Generation

The server generates slots from teacher availability every time the student asks
for openings. Slots are not pre-materialized in the database.

Inputs:

- `assignment_id`
- `duration_minutes`
- `from` ISO date
- `to` ISO date

Algorithm:

1. Verify the current user is the student or teacher on the assignment.
2. Load teacher booking settings or create defaults in memory.
3. Reject durations not included in `allowed_durations`.
4. Clamp the search window to:
   - now + `minimum_notice_hours`
   - now + `max_days_ahead`
5. Expand matching weekly availability rules into concrete windows in the
   teacher's timezone.
6. Apply date overrides:
   - remove unavailable override windows
   - remove entire blocked dates
   - add available override windows
7. Load non-cancelled sessions for both teacher and student across the search
   window.
8. Expand each session by teacher buffers.
9. Split availability windows into slots at 15-minute boundaries.
10. Keep slots whose full duration fits inside a window and does not overlap a
    busy interval.
11. Return slots in the current user's display timezone.

DST note: v1 uses JavaScript `Date` and `Intl` utilities already available in
the app. The implementation should centralize timezone conversion in a small
library file so it can be replaced by a dedicated date-time dependency later if
needed.

## Booking

Booking must be race-safe. The client may display slots, but the server must
recompute availability before inserting a session.

`POST /api/booking/book`:

1. Authenticates the user.
2. Verifies the user is the student on the assignment. Teachers should keep the
   existing manual scheduling path for now.
3. Validates `assignment_id`, `scheduled_at`, `duration_minutes`, and optional
   notes.
4. Recomputes availability for the requested slot.
5. If the slot is no longer available, returns `409`.
6. Inserts the session.
7. Revalidates dashboard cache.
8. Sends the existing session email notification.

To prevent double booking under concurrent requests, add a Postgres function
that performs the conflict check and insert in one transaction using an
advisory transaction lock keyed by teacher id and slot start. The API should
call this RPC instead of doing a separate read-then-insert.

## API Surface

### Teacher Availability

- `GET /api/availability/settings`
  - Teacher only.
  - Returns settings, active rules, and upcoming overrides for the current
    teacher.

- `PUT /api/availability/settings`
  - Teacher only.
  - Replaces settings fields with validated values.

- `POST /api/availability/rules`
  - Teacher only.
  - Creates one weekly rule.

- `PATCH /api/availability/rules/[id]`
  - Teacher only.
  - Updates one owned rule.

- `DELETE /api/availability/rules/[id]`
  - Teacher only.
  - Soft-deactivates one owned rule.

- `POST /api/availability/overrides`
  - Teacher only.
  - Creates one date override.

- `DELETE /api/availability/overrides/[id]`
  - Teacher only.
  - Deletes one owned override.

### Booking

- `GET /api/booking/slots?assignment_id=&duration_minutes=&from=&to=`
  - Teacher or student on the assignment.
  - Returns generated slots.

- `POST /api/booking/book`
  - Student on the assignment only.
  - Books one generated slot.

## Security and RLS

RLS should mirror the existing assignment boundaries:

- Teachers can select, insert, update, and delete only their own availability.
- Students can never read raw teacher availability tables directly.
- Students only see generated slots through the booking API for teachers they
  are actively assigned to.
- Admins can select availability data for support/debugging if needed, but admin
  editing is out of scope for v1.
- Booking APIs use server-side auth and assignment checks; clients cannot book
  arbitrary teacher/student combinations.

## UI Integration

Use the existing dashboard structure:

- `src/app/(dashboard)/teacher/schedule/page.tsx`
- `src/components/teacher/teacher-dashboard.tsx`
- `src/app/(dashboard)/student/schedule/page.tsx`
- `src/components/student/student-dashboard.tsx`
- `src/components/sessions/month-calendar.tsx`

New components should live under:

- `src/components/availability/availability-editor.tsx`
- `src/components/availability/booking-settings-form.tsx`
- `src/components/availability/date-overrides-list.tsx`
- `src/components/booking/slot-picker.tsx`
- `src/components/booking/book-session-modal.tsx`

The UI should feel like an operational scheduling tool, not a marketing-style
Calendly page. Keep it dense, clear, and consistent with the current dashboard.

## Error Handling

- No availability: show an empty state with "No available times yet."
- Duration not allowed: show "Choose one of this teacher's available durations."
- Slot taken between load and submit: return `409` and show "That time was just
  booked. Pick another slot."
- Minimum notice violation: show "This time is too soon to book."
- Assignment inactive or missing: return `403` or `404`.
- Invalid rule times: return `400` and identify the field.
- Email failure after successful booking should not roll back the booking; log it
  and keep the session.

## Testing

- Unit test slot generation:
  - recurring rule expands into slots
  - buffers remove adjacent slots
  - existing teacher sessions block slots
  - existing student sessions block slots
  - unavailable full-day override removes slots
  - available override adds slots
  - minimum notice removes near-term slots
  - max-days-ahead clamps the result
- Unit test booking validation helpers.
- API test or manual integration check:
  - teacher creates availability
  - student sees slots
  - student books a slot
  - booked session appears on both dashboards as confirmed
  - second booking attempt for same slot returns `409`
- Run `npm run lint`.
- Run `npx tsc --noEmit`.

## Future Work

- Google Calendar and Outlook Calendar sync.
- Shareable private booking links.
- Student weekly availability.
- Recurring weekly lessons.
- Admin-managed availability.
- Timezone/date library migration if DST edge cases become more complex than
  native `Intl` utilities can comfortably support.

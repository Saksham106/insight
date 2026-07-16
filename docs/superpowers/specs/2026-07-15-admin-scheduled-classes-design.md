# Admin-Scheduled Classes — Design

**Date:** 2026-07-15
**Workstream:** 2
**Status:** Approved

## Problem

The admin can view sessions but cannot create them. Sessions today are always born
`proposed` and require the other party to confirm. The admin needs to schedule a class
between a teacher and student that is **immediately confirmed** — no approval on either
side — with both parties notified.

## Design

### A. API — admin path in `POST /api/sessions`

- Detect `profile.role === "admin"`.
- Admin insert: `status: "confirmed"`, `booking_source: "manual"`, `proposed_by: <admin id>`.
  `proposed_by` is no longer required in the request body when the actor is admin.
- Non-admin flow unchanged (teacher/student → `proposed`, notify the other party).
- RLS already permits admin inserts (`sessions_insert` with_check includes `is_admin()`),
  so no policy change.
- The existing `sendNotification` computes "the other party" from the actor and breaks when
  the actor is an admin (misattributes names, emails only one side). Admin creation instead
  calls a new `notifyBothParties()` that emails **both** teacher and student, each with their
  own name / timezone / dashboard link, attributing the counterpart as `actorName`.

### B. Email — new `scheduled` event

- Add `"scheduled"` to `SessionEmailEvent` and a matching entry in `configs`.
- Copy: subject "New session scheduled with {other party}", title "A session has been
  scheduled", body "Insight Academy has scheduled a tutoring session for you with
  {other party}. This session is confirmed — no action needed."
- Reuses `sessionDetailsHtml` + `layout`; `sendSessionEmail` already handles role/timezone.

### C. UI — admin scheduling form

- New `src/components/sessions/admin-schedule-session-form.tsx`:
  - **Assignment selector**: native `<select>` of active assignments, labeled
    "{teacher} → {student}".
  - Date (`<input type=date>`), Time (`TimePicker`), Duration (`<select>`), Notes
    (`Textarea`) — same controls/pattern as the teacher `ScheduleSessionForm`.
  - Submit → `POST /api/sessions` with `{ assignment_id, scheduled_at, duration_minutes,
    notes }` (no `proposed_by`; server infers admin + confirmed).
  - Success: "Session scheduled — teacher and student notified." Resets the form.
- `AdminSessionsSection` gains an `assignments: AdminAssignmentRow[]` prop and renders the
  form (filtered to `is_active`) above the sessions list.
- `admin-dashboard.tsx` passes `assignments` into `AdminSessionsSection`.

### Out of scope

- Admin cancel/reschedule of an existing session (admin `SessionCard` shows no actions;
  the `[id]` PATCH restricts to teacher/student). Teacher/student can cancel a confirmed
  session if needed. Not asked for; deferred.

## Files

- **Edit:** `src/lib/email/index.ts` (add `scheduled` event + config)
- **Edit:** `src/app/api/sessions/route.ts` (admin branch + `notifyBothParties`)
- **Add:** `src/components/sessions/admin-schedule-session-form.tsx`
- **Edit:** `src/components/admin/admin-sessions-section.tsx` (assignments prop + form)
- **Edit:** `src/components/admin/admin-dashboard.tsx` (pass assignments)

No Supabase migration; no schema change.

## Verification

- `npm run lint` (touched files clean) + `npm run build` pass.
- Manual E2E: admin schedules a session for a teacher↔student pair → appears `Confirmed`
  on both dashboards with no Confirm button; both parties receive a "scheduled" email.

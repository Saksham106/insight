# Student Availability — Design

**Date:** 2026-07-15
**Workstream:** 3c (student availability)
**Status:** Shipped

## Goal

Let a student publish the weekly hours (and one-off date exceptions) they can meet,
mirroring the teacher availability model. When a student books, the bookable slots are the
intersection of the teacher's open times and the student's own availability. A student who
sets nothing is unrestricted — booking behaves exactly as before (fully backward compatible).

## Schema (migration `20260715000001_add_student_availability.sql`, applied to prod)

- `student_availability_rules` — `(id, student_id → profiles, weekday 0–6, start_time,
  end_time, timezone, is_active, rule_type available|blocked, timestamps)`; `end > start`.
- `student_availability_overrides` — `(id, student_id → profiles, date, start_time?, end_time?,
  timezone, is_available, reason?, timestamps)`; both-or-neither times.
- Shared `set_updated_at` trigger on both.
- RLS: owner policy `student_id = auth.uid()` (all), plus admin-select. Reuses `is_admin()`.

## Backend

- `data.ts::getStudentAvailabilityBundle(studentId)` — admin-client read of rules/overrides +
  resolved timezone (profile tz → first rule tz → UTC).
- `slot-engine.ts` — exported the pure `mergeOverlappingIntervals` and `subtractBlocks` helpers.
- `student-availability.ts` — `studentHasAvailability`, `studentAvailableIntervals`
  (windowing that mirrors the engine, in the student's zone), `filterSlotsByStudentAvailability`
  (keep slots fully inside an available interval). Unit-tested in `student-availability.test.cjs`.
- `booking/slots` route — after generating teacher slots, if the student has availability,
  intersect. No change when the student has none.

## API (student-scoped, role `student`, user client so RLS applies)

- `GET  /api/student-availability` → `{ rules, overrides, timezone }`
- `POST /api/student-availability/rules`, `PATCH|DELETE /api/student-availability/rules/[id]`
- `POST /api/student-availability/overrides`, `PATCH|DELETE /api/student-availability/overrides/[id]`

## Frontend

- `WeeklyHoursEditor` made owner-agnostic: takes `mode` + `rulesEndpoint`/`overridesEndpoint`
  props and owner-agnostic `WeeklyAvailabilityRule`/`DateAvailabilityOverride` types (the teacher
  `AvailabilityRule`/`AvailabilityOverride` now extend these).
- `StudentAvailabilityEditor` — loads `/api/student-availability`, renders the editor with
  `mode="restricted"` and the student endpoints.
- Rendered on the student Schedule view beneath the booking picker.

## Verification

- `npm run build` + `tsc` clean; 34 existing availability/lib tests still pass; 7 new
  student-availability unit tests pass; route smoke tests (401 unauth, 307 schedule) pass.

# Schedule & Booking-Rules Simplification — Phase 3 Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Checkbox steps.

**Goal:** Make teacher/student availability easy: one intuitive "set your available hours" model (Calendly-style), and booking rules reduced to essentials with everything else behind an "Advanced" disclosure. No option deleted from the data model.

**Decisions (user-approved):** (1) Essentials + Advanced disclosure. (2) One availability model — drop the open-vs-restricted toggle; teachers paint available weekly hours.

**Architecture:** The `WeeklyHoursEditor` already supports "restricted" (paint available windows). So we force `availability_mode = "restricted"` everywhere and hide the mode/open-hours UI. The slot engine applies `blocked` rules in BOTH modes, so we can migrate every "open" teacher without changing their bookability by materializing their open envelope (`open_day_start`–`open_day_end`, weekdays 0–6) as `available` rules while keeping any existing `blocked` rules.

## Global Constraints
- Do NOT touch `/admin/hermes` or `hermes_*`.
- Keep booking/slot generation working (verify slots still generate after migration).
- Nothing removed from `teacher_booking_settings` columns — Advanced UI still writes them.
- Mobile-first.

---

### Task 1: Migrate open → restricted, preserving bookability

**Files:** Create `supabase/migrations/20260718120000_single_availability_model.sql`. Apply to linked project.

- [ ] For each teacher whose settings `availability_mode = 'open'`: insert `available` rules for weekdays 0–6 using `open_day_start`/`open_day_end` (timezone = settings.timezone, is_active true, rule_type 'available'), UNLESS that teacher already has active `available` rules (skip those — they were already restricted-like). Then set their `availability_mode = 'restricted'`.
- [ ] Change column default: `alter column availability_mode set default 'restricted'`.
- [ ] Guard against duplicate runs (only insert where no active available rule exists for that teacher+weekday).
- [ ] Verify with a SELECT: every previously-open teacher now has 7 available rules and mode restricted; slot generation for a sample teacher still returns slots.
- [ ] Commit.

### Task 2: BookingSettingsForm → essentials + Advanced

**Files:** Modify `src/components/availability/booking-settings-form.tsx`.

- [ ] Remove the `availability_mode` radios and the open-hours start/end fields from the UI. Always submit `availability_mode: "restricted"` (keep existing `open_day_start/end` values passed through unchanged so the PUT validation still passes).
- [ ] Essentials (always visible): **Default session length** (select from allowed) + **Automatically confirm bookings** toggle (high-value, keep visible). 
- [ ] Wrap the rest in a `<details>` "Advanced options": allowed session lengths, slot spacing, minimum notice, max days ahead, buffer before/after.
- [ ] Drop the now-irrelevant `rulesCount === 0` restricted-mode error (or keep as a gentle "add hours" hint). Keep allowed-duration validation.
- [ ] Verify save round-trips (PUT succeeds, settings persist).
- [ ] Commit.

### Task 3: AvailabilityEditor — availability first, one model

**Files:** Modify `src/components/availability/availability-editor.tsx`.

- [ ] Pass `mode="restricted"` to `WeeklyHoursEditor` regardless of `settings.availability_mode` (the migration makes them consistent, but be defensive).
- [ ] Update the header copy: "Set the hours students can book you each week." Keep the timezone note.
- [ ] Keep "Your weekly hours" open by default; keep "Booking rules" collapsed. Remove open-mode-specific wording.
- [ ] Commit.

### Task 4: Student side parity

**Files:** Inspect `src/components/availability/student-availability-editor.tsx` and `src/app/(dashboard)/student/schedule/page.tsx`.

- [ ] Student availability is already always "restricted" — confirm it uses `WeeklyHoursEditor` with restricted and no mode UI. Apply the same essentials/copy cleanup if it shows booking-rule options. (Students set when THEY can attend.)
- [ ] Commit if changed.

### Task 5: Verify end-to-end (browser)
- [ ] Teacher `/schedule`: availability shows day-rows (paint hours); Booking rules shows only essentials with Advanced collapsed; no open/restricted toggle. Save works.
- [ ] Student booking a session still sees available slots (migration preserved bookability).
- [ ] Mobile (375px) layout clean.
- [ ] Console/log check. Clean up any test edits.

## Self-Review
- One model (Task 1–3), essentials+Advanced (Task 2), no data deleted, migration preserves bookability via available-rule materialization + blocked-rules-in-both-modes. ✓

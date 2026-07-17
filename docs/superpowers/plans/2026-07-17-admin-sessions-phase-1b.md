# Admin Sessions on Groups — Phase 1b Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use `- [ ]` checkboxes.

**Goal:** Let the admin schedule a session for one or more students of a teacher in a single action (a group class), and manage it as a unit.

**Architecture:** Fan-out. `sessions.assignment_id` is NOT NULL and every teacher×student pair already has a derived assignment. Scheduling for N students inserts N confirmed sessions (one per assignment) sharing a new `group_session_id`. Teacher/student dashboards, booking, and emails are unchanged. New: an admin group-schedule API, a teacher→students scheduling form, and grouped display with cancel-as-group in the admin sessions view.

**Tech Stack:** Next.js App Router (16), React 19, Supabase service-role admin client, TypeScript.

## Global Constraints

- Do NOT touch `/admin/hermes` or `hermes_*` tables.
- Admin-only mutations via `createAdminClient()` guarded by `profile.role === "admin"`.
- Reuse existing `sendSessionEmail` / notify helpers; admin batch notifies each pair.
- Mobile-first; follow existing inline-style + utility-class conventions.
- Keep existing per-session teacher/student scheduling, booking, and PATCH flows working.

---

### Task 1: `group_session_id` column

**Files:**
- Create: `supabase/migrations/20260717140000_add_group_session_id.sql`

- [ ] Add nullable `group_session_id uuid` + index. Apply to linked project.

```sql
alter table public.sessions add column if not exists group_session_id uuid;
create index if not exists idx_sessions_group on public.sessions (group_session_id);
```

- [ ] Commit `feat(sessions): add group_session_id`.

---

### Task 2: Admin group-schedule + group-cancel API

**Files:**
- Create: `src/app/api/sessions/group/route.ts` (POST create batch)
- Create: `src/app/api/sessions/group/[groupId]/route.ts` (DELETE cancel batch)

**Interfaces:**
- `POST /api/sessions/group { teacherId, studentIds[], scheduled_at, duration_minutes, notes }` → `{ groupSessionId, count }`.
- `DELETE /api/sessions/group/:groupId` → `{ cancelled }`.

- [ ] **Step 1:** POST route (admin guard). Validate: non-empty `studentIds`, future `scheduled_at`, positive duration. Resolve, for each studentId, the active `teacher_student_assignments` row for (teacherId, studentId) via `createAdminClient()`. Skip any student with no active assignment (collect skipped). Generate one `group_session_id` (`crypto.randomUUID()`). Insert one session per assignment: `{ assignment_id, scheduled_at, duration_minutes, notes, status: "confirmed", booking_source: "manual", proposed_by: adminId, group_session_id }`. `revalidateTag("dashboard","max")`. Fire `sendSessionEmail` to each pair (reuse the notify-both-parties shape from `src/app/api/sessions/route.ts` — extract a shared helper `notifyAssignmentBothParties(assignmentId, scheduledAt, duration, notes)` into `src/lib/email/session-notify.ts` and import it in both routes to stay DRY). Return `{ groupSessionId, count, skipped }`.
- [ ] **Step 2:** DELETE route (admin guard). Load sessions where `group_session_id = :groupId`; set `status = "cancelled"`, `cancelled_by = adminId` for all; revalidate; notify each pair (`event: "cancelled"`). Return `{ cancelled: n }`.
- [ ] **Step 3:** Extract `notifyAssignmentBothParties` into `src/lib/email/session-notify.ts`; refactor `src/app/api/sessions/route.ts`'s `notifyBothParties` to use it (no behavior change). Verify existing single-session admin scheduling still emails.
- [ ] **Step 4:** Commit `feat(sessions): admin group schedule + cancel API`.

---

### Task 3: Grouped admin sessions data

**Files:**
- Modify: `src/lib/dashboard-data.ts` (add `group_session_id` to the admin sessions select + `AdminSession` type)

- [ ] Add `group_session_id` to the `sessions` select string and to the mapped `AdminSession` object; add `group_session_id: string | null` to the `AdminSession` type (`export type AdminSession = Session & { teacherName: string; studentName: string; group_session_id: string | null }`).
- [ ] Commit `feat(sessions): expose group_session_id to admin dashboard`.

---

### Task 4: Scheduling form (teacher → one or more students)

**Files:**
- Create: `src/components/sessions/admin-schedule-group-form.tsx`
- Modify: `src/components/admin/admin-sessions-section.tsx` (use new form; group the list by `group_session_id`)

**Interfaces:**
- Consumes: `assignments: AdminAssignmentRow[]` (already passed to `AdminSessionsSection`) to build teacher→students; `POST /api/sessions/group`; `DELETE /api/sessions/group/:groupId`.

- [ ] **Step 1:** `admin-schedule-group-form.tsx`:
  - Build `Map<teacherId, {teacher, students[]}>` from `assignments.filter(a => a.is_active && a.teacher && a.student)`.
  - Teacher `<select>`; on choose, show that teacher's students as toggle chips + a "Select all" toggle (default all selected).
  - Date (`Input type=date`), Time (`TimePicker`), Duration (`select`), Notes (`Textarea`) — reuse the fields from the old `admin-schedule-session-form.tsx`.
  - Submit → `POST /api/sessions/group`. On success show "Scheduled for N students", reset, `router.refresh()`. Surface `skipped` if any.
  - Empty state when no active assignments: "Create a group with a teacher and students first."
- [ ] **Step 2:** In `admin-sessions-section.tsx`, replace `AdminScheduleSessionForm` with `AdminScheduleGroupForm`. In the entries list, group sessions by `group_session_id` (null → standalone). Render a batch of >1 as one card block: header "`Teacher` · group class · `N students`", the shared time (via one `SessionCard`), the student name list, and a "Cancel class" button → `DELETE /api/sessions/group/:groupId` + `router.refresh()`. Standalone sessions render as today (`SessionCard` with `Teacher → Student` label).
- [ ] **Step 3: Browser verify** (Task 5).
- [ ] **Step 4:** Commit `feat(sessions): group scheduling UI + grouped display`.

---

### Task 5: End-to-end verification (browser, admin login)

- [ ] Admin → Sessions. Pick a teacher, select 2+ students, pick a future time, Schedule.
- [ ] Confirm one grouped entry appears listing all students; DB shows N sessions sharing one `group_session_id`, all `confirmed`.
- [ ] Confirm a teacher/student dashboard shows their session (via assignment) as normal.
- [ ] Cancel the class; confirm all N sessions flip to `cancelled`.
- [ ] Schedule for a single student; confirm it renders as a normal standalone session.
- [ ] Console/log check; mobile (375px) layout check; clean up test sessions.

## Self-Review
- Covers "schedule for a group or one or more" (Task 4), reuses booking/dashboards unchanged (fan-out, Task 1-2), cancel-as-group (Task 2/4). Reschedule-as-group deferred (individual reschedule still works via existing per-session PATCH). ✓
- DRY: shared `notifyAssignmentBothParties` (Task 2). ✓

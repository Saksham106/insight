# Unified Invite Card — Design

**Date:** 2026-07-15
**Workstream:** 1 of the admin/scheduling/chat overhaul (see conversation for full decomposition)
**Status:** Approved

## Problem

The admin "Users" view renders three near-identical invite cards — `CreateTeacherForm`,
`CreateStudentForm`, `CreateParentForm` — one per role. They differ only in a hardcoded
`role` and label text. The student card is also mislabeled "Invite student/parent",
conflating two distinct roles.

This is confusing to the admin (three boxes for one action) and is triplicated code.

Out of scope: the original prompt also asked to diagnose/fix the two users' login-email
issue. That has been handled separately (by the user's brother) and is explicitly dropped
from this workstream. No email-deliverability, activation-tracking, or resend changes here.

## Goal

Replace the three cards with **one** invite card that has a role selector offering three
distinct choices: **Teacher · Student · Parent**.

## Design

### Component

New `src/components/admin/invite-user-form.tsx` (client component), replacing the three
`Create*Form` files.

- **Role selector:** a segmented control of three buttons — `Teacher`, `Student`, `Parent`.
  Default selection: `Student` (most common invite). Selected button is visually distinct
  (navy fill); others are outline. Built with inline `style={{}}` per project convention
  (positional/layout Tailwind utilities are not generated in this project).
- **Fields:** Full name, Email — unchanged from the current forms.
- **Submit:** POST `/api/admin/invite-user` with `{ fullName, email, role }` where `role`
  is the selected segment. The endpoint already accepts and validates
  `teacher | student | parent | admin`; no API change needed.
- **Preserved behaviors** (identical to current forms):
  - `409 alreadyActive` → warning: user already active, can log in directly.
  - `409 alreadyInvited` → show "Resend credentials" button; resend posts with
    `resend: true`.
  - `emailError` in a 200 → warning + reveal generated password to share manually.
  - Success → success message + reveal generated password; reset name/email; `router.refresh()`.
  - Dismissable generated-password panel.
- On successful submit, the role selector keeps its last selection (admin often invites
  several of the same role in a row).

### Dashboard wiring

`src/components/admin/admin-dashboard.tsx`:
- Replace the `<AdminFormsGrid>` block containing the three forms with a single
  `<InviteUserForm />`.
- The card sits at the top of the Users view where the grid was, full-width within the
  content column (no 2-up grid needed for one card).

### Cleanup

- Delete `create-teacher-form.tsx`, `create-student-form.tsx`, `create-parent-form.tsx`.
- Delete `admin-forms-grid.tsx` (only consumer was these three cards — verify no other
  import before removing).

## Files touched

- **Add:** `src/components/admin/invite-user-form.tsx`
- **Edit:** `src/components/admin/admin-dashboard.tsx`
- **Delete:** `create-teacher-form.tsx`, `create-student-form.tsx`, `create-parent-form.tsx`,
  `admin-forms-grid.tsx` (pending import check)

No API routes, no Supabase migrations, no schema changes.

## Verification

- Admin → Users: one invite card with a Teacher/Student/Parent selector.
- Invite a test user under each of the three roles; confirm the created `profiles.role`
  matches the selected segment.
- Re-invite an existing active user → already-active warning.
- Re-invite a pending (never-logged-in) user → resend flow works.
- `npm run build` / lint / existing test suite pass.

# Admin Dashboard Redesign — Groups as the Core Unit

**Date:** 2026-07-17
**Status:** Approved (design), implementing Phase 1a
**Scope:** Admin dashboard only (Phase 1). Teacher/student schedule simplification, the
chat-input layout bug, and mobile polish are tracked as later phases and are out of scope here.

## Problem

The admin experience is too complicated and finicky. Assignments are rigidly one
teacher ↔ one student. Group-chat creation is buried in the Chats page and overlaps
confusingly with assignments. Sessions can only be scheduled for a single pair. The
goal is a simpler, mobile-friendly model that does a few things well.

## Core decision

**A group is the core unit.** When the admin selects people and creates a group, that
group is one conversation with N members. Teaching relationships (which power booking,
sessions, and "my students / my teachers") are derived from group membership, not
maintained as a separate concept the admin has to think about.

- The admin is the **creator** of a group but **not a member** (not in the chat).
- A group may mix any roles: teachers, students, parents.

## Architecture

Relationship-of-record today is `teacher_student_assignments` (one teacher + one
student). Booking (`/api/booking/slots`) and sessions resolve availability from an
`assignment_id`. Conversations are already first-class (`conversations`,
`conversation_participants`, `is_group`, `title`, `created_by`).

**Strategy:** keep `teacher_student_assignments` as the derived booking substrate so the
availability/booking engine is untouched, but make the **group conversation** the
UI-facing unit. Creating a group ensures a `teacher_student_assignments` row exists for
every (teacher × student) pair in that group. This keeps RLS and booking working while
presenting a single simple concept to the admin.

## Phase 1a — Groups + Chats viewer (build first)

### Assignments page → "Groups"
- Single "New group" flow (works as a modal/inline form, mobile-first):
  - People picker: search + role filter (teachers / students / parents), tap to add,
    selected people render as removable chips.
  - Optional group name; auto-derived from members when blank (e.g. "Ms. Lee & Aryan").
  - Create.
- On create: insert one `conversations` row (`created_by` = admin, admin NOT added to
  `conversation_participants`); add selected people as participants; ensure
  `teacher_student_assignments` rows for each teacher × student pair in the group.
- Manage: groups as cards (members, last activity, message count). Per-card actions:
  rename, add/remove members, archive. The old "1 teacher + 1 student" form is removed.

### Chats page → read-only viewer
- Admin browses **all** conversations (groups and DMs), including ones they are not in.
- List of conversations on the left, messages on the right, read-only.
- Group creation is removed from this page (lives on the Groups page now).

### Data / API
- `POST /api/admin/groups` — create group (conversation + participants + derived
  assignment rows). Replaces the single-pair `/api/admin/assign` flow (kept as a thin
  compatibility path if still referenced).
- `PATCH/DELETE /api/admin/groups/[id]` — rename, add/remove members, archive.
- Admin conversation listing reused/extended for the read-only viewer.

## Phase 1b — Sessions rebuilt on groups (build second)

- Schedule: pick a group → pick date/time (host teacher's availability), optionally
  narrow to specific members rather than the whole group.
- Data model: sessions reference the group (`conversation_id`) and an attendee set
  (`session_participants`), with a host teacher. `assignment_id` kept nullable for
  backward compatibility. Busy/availability computed from host teacher + student
  attendees.

## Non-goals (this spec)
- Teacher/student schedule + booking-rules simplification (later phase).
- Chat message-input layout bug (later phase).
- Global mobile polish beyond making the new admin surfaces mobile-first.
- Anything under `/admin/hermes` (Kitty) — explicitly untouched.

## Success criteria
- Admin can create a group of arbitrary people in one short flow and is not placed in
  the chat.
- Existing 1:1 chats and booking continue to work unchanged.
- Admin can read any conversation from the Chats page.
- New surfaces are usable on a phone.

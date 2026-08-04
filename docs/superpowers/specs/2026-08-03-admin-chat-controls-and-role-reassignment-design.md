# Admin chat controls, duplicate prevention, and role reassignment

Date: 2026-08-03

## Problem

Three gaps in admin administration:

1. **Chat controls are undiscoverable.** Renaming a chat, changing its roster, and
   archiving it all already work, but they live behind a button labelled
   "Members". Nothing suggests that button also holds rename and delete, so from
   the admin's seat those capabilities do not exist.
2. **Duplicate chats are easy to create.** Dedupe only fires for an *unnamed
   two-person* chat. A three-person group, or a named pair, can be created over
   and over with the same people, leaving several parallel threads for one
   relationship.
3. **A miscategorised person cannot be fixed.** `profiles.role` decides which
   dashboard someone sees and which relationships they can hold. If a parent is
   invited as a student (or a tutor as a parent), there is no way to correct it
   short of deleting the account and re-inviting.

## Non-goals

- Changing anyone to or from `admin`. That is a privilege change, not a
  miscategorisation, and it carries a lockout risk.
- Hard-deleting conversations or message rows.
- Reworking the participant-facing chat UI. This is admin surface only, except
  where the shared dedupe helper is used by both.

---

## Part 1 — Chat controls, made discoverable

No API or schema change. `PATCH /api/admin/conversations/[id]` (title +
memberIds) and `DELETE` (sets `archived_at`) already do the work.

- `ConversationMembersModal` becomes `ManageChatModal`, titled "Manage chat",
  with three labelled sections: **Chat name**, **Members**, **Delete chat**.
- The thread header button becomes **Manage** (settings icon) instead of
  **Members**.
- The destructive path is relabelled from "Archive" to "Delete chat", with
  confirm copy that is honest about what happens: the chat disappears for
  everyone, and the message history stays in the database without being shown
  anywhere.

The soft-delete mechanism is deliberately unchanged. Message history between
tutors, parents, and students is evidence in a dispute; a misclick should not be
able to destroy it.

## Part 2 — No duplicate chats

### Roster key

New pure module `src/lib/chat/roster-key.ts`:

```
rosterKey(memberIds: string[]): string
```

Sorts, dedupes, and joins the member ids so that two rosters with the same
people produce the same key regardless of order or repeats. Pure and
DB-free, matching the existing `conversation-shape.ts` / `group-derive.ts`
pattern, and unit-tested directly.

### Matching

`findExistingDirectConversation` is replaced by
`findConversationByExactRoster(memberIds)`:

- Matches **any** roster size, not just two.
- **Ignores the chat name.** A named chat and an unnamed chat with the same
  people are the same relationship.
- Still excludes archived chats, so deleting a chat frees those people to start
  a fresh one. (Without this, deleting a pair's chat would permanently trap
  every future attempt into the deleted, unreachable thread.)

### Reporting it

`createAdminConversation` and `createConversation` return
`{ conversationId, existing: true }` on a match instead of inserting.
`POST /api/admin/conversations` passes `existing` through to the client.

`NewConversationModal` shows "A chat with exactly these people already exists."
plus an **Open it** button. The admin learns *why* no new chat appeared rather
than silently landing somewhere unexpected.

### The back door

`updateConversationMembers` rejects an edit that would make a chat's roster
identical to another live chat's, with "Another chat already has exactly these
people." Otherwise the roster editor is a second route to the duplicate state
the creation path now refuses.

### Accepted consequence

Matching regardless of name means two chats with the same three people (say
"Maths" and "Physics") can no longer coexist — the second is refused and the
admin is pointed at the first. This is the intended trade: one relationship, one
thread. The escape hatch is a different roster, or renaming the existing chat.

## Part 3 — Reassign a person's classification

### Planner

New pure module `src/lib/admin/role-reassign.ts`. Given `(fromRole, toRole)` it
returns which relationship classes to clear:

| Leaving  | Cleared                                                                                  |
| -------- | ---------------------------------------------------------------------------------------- |
| tutor    | `teacher_student_assignments` where they are the tutor → `is_active = false`               |
| student  | `teacher_student_assignments` where they are the student → `is_active = false`; their `parent_student_links` deleted |
| parent   | their `parent_student_links` (as parent) deleted                                           |

Assignments are **deactivated, not deleted**: sessions and the lesson ledger
reference them, and `ensureAssignments` already treats an inactive row as
something to reactivate rather than recreate. `parent_student_links` has no
`is_active` column and carries no history, so those rows are deleted.

Labels, availability rules, and booking settings are left in place, dormant.
They are configuration rather than relationships — harmless while unused, and
correct again if the person is reassigned back.

### Endpoint

`POST /api/admin/reassign-role`, body `{ userId, role, preview? }`.

Guards:

- Admin-only.
- Refuses the caller's own account.
- Refuses `admin` as either the current or the target role.
- Target must be one of `teacher` / `student` / `parent`.
- Target must differ from the current role.

With `preview: true` it returns the impact counts and writes nothing. Without
it, it applies the plan and then updates `profiles.role`.

No JWT or auth-metadata sync is needed: `getUserProfile` reads
`profiles.role` fresh on every request, so the new role takes effect on the
person's next page load.

### UI

A **Reassign** button on each row of the teachers / students / parents tables
opens a new `ReassignRoleModal`: a role picker, then a confirm step listing
exactly what will be cleared ("2 tutor assignments will be deactivated · 1
parent link will be removed"), sourced from the preview call.

This is deliberately *not* folded into `EditUserModal`. Every field in that
modal is role-specific (labels for tutors, linked children for parents, linked
parents for students) and would be stale the instant the role changed.

After saving, the person leaves their old table and appears in the new one — the
admin dashboard already queries by role.

## Testing

Pure modules get sibling `.test.cjs` files, matching the existing convention:

- `src/lib/chat/roster-key.test.cjs` — order independence, duplicate collapsing,
  size independence, distinctness for different rosters.
- `src/lib/admin/role-reassign.test.cjs` — all six tutor/student/parent
  transitions, plus the no-op and admin-involved cases.

Run with `node --test`.

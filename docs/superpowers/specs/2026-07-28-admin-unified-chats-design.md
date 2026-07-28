# Admin unified Chats surface

**Date:** 2026-07-28
**Status:** Approved
**Supersedes (partially):** `2026-07-17-admin-groups-redesign-design.md` — phase 1a split
admin conversation management (Groups tab) from admin conversation reading (Chats tab).
This spec merges them back into one surface.

## Problem

The admin dashboard has two tabs over the same objects:

- **Groups** (`/admin/assignments`, `GroupsManager`) — the *management* surface. Lists only
  conversations with `is_group = true`. Create, rename, add/remove members, archive. Clicking a
  group opens a modal, not the chat; an "Open chat" button navigates to the other tab.
- **Chats** (`/admin/chats`, `AdminChatsViewer`) — a *read-only reader* over every conversation,
  groups and DMs alike. No management at all.

Groups are a strict subset of chats, so the split is by verb (manage vs. read), not by object.
Two consequences:

1. **A 1:1 chat can never gain a member.** `getAllGroupsForAdmin` filters `is_group = true`, so
   DMs never appear in the Groups tab and have no edit path anywhere. The motivating case — an
   existing teacher↔student chat that an admin wants to add a parent to — is impossible today.
2. **The admin cannot reply to their own DMs.** `getChattableContacts` lets every role DM an
   admin, and those DMs appear in the admin's list, but `AdminChatsViewer` hardcodes `readOnly`
   on every thread. There is no other admin chat surface, so those messages are unanswerable.

## Goals

- One tab. Every conversation in the academy in a single list, manageable in place.
- Any conversation's roster can be edited — DM or group, no distinction.
- The admin can text in conversations they are a member of, and read-only everywhere else.
- Behaves like an ordinary messaging app.

## Non-goals

- The admin joining groups. Retained decision: an admin creates a conversation but is **not** a
  participant. Groups are therefore always view-only to the admin; only their own DMs are
  writable. No "join chat" action.
- Any change to teacher/student/parent chat surfaces (`ChatsPanel`). Admin-side only.
- Message-visibility cutoffs. New members see full history (see "Decisions", D4).
- Any schema migration.

## Decisions

### D1 — Merge into one tab

The Groups tab is removed. `/admin/chats` becomes the single surface for both reading and
managing. Rejected: keeping two tabs and adding member management to both (preserves the
duplication that motivated the work).

### D2 — Adding a member to a DM promotes it in place

Adding a third person to a teacher↔student DM mutates that conversation: the participant is
inserted and the thread continues with its history intact. Rejected: spinning off a new group
and leaving the DM untouched — it starts empty and creates two overlapping threads, which is
the duplication problem relocated.

Note this diverges from WhatsApp/Signal/Telegram, which forbid adding to a 1:1 and force a new
group. In-place promotion is the better fit for an admin tool where continuity of the thread is
the point.

Consequences, all intended:

- The conversation keeps its `assignment_id`, so the teacher's and student's dashboard chat
  links (`dashboard-data.ts`) continue to resolve and now open the three-person thread.
- `findOrCreateDm` will no longer match that conversation, so if the teacher later wants a
  private 1:1 with the student they get a fresh, empty DM. The prior history stays in the group.

### D3 — `is_group` becomes a rendering detail, derived from roster size

`isGroup` is computed as `members.length > 2` rather than read from the column. The distinction
stops being a *type* and becomes a *display policy*, which is all it ever was.

Verified: `is_group` appears in exactly one migration line (`20260715000002`, the column
definition) and **no RLS policy reads it**. Access is membership-based via
`is_conversation_member`. Making it non-load-bearing touches nothing near access control.

The column is retained and still written on create. Nothing reads it for display, so a flag that
disagrees with the roster is impossible by construction.

Rejected: dropping the column entirely (a migration over existing rows and edits near the RLS
policies, for zero user-visible gain); and keeping it as a stored flag flipped on promotion
(permits drift between flag and roster).

Corollary: removing a member back down to two makes the thread render as a DM again, history
untouched. Accepted.

### D4 — New members see full history

Membership grants access to the whole thread; there is no join-time cutoff. Rejected: enforcing
`conversation_participants.added_at` as a cutoff — it would need to hold in the RLS policy, the
message queries, and the realtime subscription simultaneously, and an error in the RLS one is a
silent leak. Considered and accepted: this exposes a student's prior messages to a parent added
later. The admin performing the add can already read every thread in the system.

### D5 — Minimum roster of 2

`createAdminGroup` currently accepts a single member. A conversation with one participant has
nobody to talk to. Both create and member-update require at least 2.

## Design

### Navigation and routing

- `roleNav.admin` in `dashboard-header.tsx` drops the Groups entry → Overview, Users, Sessions,
  Chats.
- `/admin/assignments/page.tsx` becomes a permanent redirect to `/admin/chats`, so existing
  links and bookmarks resolve.
- `AdminDashboardView` drops the `"assignments"` member; the `view === "assignments"` branch and
  its `viewCopy` entry are removed from `admin-dashboard.tsx`.
- The Overview link grid (`overviewLinks`) currently holds Users, Groups, Sessions, Kitty. The
  Groups card is repointed to `/admin/chats`, relabelled "Chats", and given the description
  "Read every conversation and manage who's in them". The grid keeps four cards.
- `viewCopy.chats` keeps its existing title but its description widens from "Read any
  conversation across the academy" to cover management as well.

### Data layer (`src/lib/chat/data.ts`)

| Before | After | Change |
| --- | --- | --- |
| `hydrateSummaries` reads `c.is_group` | derives `members.length > 2` | D3 |
| `getAllGroupsForAdmin` | *deleted* | superseded by `getAllConversationsForAdmin` |
| `getAllConversationsForAdmin` | unchanged | the single admin list |
| `findOrCreateDm` keys on `is_group = false` + 2 members | keys on exactly 2 members **and** `title is null` | D3 |
| `createAdminGroup` | `createAdminConversation` | rename; min roster 2 (D5) |
| `renameGroup` | `renameConversation` | rename |
| `archiveGroup` | `archiveConversation` | rename |
| `updateGroupMembers` | `updateConversationMembers` | rename; min roster 2 (D5) |

The `title is null` half of the `findOrCreateDm` key matters: without it, a deliberately-named
two-person conversation would be silently reused as those two people's DM.

`updateConversationMembers` keeps its existing add/remove diff and its `ensureAssignments` call
unchanged, so adding a teacher or student to any thread still derives the `teacher_student_assignments`
row the booking engine needs, and adding a parent correctly derives nothing. This now reaches
DMs, which it previously could not.

### API

`/api/admin/groups` and `/api/admin/groups/[id]` fold into `/api/admin/conversations` and
`/api/admin/conversations/[id]`:

- `GET /api/admin/conversations` — list (exists)
- `POST /api/admin/conversations` — create, body `{ memberIds: string[], title?: string | null }`
- `PATCH /api/admin/conversations/[id]` — body `{ title?: string | null, memberIds?: string[] }`
- `DELETE /api/admin/conversations/[id]` — archive

Each keeps the existing `profile.role !== "admin"` guard and the `revalidateTag` calls from the
groups routes. The old routes are deleted rather than aliased; they have no external consumers.

### UI

`groups-manager.tsx` is deleted. Its two modals move to the chats surface, which splits three
ways so no file carries both the layout and the dialogs:

- `admin-chats-viewer.tsx` — list + thread panes (existing two-pane grid, retained)
- `new-conversation-modal.tsx` — lifted from `NewGroupModal`
- `conversation-members-modal.tsx` — lifted from `ManageGroupModal`, minus its "Open chat"
  button (the chat is already open behind it)

Additions to the viewer:

- **New chat** button in the list header. `GroupPeoplePicker` plus an optional name, minimum two
  people, admin not added to the result.
- **Members affordance** in the thread header showing the roster count, opening the members
  modal: rename, add, remove, archive. Available on **every** conversation, DM included. This is
  the motivating fix.
- **Composer gating.** `readOnly` becomes `!isMember`, where
  `isMember = conversation.members.some((m) => m.id === currentUserId)`. Threads the admin is not
  in render read-only with an explicit "You're not in this chat — view only" note, so the
  disabled composer reads as deliberate rather than broken.
- **Search** filtering the list by conversation title and member name. This list holds every
  conversation in the academy and is the largest in the app.

Archiving keeps the optimistic-removal behaviour from `GroupsManager` (drop the row immediately,
then reconcile against the server).

### Error handling

- Create or member-update with a roster below 2 → `400` with a message; surfaced inline in the
  modal, matching the existing error pattern in both modals.
- Existing `403` guards on every route are unchanged.
- Archive stays non-destructive (`conversations.archived_at`), unchanged.
- An admin removing themselves from a conversation they are in is permitted; the thread becomes
  view-only to them. Edge case, no special handling.

### Testing

`node --test` `.test.cjs` files, following `src/lib/chat/group-derive.test.cjs`. Covering the
pure logic only:

- `isGroup` derivation across the 2/3-member boundary.
- The `findOrCreateDm` key: two members and no title matches; two members with a title does not;
  three members does not.
- The roster-minimum guard rejects 0 and 1, accepts 2.

Manual verification of the motivating path, since it spans RLS and realtime: open an existing
teacher↔student thread as admin, add a parent, confirm the thread keeps its history, renders as
a group, appears for the parent with full history, and that the teacher's dashboard chat link
still resolves to it.

## Risks

- **`findOrCreateDm` re-key.** The riskiest edit — it decides whether "message this person"
  reuses a thread or creates a duplicate. Covered by unit tests on the key.
- **Full history to added members** (D4) is deliberate and irreversible per-thread once someone
  is added. Accepted above.
- Route deletion is safe (internal consumers only, all updated in the same change).

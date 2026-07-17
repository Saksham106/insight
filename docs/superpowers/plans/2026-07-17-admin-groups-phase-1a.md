# Admin Groups — Phase 1a Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the admin Assignments page a simple "create & manage group chats" surface (admin is creator, not a member), and turn the Chats page into a read-only viewer of every conversation.

**Architecture:** The group *conversation* becomes the admin-facing unit. Creating a group inserts a `conversations` row (`created_by` = admin, admin NOT added to `conversation_participants`), adds the selected people as participants, and derives `teacher_student_assignments` rows for each teacher×student pair so the untouched booking/availability engine keeps working. Reuse the existing chat data layer, `ChatWindow`, `Modal`, and contacts API.

**Tech Stack:** Next.js App Router (v16), React 19, Supabase (service-role admin client), TypeScript, Tailwind + inline styles per existing convention.

## Global Constraints

- Do NOT touch `/admin/hermes` or any `hermes_*` table (Kitty — separate project).
- Read `node_modules/next/dist/docs/` before using unfamiliar Next APIs (repo runs a modified Next 16).
- Admin-only mutations go through `createAdminClient()` inside API routes guarded by `getUserProfile()`/`requireRole(["admin"])`.
- Follow existing file style: inline-style objects + `text-*`/`color` utility classes, `lucide-react` icons.
- New surfaces must be mobile-first (single-column on `max-width: 768px`).
- Keep existing 1:1 chats and booking working unchanged.

---

### Task 1: Non-destructive archive column + group data helpers

**Files:**
- Create: `supabase/migrations/20260717120000_add_conversation_archive.sql`
- Modify: `src/lib/chat/data.ts`
- Test: `src/lib/chat/group-derive.test.cjs`
- Create: `src/lib/chat/group-derive.ts`

**Interfaces:**
- Produces: `archived_at timestamptz` on `conversations`.
- Produces: `derivePairs(members: {id,role}[]): {teacherId, studentId}[]` — every teacher×student pair.
- Produces (data.ts): `getAllGroupsForAdmin(): Promise<AdminGroupSummary[]>`, `createAdminGroup(params)`, `updateGroupMembers(...)`, `renameGroup(...)`, `archiveGroup(...)`.

- [ ] **Step 1: Migration** — add nullable `archived_at` to `conversations`; group listings filter `archived_at is null`.

```sql
alter table public.conversations add column if not exists archived_at timestamptz;
create index if not exists idx_conversations_archived on public.conversations (archived_at);
```

- [ ] **Step 2: Failing test for `derivePairs`** in `group-derive.test.cjs`:

```js
const test = require("node:test");
const assert = require("node:assert");
const { derivePairs } = require("./group-derive.ts");

test("derivePairs makes every teacher x student pair, ignoring parents", () => {
  const pairs = derivePairs([
    { id: "t1", role: "teacher" },
    { id: "t2", role: "teacher" },
    { id: "s1", role: "student" },
    { id: "p1", role: "parent" },
  ]);
  assert.deepStrictEqual(new Set(pairs.map(p => `${p.teacherId}:${p.studentId}`)),
    new Set(["t1:s1", "t2:s1"]));
});

test("derivePairs returns [] when no teacher or no student", () => {
  assert.deepStrictEqual(derivePairs([{ id: "s1", role: "student" }]), []);
});
```

Run: `node --test src/lib/chat/group-derive.test.cjs` → FAIL (module missing). Note: if `.ts` require fails under node, compile inline instead — mirror the existing `grid-geometry.test.cjs` harness (it requires a `.ts` via the repo's node test setup; match that exact pattern).

- [ ] **Step 3: Implement `group-derive.ts`:**

```ts
export interface MemberRole { id: string; role: string }
export interface Pair { teacherId: string; studentId: string }

export function derivePairs(members: MemberRole[]): Pair[] {
  const teachers = members.filter((m) => m.role === "teacher");
  const students = members.filter((m) => m.role === "student");
  const pairs: Pair[] = [];
  for (const t of teachers) for (const s of students) pairs.push({ teacherId: t.id, studentId: s.id });
  return pairs;
}
```

- [ ] **Step 4: Run test** → PASS.

- [ ] **Step 5: Add data-layer functions to `src/lib/chat/data.ts`.**
  - `AdminGroupSummary` = `ConversationSummary` shape (reuse) but for groups regardless of membership.
  - `getAllGroupsForAdmin()`: same query shape as `getConversationsForUser` but start from `conversations` where `is_group = true and archived_at is null` (no membership filter), hydrate members + last message + sort by activity.
  - `createAdminGroup({ creatorId, memberIds, title })`: insert conversation `{ is_group: true, title, created_by: creatorId }` (do NOT add creator to participants); insert participant rows for `memberIds`; fetch member roles; `derivePairs` → upsert active `teacher_student_assignments` for each pair (skip existing; reactivate inactive). Return `{ conversationId }`.
  - `renameGroup(id, title)`, `archiveGroup(id)` (`update ... set archived_at = now()`), `updateGroupMembers(id, memberIds)` (diff participants; add/remove; re-derive assignment rows for added teacher×student pairs).

- [ ] **Step 6: Commit.**

```bash
git add supabase/migrations/20260717120000_add_conversation_archive.sql src/lib/chat/group-derive.ts src/lib/chat/group-derive.test.cjs src/lib/chat/data.ts
git commit -m "feat(admin): group data layer + archive column + pair derivation"
```

---

### Task 2: Admin group API routes

**Files:**
- Create: `src/app/api/admin/groups/route.ts` (POST create, GET list)
- Create: `src/app/api/admin/groups/[id]/route.ts` (PATCH rename/members, DELETE archive)

**Interfaces:**
- Consumes: Task 1 data-layer functions.
- Produces: `POST /api/admin/groups {memberIds, title}` → `{conversationId}`; `PATCH /api/admin/groups/:id {title?, memberIds?}`; `DELETE /api/admin/groups/:id` (archive).

- [ ] **Step 1:** `POST`/`GET` route. Guard `profile.role === "admin"`. Validate `memberIds` is a non-empty string array. Call `createAdminGroup`. On success `revalidateTag("dashboard","max")` and return `{conversationId}`. `GET` returns `{ groups: await getAllGroupsForAdmin() }`.
- [ ] **Step 2:** `[id]` route: `PATCH` handles `{title}` (rename) and/or `{memberIds}` (update members); `DELETE` calls `archiveGroup`. Same admin guard + revalidate.
- [ ] **Step 3: Manual verify** with the dev server (Task 5 verification) — create a group, confirm row in `conversations` with `created_by` = admin and admin absent from participants; confirm derived assignment rows.
- [ ] **Step 4: Commit** `feat(admin): group create/list/update/archive API`.

---

### Task 3: Groups page UI (replaces AssignStudentForm + AssignmentsTable)

**Files:**
- Create: `src/components/admin/groups-manager.tsx`
- Create: `src/components/admin/group-people-picker.tsx` (people picker w/ role filter + chips; adapt from `NewChatModal`)
- Modify: `src/components/admin/admin-dashboard.tsx` (render `<GroupsManager>` for `view === "assignments"`; drop `AssignStudentForm`/`AssignmentsTable` imports from that view)
- Modify: `src/components/admin/admin-dashboard.tsx` copy: `assignments` title → "Groups", description → "Create and manage group chats." Overview link + `dashboard-header.tsx` label → "Groups".

**Interfaces:**
- Consumes: `GET/POST /api/admin/groups`, `GET /api/chat/contacts` (already returns all active users for admin), `PATCH/DELETE /api/admin/groups/:id`.

- [ ] **Step 1:** `group-people-picker.tsx` — controlled component: props `{ contacts, selected, onToggle }`; search box; role filter chips (All / Teachers / Students / Parents); selected people shown as removable chips above the list. Pure presentational; reuse the row styling from `NewChatModal`.
- [ ] **Step 2:** `groups-manager.tsx`:
  - Loads groups (`GET /api/admin/groups`) and contacts (`GET /api/chat/contacts`).
  - "New group" button → `Modal` with `group-people-picker` + optional name input + Create (`POST`). Auto title = members' first names joined when name blank (client-side preview only; server also derives).
  - Group cards grid (mobile: single column): avatar (Users icon), title, member count, last-activity preview; tap card → manage sheet (`Modal`) with rename, add/remove members (re-uses picker, seeded with current members), archive (confirm), and "Open chat" that routes to `/admin/chats?c=<id>`.
- [ ] **Step 3:** Wire into `admin-dashboard.tsx` `view === "assignments"` branch; remove old form/table usage there. Update copy + nav label to "Groups".
- [ ] **Step 4: Browser verify** (Task 5).
- [ ] **Step 5: Commit** `feat(admin): groups manager UI`.

---

### Task 4: Chats page → read-only all-conversations viewer

**Files:**
- Create: `src/components/admin/admin-chats-viewer.tsx`
- Modify: `src/components/admin/admin-dashboard.tsx` (`view === "chats"` renders `<AdminChatsViewer>` instead of `<ChatsPanel>`)
- Modify (if needed): `src/lib/chat/data.ts` — add `getAllConversationsForAdmin()` (groups + DMs, `archived_at is null`).

**Interfaces:**
- Consumes: `getAllConversationsForAdmin()` (via a new `GET /api/admin/conversations` OR server-render list into the client component). Reuse `ChatWindow` with `readOnly`.

- [ ] **Step 1:** `getAllConversationsForAdmin()` in data.ts — like `getAllGroupsForAdmin` but include non-group conversations too.
- [ ] **Step 2:** `admin-chats-viewer.tsx` — two-pane (list + thread) mirroring `ChatsPanel` layout/mobile behavior, but: list = ALL conversations; thread uses `<ChatWindow readOnly>`; no "New" button; supports `?c=<id>` deep-link (read `useSearchParams`) so the Groups "Open chat" action lands here.
- [ ] **Step 3:** Swap into dashboard `chats` view.
- [ ] **Step 4: Browser verify.**
- [ ] **Step 5: Commit** `feat(admin): read-only all-chats viewer`.

---

### Task 5: End-to-end verification (browser)

- [ ] Start dev server via preview_start `{name: "dev"}` (add `.claude/launch.json` if missing: npm run dev, port 3000).
- [ ] Log in as admin (`sgoel.shivansh@gmail.com`).
- [ ] Groups page: create a group with a teacher + student + parent; confirm admin is not a participant; confirm it appears as a card; rename it; add/remove a member; archive it (disappears).
- [ ] Confirm booking still works: the derived assignment lets the teacher/student book (spot-check `/api/booking/slots` or the teacher schedule).
- [ ] Chats page: confirm all conversations listed and readable read-only; confirm `?c=<id>` deep-link opens the right thread.
- [ ] Check `read_console_messages` + `preview_logs` for errors; resize to mobile (375px) and confirm single-column usability.
- [ ] Screenshot the Groups page and Chats viewer as proof.

---

## Self-Review notes
- Spec coverage: Groups creation (Task 3), admin-not-member (Task 1 `createAdminGroup`), derived booking (Task 1), chats read-only viewer (Task 4), archive non-destructive (Task 1). Sessions rebuild = Phase 1b, out of scope. ✓
- Contacts for admin already returns all active users (`getChattableContacts`, role==="admin" branch) — no new endpoint needed for the picker. ✓
- `ChatWindow` already supports `readOnly` (used by admin conversation viewer). ✓

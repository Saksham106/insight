# Admin Unified Chats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the admin Groups and Chats tabs into one surface where every conversation — DM or group — can be read and have its roster edited in place.

**Architecture:** `is_group` stops being a type and becomes a derived display detail (`members.length > 2`), so adding a third person to a 1:1 promotes it to a group in place with history intact. The Groups tab and its API are deleted; management moves into `AdminChatsViewer` as two modals. The admin's composer is enabled only in conversations they are a member of.

**Tech Stack:** Next.js (see `AGENTS.md` — this is NOT the Next.js in your training data; read `node_modules/next/dist/docs/` before writing routing code), TypeScript, Supabase (`@supabase/supabase-js`), `node --test` with `.test.cjs` files.

**Spec:** `docs/superpowers/specs/2026-07-28-admin-unified-chats-design.md`

## Global Constraints

- **No schema migration.** The `conversations.is_group` column stays and is still written on create. Nothing may read it for display. No RLS policy touches it — verified.
- **Minimum roster is 2** on both create and member-update, everywhere.
- **The admin is never added as a participant** to a conversation they create. This is a retained decision, not an oversight.
- **No changes to `ChatsPanel`** or any teacher/student/parent chat surface. `src/lib/chat/data.ts` is shared by both, so edits there must keep the non-admin path working.
- Tests are `.test.cjs` beside the module, run with `node --test`, using the `typescript` transpile-on-require shim copied verbatim from `src/lib/chat/group-derive.test.cjs`.
- Existing code style: inline `style={{}}` objects with `var(--color-*)` tokens, `className` for typography (`text-sm text-muted`, `text-navy`). Match it; do not introduce a new styling approach.
- Commit after every task.

## File Structure

**Create:**
- `src/lib/chat/conversation-shape.ts` — pure helpers: `isGroupConversation`, `isDirectConversationKey`, `hasMinimumRoster`. Extracted so the risky derivation logic is unit-testable without a database.
- `src/lib/chat/conversation-shape.test.cjs` — tests for the above.
- `src/app/api/admin/conversations/[id]/route.ts` — PATCH (rename / set members) + DELETE (archive).
- `src/components/admin/new-conversation-modal.tsx` — lifted from `NewGroupModal`.
- `src/components/admin/conversation-members-modal.tsx` — lifted from `ManageGroupModal`.

**Modify:**
- `src/lib/chat/data.ts` — derive `isGroup`; re-key DM dedupe; rename the four group functions; enforce min roster.
- `src/app/api/admin/conversations/route.ts` — add POST.
- `src/components/admin/admin-chats-viewer.tsx` — new-chat button, members affordance, composer gating, search.
- `src/components/admin/admin-dashboard.tsx` — drop the `assignments` view; repoint the Overview card.
- `src/components/layout/dashboard-header.tsx` — drop the Groups nav entry.
- `src/app/(dashboard)/admin/assignments/page.tsx` — becomes a redirect.

**Delete:**
- `src/components/admin/groups-manager.tsx`
- `src/app/api/admin/groups/route.ts`
- `src/app/api/admin/groups/[id]/route.ts`

**Task order rationale:** Task 1 is pure logic with no consumers, so it lands safely first. Task 2 wires it into the data layer. Task 3 moves the API. Tasks 4–5 build the UI against the new API. Task 6 deletes the old tab once nothing points at it. Deleting last means the app is never in a broken intermediate state.

---

### Task 1: Pure conversation-shape helpers

**Files:**
- Create: `src/lib/chat/conversation-shape.ts`
- Test: `src/lib/chat/conversation-shape.test.cjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `isGroupConversation(memberCount: number): boolean`
  - `isDirectConversationKey(memberCount: number, title: string | null): boolean`
  - `hasMinimumRoster(memberCount: number): boolean`
  - `MINIMUM_ROSTER: number` (value `2`)

- [ ] **Step 1: Write the failing test**

Create `src/lib/chat/conversation-shape.test.cjs`:

```javascript
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

// Compile the sibling .ts on require, mirroring group-derive.test.cjs.
require.extensions[".ts"] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  module._compile(output.outputText, filename);
};

const s = require(path.join(__dirname, "conversation-shape.ts"));

test("isGroupConversation is true only above two members", () => {
  assert.equal(s.isGroupConversation(0), false);
  assert.equal(s.isGroupConversation(1), false);
  assert.equal(s.isGroupConversation(2), false);
  assert.equal(s.isGroupConversation(3), true);
  assert.equal(s.isGroupConversation(9), true);
});

test("isDirectConversationKey matches exactly two members with no title", () => {
  assert.equal(s.isDirectConversationKey(2, null), true);
  assert.equal(s.isDirectConversationKey(2, ""), true);
  assert.equal(s.isDirectConversationKey(2, "   "), true);
});

test("isDirectConversationKey rejects a deliberately named pair", () => {
  assert.equal(s.isDirectConversationKey(2, "Algebra tutoring"), false);
});

test("isDirectConversationKey rejects rosters that are not exactly two", () => {
  assert.equal(s.isDirectConversationKey(1, null), false);
  assert.equal(s.isDirectConversationKey(3, null), false);
});

test("hasMinimumRoster requires two people", () => {
  assert.equal(s.hasMinimumRoster(0), false);
  assert.equal(s.hasMinimumRoster(1), false);
  assert.equal(s.hasMinimumRoster(2), true);
  assert.equal(s.hasMinimumRoster(5), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test src/lib/chat/conversation-shape.test.cjs
```

Expected: FAIL — `Cannot find module .../conversation-shape.ts`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/chat/conversation-shape.ts`:

```typescript
// Pure shape helpers for conversations. A conversation is N people and an
// optional name; "group" vs "DM" is a rendering detail derived from the roster,
// not a stored type. Keeping these pure makes the derivation testable without a
// database — it decides whether "message this person" reuses a thread or opens
// a duplicate, so it is worth covering directly.

// A conversation needs at least two people; one participant has nobody to talk to.
export const MINIMUM_ROSTER = 2;

// Renders as a group once a third person joins. Adding someone to a 1:1
// promotes it; removing them back down renders it as a DM again.
export function isGroupConversation(memberCount: number): boolean {
  return memberCount > 2;
}

// The dedupe key for "do these two already have a direct thread?". A pair the
// admin deliberately named is NOT a DM — reusing it would silently hijack a
// named conversation as someone's 1:1.
export function isDirectConversationKey(memberCount: number, title: string | null): boolean {
  return memberCount === 2 && !title?.trim();
}

export function hasMinimumRoster(memberCount: number): boolean {
  return memberCount >= MINIMUM_ROSTER;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test src/lib/chat/conversation-shape.test.cjs
```

Expected: PASS — 5 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add src/lib/chat/conversation-shape.ts src/lib/chat/conversation-shape.test.cjs
git commit -m "feat: add pure conversation-shape helpers"
```

---

### Task 2: Derive `isGroup` and re-key DM dedupe in the data layer

**Files:**
- Modify: `src/lib/chat/data.ts`

**Interfaces:**
- Consumes: `isGroupConversation`, `isDirectConversationKey`, `hasMinimumRoster`, `MINIMUM_ROSTER` from Task 1.
- Produces (renames — later tasks import these names):
  - `createAdminConversation({ creatorId, memberIds, title }): Promise<{ conversationId: string } | { error: string }>`
  - `renameConversation(id: string, title: string | null): Promise<{ error?: string }>`
  - `archiveConversation(id: string): Promise<{ error?: string }>`
  - `updateConversationMembers(id: string, memberIds: string[]): Promise<{ error?: string }>`
  - `getAllConversationsForAdmin()` — unchanged signature, now the only admin list.
  - `getAllGroupsForAdmin` — **removed**.

- [ ] **Step 1: Add the import**

At the top of `src/lib/chat/data.ts`, beside the existing `group-derive` import:

```typescript
import { derivePairs, type MemberRole } from "@/lib/chat/group-derive";
import {
  hasMinimumRoster,
  isDirectConversationKey,
  isGroupConversation,
} from "@/lib/chat/conversation-shape";
```

- [ ] **Step 2: Derive `isGroup` in `hydrateSummaries`**

In `hydrateSummaries` (~line 76), replace:

```typescript
    const isGroup = Boolean(c.is_group);
```

with:

```typescript
    // Derived, not read from the column: a conversation is a group once it has
    // a third member. Keeps the flag from ever disagreeing with the roster.
    const isGroup = isGroupConversation(members.length);
```

Leave the `.select("id, is_group, title, created_at, updated_at")` alone — dropping `is_group` from the select is a needless diff and the column is still written.

- [ ] **Step 3: Delete `getAllGroupsForAdmin`**

Remove the whole function (~lines 116–125), including its doc comment. `getAllConversationsForAdmin` directly below it is now the only admin list.

- [ ] **Step 4: Re-key `findExistingDirectConversation`**

In `findExistingDirectConversation` (~line 269), replace the group filter and the member-count loop:

```typescript
  // Of the shared conversations, find one that is a non-group with exactly 2 members.
  const { data: convos } = await admin
    .from("conversations")
    .select("id, is_group")
    .in("id", sharedIds)
    .eq("is_group", false);

  for (const c of convos ?? []) {
    const { count } = await admin
      .from("conversation_participants")
      .select("*", { count: "exact", head: true })
      .eq("conversation_id", c.id as string);
    if (count === 2) return c.id as string;
  }
  return null;
```

with:

```typescript
  // A direct thread is any conversation with exactly these two people and no
  // deliberate name. A named pair is a real conversation in its own right and
  // must not be silently reused as someone's DM.
  const { data: convos } = await admin
    .from("conversations")
    .select("id, title")
    .in("id", sharedIds);

  for (const c of convos ?? []) {
    const { count } = await admin
      .from("conversation_participants")
      .select("*", { count: "exact", head: true })
      .eq("conversation_id", c.id as string);
    if (isDirectConversationKey(count ?? 0, (c.title as string | null) ?? null)) {
      return c.id as string;
    }
  }
  return null;
```

- [ ] **Step 5: Re-key the dedupe guard in `createConversation`**

In `createConversation` (~line 226), replace:

```typescript
  // For a 1:1, reuse any existing conversation between exactly these two people
  // so we never create duplicate DM threads.
  if (!params.isGroup && uniqueMembers.length === 2) {
```

with:

```typescript
  // Reuse an existing direct thread between exactly these two people so we never
  // create duplicate DMs. Keyed on the roster and the absence of a name, not on
  // the caller's isGroup hint.
  if (isDirectConversationKey(uniqueMembers.length, params.title)) {
```

`createConversation` keeps its `isGroup` parameter — it is still written to the column, and `POST /api/chat/conversations` already derives it as `requested.length > 1`, which agrees with the new derivation. No caller changes.

- [ ] **Step 6: Rename the four admin functions and enforce the roster minimum**

Rename in place, updating each doc comment that says "group" to say "conversation":

- `createAdminGroup` → `createAdminConversation`. In its insert, change the hardcoded `is_group: true` to `is_group: isGroupConversation(uniqueMembers.length)` — nothing reads the column for display any more, but keeping it accurate means anyone querying the database directly is not misled. Then replace the guard:

```typescript
  const uniqueMembers = [...new Set(params.memberIds)].filter((id) => id !== params.creatorId);
  if (uniqueMembers.length < 1) return { error: "Add at least one person to the group." };
```

with:

```typescript
  const uniqueMembers = [...new Set(params.memberIds)].filter((id) => id !== params.creatorId);
  if (!hasMinimumRoster(uniqueMembers.length)) {
    return { error: "A conversation needs at least two people." };
  }
```

- `renameGroup` → `renameConversation` (body unchanged).
- `archiveGroup` → `archiveConversation` (body unchanged).
- `updateGroupMembers` → `updateConversationMembers`. Replace:

```typescript
  const target = [...new Set(memberIds)];
  if (target.length < 1) return { error: "A group needs at least one person." };
```

with:

```typescript
  const target = [...new Set(memberIds)];
  if (!hasMinimumRoster(target.length)) {
    return { error: "A conversation needs at least two people." };
  }
```

Its add/remove diff and its `ensureAssignments(admin, await memberRoles(admin, target))` call are unchanged — that is what derives `teacher_student_assignments` for the new roster, and it now reaches promoted DMs.

- [ ] **Step 7: Verify nothing still references the old names**

```bash
grep -rn "getAllGroupsForAdmin\|createAdminGroup\|renameGroup\|archiveGroup\|updateGroupMembers" src
```

Expected: only `src/app/api/admin/groups/route.ts` and `src/app/api/admin/groups/[id]/route.ts` — both deleted in Task 3. If anything else appears, update it.

- [ ] **Step 8: Confirm the existing suite still passes**

```bash
node --test src/lib/chat/conversation-shape.test.cjs src/lib/chat/group-derive.test.cjs && npx tsc --noEmit
```

Expected: tests PASS. `tsc` will report errors in the two `api/admin/groups` route files that import the old names — that is expected and fixed in Task 3. No other file may error.

- [ ] **Step 9: Commit**

```bash
git add src/lib/chat/data.ts
git commit -m "refactor: derive isGroup from roster size instead of the column"
```

---

### Task 3: Fold the groups API into `/api/admin/conversations`

**Files:**
- Modify: `src/app/api/admin/conversations/route.ts`
- Create: `src/app/api/admin/conversations/[id]/route.ts`
- Delete: `src/app/api/admin/groups/route.ts`, `src/app/api/admin/groups/[id]/route.ts`

**Interfaces:**
- Consumes: `createAdminConversation`, `renameConversation`, `archiveConversation`, `updateConversationMembers`, `getAllConversationsForAdmin` from Task 2.
- Produces (Tasks 4–5 call these):
  - `GET /api/admin/conversations` → `{ conversations: ConversationSummary[] }`
  - `POST /api/admin/conversations` body `{ memberIds: string[]; title?: string | null }` → `{ conversationId: string }`
  - `PATCH /api/admin/conversations/[id]` body `{ title?: string | null; memberIds?: string[] }` → `{ ok: true }`
  - `DELETE /api/admin/conversations/[id]` → `{ ok: true }`

- [ ] **Step 1: Add POST to the collection route**

Replace the whole of `src/app/api/admin/conversations/route.ts` with:

```typescript
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { getUserProfile } from "@/lib/auth/get-user-profile";
import { createAdminConversation, getAllConversationsForAdmin } from "@/lib/chat/data";

// The admin's single conversations resource: every thread in the academy
// (groups and DMs alike), plus creation. Admin RLS already permits reading the
// messages themselves client-side.
export async function GET() {
  const profile = await getUserProfile();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const conversations = await getAllConversationsForAdmin();
  return NextResponse.json({ conversations });
}

export async function POST(request: Request) {
  const profile = await getUserProfile();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const memberIds: unknown = body?.memberIds;
  const title: unknown = body?.title;

  if (!Array.isArray(memberIds) || memberIds.some((id) => typeof id !== "string")) {
    return NextResponse.json({ error: "A conversation needs at least two people." }, { status: 400 });
  }

  const result = await createAdminConversation({
    creatorId: profile.id,
    memberIds: memberIds as string[],
    title: typeof title === "string" ? title : null,
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  revalidateTag("dashboard", "max");
  revalidateTag("admin-dashboard", "max");
  return NextResponse.json({ conversationId: result.conversationId });
}
```

The roster minimum is enforced in `createAdminConversation`, so its message surfaces as a `400` rather than being duplicated here. Note the status change from the old route's `500` — a short roster is a client error.

- [ ] **Step 2: Create the item route**

Create `src/app/api/admin/conversations/[id]/route.ts`:

```typescript
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { getUserProfile } from "@/lib/auth/get-user-profile";
import { archiveConversation, renameConversation, updateConversationMembers } from "@/lib/chat/data";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function revalidate() {
  revalidateTag("dashboard", "max");
  revalidateTag("admin-dashboard", "max");
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const profile = await getUserProfile();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const title: unknown = body?.title;
  const memberIds: unknown = body?.memberIds;

  if (typeof title === "string" || title === null) {
    const res = await renameConversation(id, (title as string | null) ?? null);
    if (res.error) return NextResponse.json({ error: res.error }, { status: 500 });
  }

  if (Array.isArray(memberIds)) {
    if (memberIds.some((m) => typeof m !== "string")) {
      return NextResponse.json({ error: "A conversation needs at least two people." }, { status: 400 });
    }
    const res = await updateConversationMembers(id, memberIds as string[]);
    if (res.error) return NextResponse.json({ error: res.error }, { status: 400 });
  }

  revalidate();
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const profile = await getUserProfile();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;
  const res = await archiveConversation(id);
  if (res.error) return NextResponse.json({ error: res.error }, { status: 500 });

  revalidate();
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Delete the old routes**

```bash
rm -r src/app/api/admin/groups
```

- [ ] **Step 4: Verify the app still type-checks**

```bash
npx tsc --noEmit
```

Expected: errors only in `src/components/admin/groups-manager.tsx`, which still fetches `/api/admin/groups` (string literals, so it may in fact pass) — it is deleted in Task 6. No errors in `src/lib` or `src/app/api`.

- [ ] **Step 5: Commit**

```bash
git add -A src/app/api/admin
git commit -m "refactor: fold the admin groups API into conversations"
```

---

### Task 4: Extract the two conversation modals

**Files:**
- Create: `src/components/admin/new-conversation-modal.tsx`
- Create: `src/components/admin/conversation-members-modal.tsx`

**Interfaces:**
- Consumes: `GroupPeoplePicker` from `@/components/admin/group-people-picker` (props: `{ contacts: ChattableContact[]; selected: Set<string>; onToggle: (id: string) => void }`), `suggestGroupTitle` from `@/lib/chat/group-derive`, the Task 3 endpoints.
- Produces (Task 5 renders these):
  - `<NewConversationModal contacts onClose onCreated />` where `onCreated: (conversationId: string) => void | Promise<void>`
  - `<ConversationMembersModal conversation contacts onClose onChanged onArchived />` where `onChanged: () => void | Promise<void>` and `onArchived: (id: string) => void`

- [ ] **Step 1: Create the new-conversation modal**

Create `src/components/admin/new-conversation-modal.tsx`. This is `NewGroupModal` from `groups-manager.tsx` with the endpoint repointed, the roster minimum raised to 2, and `onCreated` now carrying the new id so the caller can open the thread:

```tsx
"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { GroupPeoplePicker } from "@/components/admin/group-people-picker";
import { suggestGroupTitle } from "@/lib/chat/group-derive";
import { MINIMUM_ROSTER, hasMinimumRoster } from "@/lib/chat/conversation-shape";
import type { ChattableContact } from "@/lib/chat-types";

export function NewConversationModal({
  contacts,
  onClose,
  onCreated,
}: {
  contacts: ChattableContact[];
  onClose: () => void;
  onCreated: (conversationId: string) => void | Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const nameById = useMemo(() => new Map(contacts.map((c) => [c.id, c.full_name])), [contacts]);
  const placeholder = useMemo(
    () => suggestGroupTitle([...selected].map((id) => nameById.get(id) ?? "").filter(Boolean)),
    [selected, nameById],
  );

  const create = async () => {
    setError(null);
    if (!hasMinimumRoster(selected.size)) {
      setError(`Pick at least ${MINIMUM_ROSTER} people.`);
      return;
    }
    setCreating(true);
    const res = await fetch("/api/admin/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberIds: [...selected], title: name.trim() || null }),
    });
    const data = await res.json().catch(() => ({}));
    setCreating(false);
    if (!res.ok) {
      setError(data.error ?? "Could not create the conversation.");
      return;
    }
    await onCreated(data.conversationId as string);
  };

  return (
    <Modal
      title="New chat"
      description="Pick who's in it. You create the chat but aren't a member, so you won't be able to send messages in it."
      onClose={onClose}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <Input
          placeholder={selected.size > 0 ? placeholder : "Chat name (optional)"}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <GroupPeoplePicker contacts={contacts} selected={selected} onToggle={toggle} />
        {error && <p className="text-sm text-error">{error}</p>}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
          <p className="text-xs text-muted">{selected.size} selected</p>
          <div style={{ display: "flex", gap: "8px" }}>
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={create} disabled={creating || !hasMinimumRoster(selected.size)}>
              {creating ? "Creating…" : "Create chat"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Create the members modal**

Create `src/components/admin/conversation-members-modal.tsx`. This is `ManageGroupModal` with the endpoint repointed, the "Open chat" button dropped (the thread is already open behind it), and the roster minimum raised:

```tsx
"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { GroupPeoplePicker } from "@/components/admin/group-people-picker";
import { MINIMUM_ROSTER, hasMinimumRoster } from "@/lib/chat/conversation-shape";
import type { ChattableContact, ConversationSummary } from "@/lib/chat-types";

export function ConversationMembersModal({
  conversation,
  contacts,
  onClose,
  onChanged,
  onArchived,
}: {
  conversation: ConversationSummary;
  contacts: ChattableContact[];
  onClose: () => void;
  onChanged: () => void | Promise<void>;
  onArchived: (id: string) => void;
}) {
  const [name, setName] = useState(conversation.isGroup ? conversation.title : "");
  const [selected, setSelected] = useState<Set<string>>(new Set(conversation.members.map((m) => m.id)));
  const [saving, setSaving] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = async () => {
    setError(null);
    if (!hasMinimumRoster(selected.size)) {
      setError(`A chat needs at least ${MINIMUM_ROSTER} people.`);
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/admin/conversations/${conversation.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: name.trim() || null, memberIds: [...selected] }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Could not save changes.");
      return;
    }
    await onChanged();
  };

  const archive = async () => {
    setSaving(true);
    const res = await fetch(`/api/admin/conversations/${conversation.id}`, { method: "DELETE" });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not archive the chat.");
      return;
    }
    onArchived(conversation.id);
  };

  if (confirmArchive) {
    return (
      <Modal
        title="Archive chat?"
        description="The conversation is hidden from everyone but its message history is kept. This can't be undone from here."
        onClose={() => setConfirmArchive(false)}
      >
        {error && <p className="text-sm text-error">{error}</p>}
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <Button variant="outline" disabled={saving} onClick={() => setConfirmArchive(false)}>Cancel</Button>
          <Button disabled={saving} onClick={archive} style={{ backgroundColor: "var(--color-error)", border: "none" }}>
            {saving ? "Archiving…" : "Yes, archive"}
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title="Members"
      description="Adding a third person turns a one-to-one chat into a group. Everyone added can read the whole history."
      onClose={onClose}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <Input placeholder="Chat name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
        <GroupPeoplePicker contacts={contacts} selected={selected} onToggle={toggle} />
        {error && <p className="text-sm text-error">{error}</p>}
        <div style={{ display: "flex", gap: "8px", justifyContent: "space-between" }}>
          <Button
            variant="outline"
            disabled={saving}
            onClick={() => setConfirmArchive(true)}
            style={{ color: "var(--color-error)", borderColor: "var(--color-error)" }}
          >
            Archive
          </Button>
          <div style={{ display: "flex", gap: "8px" }}>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
```

The `name` initialiser uses `conversation.isGroup ? conversation.title : ""` because `ConversationSummary.title` is a *resolved display* title — for a DM it is the other person's name, which must not be saved back as a custom title.

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors in either new file.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/new-conversation-modal.tsx src/components/admin/conversation-members-modal.tsx
git commit -m "feat: add conversation create and members modals"
```

---

### Task 5: Make the Chats tab manage as well as read

**Files:**
- Modify: `src/components/admin/admin-chats-viewer.tsx`

**Interfaces:**
- Consumes: both modals from Task 4, `GET/POST /api/admin/conversations` from Task 3, `GET /api/chat/contacts` (existing, returns `{ contacts: ChattableContact[] }`).
- Produces: nothing downstream.

- [ ] **Step 1: Load contacts alongside conversations**

In `AdminChatsViewer`, add contacts state and fetch both together. Replace the `load` callback and the `conversations`/`loading` state block with:

```tsx
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [contacts, setContacts] = useState<ChattableContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showMembers, setShowMembers] = useState(false);

  const load = useCallback(async () => {
    const [c, k] = await Promise.all([
      fetch(`/api/admin/conversations?t=${Date.now()}`, { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => ({})),
      fetch("/api/chat/contacts", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
    ]);
    setConversations((c.conversations as ConversationSummary[]) ?? []);
    setContacts((k.contacts as ChattableContact[]) ?? []);
    setLoading(false);
  }, []);
```

Add `ChattableContact` to the `@/lib/chat-types` import, and import both modals plus `Button`, `Input`, and the `Plus`/`Search` icons from `lucide-react`.

- [ ] **Step 2: Filter the list by search**

Below `const active = ...`, add:

```tsx
  // This list holds every conversation in the academy — the largest in the app —
  // so it needs to be searchable by chat name or by who's in it.
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.members.some((m) => m.full_name.toLowerCase().includes(q)),
    );
  }, [conversations, search]);
```

Then change the list body to map over `visible` instead of `conversations`, and change the empty branch to:

```tsx
            ) : visible.length === 0 ? (
              <p className="text-sm text-muted" style={{ padding: "16px" }}>
                {search.trim() ? "No chats match that search." : "No conversations yet."}
              </p>
```

- [ ] **Step 3: Add the header, new-chat button, and search box**

Replace the list-pane header block:

```tsx
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--color-border)" }}>
            <p className="text-base font-semibold text-navy">All chats</p>
            <p className="text-xs text-muted">Read-only view of every conversation.</p>
          </div>
```

with:

```tsx
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--color-border)", display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
              <div style={{ minWidth: 0 }}>
                <p className="text-base font-semibold text-navy">All chats</p>
                <p className="text-xs text-muted">Every conversation in the academy.</p>
              </div>
              <Button size="sm" onClick={() => setShowNew(true)} style={{ flexShrink: 0 }}>
                <Plus style={{ height: "16px", width: "16px", marginRight: "6px" }} />
                New
              </Button>
            </div>
            <div style={{ position: "relative" }}>
              <Search
                size={15}
                style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--color-muted)" }}
              />
              <Input
                placeholder="Search chats or people"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ paddingLeft: "32px" }}
              />
            </div>
          </div>
```

- [ ] **Step 4: Render the modals**

Just before the closing `</section>` of `AdminChatsViewer`:

```tsx
      {showNew && (
        <NewConversationModal
          contacts={contacts}
          onClose={() => setShowNew(false)}
          onCreated={async (id) => {
            setShowNew(false);
            await load();
            setActiveId(id);
          }}
        />
      )}

      {showMembers && active && (
        <ConversationMembersModal
          conversation={active}
          contacts={contacts}
          onClose={() => setShowMembers(false)}
          onChanged={async () => {
            setShowMembers(false);
            await load();
          }}
          onArchived={(id) => {
            // Optimistically drop the row so archiving feels instant, then
            // reconcile with the server.
            setConversations((prev) => prev.filter((c) => c.id !== id));
            setShowMembers(false);
            setActiveId(null);
            void load();
          }}
        />
      )}
```

- [ ] **Step 5: Pass membership and the members handler into the thread**

Change the `<AdminThread .../>` call to add one prop:

```tsx
            <AdminThread
              key={active.id}
              conversation={active}
              currentUserId={currentUserId}
              onManageMembers={() => setShowMembers(true)}
              onBack={isMobile ? () => setActiveId(null) : undefined}
            />
```

- [ ] **Step 6: Gate the composer and add the members bar in `AdminThread`**

Change the `AdminThread` signature to accept `onManageMembers: () => void`, then derive membership and replace the render. After the existing `subtitle` line:

```tsx
  // The admin is not a participant in conversations they create, so most threads
  // are read-only to them. Their own DMs are the exception — people can message
  // an admin directly, and this is the only surface where those can be answered.
  const isMember = conversation.members.some((m) => m.id === currentUserId);
```

Replace the `initial === null ? ... : ...` block's else branch with:

```tsx
        <div style={{ flex: 1, minHeight: 0, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "8px",
              padding: "8px 14px",
              borderBottom: "1px solid var(--color-border)",
              flexShrink: 0,
            }}
          >
            <p className="text-xs text-muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {conversation.members.length} {conversation.members.length === 1 ? "member" : "members"}
            </p>
            <Button variant="outline" size="sm" onClick={onManageMembers} style={{ flexShrink: 0 }}>
              <Users size={15} style={{ marginRight: "6px" }} /> Members
            </Button>
          </div>
          <div style={{ flex: 1, minHeight: 0, minWidth: 0 }}>
            <ChatWindow
              conversationId={conversation.id}
              currentUserId={currentUserId}
              title={conversation.isGroup ? `${conversation.title}${subtitle ? ` · ${subtitle}` : ""}` : conversation.title}
              initialMessages={initial}
              initialHasMore={hasMore}
              readOnly={!isMember}
              fill
            />
          </div>
          {!isMember && (
            <p
              className="text-xs text-muted"
              style={{ padding: "10px 14px", borderTop: "1px solid var(--color-border)", flexShrink: 0, textAlign: "center" }}
            >
              You're not in this chat — view only.
            </p>
          )}
        </div>
```

`ChatWindow` renders no composer at all when `readOnly`, so the note replaces it rather than sitting beside a disabled input.

- [ ] **Step 7: Type-check and lint**

```bash
npx tsc --noEmit && npm run lint
```

Expected: no errors in `admin-chats-viewer.tsx`. `groups-manager.tsx` may still appear; it is deleted in Task 6.

- [ ] **Step 8: Commit**

```bash
git add src/components/admin/admin-chats-viewer.tsx
git commit -m "feat: manage members and send messages from the admin Chats tab"
```

---

### Task 6: Retire the Groups tab

**Files:**
- Modify: `src/components/layout/dashboard-header.tsx:34`
- Modify: `src/components/admin/admin-dashboard.tsx`
- Modify: `src/app/(dashboard)/admin/assignments/page.tsx`
- Delete: `src/components/admin/groups-manager.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1–5.
- Produces: nothing downstream.

- [ ] **Step 1: Drop the nav entry**

In `dashboard-header.tsx`, remove this line from `roleNav.admin`:

```tsx
    { href: "/admin/assignments", label: "Groups" },
```

Admin nav becomes Overview, Users, Sessions, Chats.

- [ ] **Step 2: Redirect the old route**

Replace the whole of `src/app/(dashboard)/admin/assignments/page.tsx` with:

```tsx
import { permanentRedirect } from "next/navigation";

// The Groups tab merged into Chats — every conversation is now managed in one
// place. Kept as a redirect so existing links and bookmarks still resolve.
export default function AdminAssignmentsPage() {
  permanentRedirect("/admin/chats");
}
```

Before writing this, check `node_modules/next/dist/docs/` for the current redirect API — per `AGENTS.md` this Next.js differs from training data, and `permanentRedirect` vs `redirect` and their import path are exactly the kind of thing that has changed. Use whatever that documentation specifies.

- [ ] **Step 3: Remove the assignments view from the dashboard**

In `admin-dashboard.tsx`:

Change the view union:

```tsx
export type AdminDashboardView = "overview" | "users" | "sessions" | "chats";
```

Remove the `assignments` entry from `viewCopy`, and widen the `chats` description:

```tsx
  chats: {
    title: "Chats",
    description: "Read every conversation and manage who's in them.",
  },
```

Repoint the Groups card in `overviewLinks` (keeping the grid at four cards):

```tsx
  {
    href: "/admin/chats",
    icon: MessagesSquare,
    title: "Chats",
    description: "Read every conversation and manage who's in them.",
  },
```

Swap the `Link2` import for `MessagesSquare` in the `lucide-react` import, and drop the now-unused `GroupsManager` import. Delete this line:

```tsx
      {view === "assignments" && <GroupsManager />}
```

- [ ] **Step 4: Delete the groups manager**

```bash
rm src/components/admin/groups-manager.tsx
```

- [ ] **Step 5: Verify nothing references the deleted surface**

```bash
grep -rn "GroupsManager\|admin/groups\|assignments\"" src
```

Expected: no hits for `GroupsManager` or `/api/admin/groups`. Hits for `teacher_student_assignments` and `AdminAssignmentRow` are unrelated and must stay.

- [ ] **Step 6: Full verification**

```bash
npx tsc --noEmit && npm run lint && node --test src/lib/chat/conversation-shape.test.cjs src/lib/chat/group-derive.test.cjs && npm run build
```

Expected: all four PASS with zero errors.

- [ ] **Step 7: Commit**

```bash
git add -A src/components src/app
git commit -m "refactor: retire the admin Groups tab in favour of unified Chats"
```

---

### Task 7: Verify the motivating path in the running app

**Files:** none — this task changes no code. It exists because the core behaviour spans RLS, realtime, and derived assignments, none of which unit tests reach.

- [ ] **Step 1: Start the dev server**

Use the `preview_start` tool with the project's dev configuration (never `npm run dev` via Bash). Sign in as the admin account — see the `insight-roles-and-logins` note for which test account is which.

- [ ] **Step 2: Confirm the tab merge**

Navigate to `/admin`. Expect four nav items — Overview, Users, Sessions, Chats — and no Groups. Navigate to `/admin/assignments` directly and confirm it lands on `/admin/chats`.

- [ ] **Step 3: Exercise the motivating case**

Open an existing teacher↔student conversation. It should show as a DM (titled with both names, initials avatar). Click **Members**, add a parent, save. Confirm:

- the thread keeps every prior message
- it now renders as a group (`Users` icon, "3 members")
- the list row shows the member count

- [ ] **Step 4: Confirm the promotion from the other side**

Sign in as that parent. Confirm the conversation appears in their Chats and that the full prior history is readable — this is the deliberate D4 behaviour, and seeing it confirms the membership RLS path works for a mid-thread join.

- [ ] **Step 5: Confirm composer gating**

Back as admin: open the promoted group and confirm there is no composer and the "You're not in this chat — view only" note is present. Then open a DM the admin is actually in — if none exists, send one to the admin from a teacher account first — and confirm the composer is present and a message sends. This is the bug fix; it must be seen working.

- [ ] **Step 6: Check the console and server logs**

Use `read_console_messages` and `preview_logs` with `level: "error"`. Expected: no errors from any step above.

- [ ] **Step 7: Screenshot the result**

Capture the unified Chats tab with a promoted group open, to share as evidence the change works.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
| --- | --- |
| D1 merge into one tab | 5, 6 |
| D2 promote DM in place | 2 (derivation), 4–5 (the UI that reaches it), 7 (verified) |
| D3 `is_group` derived | 1, 2 |
| D4 full history | 2 (no cutoff added), 7 step 4 (verified) |
| D5 minimum roster 2 | 1, 2, 3, 4 |
| Navigation and routing | 6 |
| Data layer table | 2 |
| API | 3 |
| UI: new chat, members, composer gating, search | 5 |
| File split (3 files) | 4, 5 |
| Error handling | 3 (400s), 4 (inline modal errors) |
| Testing | 1 (unit), 7 (manual) |

No gaps.

**Placeholder scan:** none — every code step carries complete code. The one instruction deferring to an external source (Task 6 Step 2, the Next.js redirect API) is required by `AGENTS.md` and names the exact file to consult.

**Type consistency:** `createAdminConversation` / `renameConversation` / `archiveConversation` / `updateConversationMembers` are named identically in Task 2 (produced) and Task 3 (consumed). `isGroupConversation` / `isDirectConversationKey` / `hasMinimumRoster` / `MINIMUM_ROSTER` are named identically in Tasks 1, 2, and 4. `onCreated` carries `(conversationId: string)` in both Task 4's definition and Task 5's call site. `ConversationSummary` and `ChattableContact` match `src/lib/chat-types.ts`.

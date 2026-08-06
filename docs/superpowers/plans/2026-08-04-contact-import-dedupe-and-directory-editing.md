# Contact Import De-duplication and Directory Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a contact import ask only about contacts that are new, and make the Kitty contact directory editable and deletable.

**Architecture:** `buildImportPreview` classifies every parsed row as `new`, `existing`, `removed`, or `error`, and the review screen collapses everything that is not `new`. The commit endpoint grows two extra lists — role updates and restores — each validated against the HMAC-signed preview rows, so it cannot be used to edit arbitrary contacts. The import RPC's conflict branch stops overwriting known contacts. The directory gains delete, restore, role, name, and pause controls, and the WhatsApp webhook stops dropping messages from deleted contacts.

**Tech Stack:** Next.js 16 (App Router, `RouteContext` typed route handlers), TypeScript, Supabase (`supabase-js` v2 + `plpgsql` RPC), React client components with inline styles, `node:test` with `.test.cjs` files that transpile `.ts` on require.

## Global Constraints

- Read the relevant guide in `node_modules/next/dist/docs/` before writing route-handler or App Router code. This Next.js version differs from training data.
- Tests are `.test.cjs` files run with `node --test <path>`. There is no `npm test` script.
- Only names and phone numbers survive an import. Emails, notes, and birthdays in the source `.vcf` are discarded, and the import card copy continues to say so.
- Existing contacts are never re-attested, renamed, re-roled, or unlinked as a side effect of an import. Every change to a known contact must be one the admin explicitly made.
- Deletion is soft (`deleted_at`, `is_active: false`) and sticky. Nothing revives a deleted contact except an explicit restore.
- Route handlers check `profile.role !== "admin"` and return 403 before touching `createAdminClient()`.
- Audit every admin mutation into `hermes_audit_events`.

---

### Task 1: Bucket preview rows by directory status

**Files:**
- Modify: `src/lib/hermes/import.ts:7-26` (types), `src/lib/hermes/import.ts:89-138` (`buildImportPreview`)
- Modify: `src/app/api/admin/hermes/import/preview/route.ts:29`
- Test: `src/lib/hermes/import.test.cjs:43-60`, `:83-98`

**Interfaces:**
- Consumes: `ParsedVCardContact` from `./types`, `suggestProfileMatches` / `ProfileMatchSuggestion` from `./matching`, `normalizePhone` from `./phone`.
- Produces: `ImportRowStatus = "new" | "existing" | "removed" | "error"`; `ImportPreviewRow` with `status: ImportRowStatus` and `existing: { id: string; displayName: string; role: string; deleted: boolean } | null` replacing `existingContactId`; `ImportPreview["summary"] = { total, new, existing, removed, errors }`; `ExistingHermesContact` with added `role: string` and `deleted_at: string | null`.

- [ ] **Step 1: Rewrite the preview test to assert buckets**

Replace `src/lib/hermes/import.test.cjs:43-60` with:

```javascript
test("buckets rows as new, existing, removed, or error", () => {
  const preview = buildImportPreview({
    parsed: [
      { sourceIndex: 0, displayName: "Priya Mehta", phones: ["+91 98765 43210"] },
      { sourceIndex: 1, displayName: "Priya Duplicate", phones: ["+919876543210"] },
      { sourceIndex: 2, displayName: "Local Student", phones: ["0917 583 553"] },
      { sourceIndex: 3, displayName: "Gone Away", phones: ["+15551234567"] },
    ],
    profiles,
    existingContacts: [
      { id: "c1", display_name: "Existing", whatsapp_e164: "+84917583553", role: "student", deleted_at: null },
      { id: "c2", display_name: "Removed Earlier", whatsapp_e164: "+15551234567", role: "parent", deleted_at: "2026-07-01T00:00:00Z" },
    ],
    defaultCallingCode: "84",
  });

  assert.equal(preview.rows[0].status, "new");
  assert.equal(preview.rows[0].normalizedPhone, "+919876543210");
  assert.equal(preview.rows[0].suggestions[0].profileId, "p1");
  assert.equal(preview.rows[0].existing, null);

  assert.equal(preview.rows[1].status, "error");
  assert.equal(preview.rows[1].error, "duplicate_in_upload");

  assert.equal(preview.rows[2].status, "existing");
  assert.deepEqual(preview.rows[2].existing, { id: "c1", displayName: "Existing", role: "student", deleted: false });

  assert.equal(preview.rows[3].status, "removed");
  assert.deepEqual(preview.rows[3].existing, { id: "c2", displayName: "Removed Earlier", role: "parent", deleted: true });

  assert.deepEqual(preview.summary, { total: 4, new: 1, existing: 1, removed: 1, errors: 1 });
});

test("suggests Insight profiles only for contacts being created", () => {
  const preview = buildImportPreview({
    parsed: [{ sourceIndex: 0, displayName: "Priya Mehta", phones: ["+919876543210"] }],
    profiles,
    existingContacts: [
      { id: "c1", display_name: "Priya Mehta", whatsapp_e164: "+919876543210", role: "teacher", deleted_at: null },
    ],
  });

  assert.equal(preview.rows[0].status, "existing");
  assert.deepEqual(preview.rows[0].suggestions, []);
});
```

Then update the `validateImportSelection` fixture. At `src/lib/hermes/import.test.cjs:89`, replace `existingContactId: null,` with:

```javascript
    status: "new",
    existing: null,
```

and append this assertion inside that same test, after the four existing ones:

```javascript
  // A contact already in the directory must never travel the create path.
  const knownRows = [{ ...rows[0], status: "existing", existing: { id: "c1", displayName: "Priya Mehta", role: "student", deleted: false } }];
  assert.equal(validateImportSelection(knownRows, [{ displayName: "Priya Mehta", normalizedPhone: "+919876543210", role: "teacher", profileId: null }]), false);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test src/lib/hermes/import.test.cjs`
Expected: FAIL — `preview.rows[0].status` is `undefined`, and the summary deep-equal reports the old `{ ready, errors, existing, suggestedMatches }` shape.

- [ ] **Step 3: Update the types in `src/lib/hermes/import.ts`**

Replace lines 7-26 with:

```typescript
export interface ExistingHermesContact {
  id: string;
  display_name: string;
  whatsapp_e164: string;
  role: string;
  deleted_at: string | null;
}

/** Which bucket the review screen files this row under. */
export type ImportRowStatus = "new" | "existing" | "removed" | "error";

export interface ImportPreviewRow {
  sourceIndex: number;
  displayName: string;
  rawPhone: string;
  normalizedPhone: string | null;
  status: ImportRowStatus;
  /** The directory contact this row already matches, if any. */
  existing: { id: string; displayName: string; role: string; deleted: boolean } | null;
  suggestions: ProfileMatchSuggestion[];
  error: "name_required" | "phone_required" | "country_code_required" | "invalid_phone" | "duplicate_in_upload" | null;
}

export interface ImportPreview {
  rows: ImportPreviewRow[];
  summary: { total: number; new: number; existing: number; removed: number; errors: number };
}
```

- [ ] **Step 4: Classify rows in `buildImportPreview`**

In `src/lib/hermes/import.ts`, replace the `existingByPhone` line (currently line 96) with:

```typescript
  const existingByPhone = new Map(input.existingContacts.map((contact) => [contact.whatsapp_e164, contact]));
```

Replace the `rows.push({ ... })` call (currently lines 116-124) with:

```typescript
      const match = normalizedPhone ? existingByPhone.get(normalizedPhone) ?? null : null;
      const existing = match
        ? { id: match.id, displayName: match.display_name, role: match.role, deleted: match.deleted_at !== null }
        : null;
      const status: ImportRowStatus = error
        ? "error"
        : existing
          ? existing.deleted
            ? "removed"
            : "existing"
          : "new";

      rows.push({
        sourceIndex: contact.sourceIndex,
        displayName: contact.displayName,
        rawPhone,
        normalizedPhone,
        status,
        existing,
        // Only a contact being created needs an Insight profile suggestion.
        suggestions: status === "new" ? suggestProfileMatches(contact.displayName, input.profiles) : [],
        error,
      });
```

Replace the `summary` block (currently lines 129-136) with:

```typescript
    summary: {
      total: rows.length,
      new: rows.filter((row) => row.status === "new").length,
      existing: rows.filter((row) => row.status === "existing").length,
      removed: rows.filter((row) => row.status === "removed").length,
      errors: rows.filter((row) => row.status === "error").length,
    },
```

- [ ] **Step 5: Narrow `validateImportSelection` to creatable rows**

In `src/lib/hermes/import.ts`, replace the `readyByPhone` map (currently lines 74-78) with:

```typescript
  const creatableByPhone = new Map(
    rows
      .filter((row) => row.status === "new" && row.normalizedPhone)
      .map((row) => [row.normalizedPhone!, row]),
  );
```

and replace `readyByPhone.get(contact.normalizedPhone)` on the following line with `creatableByPhone.get(contact.normalizedPhone)`.

- [ ] **Step 6: Feed deleted contacts into the preview**

In `src/app/api/admin/hermes/import/preview/route.ts`, replace line 29 with:

```typescript
    supabase.from("hermes_contacts").select("id, display_name, whatsapp_e164, role, deleted_at"),
```

The `.is("deleted_at", null)` filter is removed on purpose — a soft-deleted contact must be recognised so it lands in the `removed` bucket instead of looking new.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `node --test src/lib/hermes/import.test.cjs`
Expected: PASS, 9 tests.

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors ONLY in `src/components/admin/hermes-contact-import.tsx` (it still reads `existingContactId` and `summary.ready`). Task 6 fixes that file. No errors in `src/lib/` or `src/app/api/`.

- [ ] **Step 9: Commit**

```bash
git add src/lib/hermes/import.ts src/lib/hermes/import.test.cjs src/app/api/admin/hermes/import/preview/route.ts
git commit -m "feat: bucket import preview rows by directory status"
```

---

### Task 2: Accept role updates and restores at commit

**Files:**
- Modify: `src/lib/hermes/import.ts` (add `validateImportChanges` after `validateImportSelection`)
- Modify: `src/app/api/admin/hermes/import/commit/route.ts`
- Test: `src/lib/hermes/import.test.cjs`

**Interfaces:**
- Consumes: `ImportPreviewRow` and `ImportRowStatus` from Task 1.
- Produces: `ImportContactChange = { contactId: string; role: string | null }`; `validateImportChanges(rows: ImportPreviewRow[], changes: ImportContactChange[], status: "existing" | "removed"): boolean`. The commit endpoint accepts `updates: ImportContactChange[]` and `restores: ImportContactChange[]` and responds `{ result: { created, skipped, updated, restored } }`.

- [ ] **Step 1: Write the failing validation test**

Append to `src/lib/hermes/import.test.cjs`:

```javascript
test("binds updates and restores to signed rows of the matching bucket", () => {
  const rows = [
    {
      sourceIndex: 0,
      displayName: "Known Person",
      rawPhone: "+84917583553",
      normalizedPhone: "+84917583553",
      status: "existing",
      existing: { id: "c1", displayName: "Known Person", role: "student", deleted: false },
      suggestions: [],
      error: null,
    },
    {
      sourceIndex: 1,
      displayName: "Gone Away",
      rawPhone: "+15551234567",
      normalizedPhone: "+15551234567",
      status: "removed",
      existing: { id: "c2", displayName: "Gone Away", role: "parent", deleted: true },
      suggestions: [],
      error: null,
    },
  ];

  assert.equal(validateImportChanges(rows, [{ contactId: "c1", role: "teacher" }], "existing"), true);
  assert.equal(validateImportChanges(rows, [{ contactId: "c2", role: null }], "removed"), true);

  // A removed contact cannot be routed through the update list, or vice versa.
  assert.equal(validateImportChanges(rows, [{ contactId: "c2", role: "teacher" }], "existing"), false);
  assert.equal(validateImportChanges(rows, [{ contactId: "c1", role: null }], "removed"), false);

  // A contact id that appears in no signed row cannot be edited through import.
  assert.equal(validateImportChanges(rows, [{ contactId: "c9", role: "teacher" }], "existing"), false);

  // The same contact cannot be changed twice in one request.
  assert.equal(
    validateImportChanges(rows, [{ contactId: "c1", role: "teacher" }, { contactId: "c1", role: "parent" }], "existing"),
    false,
  );

  assert.equal(validateImportChanges(rows, [], "existing"), true);
});
```

Add `validateImportChanges` to the destructured require at `src/lib/hermes/import.test.cjs:20`:

```javascript
const { buildImportPreview, signImportPreview, validateImportChanges, validateImportSelection, verifyImportPreview } = require(path.join(__dirname, "import.ts"));
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test src/lib/hermes/import.test.cjs`
Expected: FAIL with `TypeError: validateImportChanges is not a function`.

- [ ] **Step 3: Implement `validateImportChanges`**

In `src/lib/hermes/import.ts`, add after `validateImportSelection`:

```typescript
export interface ImportContactChange {
  contactId: string;
  /** Null keeps the role the contact already had. */
  role: string | null;
}

/**
 * A change may only target a contact the signed preview actually matched, in
 * the bucket the caller claims. Without this the import endpoint would be a
 * way to edit any contact by id.
 */
export function validateImportChanges(
  rows: ImportPreviewRow[],
  changes: ImportContactChange[],
  status: "existing" | "removed",
) {
  const allowed = new Set(
    rows.filter((row) => row.status === status && row.existing).map((row) => row.existing!.id),
  );
  if (new Set(changes.map((change) => change.contactId)).size !== changes.length) return false;
  return changes.every((change) => allowed.has(change.contactId));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test src/lib/hermes/import.test.cjs`
Expected: PASS, 10 tests.

- [ ] **Step 5: Apply updates and restores in the commit route**

Replace `src/app/api/admin/hermes/import/commit/route.ts` entirely with:

```typescript
import { NextResponse } from "next/server";

import { getUserProfile } from "@/lib/auth/get-user-profile";
import {
  digestImportRows,
  validateImportChanges,
  validateImportSelection,
  verifyImportPreview,
  type ImportContactChange,
} from "@/lib/hermes/import";
import type { HermesContactRole } from "@/lib/hermes/types";
import { createAdminClient } from "@/lib/supabase/admin";

const ROLES = new Set<HermesContactRole>(["teacher", "student", "parent", "employee", "other", "unclassified"]);

interface CommitContact {
  displayName: string;
  normalizedPhone: string;
  role: HermesContactRole;
  profileId?: string | null;
}

function assignableRole(role: unknown): role is Exclude<HermesContactRole, "unclassified"> {
  return typeof role === "string" && ROLES.has(role as HermesContactRole) && role !== "unclassified";
}

export async function POST(request: Request) {
  const profile = await getUserProfile();
  if (!profile || profile.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const secret = process.env.HERMES_IMPORT_SIGNING_SECRET ?? process.env.HERMES_TOOL_SHARED_SECRET;
  if (!secret) return NextResponse.json({ error: "Contact import is not configured." }, { status: 503 });
  const body = await request.json();
  const token = verifyImportPreview(body.previewToken?.toString() ?? "", secret);
  const previewRows = Array.isArray(body.previewRows) ? body.previewRows : [];
  if (!token || token.digest !== digestImportRows(previewRows)) {
    return NextResponse.json({ error: "The preview expired or changed. Upload the contact file again." }, { status: 400 });
  }

  const contacts = (Array.isArray(body.contacts) ? body.contacts : []) as CommitContact[];
  const updates = (Array.isArray(body.updates) ? body.updates : []) as ImportContactChange[];
  const restores = (Array.isArray(body.restores) ? body.restores : []) as ImportContactChange[];

  if (contacts.length === 0 && updates.length === 0 && restores.length === 0) {
    return NextResponse.json({ error: "Select at least one contact to import, update, or restore." }, { status: 400 });
  }
  // Consent covers contacts being created. Contacts already in the directory
  // were attested in an earlier batch and are not re-attested here.
  if (contacts.length > 0 && body.consentAttested !== true) {
    return NextResponse.json({ error: "Confirm consent before importing contacts." }, { status: 400 });
  }
  if (contacts.some((contact) => !contact.displayName?.trim() || !/^\+[1-9]\d{7,14}$/.test(contact.normalizedPhone) || !assignableRole(contact.role))) {
    return NextResponse.json({ error: "Every selected contact needs a valid name, number, and role." }, { status: 400 });
  }
  if (contacts.length > 0 && !validateImportSelection(previewRows, contacts)) {
    return NextResponse.json({ error: "The selected contacts do not match the signed preview. Upload the contact file again." }, { status: 400 });
  }
  if (updates.some((update) => !assignableRole(update.role)) || restores.some((restore) => restore.role !== null && !assignableRole(restore.role))) {
    return NextResponse.json({ error: "Choose a valid role for every changed contact." }, { status: 400 });
  }
  if (!validateImportChanges(previewRows, updates, "existing") || !validateImportChanges(previewRows, restores, "removed")) {
    return NextResponse.json({ error: "The changed contacts do not match the signed preview. Upload the contact file again." }, { status: 400 });
  }

  const supabase = createAdminClient();
  let created = 0;
  let skipped = 0;

  if (contacts.length > 0) {
    const { data, error } = await supabase.rpc("import_hermes_contacts", {
      p_imported_by: profile.id,
      p_source_sha256: token.digest,
      p_contacts: contacts,
    });
    if (error) return NextResponse.json({ error: "The contacts were not imported." }, { status: 500 });
    created = Number((data as { created?: number })?.created ?? 0);
    skipped = Number((data as { skipped?: number })?.skipped ?? 0);
  }

  let updated = 0;
  for (const update of updates) {
    const { data } = await supabase
      .from("hermes_contacts")
      .update({ role: update.role })
      .eq("id", update.contactId)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();
    if (!data) continue;
    updated += 1;
    await supabase.from("hermes_audit_events").insert({
      actor_type: "admin", actor_profile_id: profile.id, event_type: "contact_updated",
      entity_type: "hermes_contact", entity_id: update.contactId, metadata: { fields: ["role"], source: "import" },
    });
  }

  let restored = 0;
  for (const restore of restores) {
    const patch: Record<string, unknown> = { deleted_at: null, is_active: true };
    if (restore.role) patch.role = restore.role;
    const { data } = await supabase
      .from("hermes_contacts")
      .update(patch)
      .eq("id", restore.contactId)
      .select("id")
      .maybeSingle();
    if (!data) continue;
    restored += 1;
    await supabase.from("hermes_audit_events").insert({
      actor_type: "admin", actor_profile_id: profile.id, event_type: "contact_restored",
      entity_type: "hermes_contact", entity_id: restore.contactId, metadata: { source: "import" },
    });
  }

  return NextResponse.json({ result: { created, skipped, updated, restored } });
}
```

- [ ] **Step 6: Confirm the route still authenticates before database access**

Run: `node --test src/lib/hermes/import.test.cjs`
Expected: PASS, 10 tests. The existing test at `src/lib/hermes/import.test.cjs:100` reads the route source and asserts the 403 check precedes `createAdminClient`; it must still pass.

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors ONLY in `src/components/admin/hermes-contact-import.tsx`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/hermes/import.ts src/lib/hermes/import.test.cjs src/app/api/admin/hermes/import/commit/route.ts
git commit -m "feat: apply role updates and restores from a contact import"
```

---

### Task 3: Stop the import RPC overwriting known contacts

**Files:**
- Create: `supabase/migrations/20260804120000_preserve_known_hermes_contacts_on_import.sql`
- Test: `src/lib/hermes/schema.test.cjs`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `import_hermes_contacts(p_imported_by uuid, p_source_sha256 text, p_contacts jsonb)` returns `jsonb_build_object('batchId', …, 'created', …, 'skipped', …)`. Task 2 reads `created` and `skipped` from it.

- [ ] **Step 1: Write the failing migration test**

Append to `src/lib/hermes/schema.test.cjs`:

```javascript
test("import RPC preserves contacts that already exist", () => {
  const sql = readMigration("_preserve_known_hermes_contacts_on_import.sql");
  // The conflict branch must be a no-op self-assignment, never an overwrite.
  assert.match(sql, /on conflict \(whatsapp_e164\) do update set\s+display_name = public\.hermes_contacts\.display_name/);
  for (const clobbered of ["role = excluded.role", "profile_id = excluded.profile_id", "deleted_at = null"]) {
    assert.doesNotMatch(sql, new RegExp(clobbered.replace(/[.()]/g, "\\$&")));
  }
  assert.match(sql, /'skipped', v_skipped/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test src/lib/hermes/schema.test.cjs`
Expected: FAIL with `_preserve_known_hermes_contacts_on_import.sql migration should exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260804120000_preserve_known_hermes_contacts_on_import.sql`. Copy the entire `create or replace function public.import_hermes_contacts(...)` definition from `supabase/migrations/20260716131103_add_hermes_assistant.sql:273-405` verbatim, then apply exactly these four changes. Do not copy the `revoke`/`grant` lines at 407-408; they still apply.

Change 1 — rename the counter in the `declare` block:

```sql
  v_skipped integer := 0;
```
replaces
```sql
  v_updated integer := 0;
```

Change 2 — replace the whole `on conflict` block (original lines 367-382) with:

```sql
    on conflict (whatsapp_e164) do update set
      display_name = public.hermes_contacts.display_name
```

A conflict now means the contact was created between preview and commit, since
only new contacts reach this function. Self-assigning `display_name` is a no-op
that still returns the row id for the audit event. Nothing is overwritten and a
soft-deleted contact is not revived.

Change 3 — replace the counter increment:

```sql
    if v_existing is null then v_created := v_created + 1;
    else v_skipped := v_skipped + 1;
    end if;
```

Change 4 — replace the batch update and return:

```sql
  update public.hermes_import_batches
  set created_count = v_created,
      updated_count = v_skipped,
      summary = jsonb_build_object('created', v_created, 'skipped', v_skipped)
  where id = v_batch_id;

  return jsonb_build_object('batchId', v_batch_id, 'created', v_created, 'skipped', v_skipped);
```

`updated_count` keeps its column name because the table schema is unchanged.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test src/lib/hermes/schema.test.cjs`
Expected: PASS.

- [ ] **Step 5: Apply the migration**

Run: `npx supabase db push`
Expected: the new migration applies. If the project is not linked, apply it through the Supabase MCP `apply_migration` tool with name `preserve_known_hermes_contacts_on_import`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260804120000_preserve_known_hermes_contacts_on_import.sql src/lib/hermes/schema.test.cjs
git commit -m "fix: stop a re-import overwriting known contacts"
```

---

### Task 4: Delete and restore a contact

**Files:**
- Modify: `src/app/api/admin/hermes/contacts/[id]/route.ts`
- Test: `src/lib/hermes/schema.test.cjs`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `DELETE /api/admin/hermes/contacts/[id]` → `{ contact: { id } }`; `PATCH` accepts `{ restore: true }` alongside the existing fields.

- [ ] **Step 1: Write the failing route test**

Append to `src/lib/hermes/schema.test.cjs`:

```javascript
test("contact route soft-deletes and restores without erasing history", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src/app/api/admin/hermes/contacts/[id]/route.ts"),
    "utf8",
  );
  assert.match(source, /export async function DELETE/);
  // Soft delete only — a hard delete would orphan transcripts and audit events.
  assert.doesNotMatch(source, /\.delete\(\)/);
  assert.match(source, /deleted_at: new Date\(\)\.toISOString\(\)/);
  assert.match(source, /is_active: false/);
  assert.match(source, /"contact_deleted"/);
  assert.match(source, /"contact_restored"/);
  // Restore is the one path allowed to touch an already-deleted row.
  assert.match(source, /if \(!restoring\) query = query\.is\("deleted_at", null\)/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test src/lib/hermes/schema.test.cjs`
Expected: FAIL — no `export async function DELETE` in the route source.

- [ ] **Step 3: Add restore support to PATCH**

In `src/app/api/admin/hermes/contacts/[id]/route.ts`, after the `const update: Record<string, unknown> = {};` line (currently line 15), add:

```typescript
  let restoring = false;
  if (body.restore === true) {
    restoring = true;
    Object.assign(update, { deleted_at: null, is_active: true });
  }
```

Then replace the query and audit block (currently lines 58-62) with:

```typescript
  const supabase = createAdminClient();
  let query = supabase.from("hermes_contacts").update(update).eq("id", id);
  // Every field except restore refuses to edit a contact that was removed.
  if (!restoring) query = query.is("deleted_at", null);
  const { data, error } = await query
    .select("id, display_name, preferred_name, role, profile_id, communication_policy")
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Could not update the contact." }, { status: 500 });
  await supabase.from("hermes_audit_events").insert({
    actor_type: "admin",
    actor_profile_id: profile.id,
    event_type: restoring ? "contact_restored" : "contact_updated",
    entity_type: "hermes_contact",
    entity_id: id,
    metadata: { fields: Object.keys(update) },
  });
  return NextResponse.json({ contact: data });
```

Note the `const supabase = createAdminClient();` on line 58 of the original — the `profileId` branch above it declares its own `supabase` inside a narrower scope, so both can coexist unchanged.

- [ ] **Step 4: Add the DELETE handler**

Append to `src/app/api/admin/hermes/contacts/[id]/route.ts`:

```typescript
/**
 * Removes a contact from the directory and from Kitty's reach. Soft only:
 * transcripts, audit events, and case participation reference this row.
 */
export async function DELETE(request: Request, context: RouteContext<"/api/admin/hermes/contacts/[id]">) {
  const profile = await getUserProfile();
  if (!profile || profile.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const { id } = await context.params;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("hermes_contacts")
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Could not remove the contact." }, { status: 500 });

  await supabase.from("hermes_audit_events").insert({
    actor_type: "admin",
    actor_profile_id: profile.id,
    event_type: "contact_deleted",
    entity_type: "hermes_contact",
    entity_id: id,
  });
  return NextResponse.json({ contact: data });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test src/lib/hermes/schema.test.cjs`
Expected: PASS.

- [ ] **Step 6: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/app/api/admin/hermes/contacts`
Expected: no errors in the contacts route. `request` is unused in `DELETE`; if `eslint` flags it, rename the parameter to `_request`.

- [ ] **Step 7: Commit**

```bash
git add "src/app/api/admin/hermes/contacts/[id]/route.ts" src/lib/hermes/schema.test.cjs
git commit -m "feat: remove and restore Kitty contacts"
```

---

### Task 5: Keep inbound messages from a deleted contact

**Files:**
- Modify: `src/lib/hermes/webhook.ts` (add `inboundContactDisposition` after `isInboundContactEligible` at line 32)
- Modify: `src/app/api/whatsapp/webhook/route.ts:86-122`
- Test: `src/lib/hermes/webhook.test.cjs`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `inboundContactDisposition(contact: { deleted_at: string | null } | null): "create" | "deleted" | "active"`.

Background: the lookup at `route.ts:86` filters `deleted_at is null`, so a deleted contact is missed and the handler inserts a new row. But `whatsapp_e164` is `not null unique` with no partial index (`20260716131103_add_hermes_assistant.sql:22`), so the insert fails, `created.data` is null, and line 107 skips the event. The message is dropped silently.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/hermes/webhook.test.cjs`:

```javascript
test("classifies an inbound contact without reviving a removed one", () => {
  assert.equal(inboundContactDisposition(null), "create");
  assert.equal(inboundContactDisposition({ deleted_at: null }), "active");
  assert.equal(inboundContactDisposition({ deleted_at: "2026-07-01T00:00:00Z" }), "deleted");
});

test("webhook stores a removed contact's message without replying or reviving", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/app/api/whatsapp/webhook/route.ts"), "utf8");
  assert.match(source, /inboundContactDisposition/);
  // The lookup must see removed rows, or the insert below hits the unique index.
  assert.match(source, /\.select\("id, role, communication_policy, consent_status, is_active, deleted_at"\)/);
  assert.match(source, /disposition === "create"/);
  assert.match(source, /disposition !== "deleted"/);
  assert.match(source, /"deleted_contact_received"/);
  // Nothing in the inbound path clears deleted_at.
  assert.doesNotMatch(source, /deleted_at: null/);
});
```

Add `inboundContactDisposition` to the destructured require of `webhook.ts` at the top of `src/lib/hermes/webhook.test.cjs` — find the line requiring `isInboundContactEligible` and add it to the same destructure.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test src/lib/hermes/webhook.test.cjs`
Expected: FAIL with `TypeError: inboundContactDisposition is not a function`.

- [ ] **Step 3: Add the disposition helper**

In `src/lib/hermes/webhook.ts`, add after `isInboundContactEligible` (after line 32):

```typescript
export type InboundContactDisposition = "create" | "deleted" | "active";

/**
 * What to do with the contact an inbound message came from. A removed contact
 * is kept removed: reviving it silently would undo a deliberate deletion.
 */
export function inboundContactDisposition(
  contact: { deleted_at: string | null } | null,
): InboundContactDisposition {
  if (!contact) return "create";
  return contact.deleted_at === null ? "active" : "deleted";
}
```

- [ ] **Step 4: Branch on the disposition in the route**

In `src/app/api/whatsapp/webhook/route.ts`, add `inboundContactDisposition` to the existing `@/lib/hermes/webhook` import.

Replace lines 86-108 with:

```typescript
    let { data: contact } = await supabase
      .from("hermes_contacts")
      .select("id, role, communication_policy, consent_status, is_active, deleted_at")
      .eq("whatsapp_e164", e164)
      .maybeSingle();

    const disposition = inboundContactDisposition(contact);
    if (disposition === "create") {
      const created = await supabase.from("hermes_contacts").insert({
        display_name: event.profileName?.trim() || "Unknown WhatsApp contact",
        whatsapp_e164: e164,
        role: "unclassified",
        communication_policy: "approval_required",
        consent_status: "pending",
        consent_source: "whatsapp",
        consent_attested_by: null,
      }).select("id, role, communication_policy, consent_status, is_active, deleted_at").single();
      contact = created.data;
      if (contact) await supabase.from("hermes_audit_events").insert({ actor_type: "system", actor_contact_id: contact.id, event_type: "unknown_contact_received", entity_type: "hermes_contact", entity_id: contact.id });
    } else if (disposition === "deleted" && contact) {
      // Keep the message so a mistaken removal is recoverable, but stay removed.
      await supabase.from("hermes_audit_events").insert({ actor_type: "system", actor_contact_id: contact.id, event_type: "deleted_contact_received", entity_type: "hermes_contact", entity_id: contact.id });
    }
    if (!contact) {
      continue;
    }
```

Replace the `const eligible = ...` assignment (currently line 117) with:

```typescript
    const eligible = !optedOut && disposition !== "deleted" && isInboundContactEligible({
```

leaving the object literal and closing `});` that follow it unchanged.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test src/lib/hermes/webhook.test.cjs`
Expected: PASS, all tests including the pre-existing route-source assertions.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors ONLY in `src/components/admin/hermes-contact-import.tsx`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/hermes/webhook.ts src/lib/hermes/webhook.test.cjs src/app/api/whatsapp/webhook/route.ts
git commit -m "fix: keep inbound messages from a removed contact"
```

---

### Task 6: Review screen that asks only about new contacts

**Files:**
- Modify: `src/components/admin/hermes-contact-import.tsx` (full rewrite)

**Interfaces:**
- Consumes: the preview payload from Task 1 (`status`, `existing`, `summary`) and the commit payload from Task 2 (`contacts`, `updates`, `restores`, and the `{ created, skipped, updated, restored }` result).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Rewrite the component**

Replace `src/components/admin/hermes-contact-import.tsx` entirely with:

```tsx
"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";

import { Disclosure } from "@/components/admin/hermes-dashboard-shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { HermesContactRole } from "@/lib/hermes/types";

type AssignableRole = Exclude<HermesContactRole, "unclassified">;

const ROLES: Array<{ value: AssignableRole; label: string }> = [
  { value: "teacher", label: "Teacher" },
  { value: "student", label: "Student" },
  { value: "parent", label: "Parent" },
  { value: "employee", label: "Employee" },
  { value: "other", label: "Other" },
];

interface PreviewSuggestion {
  profileId: string;
  fullName: string;
  role: string;
  timezone: string | null;
}

interface PreviewRow {
  sourceIndex: number;
  displayName: string;
  rawPhone: string;
  normalizedPhone: string | null;
  status: "new" | "existing" | "removed" | "error";
  existing: { id: string; displayName: string; role: string; deleted: boolean } | null;
  suggestions: PreviewSuggestion[];
  error: string | null;
}

interface PreviewResponse {
  rows: PreviewRow[];
  previewToken: string;
  summary: { total: number; new: number; existing: number; removed: number; errors: number };
  error?: string;
}

interface Choice {
  role: HermesContactRole;
  profileId: string | null;
}

const rowCard: CSSProperties = {
  border: "1px solid var(--color-border)",
  borderRadius: "10px",
  padding: "12px",
  display: "flex",
  flexDirection: "column",
  gap: "8px",
};

function readable(value: string) {
  return value.replaceAll("_", " ");
}

export function HermesContactImport() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [callingCode, setCallingCode] = useState("");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [choices, setChoices] = useState<Record<number, Choice>>({});
  const [roleChanges, setRoleChanges] = useState<Record<string, AssignableRole>>({});
  const [restoring, setRestoring] = useState<Record<string, AssignableRole | "keep">>({});
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const buckets = useMemo(() => {
    const rows = (preview?.rows ?? []).map((row, index) => ({ row, index }));
    return {
      fresh: rows.filter(({ row }) => row.status === "new"),
      known: rows.filter(({ row }) => row.status === "existing"),
      removed: rows.filter(({ row }) => row.status === "removed"),
      broken: rows.filter(({ row }) => row.status === "error"),
    };
  }, [preview]);

  function reset() {
    setPreview(null);
    setFile(null);
    setChoices({});
    setRoleChanges({});
    setRestoring({});
    setConsent(false);
  }

  async function previewContacts() {
    if (!file) return;
    setLoading(true);
    setStatus(null);
    const form = new FormData();
    form.set("file", file);
    if (callingCode.trim()) form.set("defaultCallingCode", callingCode.trim());
    const response = await fetch("/api/admin/hermes/import/preview", { method: "POST", body: form });
    const data = (await response.json()) as PreviewResponse;
    setLoading(false);
    if (!response.ok) {
      setStatus(data.error ?? "Could not read that contact file.");
      return;
    }
    setPreview(data);
    setChoices({});
    setRoleChanges({});
    setRestoring({});
  }

  function chooseRole(index: number, role: HermesContactRole) {
    setChoices((current) => ({ ...current, [index]: { role, profileId: null } }));
  }

  function chooseProfile(index: number, suggestion: PreviewSuggestion) {
    setChoices((current) => ({ ...current, [index]: { role: suggestion.role as HermesContactRole, profileId: suggestion.profileId } }));
  }

  const updates = Object.entries(roleChanges).map(([contactId, role]) => ({ contactId, role }));
  const restores = Object.entries(restoring).map(([contactId, role]) => ({
    contactId,
    role: role === "keep" ? null : role,
  }));
  const unresolved = buckets.fresh.filter(({ index }) => !choices[index] || choices[index].role === "unclassified");
  const nothingToDo = buckets.fresh.length === 0 && updates.length === 0 && restores.length === 0;

  const actionLabel = [
    buckets.fresh.length > 0 ? `Import ${buckets.fresh.length}` : null,
    updates.length > 0 ? `update ${updates.length}` : null,
    restores.length > 0 ? `restore ${restores.length}` : null,
  ].filter(Boolean).join(" · ") || "Nothing to import";

  async function importContacts() {
    if (!preview) return;
    if (unresolved.length > 0) {
      setStatus("Choose a role or confirm an Insight match for every new contact.");
      return;
    }
    if (buckets.fresh.length > 0 && !consent) {
      setStatus("Confirm that these contacts agreed to receive MyInsightAcademy WhatsApp messages.");
      return;
    }

    setLoading(true);
    const response = await fetch("/api/admin/hermes/import/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        previewToken: preview.previewToken,
        previewRows: preview.rows,
        consentAttested: buckets.fresh.length > 0,
        contacts: buckets.fresh.map(({ row, index }) => ({
          displayName: row.displayName,
          normalizedPhone: row.normalizedPhone,
          role: choices[index].role,
          profileId: choices[index].profileId,
        })),
        updates,
        restores,
      }),
    });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) {
      setStatus(data.error ?? "The contacts were not imported.");
      return;
    }
    const { created = 0, updated = 0, restored = 0 } = data.result ?? {};
    setStatus(
      `Done — ${created} added, ${updated} updated, ${restored} restored. ` +
      `${preview.summary.existing - updated} left untouched.`,
    );
    reset();
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle style={{ display: "flex", gap: "8px", alignItems: "center" }}><Upload size={18} /> Import iPhone contacts</CardTitle>
        <CardDescription>Upload an academy-only .vcf file. Insight keeps names and phone numbers only.</CardDescription>
      </CardHeader>
      <CardContent style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div className="form-grid-2" style={{ gap: "12px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <Label htmlFor="hermes-vcard">Contact list (.vcf)</Label>
            <Input id="hermes-vcard" type="file" accept=".vcf,text/vcard,text/x-vcard" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <Label htmlFor="hermes-calling-code">Default country code for local numbers</Label>
            <Input id="hermes-calling-code" inputMode="numeric" placeholder="84" value={callingCode} onChange={(event) => setCallingCode(event.target.value)} />
          </div>
        </div>
        <Button type="button" onClick={previewContacts} disabled={!file || loading}>{loading ? "Reading contacts…" : "Preview contacts"}</Button>

        {preview ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <p className="text-sm text-muted">
              {preview.summary.total} in file · {preview.summary.new} new · {preview.summary.existing} already yours
              {preview.summary.removed > 0 ? ` · ${preview.summary.removed} previously removed` : ""}
              {preview.summary.errors > 0 ? ` · ${preview.summary.errors} need fixing` : ""}
            </p>

            {buckets.fresh.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <p className="text-sm font-semibold text-navy">New contacts ({buckets.fresh.length})</p>
                {buckets.fresh.map(({ row, index }) => (
                  <div key={`${row.sourceIndex}-${row.rawPhone}`} style={rowCard}>
                    <div>
                      <p className="text-sm font-semibold">{row.displayName || "Unnamed contact"}</p>
                      <p className="text-sm text-muted">{row.normalizedPhone ?? (row.rawPhone || "No phone number")}</p>
                    </div>
                    {row.suggestions.map((suggestion) => (
                      <Button key={suggestion.profileId} type="button" size="sm" variant={choices[index]?.profileId === suggestion.profileId ? "default" : "outline"} onClick={() => chooseProfile(index, suggestion)}>
                        Same as {suggestion.fullName} ({suggestion.role})
                      </Button>
                    ))}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                      {ROLES.map((role) => (
                        <Button key={role.value} type="button" size="sm" variant={choices[index]?.role === role.value && !choices[index]?.profileId ? "default" : "outline"} onClick={() => chooseRole(index, role.value)}>
                          {role.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {buckets.known.length > 0 ? (
              <Disclosure bare summary={`Already in your directory (${buckets.known.length})`} hint="left as they are">
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {buckets.known.map(({ row }) => (
                    <div key={row.existing!.id} style={{ ...rowCard, flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ minWidth: 0 }}>
                        <p className="text-sm font-semibold">{row.existing!.displayName}</p>
                        <p className="text-xs text-muted">
                          {row.normalizedPhone} · filed as {readable(row.existing!.role)}
                          {roleChanges[row.existing!.id] ? ` → ${readable(roleChanges[row.existing!.id])}` : ""}
                        </p>
                      </div>
                      <select
                        value={roleChanges[row.existing!.id] ?? ""}
                        aria-label={`Change the role for ${row.existing!.displayName}`}
                        onChange={(event) => {
                          const value = event.target.value;
                          setRoleChanges((current) => {
                            const next = { ...current };
                            if (!value) delete next[row.existing!.id];
                            else next[row.existing!.id] = value as AssignableRole;
                            return next;
                          });
                        }}
                        style={{ height: "32px", borderRadius: "8px", border: "1px solid var(--color-border)", padding: "0 8px" }}
                      >
                        <option value="">Keep {readable(row.existing!.role)}</option>
                        {ROLES.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </Disclosure>
            ) : null}

            {buckets.removed.length > 0 ? (
              <Disclosure bare summary={`Previously removed (${buckets.removed.length})`} hint="ignored unless you restore them">
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {buckets.removed.map(({ row }) => (
                    <div key={row.existing!.id} style={{ ...rowCard, flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ minWidth: 0 }}>
                        <p className="text-sm font-semibold">{row.existing!.displayName}</p>
                        <p className="text-xs text-muted">{row.normalizedPhone} · was {readable(row.existing!.role)}</p>
                      </div>
                      {restoring[row.existing!.id] ? (
                        <Button type="button" size="sm" variant="outline" onClick={() => setRestoring((current) => {
                          const next = { ...current };
                          delete next[row.existing!.id];
                          return next;
                        })}>
                          Cancel restore
                        </Button>
                      ) : (
                        <Button type="button" size="sm" onClick={() => setRestoring((current) => ({ ...current, [row.existing!.id]: "keep" }))}>
                          Restore
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </Disclosure>
            ) : null}

            {buckets.broken.length > 0 ? (
              <Disclosure bare summary={`Needs fixing (${buckets.broken.length})`} hint="skipped by this import">
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {buckets.broken.map(({ row }) => (
                    <div key={`${row.sourceIndex}-${row.rawPhone}`} style={rowCard}>
                      <p className="text-sm font-semibold">{row.displayName || "Unnamed contact"}</p>
                      <p className="text-sm text-muted">{row.rawPhone || "No phone number"}</p>
                      <p className="text-sm text-error">{readable(row.error ?? "")}</p>
                    </div>
                  ))}
                </div>
              </Disclosure>
            ) : null}

            {buckets.fresh.length > 0 ? (
              <label className="text-sm" style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
                I confirm these contacts agreed to receive MyInsightAcademy WhatsApp messages.
              </label>
            ) : null}

            <Button type="button" onClick={importContacts} disabled={loading || nothingToDo}>
              {loading ? "Importing…" : actionLabel}
            </Button>
          </div>
        ) : null}
        {status ? <p className={status.startsWith("Done") ? "text-sm text-success" : "text-sm text-error"}>{status}</p> : null}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/components/admin/hermes-contact-import.tsx`
Expected: PASS with no errors anywhere. This is the task that clears the errors Tasks 1-5 left behind.

- [ ] **Step 3: Verify in the browser**

Start the dev server and open the admin Kitty page, Contacts tab, "Import a contact file". Upload a `.vcf` where some numbers already exist in the directory. Confirm: the summary line counts each bucket; only new contacts show role buttons; the import button enables without touching the collapsed sections; the button label matches the work.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/hermes-contact-import.tsx
git commit -m "feat: ask only about new contacts when importing"
```

---

### Task 7: Directory editing, removal, and restore

**Files:**
- Modify: `src/app/(dashboard)/admin/hermes/page.tsx:41-45`
- Modify: `src/components/admin/hermes-dashboard-shared.tsx:2-16` (add `deleted_at` to `HermesContactIdentity`)
- Modify: `src/components/admin/hermes-contacts-panel.tsx`

**Interfaces:**
- Consumes: `DELETE` and `PATCH { restore: true }` from Task 4; the existing `PATCH { role }`, `{ displayName }`, `{ communicationPolicy }`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Load removed contacts**

In `src/app/(dashboard)/admin/hermes/page.tsx`, replace lines 41-45 with:

```typescript
      supabase
        .from("hermes_contacts")
        .select("id, display_name, preferred_name, whatsapp_e164, role, profile_id, profile_link_status, communication_policy, consent_status, timezone, updated_at, deleted_at")
        .order("display_name"),
```

The `is_active` and `deleted_at` filters are dropped so the panel can offer restore; the panel splits active from removed.

In `src/components/admin/hermes-dashboard-shared.tsx`, add to `HermesContactIdentity` after `updated_at: string;`:

```typescript
  /** Non-null means the contact was removed from the directory. */
  deleted_at: string | null;
```

- [ ] **Step 2: Add the row actions to the panel**

In `src/components/admin/hermes-contacts-panel.tsx`, replace the `lucide-react` import on line 5 with:

```tsx
import { Contact, Pencil, Search, Trash2 } from "lucide-react";
```

Then add this component above `HermesContactsPanel`:

```tsx
const ASSIGNABLE_ROLES = ["teacher", "student", "parent", "employee", "other"] as const;

/** Role, pause, and removal for one directory row. */
function ContactActions({ contact }: { contact: HermesAdminContact }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paused = contact.communication_policy === "paused";

  async function send(method: "PATCH" | "DELETE", body?: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/hermes/contacts/${contact.id}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "That change was not saved.");
        return;
      }
      router.refresh();
    } catch {
      setError("That change was not saved.");
    } finally {
      setBusy(false);
    }
  }

  if (contact.deleted_at) {
    return (
      <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => send("PATCH", { restore: true })}>
          Restore
        </Button>
        {error ? <span className="text-xs text-error">{error}</span> : null}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
      <select
        value={contact.role}
        disabled={busy}
        aria-label={`Role for ${contact.display_name}`}
        onChange={(event) => send("PATCH", { role: event.target.value })}
        style={{ height: "30px", borderRadius: "8px", border: "1px solid var(--color-border)", padding: "0 8px" }}
      >
        {contact.role === "unclassified" ? <option value="unclassified">Unclassified</option> : null}
        {ASSIGNABLE_ROLES.map((role) => <option key={role} value={role}>{readable(role)}</option>)}
      </select>
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => send("PATCH", { communicationPolicy: paused ? "direct" : "paused" })}>
        {paused ? "Resume" : "Pause"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy}
        aria-label={`Remove ${contact.display_name}`}
        onClick={() => {
          if (!window.confirm(`Remove ${contact.display_name} from the directory? Kitty will stop messaging them. Their message history is kept.`)) return;
          void send("DELETE");
        }}
      >
        <Trash2 size={14} />
      </Button>
      {error ? <span className="text-xs text-error">{error}</span> : null}
    </div>
  );
}
```

- [ ] **Step 3: Make the display name editable**

In `src/components/admin/hermes-contacts-panel.tsx`, add this component beside `MessagingName`:

```tsx
/** The contact's directory name. Unlike the messaging name, it cannot be empty. */
function DisplayName({ contact }: { contact: HermesAdminContact }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(contact.display_name);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Name cannot be empty.");
      return;
    }
    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/hermes/contacts/${contact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: trimmed }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "The name was not saved.");
        return;
      }
      setEditing(false);
      router.refresh();
    } catch {
      setError("The name was not saved.");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <p className="text-sm font-semibold text-navy">
        {contact.display_name}{" "}
        <button
          type="button"
          onClick={() => {
            setValue(contact.display_name);
            setError(null);
            setEditing(true);
          }}
          aria-label={`Edit the name for ${contact.display_name}`}
          style={{ background: "none", border: "none", cursor: "pointer", padding: "2px", color: "var(--color-slate)", verticalAlign: "middle" }}
        >
          <Pencil size={12} />
        </button>
      </p>
    );
  }

  return (
    <form onSubmit={save} style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
      <Input
        value={value}
        autoFocus
        maxLength={100}
        onChange={(event) => setValue(event.target.value)}
        aria-label={`Name for ${contact.display_name}`}
        style={{ height: "32px", width: "180px" }}
      />
      <Button type="submit" size="sm" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
      <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
      {error ? <span className="text-xs text-error">{error}</span> : null}
    </form>
  );
}
```

Render it in place of the plain `<p className="text-sm font-semibold text-navy">{contact.display_name}</p>` on the active-contact row (currently line 191):

```tsx
                  <DisplayName contact={contact} />
```

- [ ] **Step 4: Split active from removed in the panel**

In `HermesContactsPanel`, replace the `visible` memo and the list body so removed contacts get their own collapsed section:

```tsx
  const active = useMemo(() => contacts.filter((contact) => !contact.deleted_at), [contacts]);
  const removed = useMemo(() => contacts.filter((contact) => contact.deleted_at), [contacts]);

  const visible = useMemo(() => {
    if (!needle) return active;
    return active.filter(
      (contact) =>
        contact.display_name.toLowerCase().includes(needle) ||
        messagingName(contact).toLowerCase().includes(needle) ||
        contact.whatsapp_e164.toLowerCase().includes(needle),
    );
  }, [active, needle]);
```

Update the `PanelCard` description to count `active.length` instead of `contacts.length`, update the two empty-state checks to test `active.length === 0`, add `<ContactActions contact={contact} />` to each row's right-hand cluster, and add after the list:

```tsx
        {removed.length > 0 ? (
          <div style={{ marginTop: "16px" }}>
            <Disclosure bare summary={`Removed contacts (${removed.length})`} hint="Kitty does not message them">
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
                {removed.map((contact) => (
                  <li key={contact.id} className="border border-border" style={{ borderRadius: "10px", padding: "12px 14px", display: "flex", gap: "12px", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ minWidth: 0 }}>
                      <p className="text-sm font-semibold text-navy">{contact.display_name}</p>
                      <p className="text-xs text-muted">{contact.whatsapp_e164} · was {readable(contact.role)}</p>
                    </div>
                    <ContactActions contact={contact} />
                  </li>
                ))}
              </ul>
            </Disclosure>
          </div>
        ) : null}
```

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/components/admin src/app/\(dashboard\)/admin/hermes`
Expected: PASS with no errors.

- [ ] **Step 6: Verify in the browser**

On the admin Kitty page, Contacts tab: change a contact's role and confirm the badge updates after refresh; edit a display name; pause and resume a contact; remove a contact and confirm it leaves the list and appears under "Removed contacts"; restore it. Then re-import a `.vcf` containing the removed contact's number and confirm it lands in "Previously removed" rather than "New contacts".

- [ ] **Step 7: Run the full test suite**

Run: `node --test src/lib/hermes/*.test.cjs src/app/*.test.cjs src/lib/admin/*.test.cjs`
Expected: PASS, no failures.

- [ ] **Step 8: Commit**

```bash
git add src/components/admin/hermes-contacts-panel.tsx src/components/admin/hermes-dashboard-shared.tsx "src/app/(dashboard)/admin/hermes/page.tsx"
git commit -m "feat: edit, remove, and restore contacts in the directory"
```

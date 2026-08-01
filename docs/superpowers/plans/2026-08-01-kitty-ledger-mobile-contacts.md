# Kitty Ledger, Mobile Tabs & Contact Names Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/admin/hermes` usable on a phone and at scale — collapsible ledger rows, a wrapping mobile section bar, a searchable contact directory, and a short "messaging name" so WhatsApp stops greeting people as "Anjali Chemistry Teacher 12/15".

**Architecture:** Four independent changes. Three are presentation-only edits to existing components plus one CSS block. The fourth adds a nullable `preferred_name` column to `hermes_contacts`, resolved through one pure helper (`messagingName`) that every outbound-message path calls instead of reading `display_name` directly.

**Tech Stack:** Next.js 16 (App Router, server components by default), React 19, TypeScript, Supabase (Postgres + JS client), `node:test` with `.test.cjs` files, plain CSS in `src/app/globals.css`, inline styles in components.

**Spec:** `docs/superpowers/specs/2026-08-01-kitty-ledger-mobile-contacts-design.md`

## Global Constraints

- Tests run with `node --test 'src/**/*.test.cjs'`. Baseline before any change: **226 passing**. Every task must leave the suite green.
- `.test.cjs` files are CommonJS. Tests that import TypeScript use the `require.extensions[".ts"]` transpile shim — copy it verbatim from `src/lib/hermes/vcard.test.cjs`. Component tests instead read the source file as text and assert with regex; follow whichever idiom the neighbouring test uses.
- Type-check with `npx tsc --noEmit` and lint with `npm run lint` before the final commit.
- Server components are the default. Add `"use client"` only where the plan says to.
- Do **not** apply the migration to any Supabase project. Write the file only; applying it is the user's call.
- The working tree has unrelated uncommitted changes in `infra/hermes-plugins/`, `src/lib/hermes/lesson-ledger.ts`, `src/lib/hermes/cases.test.cjs`, `src/lib/hermes/lesson-ledger.test.cjs`, `src/app/api/hermes/tools/route.ts`, and `infra/hermes-profiles/default-insight/AGENTS.md`. **Never `git add -A` or `git commit -a`.** Stage only the exact paths each task names.
- `display_name` stays the name shown everywhere in the admin UI. Only outbound messages use the messaging name.

---

## File Structure

| File | Responsibility | Task |
| --- | --- | --- |
| `src/components/admin/hermes-dashboard-shared.tsx` | Tab list order; `preferred_name` on the contact type | 1, 5 |
| `src/components/admin/hermes-assistant-dashboard.tsx` | Rendered tab order | 1 |
| `src/components/admin/hermes-assistant-dashboard.test.cjs` | Tab order + CSS + accordion assertions | 1, 2, 3 |
| `src/app/globals.css` | Mobile chip grid | 2 |
| `src/components/admin/hermes-settlements-panel.tsx` | Per-tutor accordion rows | 3 |
| `src/lib/hermes/contact-name.ts` | **New.** `deriveMessagingName`, `messagingName` | 4 |
| `src/lib/hermes/contact-name.test.cjs` | **New.** Derivation unit tests | 4 |
| `supabase/migrations/20260801120000_add_hermes_contact_preferred_name.sql` | **New.** The column | 5 |
| `src/app/(dashboard)/admin/hermes/page.tsx` | Selects `preferred_name` | 5 |
| `src/app/api/admin/hermes/contacts/[id]/route.ts` | `preferredName` PATCH branch | 5 |
| `src/app/api/whatsapp/send/route.ts` | Uses `messagingName` for template recipients | 6 |
| `src/lib/hermes/cases.ts` | `projectContact` exposes `messagingName` to the agent | 6 |
| `src/app/api/hermes/tools/route.ts` | Selects `preferred_name` | 6 |
| `infra/hermes-profiles/default-insight/AGENTS.md` | Tells Kitty which name to use | 6 |
| `src/components/admin/hermes-contacts-panel.tsx` | Search + inline messaging-name edit | 7 |

Tasks 1–3 are presentation-only and independent of each other. Tasks 4→5→6→7 are a chain: the helper, then the column and API, then the message paths, then the UI.

---

### Task 1: Reorder the tabs

**Files:**
- Modify: `src/components/admin/hermes-dashboard-shared.tsx:71-77`
- Modify: `src/components/admin/hermes-assistant-dashboard.tsx:65-71`
- Test: `src/components/admin/hermes-assistant-dashboard.test.cjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `HERMES_TABS` order `["conversations", "ledger", "contacts", "scheduling", "attention"]`. `DEFAULT_HERMES_TAB` stays `"conversations"`. No type or function signature changes.

- [ ] **Step 1: Write the failing test**

Append to `src/components/admin/hermes-assistant-dashboard.test.cjs`:

```js
test("tab bar leads with the sections Swati opens most", () => {
  const shared = read("src/components/admin/hermes-dashboard-shared.tsx");
  const order = shared
    .match(/export const HERMES_TABS = \[([\s\S]*?)\] as const;/)[1]
    .match(/"([a-z]+)"/g)
    .map((quoted) => quoted.replaceAll('"', ""));
  assert.deepEqual(order, ["conversations", "ledger", "contacts", "scheduling", "attention"]);

  const shell = read("src/components/admin/hermes-assistant-dashboard.tsx");
  const rendered = [...shell.matchAll(/\{ id: "([a-z]+)", label:/g)].map((match) => match[1]);
  assert.deepEqual(rendered, order, "rendered tab order must match HERMES_TABS");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test src/components/admin/hermes-assistant-dashboard.test.cjs`
Expected: FAIL — the arrays are currently `conversations, attention, scheduling, ledger, contacts`.

- [ ] **Step 3: Reorder both literals**

In `src/components/admin/hermes-dashboard-shared.tsx`:

```ts
export const HERMES_TABS = [
  "conversations",
  "ledger",
  "contacts",
  "scheduling",
  "attention",
] as const;
```

In `src/components/admin/hermes-assistant-dashboard.tsx`, replace the `tabs` array with:

```tsx
  const tabs: Array<{ id: HermesTab; label: string; icon: React.ReactNode; count?: number }> = [
    { id: "conversations", label: "Conversations", icon: <Users size={16} />, count: contacts.length },
    { id: "ledger", label: "Ledger", icon: <Banknote size={16} />, count: lessonCycles.length + settlements.length },
    { id: "contacts", label: "Contacts", icon: <Contact size={16} /> },
    { id: "scheduling", label: "Scheduling", icon: <Clock3 size={16} />, count: cases.length },
    { id: "attention", label: "Needs attention", icon: <AlertCircle size={16} />, count: attentionCount },
  ];
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test src/components/admin/hermes-assistant-dashboard.test.cjs`
Expected: PASS, including the pre-existing "every section stays reachable from the tab bar" test.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/hermes-dashboard-shared.tsx src/components/admin/hermes-assistant-dashboard.tsx src/components/admin/hermes-assistant-dashboard.test.cjs
git commit -m "feat: reorder Kitty tabs to conversations, ledger, contacts"
```

---

### Task 2: Mobile chip grid

**Files:**
- Modify: `src/app/globals.css:246-255` (inside the `@media (max-width: 768px)` block)
- Test: `src/components/admin/hermes-assistant-dashboard.test.cjs`

**Interfaces:**
- Consumes: the base `.kitty-tabs` rule at `globals.css:183`, which already sets `display: flex; flex-wrap: wrap; gap: 6px`.
- Produces: no JS surface. Chips are `flex: 1 1 calc(50% - 3px)` under 768px.

- [ ] **Step 1: Write the failing test**

Append to `src/components/admin/hermes-assistant-dashboard.test.cjs`:

```js
test("the phone tab bar wraps into a grid instead of scrolling sideways", () => {
  const css = read("src/app/globals.css");
  const mobile = css.slice(css.indexOf("@media (max-width: 768px)"));
  const tabRules = mobile.slice(mobile.indexOf(".kitty-tabs"));
  assert.doesNotMatch(tabRules, /overflow-x:\s*auto/);
  assert.doesNotMatch(tabRules, /flex-wrap:\s*nowrap/);
  assert.match(tabRules, /flex:\s*1 1 calc\(50% - 3px\)/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test src/components/admin/hermes-assistant-dashboard.test.cjs`
Expected: FAIL — `overflow-x: auto` is still present.

- [ ] **Step 3: Replace the mobile rules**

In `src/app/globals.css`, inside `@media (max-width: 768px)`, delete this entire block:

```css
  .kitty-tabs {
    flex-wrap: nowrap;
    overflow-x: auto;
    /* Momentum scrolling shouldn't clip the focus ring on the first chip. */
    scroll-padding-inline: 4px;
  }

  .kitty-tabs > * {
    flex-shrink: 0;
  }
```

and put this in its place:

```css
  /* Two columns beat a sideways-scrolling strip on a phone: every section
     stays visible and one tap away. 3px is half the 6px flex gap. */
  .kitty-tabs > * {
    flex: 1 1 calc(50% - 3px);
    justify-content: center;
  }
```

The base `.kitty-tabs` rule outside the media query is unchanged — it already wraps, so five chips lay out 2 / 2 / 1 and the lone fifth chip grows to full width.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test src/components/admin/hermes-assistant-dashboard.test.cjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css src/components/admin/hermes-assistant-dashboard.test.cjs
git commit -m "fix: wrap Kitty tabs into a grid on phones"
```

---

### Task 3: Ledger accordion rows

**Files:**
- Modify: `src/components/admin/hermes-settlements-panel.tsx:128-252`
- Test: `src/components/admin/hermes-assistant-dashboard.test.cjs`

**Interfaces:**
- Consumes: `AdminTeacherCollection` from `src/lib/hermes/lesson-ledger-admin.ts` — `{ id, tutorContactId, tutorName, status, requestDeliveryStatus, requestFailure, report }`, where `report` is `{ id, revision, status, sourceChannel, submittedAt, confirmedAt, lessons }` or `null`, and each lesson is `{ id, reportedStudentName, studentName, lessonDate, durationMinutes, subject }`.
- Produces: no exported surface change. `HermesSettlementsPanel` keeps its props.

- [ ] **Step 1: Write the failing test**

Append to `src/components/admin/hermes-assistant-dashboard.test.cjs`:

```js
test("each tutor in the lesson ledger collapses to a summary row", () => {
  const panel = read("src/components/admin/hermes-settlements-panel.tsx");
  assert.match(panel, /unresolvedCount/, "summary must count unresolved students");
  assert.match(panel, /awaiting report/, "a tutor with no report says so on the row");
  assert.match(panel, /delivery failed/, "a failed request is visible while collapsed");
  const collectionBlock = panel.slice(panel.indexOf("cycle.collections.map"));
  assert.match(collectionBlock.slice(0, 400), /<details/, "collections render as <details>");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test src/components/admin/hermes-assistant-dashboard.test.cjs`
Expected: FAIL — collections currently render as `<section>` and nothing counts unresolved students.

- [ ] **Step 3: Replace the collection renderer**

In `src/components/admin/hermes-settlements-panel.tsx`, replace the whole `{cycle.collections.map((collection) => { ... })}` callback. The opening of the callback becomes:

```tsx
                    {cycle.collections.map((collection) => {
                      const report = collection.report;
                      const lessons = report?.lessons ?? [];
                      const unresolvedCount = lessons.filter(
                        (lesson) => lesson.studentName === null,
                      ).length;
                      const deliveryFailed =
                        collection.requestDeliveryStatus === "failed";
                      return (
                        <details
                          key={collection.id}
                          className="border border-border"
                          style={{
                            borderRadius: "8px",
                            padding: "12px",
                            background: "var(--color-background)",
                          }}
                        >
                          <summary style={{ cursor: "pointer" }}>
                            <span
                              style={{
                                display: "inline-flex",
                                width: "calc(100% - 24px)",
                                flexWrap: "wrap",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: "8px",
                                verticalAlign: "middle",
                              }}
                            >
                              <span className="text-sm font-semibold text-navy">
                                {collection.tutorName || "Tutor unavailable"}
                              </span>
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  flexWrap: "wrap",
                                  gap: "8px",
                                }}
                              >
                                <span className="text-xs text-muted">
                                  {report === null
                                    ? "awaiting report"
                                    : `${lessons.length} ${lessons.length === 1 ? "lesson" : "lessons"}`}
                                </span>
                                {unresolvedCount > 0 ? (
                                  <span className="text-xs text-error">
                                    {unresolvedCount} unresolved
                                  </span>
                                ) : null}
                                {deliveryFailed ? (
                                  <span className="text-xs text-error">
                                    delivery failed
                                  </span>
                                ) : null}
                                <Badge>{humanize(collection.status)}</Badge>
                              </span>
                            </span>
                          </summary>

                          <div style={{ marginTop: "12px" }}>
```

Everything from the existing `<p className="text-xs text-muted">Request delivery:` line down to the close of the report block stays **exactly as it is today** — only its wrapper changes. The old `<h3>` name line and its sibling `<Badge>` (the flex row directly under the old `<section>` tag) are deleted, because the summary now carries both.

The callback closes with:

```tsx
                          </div>
                        </details>
                      );
                    })}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test src/components/admin/hermes-assistant-dashboard.test.cjs`
Expected: PASS.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/hermes-settlements-panel.tsx src/components/admin/hermes-assistant-dashboard.test.cjs
git commit -m "feat: collapse ledger tutors into summary rows"
```

---

### Task 4: The messaging-name helper

**Files:**
- Create: `src/lib/hermes/contact-name.ts`
- Test: `src/lib/hermes/contact-name.test.cjs`

**Interfaces:**
- Consumes: nothing. Pure functions, no imports, safe in both server and client components.
- Produces:
  - `deriveMessagingName(displayName: string): string`
  - `messagingName(contact: MessagingNameContact): string`
  - `interface MessagingNameContact { display_name: string; preferred_name?: string | null }`

- [ ] **Step 1: Write the failing test**

Create `src/lib/hermes/contact-name.test.cjs`:

```js
/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = function compileTypeScript(module, filename) {
  let source = fs.readFileSync(filename, "utf8");
  source = source.replace(/from\s+["']\.\/([^"']+)["']/g, (match, target) =>
    match.replace(`./${target}`, `./${target}.ts`),
  );
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  module._compile(output.outputText, filename);
};

const { deriveMessagingName, messagingName } = require(path.join(__dirname, "contact-name.ts"));

test("takes the first word of a name padded with Swati's own notes", () => {
  assert.equal(deriveMessagingName("Anjali Chemistry Teacher 12/15"), "Anjali");
  assert.equal(deriveMessagingName("Ravi"), "Ravi");
  assert.equal(deriveMessagingName("Ravi Uncle"), "Ravi");
});

test("keeps an address title attached to the name after it", () => {
  assert.equal(deriveMessagingName("Dr. Sharma"), "Dr. Sharma");
  assert.equal(deriveMessagingName("Dr Sharma"), "Dr Sharma");
  assert.equal(deriveMessagingName("Mrs Kulkarni Maths"), "Mrs Kulkarni");
  assert.equal(deriveMessagingName("Prof. Iyer"), "Prof. Iyer");
});

test("drops qualification prefixes and trailing honorifics", () => {
  assert.equal(deriveMessagingName("C.A. Ritesh Sir"), "Ritesh");
  assert.equal(deriveMessagingName("CA Ritesh"), "Ritesh");
  assert.equal(deriveMessagingName("Priya Ma'am"), "Priya");
  assert.equal(deriveMessagingName("Adv Nikhil ji"), "Nikhil");
});

test("falls back to the original when stripping would leave nothing", () => {
  assert.equal(deriveMessagingName("Sir"), "Sir");
  assert.equal(deriveMessagingName("   "), "");
  assert.equal(deriveMessagingName("  Meera  "), "Meera");
});

test("an explicit preferred name always wins", () => {
  assert.equal(
    messagingName({ display_name: "Anjali Chemistry Teacher 12/15", preferred_name: "Anju" }),
    "Anju",
  );
  assert.equal(
    messagingName({ display_name: "Anjali Chemistry Teacher 12/15", preferred_name: null }),
    "Anjali",
  );
  assert.equal(messagingName({ display_name: "C.A. Ritesh Sir" }), "Ritesh");
  assert.equal(
    messagingName({ display_name: "C.A. Ritesh Sir", preferred_name: "   " }),
    "Ritesh",
    "a whitespace-only override is not an override",
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test src/lib/hermes/contact-name.test.cjs`
Expected: FAIL — `Cannot find module .../contact-name.ts`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/hermes/contact-name.ts`:

```ts
/**
 * Swati saves contacts on her phone with notes to herself —
 * "Anjali Chemistry Teacher 12/15", "C.A. Ritesh Sir". That full string is the
 * name the admin UI shows, but it is not what a WhatsApp greeting should say.
 * This derives a sane default; an admin can override it per contact.
 */

/** Qualifications sitting in front of a given name. Dropped. */
const QUALIFICATION_PREFIXES = new Set(["ca", "er", "adv", "advocate", "eng", "engr", "cs", "cma"]);

/** Respectful suffixes. Dropped. */
const TRAILING_HONORIFICS = new Set(["sir", "madam", "maam", "mam", "ji"]);

/**
 * Forms of address. Kept, together with the word after them — dropping one
 * leaves a bare surname that reads wrong in a greeting ("Hi Sharma").
 */
const ADDRESS_TITLES = new Set(["dr", "mr", "mrs", "ms", "miss", "prof"]);

function normalize(token: string) {
  return token.toLowerCase().replaceAll(".", "").replaceAll("'", "").replaceAll("\u2019", "");
}

export function deriveMessagingName(displayName: string): string {
  const tokens = displayName.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "";

  let start = 0;
  while (start < tokens.length && QUALIFICATION_PREFIXES.has(normalize(tokens[start]))) {
    start += 1;
  }

  let end = tokens.length;
  while (end > start && TRAILING_HONORIFICS.has(normalize(tokens[end - 1]))) {
    end -= 1;
  }

  // Nothing survived — the whole name was titles. Keep it rather than send "".
  if (start >= end) return tokens[0];

  const first = tokens[start];
  if (ADDRESS_TITLES.has(normalize(first)) && start + 1 < end) {
    return `${first} ${tokens[start + 1]}`;
  }
  return first;
}

export interface MessagingNameContact {
  display_name: string;
  preferred_name?: string | null;
}

/** The name Kitty says out loud. Never `display_name` directly. */
export function messagingName(contact: MessagingNameContact): string {
  const preferred = contact.preferred_name?.trim();
  return preferred ? preferred : deriveMessagingName(contact.display_name);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test src/lib/hermes/contact-name.test.cjs`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/hermes/contact-name.ts src/lib/hermes/contact-name.test.cjs
git commit -m "feat: derive a messaging name from an imported contact name"
```

---

### Task 5: The column, the API, and the page query

**Files:**
- Create: `supabase/migrations/20260801120000_add_hermes_contact_preferred_name.sql`
- Modify: `src/components/admin/hermes-dashboard-shared.tsx:3-14` (`HermesContactIdentity`)
- Modify: `src/app/(dashboard)/admin/hermes/page.tsx:42`
- Modify: `src/app/api/admin/hermes/contacts/[id]/route.ts`
- Test: `src/app/api/admin/hermes/contacts/route.test.cjs` (create)

**Interfaces:**
- Consumes: nothing from Task 4 (the column is independent of the helper).
- Produces: `hermes_contacts.preferred_name text null`; `HermesContactIdentity.preferred_name: string | null`; `PATCH /api/admin/hermes/contacts/[id]` accepting `{ preferredName: string | null }`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260801120000_add_hermes_contact_preferred_name.sql`:

```sql
-- The name Kitty uses when addressing a contact in an outbound message.
-- Null means "derive it from display_name" (see src/lib/hermes/contact-name.ts).
-- Deliberately not backfilled: a derived default self-corrects when
-- display_name is fixed, and clearing an override returns to that default.
alter table public.hermes_contacts
  add column if not exists preferred_name text;

alter table public.hermes_contacts
  drop constraint if exists hermes_contacts_preferred_name_length;

alter table public.hermes_contacts
  add constraint hermes_contacts_preferred_name_length
  check (
    preferred_name is null
    or length(btrim(preferred_name)) between 1 and 100
  );
```

- [ ] **Step 2: Write the failing test**

Create `src/app/api/admin/hermes/contacts/route.test.cjs`:

```js
/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

function read(relative) {
  return fs.readFileSync(path.join(process.cwd(), relative), "utf8");
}

test("the contact PATCH route accepts a messaging name and a reset", () => {
  const route = read("src/app/api/admin/hermes/contacts/[id]/route.ts");
  assert.match(route, /body\.preferredName !== undefined/);
  assert.match(route, /update\.preferred_name = null/, "null clears the override");
  assert.match(route, /update\.preferred_name = preferred/, "a string sets it");
  assert.match(route, /select\("id, display_name, preferred_name/, "the response carries it back");
});

test("the migration adds a nullable, length-checked preferred_name", () => {
  const migration = read("supabase/migrations/20260801120000_add_hermes_contact_preferred_name.sql");
  assert.match(migration, /add column if not exists preferred_name text/);
  assert.match(migration, /between 1 and 100/);
  assert.doesNotMatch(migration, /update public\.hermes_contacts/, "must not backfill");
});

test("the admin page and shared type carry preferred_name", () => {
  assert.match(
    read("src/app/(dashboard)/admin/hermes/page.tsx"),
    /id, display_name, preferred_name, whatsapp_e164/,
  );
  assert.match(
    read("src/components/admin/hermes-dashboard-shared.tsx"),
    /preferred_name: string \| null;/,
  );
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test src/app/api/admin/hermes/contacts/route.test.cjs`
Expected: FAIL on the route and page assertions (the migration test passes — Step 1 already wrote it).

- [ ] **Step 4: Add the PATCH branch**

In `src/app/api/admin/hermes/contacts/[id]/route.ts`, directly after the `displayName` block (which ends `update.display_name = name;` and its closing brace), insert:

```ts
  if (body.preferredName !== undefined) {
    if (body.preferredName === null) {
      update.preferred_name = null;
    } else if (typeof body.preferredName === "string") {
      const preferred = body.preferredName.trim();
      if (!preferred || preferred.length > 100) {
        return NextResponse.json({ error: "Messaging name must be 1-100 characters." }, { status: 400 });
      }
      update.preferred_name = preferred;
    } else {
      return NextResponse.json({ error: "Invalid messaging name." }, { status: 400 });
    }
  }
```

Then widen the response select on the update call:

```ts
  const { data, error } = await supabase.from("hermes_contacts").update(update).eq("id", id).is("deleted_at", null).select("id, display_name, preferred_name, role, profile_id, communication_policy").maybeSingle();
```

- [ ] **Step 5: Select the column on the admin page**

In `src/app/(dashboard)/admin/hermes/page.tsx`, change the contacts select string to:

```ts
        .select("id, display_name, preferred_name, whatsapp_e164, role, profile_id, profile_link_status, communication_policy, consent_status, timezone, updated_at")
```

In `src/components/admin/hermes-dashboard-shared.tsx`, add the field to `HermesContactIdentity` under `display_name`:

```ts
  display_name: string;
  preferred_name: string | null;
```

- [ ] **Step 6: Run the tests and type-check**

Run: `node --test src/app/api/admin/hermes/contacts/route.test.cjs`
Expected: PASS, 3 tests.

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260801120000_add_hermes_contact_preferred_name.sql "src/app/(dashboard)/admin/hermes/page.tsx" src/components/admin/hermes-dashboard-shared.tsx "src/app/api/admin/hermes/contacts/[id]/route.ts" src/app/api/admin/hermes/contacts/route.test.cjs
git commit -m "feat: add an editable messaging name to Kitty contacts"
```

---

### Task 6: Send the messaging name, not the display name

**Files:**
- Modify: `src/app/api/whatsapp/send/route.ts:23-25, 47, 74, 99, 102`
- Modify: `src/lib/hermes/cases.ts:88-110`
- Modify: `src/app/api/hermes/tools/route.ts:23`
- Modify: `infra/hermes-profiles/default-insight/AGENTS.md`
- Test: `src/lib/hermes/messaging-name-usage.test.cjs` (create)

**Interfaces:**
- Consumes: `messagingName` and `MessagingNameContact` from Task 4; `preferred_name` from Task 5.
- Produces: `projectContact` output gains a `messagingName: string` field alongside the existing `displayName`.

**Careful:** `src/app/api/hermes/tools/route.ts` and `infra/hermes-profiles/default-insight/AGENTS.md` have unrelated uncommitted edits. Change only the lines named here and stage only these paths.

- [ ] **Step 1: Write the failing test**

Create `src/lib/hermes/messaging-name-usage.test.cjs`:

```js
/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

function read(relative) {
  return fs.readFileSync(path.join(process.cwd(), relative), "utf8");
}

test("no WhatsApp template greets a contact with their raw display name", () => {
  const route = read("src/app/api/whatsapp/send/route.ts");
  assert.doesNotMatch(route, /recipientName: contact\.display_name/);
  assert.doesNotMatch(route, /buildLessonReportRequestContent\([^)]*contact\.display_name/);
  assert.doesNotMatch(route, /validateSchedulingBodyParameters\([^,]+, contact\.display_name/);
  assert.match(route, /const recipientName = messagingName\(contact\)/);
  assert.match(route, /select\("id, display_name, preferred_name/);
});

test("the agent is handed a messagingName and told to use it", () => {
  const cases = read("src/lib/hermes/cases.ts");
  assert.match(cases, /messagingName: messagingName\(contact\)/);
  assert.match(read("src/app/api/hermes/tools/route.ts"), /display_name, preferred_name/);
  assert.match(
    read("infra/hermes-profiles/default-insight/AGENTS.md"),
    /messagingName/,
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test src/lib/hermes/messaging-name-usage.test.cjs`
Expected: FAIL — every recipient today is `contact.display_name`.

- [ ] **Step 3: Update the send route**

In `src/app/api/whatsapp/send/route.ts`, add the import beside the other `@/lib/hermes` imports:

```ts
import { messagingName } from "@/lib/hermes/contact-name";
```

Widen the contact select:

```ts
      .select("id, display_name, preferred_name, role, whatsapp_e164, communication_policy, consent_status, service_window_expires_at")
```

Immediately after the `if (!contact) return NextResponse.json({ error: "Contact unavailable" }, { status: 404 });` line, add:

```ts
  const recipientName = messagingName(contact);
```

Then replace all four recipient arguments:

| Was | Becomes |
| --- | --- |
| `buildLessonReportRequestContent(cycle.period_start, contact.display_name)` | `buildLessonReportRequestContent(cycle.period_start, recipientName)` |
| `recipientName: contact.display_name,` (in the family-invoice `buildSettlementMessageContent` call) | `recipientName,` |
| `buildSchedulingMessageContent({ intent: body.intent, recipientName: contact.display_name, templateData: body.templateData })` | `buildSchedulingMessageContent({ intent: body.intent, recipientName, templateData: body.templateData })` |
| `validateSchedulingBodyParameters(body.intent, contact.display_name, body.bodyParameters ?? [])` | `validateSchedulingBodyParameters(body.intent, recipientName, body.bodyParameters ?? [])` |

- [ ] **Step 4: Expose the name to the agent**

In `src/lib/hermes/cases.ts`, import the helper at the top:

```ts
import { messagingName } from "./contact-name";
```

Add the field to `ContactRecord`:

```ts
interface ContactRecord {
  id: string;
  display_name: string;
  preferred_name?: string | null;
  role: string;
  timezone: string | null;
  communication_policy: string;
  consent_status: string;
  is_active?: boolean;
}
```

and to `projectContact`'s return, directly under `displayName`:

```ts
    displayName: contact.display_name,
    messagingName: messagingName(contact),
```

In `src/app/api/hermes/tools/route.ts`, extend one constant only:

```ts
const CONTACT_FIELDS = "id, display_name, preferred_name, role, timezone, communication_policy, consent_status, is_active";
```

In `infra/hermes-profiles/default-insight/AGENTS.md`, append one bullet to the existing list:

```markdown
- Address a contact by their `messagingName`, never `displayName`. `displayName` is how Swati filed them in her phone and often carries her own notes ("Anjali Chemistry Teacher 12/15"); `messagingName` is the name they should be greeted by.
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test src/lib/hermes/messaging-name-usage.test.cjs`
Expected: PASS, 2 tests.

Run: `node --test 'src/**/*.test.cjs'`
Expected: all pass — `cases.test.cjs` exercises `projectContact`, so confirm the added field breaks no existing assertion. If one fails on an exact-object comparison, update that assertion to include `messagingName`.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/whatsapp/send/route.ts src/lib/hermes/cases.ts src/app/api/hermes/tools/route.ts infra/hermes-profiles/default-insight/AGENTS.md src/lib/hermes/messaging-name-usage.test.cjs
git commit -m "feat: greet contacts by their messaging name in WhatsApp"
```

---

### Task 7: Searchable contact directory with inline name editing

**Files:**
- Modify: `src/components/admin/hermes-contacts-panel.tsx` (full rewrite)
- Test: `src/components/admin/hermes-contacts-panel.test.cjs` (create)

**Interfaces:**
- Consumes: `messagingName` from Task 4; `HermesAdminContact` (now with `preferred_name`) from Task 5; the `preferredName` PATCH branch from Task 5.
- Produces: no export change — `HermesContactsPanel({ contacts })` keeps its signature, so `hermes-assistant-dashboard.tsx` needs no edit.

- [ ] **Step 1: Write the failing test**

Create `src/components/admin/hermes-contacts-panel.test.cjs`:

```js
/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

function read(relative) {
  return fs.readFileSync(path.join(process.cwd(), relative), "utf8");
}

test("the contact directory is searchable and editable", () => {
  const panel = read("src/components/admin/hermes-contacts-panel.tsx");
  assert.match(panel, /^"use client";/, "search needs client state");
  assert.match(panel, /Search contacts/, "there is a search box");
  assert.match(panel, /display_name\.toLowerCase\(\)\.includes\(needle\)/);
  assert.match(panel, /whatsapp_e164\.toLowerCase\(\)\.includes\(needle\)/);
  assert.match(panel, /messagingName\(contact\)/, "search and display resolve the messaging name");
  assert.match(panel, /method: "PATCH"/);
  assert.match(panel, /preferredName: trimmed === "" \? null : trimmed/, "clearing resets to the derived default");
  assert.doesNotMatch(panel, /Read-only/, "the directory is no longer read-only");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test src/components/admin/hermes-contacts-panel.test.cjs`
Expected: FAIL — the panel is a read-only server component.

- [ ] **Step 3: Rewrite the panel**

Replace the entire contents of `src/components/admin/hermes-contacts-panel.tsx`:

```tsx
"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Contact, Pencil, Search } from "lucide-react";

import { HermesContactImport } from "@/components/admin/hermes-contact-import";
import { HermesContactQuickAdd } from "@/components/admin/hermes-contact-quick-add";
import {
  Disclosure,
  Empty,
  PanelCard,
  type HermesAdminContact,
} from "@/components/admin/hermes-dashboard-shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { messagingName } from "@/lib/hermes/contact-name";

function readable(value: string) {
  return value.replaceAll("_", " ");
}

/**
 * The name Kitty greets this contact by. Muted while it is still derived from
 * `display_name`, so an admin can see at a glance which ones were chosen.
 */
function MessagingName({ contact }: { contact: HermesAdminContact }) {
  const router = useRouter();
  const resolved = messagingName(contact);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(resolved);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    const trimmed = value.trim();

    try {
      const response = await fetch(`/api/admin/hermes/contacts/${contact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferredName: trimmed === "" ? null : trimmed }),
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
      <p className="text-xs text-muted" style={{ marginTop: "2px" }}>
        Messages as{" "}
        <span className={contact.preferred_name ? "text-navy font-semibold" : undefined}>
          {resolved}
        </span>{" "}
        <button
          type="button"
          onClick={() => {
            setValue(resolved);
            setError(null);
            setEditing(true);
          }}
          aria-label={`Edit the messaging name for ${contact.display_name}`}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "2px",
            color: "var(--color-slate)",
            verticalAlign: "middle",
          }}
        >
          <Pencil size={12} />
        </button>
      </p>
    );
  }

  return (
    <form onSubmit={save} style={{ marginTop: "4px", display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
      <Input
        value={value}
        autoFocus
        maxLength={100}
        onChange={(event) => setValue(event.target.value)}
        aria-label={`Messaging name for ${contact.display_name}`}
        placeholder={deriveHint(contact)}
        style={{ height: "32px", width: "160px" }}
      />
      <Button type="submit" disabled={saving} style={{ height: "32px" }}>
        {saving ? "Saving…" : "Save"}
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={() => setEditing(false)}
        style={{ height: "32px" }}
      >
        Cancel
      </Button>
      {error ? <span className="text-xs text-error">{error}</span> : null}
    </form>
  );
}

/** Empty input resets to this. */
function deriveHint(contact: HermesAdminContact) {
  return messagingName({ display_name: contact.display_name, preferred_name: null });
}

export function HermesContactsPanel({ contacts }: { contacts: HermesAdminContact[] }) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();

  const visible = useMemo(() => {
    if (!needle) return contacts;
    return contacts.filter(
      (contact) =>
        contact.display_name.toLowerCase().includes(needle) ||
        messagingName(contact).toLowerCase().includes(needle) ||
        contact.whatsapp_e164.toLowerCase().includes(needle),
    );
  }, [contacts, needle]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <Disclosure bare summary="Add a contact" hint="one WhatsApp number at a time">
        <HermesContactQuickAdd />
      </Disclosure>

      <Disclosure bare summary="Import a contact file" hint="upload an academy-only .vcf">
        <HermesContactImport />
      </Disclosure>

      <PanelCard
        icon={<Contact size={18} />}
        title="Contact directory"
        description={
          needle
            ? `${visible.length} of ${contacts.length} contacts`
            : `${contacts.length} active contacts`
        }
      >
        <div style={{ position: "relative", marginBottom: "12px" }}>
          <Search
            size={16}
            style={{
              position: "absolute",
              left: "10px",
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--color-muted)",
              pointerEvents: "none",
            }}
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search contacts by name or number…"
            aria-label="Search contacts"
            style={{ paddingLeft: "32px" }}
          />
        </div>

        {contacts.length === 0 ? (
          <Empty>No contacts yet. Add one or import a contact file above.</Empty>
        ) : visible.length === 0 ? (
          <Empty>No contacts match that search.</Empty>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
            {visible.map((contact) => (
              <li
                key={contact.id}
                className="border border-border"
                style={{ borderRadius: "10px", padding: "12px 14px", display: "flex", gap: "12px", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}
              >
                <div style={{ minWidth: 0 }}>
                  <p className="text-sm font-semibold text-navy">{contact.display_name}</p>
                  <p className="text-xs text-muted">{contact.whatsapp_e164}</p>
                  <MessagingName contact={contact} />
                </div>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
                  <Badge>{readable(contact.role)}</Badge>
                  <span className="text-xs text-muted">
                    Insight link: {readable(contact.profile_link_status)} · Messaging: {readable(contact.communication_policy)} · Consent: {readable(contact.consent_status)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </PanelCard>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test src/components/admin/hermes-contacts-panel.test.cjs`
Expected: PASS.

- [ ] **Step 5: Type-check and lint**

Run: `npx tsc --noEmit`
Expected: no output.

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/hermes-contacts-panel.tsx src/components/admin/hermes-contacts-panel.test.cjs
git commit -m "feat: search contacts and edit their messaging name"
```

---

### Task 8: Full verification

**Files:** none modified.

- [ ] **Step 1: Run the whole suite**

Run: `node --test 'src/**/*.test.cjs'`
Expected: 0 failures, and a total of at least 226 + the new tests.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: a successful build. `hermes-contacts-panel.tsx` is now a client component — confirm the build does not complain about a server-only import reaching it.

- [ ] **Step 5: Report**

State the exact test count, and state plainly that the migration has **not** been applied to any Supabase project and that `/admin/hermes` has not been checked against a running server.

---

## Out of Scope

- Backfilling `preferred_name`.
- Changing which name the admin UI displays.
- Editing role, policy, or profile links from the directory.
- The Financial settlements card and any ledger data loading.
- Applying the migration or deploying.

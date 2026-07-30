# Kitty Combined Lesson Ledger Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show Kitty's deployed flexible lesson ledger to authenticated MyInsightAcademy administrators in a combined Ledger tab while preserving the existing financial-settlement view.

**Architecture:** Add one server-only query/projection module that loads the recent lesson cycles and their dependent collections, active report revisions, lesson rows, contact labels, and report-request delivery records. The existing admin Server Component passes that minimized projection into a read-only combined panel; no client state, mutation route, schema change, or new dependency is required.

**Tech Stack:** Next.js 16.2 Server Components, React 19.2, TypeScript, Supabase/Postgres, Node test runner, Python `unittest`

## Global Constraints

- Work only in the isolated `codex/kitty-combined-ledger-admin` worktree.
- Keep `/admin/hermes` admin-only and call `requireRole(["admin"])` before creating the service-role client.
- Load at most twelve recent lesson cycles with explicit database columns.
- Display only the active report revision for each tutor collection.
- Never expose phone numbers, transcripts, prompts, reasoning, tool data, credentials, or raw session data in the ledger projection.
- Keep the admin surface read-only; add no send, edit, calculation, approval, or money-moving controls.
- Preserve the existing financial settlement panel below the lesson collection view.
- Add no runtime dependency.
- Follow red-green-refactor for every production change.

---

### Task 1: Build the Admin Lesson-Ledger Projection

**Files:**
- Create: `src/lib/hermes/lesson-ledger-admin.ts`
- Create: `src/lib/hermes/lesson-ledger-admin.test.cjs`

**Interfaces:**
- Consumes: the existing server-only Supabase admin client and raw rows from `academy_lesson_cycles`, `academy_teacher_collections`, `academy_lesson_report_revisions`, `academy_lessons`, and `hermes_messages`.
- Produces: `loadAdminLessonCycles(supabase): Promise<AdminLessonCycle[]>`.
- Produces: `projectAdminLessonCycles(input): AdminLessonCycle[]` for deterministic unit testing.

- [ ] **Step 1: Write failing projection tests**

Create a TypeScript-loading Node test with fixtures for two lesson cycles. Assert:

```js
const projected = projectAdminLessonCycles({
  cycles,
  collections,
  reports,
  lessons,
  deliveryMessages,
});

assert.equal(projected[0].selectedTutorCount, 2);
assert.equal(projected[0].confirmedReportCount, 1);
assert.equal(projected[0].lessonCount, 3);
assert.equal(projected[0].unresolvedCount, 1);
assert.equal(projected[0].collections[0].tutorName, "Teacher A");
assert.equal(projected[0].collections[0].report.revision, 2);
assert.deepEqual(
  projected[0].collections[0].report.lessons.map((lesson) => lesson.lessonDate),
  ["2026-07-03", "2026-07-10"],
);
```

Include a superseded revision and prove it is excluded. Include a missing tutor relation and expect `Tutor unavailable`. Include an unresolved student and expect `studentName: null`. Include a confirmed report with zero lessons and prove `report.lessons` is an empty array rather than a missing report. Include failed then successful report-request messages and prove only the newest delivery state is projected.

- [ ] **Step 2: Run the new test and verify RED**

Run:

```bash
node --test src/lib/hermes/lesson-ledger-admin.test.cjs
```

Expected: FAIL because `lesson-ledger-admin.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure projection**

Create these public shapes:

```ts
export interface AdminLesson {
  id: string;
  reportedStudentName: string;
  studentName: string | null;
  lessonDate: string;
  durationMinutes: number;
  subject: string | null;
}

export interface AdminLessonReport {
  id: string;
  revision: number;
  status: string;
  sourceChannel: string;
  submittedAt: string;
  confirmedAt: string | null;
  lessons: AdminLesson[];
}

export interface AdminTeacherCollection {
  id: string;
  tutorContactId: string;
  tutorName: string;
  status: string;
  requestDeliveryStatus: string | null;
  requestFailure: string | null;
  report: AdminLessonReport | null;
}

export interface AdminLessonCycle {
  id: string;
  periodStart: string;
  status: string;
  version: number;
  confirmedAt: string | null;
  updatedAt: string;
  selectedTutorCount: number;
  confirmedReportCount: number;
  lessonCount: number;
  unresolvedCount: number;
  collections: AdminTeacherCollection[];
}
```

`projectAdminLessonCycles` must:

- sort cycles newest first;
- exclude every report with `status === "superseded"`;
- select the highest active revision per collection;
- sort collections by tutor name and lessons by date, reported name, then ID;
- count confirmed collections, all active lessons, and lessons without a resolved student;
- select the latest delivery message for each cycle/contact pair by `occurred_at`, then ID;
- expose `error_detail` only when the latest request status is `failed`; and
- use `Tutor unavailable` for a missing historical tutor relation.

- [ ] **Step 4: Run the projection test and verify GREEN**

Run:

```bash
node --test src/lib/hermes/lesson-ledger-admin.test.cjs
```

Expected: PASS.

- [ ] **Step 5: Add a failing loader contract test**

Read `lesson-ledger-admin.ts` and assert it contains explicit bounded queries for:

```text
academy_lesson_cycles
academy_teacher_collections
academy_lesson_report_revisions
academy_lessons
hermes_messages
```

Assert the cycle query contains `.limit(12)`, the report request query binds `intent = lesson_report_request`, and no query selects `whatsapp_e164`, transcript bodies, prompts, tokens, or raw session data.

- [ ] **Step 6: Run the loader contract test and verify RED**

Run:

```bash
node --test src/lib/hermes/lesson-ledger-admin.test.cjs
```

Expected: FAIL because `loadAdminLessonCycles` and its queries are absent.

- [ ] **Step 7: Implement the server-only loader**

Use:

```ts
type AdminClient = ReturnType<typeof createAdminClient>;

export async function loadAdminLessonCycles(
  supabase: AdminClient,
): Promise<AdminLessonCycle[]>
```

Load cycles first:

```ts
supabase
  .from("academy_lesson_cycles")
  .select("id, period_start, status, version, confirmed_at, updated_at")
  .order("period_start", { ascending: false })
  .limit(12)
```

Return `[]` immediately when no cycles exist. Otherwise load collections by cycle ID with the tutor relation, active reports by collection ID, lessons by active report ID with the resolved student relation, and report-request messages by cycle ID. Guard every empty ID list before calling `.in(...)`. Throw `lesson_ledger_unavailable` on any query error and pass the raw rows into `projectAdminLessonCycles`.

- [ ] **Step 8: Run the complete module test and commit**

Run:

```bash
node --test src/lib/hermes/lesson-ledger-admin.test.cjs
```

Expected: PASS.

Commit:

```bash
git add src/lib/hermes/lesson-ledger-admin.ts src/lib/hermes/lesson-ledger-admin.test.cjs
git commit -m "feat: project Kitty lesson ledger for admins"
```

---

### Task 2: Load the Lesson Ledger on the Admin Server Page

**Files:**
- Modify: `src/app/(dashboard)/admin/hermes/page.tsx`
- Modify: `src/components/admin/hermes-dashboard-shared.tsx`
- Modify: `src/components/admin/hermes-assistant-dashboard.tsx`
- Modify: `src/components/admin/hermes-assistant-dashboard.test.cjs`

**Interfaces:**
- Consumes: `loadAdminLessonCycles` and `AdminLessonCycle` from Task 1.
- Produces: `lessonCycles: AdminLessonCycle[]` and `lessonLedgerError: string | null` props for the dashboard.
- Changes the tab identifier from `settlements` to `ledger`.

- [ ] **Step 1: Write failing page and tab contract tests**

Add assertions that:

```js
assert.match(page, /loadAdminLessonCycles/);
assert.match(page, /lessonCycles=/);
assert.match(page, /lessonLedgerError=/);
assert.ok(page.indexOf('requireRole(["admin"])') < page.indexOf("createAdminClient()"));
assert.ok(shared.includes('"ledger"'));
assert.doesNotMatch(shared, /"settlements"/);
assert.match(shell, /label: "Ledger"/);
assert.match(shell, /tab === "ledger"/);
assert.match(shell, /lessonCycles\.length \+ settlements\.length/);
```

Keep the existing assertion that financial settlement loading remains present.
Also repair the already-known stale conversation-link source assertion to
expect the merged mobile navigation helper:

```js
assert.match(source, /href=\{hermesTabHref\("conversations", contact\.id\)\}/);
```

This test-only repair changes no runtime behavior.

- [ ] **Step 2: Run the focused dashboard test and verify RED**

Run:

```bash
node --test src/components/admin/hermes-assistant-dashboard.test.cjs
```

Expected: FAIL because the page does not load lesson cycles and the tab is still `settlements`.

- [ ] **Step 3: Implement minimized server loading and isolated errors**

Import `loadAdminLessonCycles` in the page and start it alongside the existing independent top-level queries:

```ts
const lessonResult = await loadAdminLessonCycles(supabase)
  .then((data) => ({ data, error: false }))
  .catch(() => ({ data: [], error: true }));
```

Pass:

```tsx
lessonCycles={lessonResult.data}
lessonLedgerError={
  lessonResult.error ? "Lesson ledger temporarily unavailable." : null
}
```

Do not include the lesson error in the generic `loadError`, so financial settlement data and the other tabs remain usable.

- [ ] **Step 4: Rename the route tab and dashboard contract**

Change `HERMES_TABS` to contain `ledger` instead of `settlements`. Update the shell tab label and conditional render. Extend dashboard props with:

```ts
lessonCycles: AdminLessonCycle[];
lessonLedgerError: string | null;
```

Set the Ledger count to `lessonCycles.length + settlements.length`.

- [ ] **Step 5: Run the focused tests and commit**

Run:

```bash
node --test src/components/admin/hermes-assistant-dashboard.test.cjs src/lib/hermes/lesson-ledger-admin.test.cjs
```

Expected: PASS with every new Task 2 assertion satisfied.

Commit:

```bash
git add 'src/app/(dashboard)/admin/hermes/page.tsx' src/components/admin/hermes-dashboard-shared.tsx src/components/admin/hermes-assistant-dashboard.tsx src/components/admin/hermes-assistant-dashboard.test.cjs
git commit -m "feat: load lesson ledger in Kitty admin"
```

---

### Task 3: Render the Combined Ledger Panel

**Files:**
- Modify: `src/components/admin/hermes-settlements-panel.tsx`
- Modify: `src/components/admin/hermes-assistant-dashboard.test.cjs`

**Interfaces:**
- Consumes: `lessonCycles: AdminLessonCycle[]`, `lessonLedgerError: string | null`, and existing `settlements: HermesSettlementCycle[]`.
- Produces: one read-only `HermesSettlementsPanel` containing Lesson collection first and Financial settlements second.

- [ ] **Step 1: Write failing combined-panel tests**

Assert the panel source contains:

```text
Lesson collection
Financial settlements
Tutors confirmed
Lessons recorded
Students unresolved
Tutor unavailable
Awaiting lesson report
Confirmed with no lessons
Reported as
Delivery failed
Corrections remain available in audit history
```

Assert the lesson section appears before the financial section. Assert the panel iterates `lessonCycles`, `collections`, `report.lessons`, and still calculates the existing tutor-report, invoice, and payout counters.

- [ ] **Step 2: Run the dashboard test and verify RED**

Run:

```bash
node --test src/components/admin/hermes-assistant-dashboard.test.cjs
```

Expected: FAIL because the combined lesson section is not rendered.

- [ ] **Step 3: Implement the read-only lesson collection panel**

Change the component signature to:

```ts
export function HermesSettlementsPanel({
  lessonCycles,
  lessonLedgerError,
  settlements,
}: {
  lessonCycles: AdminLessonCycle[];
  lessonLedgerError: string | null;
  settlements: HermesSettlementCycle[];
})
```

Render two `PanelCard` components in a vertical stack.

For each lesson cycle:

- show month and cycle status in the summary;
- show `confirmedReportCount/selectedTutorCount`, `lessonCount`, and `unresolvedCount`;
- expand the newest cycle by default;
- render each tutor name, collection status, and latest request delivery status;
- show a concise delivery failure only when `requestDeliveryStatus === "failed"`;
- show `Awaiting lesson report` when `report === null`;
- show `Confirmed with no lessons` when a confirmed report has zero rows;
- show report revision, source, and confirmation state;
- render lesson date, duration, subject, resolved student name, and `Reported as …` when the resolved name differs from the reported name;
- label unresolved students clearly; and
- state once that corrections remain available in audit history.

Use semantic `<details>`, `<summary>`, `<ul>`, `<li>`, `<time>`, and existing `Badge`, `PanelCard`, and `Empty` components. Do not add `"use client"`.

For the financial panel, preserve the existing cycle disclosures and counters verbatim, changing only its heading to `Financial settlements`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
node --test src/components/admin/hermes-assistant-dashboard.test.cjs src/lib/hermes/lesson-ledger-admin.test.cjs
```

Expected: PASS with zero failures.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/hermes-settlements-panel.tsx src/components/admin/hermes-assistant-dashboard.test.cjs
git commit -m "feat: show Kitty lesson ledger to admins"
```

---

### Task 4: Verify the Full Admin Change

**Files:**
- Modify only if verification exposes a defect in the files listed above.

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: fresh test, lint, build, and live-data evidence for handoff.

- [ ] **Step 1: Run all Hermes and admin Node tests**

Run:

```bash
node --test src/lib/hermes/*.test.cjs src/components/admin/hermes-assistant-dashboard.test.cjs src/app/api/hermes/transcripts/route.test.cjs
```

Expected: PASS with zero failures.

- [ ] **Step 2: Run the relevant Python plugin/profile tests**

Run:

```bash
python3 -m unittest \
  infra/hermes-plugins/insight-admin/test_plugin.py \
  infra/hermes-plugins/insight-scheduling/test_plugin.py \
  infra/hermes-profiles/academy/test_profile.py \
  -v
```

Expected: PASS with zero failures.

- [ ] **Step 3: Run lint**

Run:

```bash
npm run lint
```

Expected: exit 0 with no lint errors.

- [ ] **Step 4: Run the production build**

Run:

```bash
npm run build
```

Expected: exit 0 and `/admin/hermes` compiled successfully.

- [ ] **Step 5: Verify production-shaped data through the pure projection**

Use the existing read-only Supabase connection to confirm that the live lesson cycle, selected tutor collection, and latest `lesson_report_request` delivery can be represented by the projection without reading message bodies or phone numbers. Do not mutate production.

- [ ] **Step 6: Review the diff and commit any verification-only correction**

Run:

```bash
git diff --check
git status --short
git log --oneline -5
```

If a scoped correction was required, commit only its exact files with a message describing that correction. Otherwise make no empty commit.

## Final Verification Checklist

- [ ] `/admin/hermes?tab=ledger` is admin-only.
- [ ] The live lesson cycle can be represented with its selected tutor and request state.
- [ ] Active report revisions and chronological lessons render without superseded rows.
- [ ] Missing reports, zero-lesson reports, unresolved students, and delivery failures have distinct states.
- [ ] The financial settlement view remains below lesson collection.
- [ ] No admin control mutates lesson or financial records.
- [ ] No phone number, transcript, prompt, reasoning, credential, or raw session data enters the ledger projection.
- [ ] Focused tests, full relevant tests, Python tests, lint, and production build all pass.

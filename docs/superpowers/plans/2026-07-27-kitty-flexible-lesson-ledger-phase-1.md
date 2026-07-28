# Kitty Flexible Lesson Ledger Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first usable Kitty lesson ledger: Swati can edit teacher–student and guardian–student relationships, select tutors for a month, collect and confirm natural-language lesson reports, include her own normalized Google Sheet rows, and consolidate confirmed lessons without calculating or moving money.

**Architecture:** Add a lesson-ledger schema beside the existing disabled financial-settlement pilot instead of mutating financial tables into a second purpose. My Insight Academy remains authoritative; Kitty's verified iMessage and WhatsApp profiles use the existing signed tool route, while tutor actions are session-bound to the current WhatsApp contact. Individual lesson rows and immutable report revisions provide the future statement basis.

**Tech Stack:** Next.js 16.2.6 App Router, TypeScript 5, Supabase/Postgres, Node test runner, Python `unittest`, Meta WhatsApp Cloud API, Hermes profile-local plugins.

## Global Constraints

- Implement in `/Users/sakshamgoel/Documents/ProjectsInternships/insight`.
- Preserve the existing scheduling, approvals, Calendar worker, transcripts, and disabled legacy settlement behavior.
- Gate the new workflow independently with `HERMES_LESSON_LEDGER_ENABLED=false` by default.
- My Insight Academy is the single ledger source of truth; WhatsApp, iMessage, and normalized Sheet rows are inputs.
- Swati is an administrator actor and must also resolve to an active teacher contact before she can be included as a teacher.
- Only Swati may edit cross-contact relationships, choose cycle tutors, resolve students, reopen a cycle, or confirm a cycle.
- A tutor may submit, revise, view, and confirm only that tutor's selected collection.
- Do not store raw chat transcripts in relationship, report, lesson, or audit metadata.
- Phase 1 stores no required rates, charges, invoices, payout claims, bank details, or currencies.
- Existing future money helpers must continue to handle VND and INR exactly and must never combine different currencies.
- Normal relationship additions/reactivations are immediately applied and summarized; deactivation requires an explicit payload flag from Swati.
- Corrections create immutable report revisions; they do not mutate a prior report's lesson rows.
- Use integer whole minutes for duration and ISO `YYYY-MM-DD` lesson dates.
- Do not add an npm runtime dependency.
- Follow red-green-refactor and commit each independently testable task.

---

## File Structure

- `supabase/migrations/20260728010000_add_flexible_lesson_ledger.sql`: additive ledger tables, relationship edit fields, RLS, indexes, and transactional RPCs.
- `src/lib/hermes/lesson-ledger.ts`: pure parsing, normalization, projections, and progress calculation.
- `src/lib/hermes/lesson-ledger.test.cjs`: unit tests for the pure ledger contract.
- `src/lib/hermes/schema.test.cjs`: migration security and database-contract tests.
- `src/lib/hermes/cases.ts`: actor scopes for tutor-owned ledger actions.
- `src/lib/hermes/cases.test.cjs`: actor-scope and route source contracts.
- `src/lib/hermes/tool-contracts.ts`: snake_case compatibility aliases for new actions.
- `src/lib/hermes/tool-contracts.test.cjs`: canonical payload normalization tests.
- `src/app/api/hermes/tools/route.ts`: signed Kitty action handlers and safe projections.
- `src/lib/hermes/meta.ts`: new lesson-report-request intent and fixed template content.
- `src/lib/hermes/meta.test.cjs`: Meta-template and fail-closed delivery tests.
- `src/app/api/whatsapp/send/route.ts`: recipient-bound lesson-report request delivery.
- `infra/hermes-plugins/insight-admin/{tools.py,__init__.py,test_plugin.py}`: default/iMessage action surface and payload guidance.
- `infra/hermes-plugins/insight-scheduling/{tools.py,__init__.py,test_plugin.py}`: WhatsApp action surface; server remains authoritative for permissions.
- `infra/hermes-profiles/academy/{AGENTS.md,README.md,test_profile.py}`: conversational workflow and rollout contract.
- `infra/hermes-profiles/default-insight/{README.md,test_profile.py}`: Swati iMessage and normalized Sheet-row workflow.
- `.env.example`: disabled feature flag and Meta template name.

---

### Task 1: Add the additive lesson-ledger schema

**Files:**
- Create: `supabase/migrations/20260728010000_add_flexible_lesson_ledger.sql`
- Modify: `src/lib/hermes/schema.test.cjs`

**Interfaces:**
- Produces tables `academy_lesson_cycles`, `academy_teacher_collections`, `academy_lesson_report_revisions`, and `academy_lessons`.
- Extends `hermes_contact_relationships` with reversible edit metadata.
- Extends `hermes_messages` with `lesson_cycle_id` for recipient-bound report requests.
- Produces service-role RPCs defined in Steps 3–5.

- [ ] **Step 1: Write failing migration contract tests**

Append a test that reads `_add_flexible_lesson_ledger.sql` and asserts all four tables, RLS, anon/authenticated revocation, service-role grants, relationship edit columns, individual lesson fields, the `lesson_cycle_id` message link, required indexes, and every RPC signature.

```js
test("flexible lesson ledger is server-scoped, revisioned, and contains no money fields", () => {
  const sql = readMigration("_add_flexible_lesson_ledger.sql");
  for (const table of ["academy_lesson_cycles", "academy_teacher_collections", "academy_lesson_report_revisions", "academy_lessons"]) {
    assert.match(sql, new RegExp(`create table public\\.${table}`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(sql, new RegExp(`revoke all on table public\\.${table} from anon, authenticated`));
    assert.match(sql, new RegExp(`grant all on table public\\.${table} to service_role`));
  }
  assert.match(sql, /duration_minutes integer not null/);
  assert.match(sql, /lesson_date date not null/);
  assert.match(sql, /add column lesson_cycle_id uuid/);
  assert.doesNotMatch(sql, /family_charge|claimed_payout|amount_minor|currency text/);
});
```

- [ ] **Step 2: Run the schema test and verify the missing-migration failure**

Run: `node --test src/lib/hermes/schema.test.cjs`  
Expected: FAIL because `_add_flexible_lesson_ledger.sql` does not exist.

- [ ] **Step 3: Create the relationship and ledger tables**

The migration must add these relationship columns with idempotent `add column if not exists` statements:

```sql
is_active boolean not null default true,
effective_start date,
effective_end date,
source_channel text not null default 'admin'
  check (source_channel in ('whatsapp', 'imessage_admin', 'admin')),
last_editor_profile_id uuid references public.profiles(id) on delete set null,
updated_at timestamptz not null default now()
```

Create:

```sql
academy_lesson_cycles(
  id uuid primary key,
  period_start date unique not null,
  status text check (status in ('collecting','needs_attention','ready_for_swati','confirmed')),
  version integer not null default 0,
  confirmed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)

academy_teacher_collections(
  id uuid primary key,
  lesson_cycle_id uuid not null,
  tutor_contact_id uuid not null,
  status text check (status in ('not_requested','requested','awaiting_reply','awaiting_teacher_confirmation','confirmed','needs_attention')),
  requested_at timestamptz,
  confirmed_report_revision_id uuid,
  unique (lesson_cycle_id, tutor_contact_id)
)

academy_lesson_report_revisions(
  id uuid primary key,
  teacher_collection_id uuid not null,
  revision integer not null,
  supersedes_report_id uuid,
  source_channel text check (source_channel in ('whatsapp','google_sheets','imessage_admin','admin')),
  status text check (status in ('draft','awaiting_teacher_confirmation','confirmed','superseded')),
  submitted_at timestamptz,
  confirmed_at timestamptz,
  unique (teacher_collection_id, revision)
)

academy_lessons(
  id uuid primary key,
  report_revision_id uuid not null,
  reported_student_name text not null,
  student_contact_id uuid,
  lesson_date date not null,
  duration_minutes integer not null check (duration_minutes between 1 and 1440),
  subject text,
  note text,
  created_at timestamptz
)
```

Add foreign keys after table creation where the collection and report references are cyclic. Add server-only RLS/grants, `set_updated_at` triggers where applicable, and indexes for cycle status, tutor collection lookup, unresolved lessons, student/month consolidation, and report revision history.

- [ ] **Step 4: Add relationship, cycle, and report RPCs**

Implement service-role-only functions:

```sql
upsert_academy_contact_relationship(
  p_source_contact_id uuid,
  p_target_contact_id uuid,
  p_relationship_type text,
  p_is_active boolean,
  p_source_channel text
) returns public.hermes_contact_relationships

start_academy_lesson_cycle(
  p_period_start date,
  p_tutor_contact_ids uuid[]
) returns public.academy_lesson_cycles

submit_academy_lesson_report(
  p_cycle_id uuid,
  p_tutor_contact_id uuid,
  p_source_channel text,
  p_lessons jsonb
) returns public.academy_lesson_report_revisions

confirm_academy_lesson_report(
  p_report_id uuid,
  p_actor_contact_id uuid
) returns public.academy_lesson_report_revisions
```

`upsert_academy_contact_relationship` accepts only `teacher` and `parent_guardian`. A `teacher` relationship validates an active teacher source and active student target; a `parent_guardian` relationship validates an active parent source and active student target. It reactivates the existing typed row and never deletes history. `start_academy_lesson_cycle` validates a real first-of-month date, 1–100 unique active teacher contacts, and inserts one collection per selected tutor. `submit_academy_lesson_report` requires the tutor to be selected, accepts 0–500 rows, supersedes the prior active revision, validates that every date belongs to the cycle month, and sets the collection to `awaiting_teacher_confirmation`. `confirm_academy_lesson_report` permits the selected tutor's contact ID or `null` for a route-authorized administrator and binds the collection to that exact revision.

- [ ] **Step 5: Add resolution, cycle confirmation, and reopen RPCs**

Implement:

```sql
resolve_academy_lesson_student(p_lesson_id uuid, p_student_contact_id uuid)
  returns public.academy_lessons

confirm_academy_lesson_cycle(p_cycle_id uuid)
  returns public.academy_lesson_cycles

reopen_academy_lesson_cycle(p_cycle_id uuid)
  returns public.academy_lesson_cycles
```

Resolution requires an active student. Cycle confirmation locks the cycle and collections, requires every collection to be `confirmed`, requires every lesson in the selected confirmed revision set to have a student contact, increments `version`, sets `confirmed_at`, and stores no money fields. Reopen changes only `confirmed` to `collecting`, clears `confirmed_at`, increments `version`, and audits the transition.

Every RPC revokes `public`, `anon`, and `authenticated` execution before granting only `service_role`. Every mutation appends a safe `hermes_audit_events` row without names, phone numbers, lesson notes, or transcripts.

- [ ] **Step 6: Run schema tests**

Run: `node --test src/lib/hermes/schema.test.cjs`  
Expected: PASS.

- [ ] **Step 7: Commit the schema**

```bash
git add supabase/migrations/20260728010000_add_flexible_lesson_ledger.sql src/lib/hermes/schema.test.cjs
git commit -m "feat: add flexible Academy lesson ledger schema"
```

### Task 2: Add strict lesson-ledger parsing and projections

**Files:**
- Create: `src/lib/hermes/lesson-ledger.ts`
- Create: `src/lib/hermes/lesson-ledger.test.cjs`

**Interfaces:**
- Produces `sanitizeLessonReport(input): { lessons: LessonInput[] }`.
- Produces `sanitizeTutorContactIds(input): string[]`.
- Produces `projectLessonCycle(input): LessonCycleProjection`.
- Produces `buildLessonReportRequestContent(periodStart): { body: string; bodyParameters: string[] }`.

- [ ] **Step 1: Write failing unit tests for individual lessons**

Cover normalized names, ISO dates, 1–1440 whole minutes, optional subject limited to 120 characters, optional note limited to 500 characters, unknown-field removal, 0–500 lessons, duplicate row rejection, UUID normalization, and deterministic ordering.

```js
assert.deepEqual(sanitizeLessonReport({ lessons: [{
  reportedStudentName: "  Maya  Rao ",
  lessonDate: "2026-07-03",
  durationMinutes: 60,
  subject: " Math ",
  transcript: "discard",
}] }), { lessons: [{
  reportedStudentName: "Maya Rao",
  lessonDate: "2026-07-03",
  durationMinutes: 60,
  subject: "Math",
}] });
```

Add a test proving the source file has no Supabase, Calendar, transcript, rate, charge, payout, invoice, or floating-point money dependency.

- [ ] **Step 2: Run and verify module-not-found failure**

Run: `node --test src/lib/hermes/lesson-ledger.test.cjs`  
Expected: FAIL because `lesson-ledger.ts` is absent.

- [ ] **Step 3: Implement the pure validators**

Define:

```ts
export interface LessonInput {
  reportedStudentName: string;
  studentContactId?: string;
  lessonDate: string;
  durationMinutes: number;
  subject?: string;
  note?: string;
}

export function sanitizeLessonReport(input: unknown): { lessons: LessonInput[] }
export function sanitizeTutorContactIds(input: unknown): string[]
```

Use a canonical duplicate key of `studentContactId ?? normalizedName`, `lessonDate`, `durationMinutes`, and normalized subject. Do not reject two lessons on the same date when duration or subject differs.

- [ ] **Step 4: Implement safe projections and request content**

`projectLessonCycle` returns cycle ID, month, status, version, per-tutor status, report revision metadata, unresolved count, and confirmed lessons. It excludes phone numbers, notes from other tutors, raw audit data, and superseded lesson rows.

`buildLessonReportRequestContent("2026-07-01")` returns:

```ts
{
  body: "Please send your My Insight Academy lesson report for July 2026. For each student, include the lesson dates and duration of each lesson.",
  bodyParameters: ["July 2026"]
}
```

- [ ] **Step 5: Run unit tests and commit**

Run: `node --test src/lib/hermes/lesson-ledger.test.cjs`  
Expected: PASS.

```bash
git add src/lib/hermes/lesson-ledger.ts src/lib/hermes/lesson-ledger.test.cjs
git commit -m "feat: validate Kitty lesson ledger input"
```

### Task 3: Add actor scopes and payload contracts

**Files:**
- Modify: `src/lib/hermes/cases.ts`
- Modify: `src/lib/hermes/cases.test.cjs`
- Modify: `src/lib/hermes/tool-contracts.ts`
- Modify: `src/lib/hermes/tool-contracts.test.cjs`

**Interfaces:**
- Adds actor scope `self_ledger`.
- Normalizes the exact new action payloads used by Task 4.

- [ ] **Step 1: Write failing authorization tests**

Assert an administrator receives `admin` for every action. Assert a contact receives `self_ledger` only for `get_lesson_cycle`, `submit_lesson_report`, and `confirm_lesson_report`. Assert relationship edits, cycle selection, request sending, student resolution, consolidation across students, cycle confirmation, and reopen remain denied to ordinary contacts.

- [ ] **Step 2: Add failing alias tests**

Test aliases for `cycle_id`, `report_id`, `tutor_contact_id`, `source_contact_id`, `target_contact_id`, `relationship_type`, `student_contact_id`, `tutor_contact_ids`, `lesson_date`, and `duration_minutes`, including nested `lessons` entries.

- [ ] **Step 3: Run focused tests and verify failures**

Run: `node --test src/lib/hermes/cases.test.cjs src/lib/hermes/tool-contracts.test.cjs`  
Expected: FAIL on missing scope and aliases.

- [ ] **Step 4: Implement minimal scopes and action-specific normalization**

Add `self_ledger` to `HermesToolActorScope`. Preserve shallow normalization for arbitrary business data, but normalize declared `lessons` entries only for `submit_lesson_report` and `import_swati_lessons`.

- [ ] **Step 5: Run tests and commit**

Run: `node --test src/lib/hermes/cases.test.cjs src/lib/hermes/tool-contracts.test.cjs`  
Expected: PASS.

```bash
git add src/lib/hermes/cases.ts src/lib/hermes/cases.test.cjs src/lib/hermes/tool-contracts.ts src/lib/hermes/tool-contracts.test.cjs
git commit -m "feat: authorize session-bound lesson ledger actions"
```

### Task 4: Expose Kitty's editable ledger tools

**Files:**
- Modify: `src/app/api/hermes/tools/route.ts`
- Modify: `src/lib/hermes/cases.test.cjs`

**Interfaces:**
- Consumes validators and RPCs from Tasks 1–2.
- Produces actions `set_contact_relationship`, `list_contact_relationships`, `start_lesson_cycle`, `get_lesson_cycle`, `request_lesson_report`, `submit_lesson_report`, `import_swati_lessons`, `confirm_lesson_report`, `resolve_lesson_student`, `get_student_lessons`, `confirm_lesson_cycle`, and `reopen_lesson_cycle`.

- [ ] **Step 1: Add failing route source-contract tests**

Assert all actions exist, use `HERMES_LESSON_LEDGER_ENABLED`, call the named RPCs, derive tutor identity from `actorContact.id`, derive Swati's source from the trusted tool mode, never accept an actor phone number, and use explicit column projections instead of `select("*")`.

- [ ] **Step 2: Run the route contract and verify failure**

Run: `node --test src/lib/hermes/cases.test.cjs`  
Expected: FAIL because the actions are absent.

- [ ] **Step 3: Implement relationship and cycle administration**

`set_contact_relationship` accepts `{sourceContactId,targetContactId,relationshipType,active}`, where `relationshipType` is `teacher` or `parent_guardian`, and calls the relationship RPC. `list_contact_relationships` accepts one contact ID and returns active/inactive teaching or guardian relationships with minimized contact projections. `start_lesson_cycle` accepts `{periodStart,tutorContactIds,includeSwati}`; when `includeSwati=true`, resolve `HERMES_ADMIN_WHATSAPP_E164` to an active teacher contact and append its ID before calling the RPC.

- [ ] **Step 4: Implement report submission, confirmation, and Sheet-row intake**

`submit_lesson_report` derives the tutor contact for external WhatsApp actors. Administrators provide `tutorContactId`; source is `whatsapp` for tutor messages, `imessage_admin` for Swati's iMessage, and `admin` for Swati's WhatsApp/admin context.

`import_swati_lessons` is administrator-only and accepts normalized rows already read by Kitty from the configured Google Sheet. It resolves Swati's active teacher contact from `HERMES_ADMIN_WHATSAPP_E164`, sanitizes the same lesson shape, and submits source `google_sheets`. This task does not add Google OAuth scopes or a second background worker.

`confirm_lesson_report` derives `actorContact.id` for tutors and passes `null` only for a verified administrator. A correction always uses `submit_lesson_report`, creating a new revision.

- [ ] **Step 5: Implement safe progress, resolution, consolidation, and cycle decisions**

`get_lesson_cycle` returns the whole safe projection to administrators; tutors receive only their collection, active report revision, and own lesson rows. `resolve_lesson_student`, `get_student_lessons`, `confirm_lesson_cycle`, and `reopen_lesson_cycle` are administrator-only. `get_student_lessons` groups confirmed-revision lesson rows for one student and cycle, ordered by date then teacher.

- [ ] **Step 6: Run focused tests and type checking**

Run: `node --test src/lib/hermes/cases.test.cjs src/lib/hermes/lesson-ledger.test.cjs src/lib/hermes/tool-contracts.test.cjs`  
Run: `npx tsc --noEmit`  
Expected: PASS.

- [ ] **Step 7: Commit the tool surface**

```bash
git add src/app/api/hermes/tools/route.ts src/lib/hermes/cases.test.cjs
git commit -m "feat: let Kitty manage lesson ledger records"
```

### Task 5: Send selected tutors a lesson-report request

**Files:**
- Modify: `src/lib/hermes/meta.ts`
- Modify: `src/lib/hermes/meta.test.cjs`
- Modify: `src/app/api/whatsapp/send/route.ts`
- Modify: `src/app/api/hermes/tools/route.ts`
- Modify: `.env.example`

**Interfaces:**
- Adds intent `lesson_report_request` with one template parameter: month.
- `request_lesson_report` sends only to a selected tutor collection and updates request status idempotently.

- [ ] **Step 1: Write failing template and sender contracts**

Assert `WHATSAPP_TEMPLATE_LESSON_REPORT_REQUEST` maps to the new intent, missing templates fail closed outside the service window, the sender requires exactly one `lessonCycleId`, the contact must match an `academy_teacher_collections` row, and no currency/payout text appears.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `node --test src/lib/hermes/meta.test.cjs src/lib/hermes/lesson-ledger.test.cjs`  
Expected: FAIL because the new intent is absent.

- [ ] **Step 3: Add fixed request content and environment mapping**

Add `lesson_report_request` to `WhatsAppIntent`, map `WHATSAPP_TEMPLATE_LESSON_REPORT_REQUEST`, and use `buildLessonReportRequestContent`. Add to `.env.example`:

```dotenv
HERMES_LESSON_LEDGER_ENABLED=false
WHATSAPP_TEMPLATE_LESSON_REPORT_REQUEST=
```

- [ ] **Step 4: Bind sender delivery to the selected collection**

Extend the signed sender body with `lessonCycleId`. For `lesson_report_request`, require the feature flag, an active teacher contact, a matching selected collection, and an editable lesson cycle. Store `hermes_messages.lesson_cycle_id`; do not accept model-provided request wording or month parameters.

- [ ] **Step 5: Implement idempotent `request_lesson_report`**

The route action validates the collection, builds an idempotency key from cycle and tutor IDs, calls the signed sender route, and changes `not_requested` to `requested` only when the sender reserves or returns the existing message. A failed template/API delivery leaves the collection actionable and returns the failure to Kitty.

- [ ] **Step 6: Run focused tests, type checking, and commit**

Run: `node --test src/lib/hermes/meta.test.cjs src/lib/hermes/lesson-ledger.test.cjs src/lib/hermes/cases.test.cjs`  
Run: `npx tsc --noEmit`  
Expected: PASS.

```bash
git add src/lib/hermes/meta.ts src/lib/hermes/meta.test.cjs src/app/api/whatsapp/send/route.ts src/app/api/hermes/tools/route.ts .env.example
git commit -m "feat: request monthly lesson reports over WhatsApp"
```

### Task 6: Teach both Kitty profiles the flexible workflow

**Files:**
- Modify: `infra/hermes-plugins/insight-admin/tools.py`
- Modify: `infra/hermes-plugins/insight-admin/__init__.py`
- Modify: `infra/hermes-plugins/insight-admin/test_plugin.py`
- Modify: `infra/hermes-plugins/insight-scheduling/tools.py`
- Modify: `infra/hermes-plugins/insight-scheduling/__init__.py`
- Modify: `infra/hermes-plugins/insight-scheduling/test_plugin.py`
- Modify: `infra/hermes-profiles/academy/AGENTS.md`
- Modify: `infra/hermes-profiles/academy/README.md`
- Modify: `infra/hermes-profiles/academy/test_profile.py`
- Modify: `infra/hermes-profiles/default-insight/README.md`
- Modify: `infra/hermes-profiles/default-insight/test_profile.py`

**Interfaces:**
- Makes the same action enum visible to Swati's iMessage and WhatsApp Kitty sessions.
- Keeps authorization on the signed server route, not in model-controlled payloads.

- [ ] **Step 1: Write failing plugin/profile tests**

Require both plugins to expose all new actions. Require the docs to state that server-side session identity decides permission, external tutors can access only their own collection/report, relationship edits are Swati-only, report summaries require teacher confirmation, Sheet rows are normalized input, corrections create revisions, and no money is calculated or moved.

- [ ] **Step 2: Run tests and verify failure**

Run: `python3 -m unittest infra/hermes-plugins/insight-admin/test_plugin.py infra/hermes-plugins/insight-scheduling/test_plugin.py infra/hermes-profiles/academy/test_profile.py infra/hermes-profiles/default-insight/test_profile.py -v`  
Expected: FAIL on missing ledger actions and guidance.

- [ ] **Step 3: Extend action enums and payload guidance**

Document exact camelCase payloads. The scheduling plugin may expose administrator action names because the server recognizes Swati's configured WhatsApp number and denies the same actions to every other contact. Do not add phone number, actor, role, or channel payload fields.

- [ ] **Step 4: Add the conversational sequence**

Academy profile instructions:

1. On a selected tutor's natural lesson list, call `submit_lesson_report`.
2. Echo the returned normalized summary with dates and durations.
3. Ask for `CONFIRM` or corrections.
4. Call `confirm_lesson_report` only for the exact pending revision after an affirmative confirmation in that context.
5. For corrections, call `submit_lesson_report` again and confirm the new revision.

Swati profile instructions include relationship edits, tutor selection, request progress, normalized Sheet-row import, ambiguity resolution, consolidation, and final cycle confirmation.

- [ ] **Step 5: Run plugin/profile tests and commit**

Run: `python3 -m unittest infra/hermes-plugins/insight-admin/test_plugin.py infra/hermes-plugins/insight-scheduling/test_plugin.py infra/hermes-profiles/academy/test_profile.py infra/hermes-profiles/default-insight/test_profile.py -v`  
Expected: PASS.

```bash
git add infra/hermes-plugins/insight-admin infra/hermes-plugins/insight-scheduling infra/hermes-profiles/academy infra/hermes-profiles/default-insight
git commit -m "docs: teach Kitty the flexible lesson ledger workflow"
```

### Task 7: Verify the complete Phase 1 story

**Files:**
- Modify only files found deficient by the checks below; keep fixes scoped to Phase 1.

**Interfaces:**
- Produces a release-ready, feature-flagged lesson-ledger implementation.

- [ ] **Step 1: Run every focused contract**

```bash
node --test \
  src/lib/hermes/schema.test.cjs \
  src/lib/hermes/lesson-ledger.test.cjs \
  src/lib/hermes/cases.test.cjs \
  src/lib/hermes/tool-contracts.test.cjs \
  src/lib/hermes/meta.test.cjs
python3 -m unittest \
  infra/hermes-plugins/insight-admin/test_plugin.py \
  infra/hermes-plugins/insight-scheduling/test_plugin.py \
  infra/hermes-profiles/academy/test_profile.py \
  infra/hermes-profiles/default-insight/test_profile.py -v
```

Expected: all tests PASS.

- [ ] **Step 2: Run repository verification**

Run: `npx tsc --noEmit`  
Run: `npm run lint`  
Run: `npm run build`  
Expected: all exit 0 with no new warnings.

- [ ] **Step 3: Run a source safety scan**

```bash
rg -n "transcript|claimed_payout|family_charge|amount_minor|bank|transfer" \
  src/lib/hermes/lesson-ledger.ts \
  supabase/migrations/20260728010000_add_flexible_lesson_ledger.sql
```

Expected: no matches except an explicit SQL comment stating that Phase 1 stores no financial fields; remove that comment if it makes the assertion noisy.

- [ ] **Step 4: Verify a synthetic cycle against the local Supabase stack when available**

Run: `npx supabase status`  
If the local stack is running, apply migrations and execute the acceptance sequence with synthetic teacher/student contacts: relationship add/reactivate, two selected tutors, one zero-lesson report, one corrected report revision, ambiguous student resolution, Swati normalized Sheet-row submission, tutor confirmation, student consolidation, cycle confirmation, reopen, and reconfirm. If the local stack is not running, record that database execution verification remains an environment prerequisite; schema and route tests must still pass.

- [ ] **Step 5: Confirm rollout remains disabled**

Verify `.env.example` contains `HERMES_LESSON_LEDGER_ENABLED=false`. Do not enable production, apply a remote migration, configure a Meta template, or message a real tutor as part of this implementation.

- [ ] **Step 6: Commit any verification-only corrections**

If verification required code corrections:

```bash
git add \
  .env.example \
  supabase/migrations/20260728010000_add_flexible_lesson_ledger.sql \
  src/lib/hermes/schema.test.cjs \
  src/lib/hermes/lesson-ledger.ts \
  src/lib/hermes/lesson-ledger.test.cjs \
  src/lib/hermes/cases.ts \
  src/lib/hermes/cases.test.cjs \
  src/lib/hermes/tool-contracts.ts \
  src/lib/hermes/tool-contracts.test.cjs \
  src/lib/hermes/meta.ts \
  src/lib/hermes/meta.test.cjs \
  src/app/api/hermes/tools/route.ts \
  src/app/api/whatsapp/send/route.ts \
  infra/hermes-plugins/insight-admin \
  infra/hermes-plugins/insight-scheduling \
  infra/hermes-profiles/academy \
  infra/hermes-profiles/default-insight
git commit -m "fix: complete Kitty lesson ledger verification"
```

If no files changed, do not create an empty commit.

## Completion Criteria

- Swati can add, reactivate, and explicitly deactivate teacher–student and guardian–student relationships from either verified Kitty channel.
- Swati can select only the tutors Kitty should contact for a month and optionally include herself as a teacher.
- Kitty sends a month-only approved Meta request to selected tutors and tracks request status idempotently.
- Tutors can report naturally, receive a structured summary, revise it, and confirm only their own report.
- Swati can submit normalized Google Sheet rows through Kitty without making the Sheet authoritative.
- Each lesson has one teacher, one resolved or unresolved student, one date, and one whole-minute duration.
- Unexpected students are allowed; ambiguous students block cycle confirmation.
- Confirmed corrections create immutable revisions.
- Consolidation groups the exact confirmed revision set by student across teachers.
- Phase 1 contains no financial calculation, invoice send, payment state, bank integration, currency conversion, or money movement.
- The feature remains disabled until migration application, Meta template approval, and synthetic staging verification are separately authorized.

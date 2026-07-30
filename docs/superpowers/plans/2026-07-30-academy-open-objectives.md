# Academy WhatsApp Open Objectives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Academy Kitty derive each WhatsApp contact's unfinished ledger or family-payment objective from Mindset Academy and gently return to that objective after answering an unrelated message.

**Architecture:** Add one pure TypeScript projector and one signed, contact-only Hermes tool action. The action reads existing lesson-collection, report-revision, invoice, and accounting-cycle rows, returns at most three minimized objectives, and never accepts caller-supplied identity. Academy instructions require the lookup on every eligible external inbound turn and define answer-then-redirect behavior using recent visible conversation context to avoid repetition.

**Tech Stack:** Next.js 16 route handlers, TypeScript, Supabase Postgres through `@supabase/supabase-js`, Hermes Markdown profile/skill instructions, Node test runner, Python `unittest`, Vercel, Fly.io.

## Global Constraints

- Do not add a Supabase table, migration, cron job, vector memory, or persistent reminder cooldown.
- Existing Mindset Academy records remain the only source of completion truth.
- The action is read-only, contact-only, server-identity-bound, idempotent, and capped at three objectives.
- Never accept `contactId`, phone number, actor, role, or authorization overrides in `get_my_open_objectives`.
- Exclude `not_requested`, confirmed, paid, void, and final-cycle records.
- Answer the immediate message before adding at most one gentle reminder.
- Suppress the reminder when it was already mentioned in visible recent context, the message supplies the requested information, the contact opts out, the contact asks for Swati, or a sensitive issue requires escalation.
- A lookup error must fail closed: Kitty answers without inventing an objective.
- Do not change Meta template selection or the WhatsApp 24-hour service-window implementation.
- Leave the existing unrelated `docs/strategy/` working-tree content untouched.

---

## File Structure

- Create `src/lib/hermes/open-objectives.ts`: normalize, filter, prioritize, cap, and project safe objective records.
- Create `src/lib/hermes/open-objectives.test.cjs`: pure unit coverage for objective rules and output minimization.
- Modify `src/lib/hermes/cases.ts`: add a dedicated self-objectives actor scope.
- Modify `src/lib/hermes/cases.test.cjs`: authorization and source-boundary assertions.
- Modify `src/app/api/hermes/tools/route.ts`: register and implement the authenticated read-only action.
- Modify `infra/hermes-skills/insight-scheduling/SKILL.md`: document invocation and conversational use.
- Modify `infra/hermes-profiles/academy/AGENTS.md`: enforce per-turn lookup and answer-then-redirect behavior.
- Modify `infra/hermes-profiles/academy/test_profile.py`: lock the deployed behavior into profile tests.
- Modify `infra/hermes-profiles/academy/README.md`: document deployment, verification, and rollback for the new action.

---

### Task 1: Pure open-objective projector

**Files:**
- Create: `src/lib/hermes/open-objectives.ts`
- Create: `src/lib/hermes/open-objectives.test.cjs`

**Interfaces:**
- Consumes:

```ts
export interface LessonObjectiveRecord {
  id: string;
  status: string;
  periodStart: string;
  cycleStatus: string;
  reports: Array<{
    id: string;
    revision: number;
    status: string;
    submittedAt: string;
  }>;
}

export interface PaymentObjectiveRecord {
  id: string;
  status: string;
  periodStart: string;
}
```

- Produces:

```ts
export type OpenObjective =
  | {
      kind: "lesson_report";
      entityId: string;
      periodStart: string;
      stage: "awaiting_report" | "awaiting_confirmation";
    }
  | {
      kind: "family_payment";
      entityId: string;
      periodStart: string;
      stage: "awaiting_payment";
      invoiceReference: string;
    };

export function projectOpenObjectives(input: {
  lessonCollections: LessonObjectiveRecord[];
  familyInvoices: PaymentObjectiveRecord[];
}): {
  primaryObjective: OpenObjective | null;
  objectives: OpenObjective[];
};
```

- [ ] **Step 1: Write failing projector tests**

Cover all of these cases in `src/lib/hermes/open-objectives.test.cjs`:

```js
test("projects requested tutor work as awaiting_report", () => {
  const result = projectOpenObjectives({
    lessonCollections: [{
      id: "11111111-1111-4111-8111-111111111111",
      status: "requested",
      periodStart: "2026-07-01",
      cycleStatus: "collecting",
      reports: [],
    }],
    familyInvoices: [],
  });
  assert.deepEqual(result.objectives, [{
    kind: "lesson_report",
    entityId: "11111111-1111-4111-8111-111111111111",
    periodStart: "2026-07-01",
    stage: "awaiting_report",
  }]);
});

test("prioritizes a current pending revision over awaiting report and payment", () => {
  const result = projectOpenObjectives({
    lessonCollections: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        status: "requested",
        periodStart: "2026-06-01",
        cycleStatus: "collecting",
        reports: [],
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        status: "awaiting_teacher_confirmation",
        periodStart: "2026-07-01",
        cycleStatus: "collecting",
        reports: [{
          id: "33333333-3333-4333-8333-333333333333",
          revision: 2,
          status: "awaiting_teacher_confirmation",
          submittedAt: "2026-07-30T12:00:00.000Z",
        }],
      },
    ],
    familyInvoices: [{
      id: "44444444-4444-4444-8444-444444444444",
      status: "sent",
      periodStart: "2026-05-01",
    }],
  });
  assert.equal(result.primaryObjective.stage, "awaiting_confirmation");
});
```

Also test:

- `not_requested` and `confirmed` collections are excluded.
- Collections whose cycle is `confirmed` are excluded.
- Superseded and confirmed report revisions do not create `awaiting_confirmation`.
- Only `sent` invoices produce `awaiting_payment`.
- Invoice references use `MIA-` plus the uppercased first eight UUID characters.
- Older periods sort first inside the same priority group.
- Output is capped at three.
- Extra/raw fields never appear in serialized output.
- Invalid records are ignored rather than projected.

- [ ] **Step 2: Run the projector tests and confirm RED**

Run:

```bash
node --test src/lib/hermes/open-objectives.test.cjs
```

Expected: FAIL because `open-objectives.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure projector**

Implement strict helpers for UUID, ISO month start, ISO timestamps, safe integer revision, and known statuses. Select the latest non-superseded `awaiting_teacher_confirmation` report by revision. Build objective candidates with numeric priority:

```ts
const PRIORITY = {
  awaiting_confirmation: 0,
  awaiting_report: 1,
  awaiting_payment: 2,
} as const;
```

Sort by priority, then `periodStart`, then `entityId`; slice to three; return the first item or `null`.

- [ ] **Step 4: Run the projector tests and confirm GREEN**

Run:

```bash
node --test src/lib/hermes/open-objectives.test.cjs
```

Expected: all projector tests pass.

- [ ] **Step 5: Commit the projector**

```bash
git add src/lib/hermes/open-objectives.ts src/lib/hermes/open-objectives.test.cjs
git commit -m "feat: derive Academy contact objectives"
```

---

### Task 2: Contact-only Hermes tool action

**Files:**
- Modify: `src/lib/hermes/cases.ts:45-56`
- Modify: `src/lib/hermes/cases.test.cjs`
- Modify: `src/app/api/hermes/tools/route.ts:1-18`
- Modify: `src/app/api/hermes/tools/route.ts:140-215`

**Interfaces:**
- Consumes: `projectOpenObjectives({ lessonCollections, familyInvoices })` from Task 1.
- Produces: signed tool action `get_my_open_objectives` with an empty payload and response:

```json
{
  "primaryObjective": null,
  "objectives": []
}
```

or the minimized objective projection defined in Task 1.

- [ ] **Step 1: Write failing authorization and route-source tests**

Update the actor-scope test:

```js
assert.equal(toolActorScope("get_my_open_objectives", "contact"), "self_objectives");
assert.equal(toolActorScope("get_my_open_objectives", "unknown"), "denied");
```

Add route-source assertions that:

- `ACTIONS` contains `get_my_open_objectives`.
- The handler rejects `actorKind !== "contact"` and requires `actorContact`.
- Both database queries use `.eq(..., actorContact.id)`.
- The action does not read `payload.contactId`, `payload.actor`, or `payload.phone`.
- Queries use explicit selected columns and finite limits.
- The result passes through `projectOpenObjectives`.

- [ ] **Step 2: Run the focused cases test and confirm RED**

Run:

```bash
node --test src/lib/hermes/cases.test.cjs
```

Expected: FAIL because the action and `self_objectives` scope do not exist.

- [ ] **Step 3: Add the actor scope**

Extend:

```ts
export type HermesToolActorScope =
  | "admin"
  | "self"
  | "case_member"
  | "self_case_member"
  | "self_financial"
  | "self_ledger"
  | "self_objectives"
  | "denied";
```

Return `self_objectives` only when `action === "get_my_open_objectives"` and `actorKind === "contact"`. Preserve the existing early admin scope result, then explicitly reject admins inside this action's route handler so the endpoint remains contact-only.

- [ ] **Step 4: Implement the read-only action**

Register the action and import `projectOpenObjectives`.

In the switch handler:

1. Reject unless `actorKind === "contact"` and `actorContact` exists.
2. Start two queries concurrently:
   - Teacher collections filtered by `tutor_contact_id = actorContact.id`, limited to 20, with explicit collection fields plus joined cycle period/status and report revision fields.
   - Family invoices filtered by `billed_contact_id = actorContact.id`, limited to 20, with explicit invoice fields plus joined settlement period.
3. Use server filters for likely-open statuses, then rely on the pure projector for fail-closed final validation.
4. Normalize Supabase's one-or-array relation shapes into the Task 1 interfaces.
5. Throw on either query error so the standard safe tool error path handles failure.
6. Audit only the action and returned objective count; do not put invoice references or private objective details in audit metadata.
7. Return `NextResponse.json(projectOpenObjectives(...))`.

Do not access any caller identity field from `payload`.

- [ ] **Step 5: Run focused tests and confirm GREEN**

Run:

```bash
node --test src/lib/hermes/open-objectives.test.cjs src/lib/hermes/cases.test.cjs
```

Expected: all tests pass.

- [ ] **Step 6: Run TypeScript and lint checks for the route**

Run:

```bash
npx tsc --noEmit
npx eslint src/lib/hermes/open-objectives.ts src/app/api/hermes/tools/route.ts src/lib/hermes/cases.ts
```

Expected: both commands exit successfully.

- [ ] **Step 7: Commit the tool action**

```bash
git add src/lib/hermes/cases.ts src/lib/hermes/cases.test.cjs src/app/api/hermes/tools/route.ts
git commit -m "feat: expose contact-scoped Academy objectives"
```

---

### Task 3: Teach Academy Kitty the behavior

**Files:**
- Modify: `infra/hermes-skills/insight-scheduling/SKILL.md`
- Modify: `infra/hermes-profiles/academy/AGENTS.md`
- Modify: `infra/hermes-profiles/academy/test_profile.py`
- Modify: `infra/hermes-profiles/academy/README.md`

**Interfaces:**
- Consumes: `get_my_open_objectives={}` from Task 2.
- Produces: deterministic profile rules for Academy WhatsApp conversations.

- [ ] **Step 1: Write failing profile tests**

Add a test that requires both `AGENTS.md` and the skill to contain:

- `get_my_open_objectives`
- every eligible external inbound WhatsApp turn
- answer the immediate message first
- at most one reminder
- visible recent conversation suppression
- `awaiting_report`
- `awaiting_confirmation`
- `awaiting_payment`
- do not guess on tool failure
- `STOP`

Also assert the available-actions list in `SKILL.md` includes `get_my_open_objectives`.

- [ ] **Step 2: Run the profile tests and confirm RED**

Run:

```bash
python3 -m unittest infra/hermes-profiles/academy/test_profile.py
```

Expected: the new test fails because the objective behavior is absent.

- [ ] **Step 3: Update `AGENTS.md`**

Add a compact “Open objectives” block with these exact semantics:

```text
For every eligible external inbound WhatsApp turn, call
get_my_open_objectives={} before the final answer. Answer the immediate
legitimate message first. If primaryObjective remains open and was not
already mentioned in the visible recent exchange, add at most one short,
friendly reminder:
- awaiting_report: ask for the named month's complete lesson list.
- awaiting_confirmation: ask the tutor to confirm or correct the exact
  pending summary.
- awaiting_payment: gently mention the outstanding invoice reference.
Do not remind when the message supplies/corrects the requested information,
STOP or consent withdrawal applies, the contact requests Swati, or safety
requires escalation. If the lookup fails, do not guess an objective.
Database/tool state—not conversation memory—decides completion.
```

Keep Swati's admin WhatsApp conversation excluded from this per-contact reminder rule.

- [ ] **Step 4: Update the skill**

Document:

```bash
python3 ~/.hermes/skills/insight-scheduling/scripts/insight_tools.py get_my_open_objectives '{}'
```

Add the action to the available-actions list and repeat the response-use constraints. Do not add direct Supabase or Meta access.

- [ ] **Step 5: Update deployment documentation**

Document:

- No migration or environment variable is needed.
- Deploy Insight before replacing Academy profile files.
- Copy the updated skill and `AGENTS.md` into the Academy profile only.
- Restart only the Academy gateway for profile-file activation.
- Roll back by restoring the previous Academy files; existing data is untouched.

- [ ] **Step 6: Run profile and Python skill tests**

Run:

```bash
python3 -m unittest discover -s infra/hermes-profiles -p 'test*.py'
python3 -m unittest discover -s infra/hermes-skills -p 'test*.py'
```

Expected: all tests pass.

- [ ] **Step 7: Commit Academy behavior**

```bash
git add infra/hermes-skills/insight-scheduling/SKILL.md infra/hermes-profiles/academy/AGENTS.md infra/hermes-profiles/academy/test_profile.py infra/hermes-profiles/academy/README.md
git commit -m "feat: keep Academy Kitty on open objectives"
```

---

### Task 4: Full verification, deployment, and live profile activation

**Files:**
- Verify all modified files.
- Do not modify Supabase schema or production data.

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces: deployed API behavior, activated Academy profile behavior, and rollback evidence.

- [ ] **Step 1: Run the complete local verification suite**

Run:

```bash
node --test src/lib/hermes/*.test.cjs
python3 -m unittest discover -s infra/hermes-profiles -p 'test*.py'
python3 -m unittest discover -s infra/hermes-skills -p 'test*.py'
npx tsc --noEmit
npm run lint
npm run build
```

Expected: all tests, type checking, lint, and production build pass.

- [ ] **Step 2: Confirm the database boundary**

Use the Supabase read-only schema inspection to verify the existing tables and columns referenced by the new action still match production. Confirm no migration was created and no grants, RLS policies, functions, or production rows changed.

- [ ] **Step 3: Inspect the final diff and repository status**

Run:

```bash
git diff main~3..HEAD --check
git status --short
```

Expected: feature commits are clean; pre-existing `docs/strategy/` remains untracked and untouched.

- [ ] **Step 4: Push the feature commits**

Run:

```bash
git push origin main
```

Expected: the remote main branch accepts the commits.

- [ ] **Step 5: Verify the Vercel production deployment**

Inspect the deployment created from the pushed commit until it reaches `READY`. Confirm the production deployment corresponds to the final pushed commit and the existing WhatsApp sender/webhook routes remain healthy.

- [ ] **Step 6: Back up and activate the Academy profile files**

On `hermes-swati111goel-5cc4efb3867b`:

1. Back up the live Academy `AGENTS.md` and `insight-scheduling/SKILL.md` with a timestamp.
2. Copy only the newly verified Academy `AGENTS.md` and skill files into the Academy profile.
3. Leave Swati's default profile files and both profiles' approval configuration unchanged.
4. Restart only `hermes -p academy gateway`.
5. Verify `hermes gateway list` shows both default and Academy gateways running.

- [ ] **Step 7: Run safe live probes**

Use a verified Academy WhatsApp contact session or a signed synthetic request to confirm:

- A contact can call `get_my_open_objectives={}` without a supplied identity.
- The result contains only that contact's objective.
- A contact with no open work receives an empty result.
- An admin/unknown session is rejected from the contact-only action.
- No objective lookup sends a WhatsApp message or mutates database state.

Do not send unsolicited production reminders during verification.

- [ ] **Step 8: Deliver Kitty handoff text**

Provide two ready-to-paste blocks:

1. **Academy WhatsApp profile:** explains the mandatory lookup, answer-then-redirect behavior, stages, suppression rules, and backend truth.
2. **Swati default profile:** explains that Swati may start/request ledger work and manage payments, but the Academy profile handles inbound contact continuity using Mindset Academy's open-objective lookup.

Tell the user the Academy block is operationally important; the default block is explanatory and helpful for cross-profile coordination.

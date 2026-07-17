# Insight Calendar Free/Busy Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow either of Swati's authorized intake channels to request Google Calendar conflict checks through a typed Insight queue processed only by the default Hermes profile.

**Architecture:** Insight stores server-only `calendar_freebusy` jobs and exposes separately signed enqueue/status and worker claim/complete capabilities. A deterministic default-profile plugin CLI calls `gws calendar freebusy query`, returns only busy intervals, and can be scheduled as a no-agent cron. No Calendar event is created or modified in this phase.

**Tech Stack:** Next.js 16, TypeScript, Supabase/Postgres, Python standard library, Hermes plugin CLI, Google Workspace CLI (`gws`), HMAC service authentication

## Global Constraints

- Run from `/private/tmp/insight-imessage-intake` on `codex/insight-imessage-intake`.
- Preserve Phase 1 and the current WhatsApp flow.
- Keep `HERMES_WORKSPACE_JOBS_ENABLED=false` by default.
- Use a distinct `HERMES_WORKSPACE_WORKER_SECRET` available only to Insight and the default profile.
- Accept only `calendar_freebusy`; reject arbitrary commands, calendar IDs, API methods, JSON fields, and date ranges over 31 days.
- Derive the Google calendar as `primary` inside the worker; never accept it from a job payload.
- Store and return busy intervals only—never event titles, descriptions, attendees, locations, links, or raw Google responses.
- Use script-only/no-agent execution. The worker must not require an LLM.
- Add no npm runtime dependency.

---

### Task 1: Add the server-only workspace queue

**Files:**
- Create: `supabase/migrations/20260716151000_add_hermes_workspace_jobs.sql`
- Modify: `src/lib/hermes/schema.test.cjs`

**Interfaces:**
- Produces: `hermes_workspace_jobs`, `workspace_state`, and service-role-only RPCs `claim_hermes_workspace_jobs(text, integer)` and `complete_hermes_workspace_job(uuid, text, text, jsonb, text)`.

- [ ] **Step 1: Write failing schema assertions**

Assert the migration creates the table, enables RLS, revokes `anon, authenticated`, constrains `job_type='calendar_freebusy'`, constrains statuses, makes `idempotency_key` unique, uses `for update skip locked`, requires matching `lease_owner` on completion, grants RPC execution only to `service_role`, and adds `workspace_state` to cases.

- [ ] **Step 2: Verify RED**

Run: `node --test src/lib/hermes/schema.test.cjs`  
Expected: FAIL with `ENOENT` for the new migration.

- [ ] **Step 3: Add the migration**

The table contains `id`, `case_id`, `job_type`, `payload`, `payload_digest`, `idempotency_key`, `status`, `attempt_count`, `max_attempts default 5`, `available_at`, `lease_owner`, `lease_expires_at`, `result`, `error_code`, and timestamps. Add indexes on `(status, available_at)` and `(case_id, created_at desc)`.

`claim_hermes_workspace_jobs` must atomically select queued/retryable rows whose `available_at <= now()` or expired leases, lock with `skip locked`, set a five-minute lease, increment attempts, and return at most `least(greatest(p_limit,1),10)` rows.

`complete_hermes_workspace_job` must update only a currently leased row owned by `p_worker_id`; allow `succeeded`, `retryable_failed`, or `permanent_failed`; clear lease fields; and set `workspace_state` to `ready` on success or `failed` on failure.

- [ ] **Step 4: Verify GREEN and commit**

Run: `node --test src/lib/hermes/schema.test.cjs`  
Expected: PASS.

Commit: `feat: add typed Workspace job queue`

### Task 2: Validate free/busy requests and minimized results

**Files:**
- Create: `src/lib/hermes/workspace-jobs.ts`
- Create: `src/lib/hermes/workspace-jobs.test.cjs`

**Interfaces:**
- Produces: `parseFreeBusyPayload(input)`, `parseFreeBusyResult(input)`, and `workspaceJobIdempotencyKey(caseId, windows)`.

- [ ] **Step 1: Write failing tests**

Tests require 1–50 candidate windows, valid RFC3339 start/end, start before end, a maximum enclosing range of 31 days, and optional IANA-style timezone of at most 100 characters. Extra payload fields are discarded. Result parsing accepts only `{ busy: [{start,end}], checkedAt }`, rejects invalid intervals, and discards every other Google field. Equivalent normalized inputs produce the same SHA-256 idempotency key.

- [ ] **Step 2: Verify RED**

Run: `node --test src/lib/hermes/workspace-jobs.test.cjs`  
Expected: FAIL because the module is absent.

- [ ] **Step 3: Implement minimal pure validators**

Reuse ISO normalization semantics from `sanitizeAvailability`, sort normalized windows by start/end before hashing, and return new objects rather than retaining caller input.

- [ ] **Step 4: Verify GREEN and commit**

Run: `node --test src/lib/hermes/workspace-jobs.test.cjs`  
Expected: PASS.

Run: `npx eslint src/lib/hermes/workspace-jobs.ts src/lib/hermes/workspace-jobs.test.cjs`  
Expected: exit 0.

Commit: `feat: validate Calendar freebusy jobs`

### Task 3: Add authorized enqueue and status actions

**Files:**
- Modify: `src/app/api/hermes/tools/route.ts`
- Modify: `src/lib/hermes/cases.test.cjs`
- Modify: `infra/hermes-plugins/insight-admin/tools.py`
- Modify: `infra/hermes-plugins/insight-admin/test_plugin.py`
- Modify: `infra/hermes-plugins/insight-scheduling/tools.py`
- Modify: `infra/hermes-plugins/insight-scheduling/test_plugin.py`
- Modify: `.env.example`

**Interfaces:**
- Adds actions `request_swati_freebusy` and `get_workspace_job`.
- `request_swati_freebusy` consumes `{caseId, windows}` and returns `{job:{id,status}}`.
- `get_workspace_job` consumes `{jobId}` and returns a safe projection with minimized result.

- [ ] **Step 1: Write failing action and plugin contract tests**

Assert both plugin action lists include the two actions. Assert `toolActorScope` denies both actions to contacts and grants admin scope. Assert route source uses `parseFreeBusyPayload`, `workspaceJobIdempotencyKey`, `HERMES_WORKSPACE_JOBS_ENABLED`, and selects no raw payload in status responses.

- [ ] **Step 2: Verify RED**

Run the cases and both plugin suites.  
Expected: FAIL because actions are missing.

- [ ] **Step 3: Implement enqueue/status**

When disabled, return 503. Require `actorKind === 'admin'`. Verify the case exists and is not confirmed/cancelled. Insert a queued `calendar_freebusy` job with the normalized payload, digest, and unique key; on duplicate, return the existing job. Set the case `workspace_state='pending'`. Status lookup must select only `id, case_id, job_type, status, result, error_code, created_at, updated_at` and pass `result` through `parseFreeBusyResult` before returning it.

Add to `.env.example`:

```dotenv
HERMES_WORKSPACE_JOBS_ENABLED=false
HERMES_WORKSPACE_WORKER_SECRET=
```

- [ ] **Step 4: Verify GREEN and commit**

Run: `node --test src/lib/hermes/cases.test.cjs src/lib/hermes/workspace-jobs.test.cjs`  
Run both plugin test suites.  
Run: `npx next typegen && npx tsc --noEmit`  
Expected: all exit 0.

Commit: `feat: enqueue Calendar freebusy checks`

### Task 4: Add the worker claim/complete endpoint

**Files:**
- Create: `src/app/api/hermes/workspace-jobs/route.ts`
- Create: `src/lib/hermes/workspace-worker.ts`
- Create: `src/lib/hermes/workspace-worker.test.cjs`

**Interfaces:**
- `POST /api/hermes/workspace-jobs` with signed `{action:'claim'|'complete', payload}`.
- Produces `parseWorkerRequest`, `projectClaimedJob`, and replay-protected worker operations.

- [ ] **Step 1: Write failing tests**

Test exact action/payload schemas, worker ID format `[A-Za-z0-9_-]{8,80}`, bounded claim limit, allowed completion statuses, required safe result on success, bounded redacted error code on failure, rejection of extra fields, separate worker secret, replay audit, and feature flag.

- [ ] **Step 2: Verify RED**

Run: `node --test src/lib/hermes/workspace-worker.test.cjs`  
Expected: FAIL because modules are absent.

- [ ] **Step 3: Implement parser and route**

Verify `HERMES_WORKSPACE_WORKER_SECRET` with the existing HMAC helper. Record request IDs in `hermes_audit_events`. Claim through the RPC. Complete only through the RPC and pass successful result through `parseFreeBusyResult`. Never return job payloads after completion.

- [ ] **Step 4: Verify GREEN and commit**

Run worker, auth, schema, and cases tests plus focused lint and TypeScript.  
Expected: all exit 0.

Commit: `feat: add signed Workspace worker API`

### Task 5: Add the deterministic default-profile worker CLI

**Files:**
- Create: `infra/hermes-plugins/insight-workspace/plugin.yaml`
- Create: `infra/hermes-plugins/insight-workspace/__init__.py`
- Create: `infra/hermes-plugins/insight-workspace/worker.py`
- Create: `infra/hermes-plugins/insight-workspace/test_worker.py`
- Modify: `infra/hermes-profiles/default-insight/README.md`
- Modify: `infra/hermes-profiles/default-insight/test_profile.py`

**Interfaces:**
- Adds `hermes insight-workspace run-once` and `hermes insight-workspace status`.
- Uses `INSIGHT_HERMES_WORKSPACE_URL`, `HERMES_WORKSPACE_WORKER_SECRET`, `HERMES_WORKSPACE_WORKER_ID`, and the existing default-profile `gws` authentication.

- [ ] **Step 1: Write failing worker tests**

Mock subprocess and HTTP only. Assert the worker claims at most five jobs, invokes exactly:

```text
gws calendar freebusy query --json <canonical-json>
```

with body `{timeMin,timeMax,timeZone,items:[{id:'primary'}]}` derived from normalized windows. Assert `shell=False`, a 30-second timeout, no inherited model payload in arguments, minimized busy output, correct retryable classification for timeout/429/5xx, permanent classification for auth/schema failures, and redacted stdout/stderr.

- [ ] **Step 2: Verify RED**

Run: `python3 -m unittest infra/hermes-plugins/insight-workspace/test_worker.py -v`  
Expected: FAIL because worker is absent.

- [ ] **Step 3: Implement worker and CLI registration**

Use `subprocess.run([...], shell=False, capture_output=True, text=True, timeout=30, check=False)`. Parse stdout JSON, extract only `calendars.primary.busy`, and sign claim/complete requests with the existing timestamp/request-ID/body convention. `status` prints counts and oldest queued age returned by the API, never payload content.

Register CLI commands using Hermes's documented `ctx.register_cli_command(name='insight-workspace', setup_fn=..., handler_fn=...)`. Do not register an agent-callable tool.

- [ ] **Step 4: Document paused no-agent cron rollout**

Document manual `run-once`, then a script-only cron every minute. Keep it paused until staging synthetic-job verification succeeds. State that Google credentials stay in the default profile and the Academy profile receives only busy intervals.

- [ ] **Step 5: Run Phase 2 verification and commit**

Run all Hermes Node tests, all three plugin suites, both profile suites, Next type generation, TypeScript, focused lint, and `npm run build`.  
Expected: all new/focused gates and production build exit 0; repository-wide legacy lint remains separately recorded.

Commit: `feat: add default-profile Calendar freebusy worker`

## Phase 2 Stop Gate

Do not enable the worker in production and do not begin Calendar writes until a staging `gws auth status`, a synthetic free/busy job, data-minimization inspection, lease-expiry test, and worker pause/rollback test all pass. Phase 2 is complete in code when it is disabled by default and the Academy profile has no worker secret or Google credential path.

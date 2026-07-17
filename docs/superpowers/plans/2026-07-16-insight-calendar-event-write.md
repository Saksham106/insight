# Insight Idempotent Calendar Event Write Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** After Swati approves the exact resolution for a case where she is the tutor, create exactly one private event on her primary Google Calendar before Kitty sends participant confirmations.

**Architecture:** Insight remains the scheduling authority and stores typed, server-only jobs. The approval transaction marks the case confirmed and enqueues a deterministic `calendar_create_event` job only for `tutor_kind='swati'`. The default-profile no-agent worker first recovers any already-created deterministic event, otherwise runs a final free/busy check and inserts it through `gws`. The Academy profile never receives Google credentials or Calendar data. Participant confirmation is blocked until the Calendar job succeeds.

**Primary references:** Google Calendar `events.insert` supports client-supplied base32hex IDs to prevent duplicate creation, the `primary` calendar keyword, private event visibility, and private extended properties. The Google Workspace CLI dynamically exposes this method as `gws calendar events insert --params ... --json ...`.

**Tech Stack:** Next.js 16, TypeScript, Supabase/Postgres, Python standard library, Hermes plugin CLI, Google Workspace CLI (`gws`), HMAC service authentication

## Global Constraints

- Keep `HERMES_CALENDAR_WRITES_ENABLED=false` by default.
- Do not activate or deploy Calendar writes in this phase.
- `tutor_kind` is explicit: `swati` or `academy_tutor`; never infer it from a name.
- Only `swati` cases create Google Calendar events. Other tutor classes continue to use Insight as their authority.
- Accept no calendar ID; the worker always derives `primary`.
- Accept no arbitrary API method, command, attendees, description, attachments, recurrence, reminders, conference data, or raw Google payload.
- Use a deterministic Calendar event ID derived from case ID and proposal version.
- Use `visibility=private`, `transparency=opaque`, no attendees, and private extended properties containing only opaque Insight identifiers.
- Recheck free/busy immediately before the first insert. A conflict makes the proposal stale and requires a new approval.
- A retry after an uncertain insert must recover the same deterministic event rather than create a duplicate.
- Do not send `class_confirmation` for a Swati-taught case until `workspace_state='ready'`.

---

### Task 1: Add tutor ownership and typed Calendar write records

**Files:**
- Create: `supabase/migrations/20260716152000_add_hermes_calendar_event_jobs.sql`
- Modify: `src/lib/hermes/schema.test.cjs`

- [ ] Add `tutor_kind` to scheduling cases with a closed check and `academy_tutor` default.
- [ ] Extend workspace job types with `calendar_create_event`.
- [ ] Add server-only `hermes_calendar_links` with unique case ID and event ID, event ETag, proposal version, and timestamps; revoke browser roles and grant only service role.
- [ ] Replace the worker completion RPC with a job-type-bound signature. On event success, atomically upsert the link and mark workspace ready. On `calendar_conflict`, mark the case `needs_attention`, `workspace_state='stale'`, and cancel unconsumed approvals. Preserve bounded retry exhaustion.
- [ ] Test RLS/grants, uniqueness, state transitions, and exact RPC binding.

### Task 2: Validate event jobs and minimized results

**Files:**
- Modify: `src/lib/hermes/workspace-jobs.ts`
- Modify: `src/lib/hermes/workspace-jobs.test.cjs`

- [ ] Add exact parsers for event payload `{start,end,timezone,summary,eventId,proposalVersion}` and result `{eventId,etag,createdAt}`.
- [ ] Bound summary to 240 characters, require one valid interval, require a valid timezone, enforce the Google base32hex ID format, and discard extra fields.
- [ ] Add a stable Calendar-event job digest and tests for malformed or oversized input.

### Task 3: Enqueue the write in the exact approval transaction

**Files:**
- Create: `supabase/migrations/20260716152100_enqueue_approved_calendar_event.sql`
- Modify: `src/app/api/hermes/tools/route.ts`
- Modify: `src/lib/hermes/cases.test.cjs`
- Modify: `.env.example`

- [ ] Replace `confirm_hermes_class` with a signature that receives the Calendar-write enable flag. Preserve the existing approval ID, proposal version, digest, unconsumed status, and exact JSON equality checks under row locks.
- [ ] For a Swati case, fail closed if writes are disabled; validate the chosen resolution; mark workspace pending; and enqueue one deterministic event job in the same transaction.
- [ ] For another tutor, confirm without a Calendar job.
- [ ] Accept `tutorKind` only from Swati's administrator actions when creating a case and persist it explicitly.
- [ ] Return a safe job status from `confirm_class` and document `HERMES_CALENDAR_WRITES_ENABLED=false`.

### Task 4: Extend the signed worker protocol by job type

**Files:**
- Modify: `src/lib/hermes/workspace-worker.ts`
- Modify: `src/lib/hermes/workspace-worker.test.cjs`
- Modify: `src/app/api/hermes/workspace-jobs/route.ts`

- [ ] Revalidate claimed payloads according to `job_type`.
- [ ] Require `jobType` on completion, parse its matching minimized result, and pass the type to the completion RPC so a lease cannot complete a job under another schema.
- [ ] Keep status and completion responses payload-free.

### Task 5: Implement deterministic event recovery, conflict check, and insert

**Files:**
- Modify: `infra/hermes-plugins/insight-workspace/worker.py`
- Modify: `infra/hermes-plugins/insight-workspace/test_worker.py`

- [ ] For `calendar_create_event`, first call `gws calendar events get` for the deterministic event ID. If it exists and its time plus private Insight identifiers match, return its minimized ID/ETag as success.
- [ ] If absent, call the existing free/busy function for the chosen interval. If any busy interval overlaps, complete with `calendar_conflict` and do not insert.
- [ ] Insert exactly with `gws calendar events insert --params '{"calendarId":"primary","sendUpdates":"none"}' --json <canonical-event>` using a private, opaque, non-recurring event with no attendees.
- [ ] Parse only event ID/ETag/created time. Classify auth/schema as permanent and timeout/429/5xx as retryable without logging response bodies.
- [ ] Add tests for recovery, conflict, exact argv, uncertainty retry, and data minimization.

### Task 6: Gate confirmations and document the rollout

**Files:**
- Modify: `src/app/api/hermes/tools/route.ts`
- Modify: `src/lib/hermes/cases.test.cjs`
- Modify: `infra/hermes-profiles/default-insight/README.md`
- Modify: `infra/hermes-profiles/default-insight/test_profile.py`

- [ ] Before forwarding `class_confirmation`, load only case status, tutor kind, and workspace state. Require `confirmed` for every case and `ready` for a Swati case.
- [ ] Document scope upgrade from free/busy to Calendar events, synthetic private-event staging verification, deterministic retry, conflict rollback, worker pause, and manual event cleanup.
- [ ] Keep the operating-system schedule paused.
- [ ] Run all Hermes Node tests, all plugin/profile tests, focused lint, Next type generation, TypeScript, and the production build.

## Phase 3 Stop Gate

Do not enable Calendar writes until staging confirms the exact OAuth scope, deterministic recovery after an intentionally interrupted insert, no duplicate event, conflict-to-stale behavior, confirmation blocking, data-minimized queue/results, worker pause, and manual rollback. Google Sheets, Calendar update/cancel, reminders, Meet creation, and WhatsApp approval replies remain outside this phase.

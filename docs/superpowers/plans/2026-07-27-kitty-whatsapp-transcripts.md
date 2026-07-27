# Kitty WhatsApp Transcripts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let Mindsight Academy administrators open any Kitty WhatsApp contact and read the exchanged WhatsApp transcript, while keeping Hermes system prompts, reasoning, tool activity, and operational metadata private.

**Architecture:** An Academy Hermes hook incrementally reads visible user/assistant rows from Hermes `state.db` and pushes small, HMAC-signed batches to a new internal Insight API route. The route validates the full batch, resolves the existing Hermes contact, and idempotently stores messages in a service-role-only Supabase table. The existing admin Hermes page reads conversation summaries and one selected transcript server-side and renders a simple master/detail interface. The hook uses a durable per-session cursor and startup catch-up, so no new Fly app, machine, public port, cron, or polling service is required.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase/Postgres, Hermes Python hooks, `SessionDB`, Node test runner, Python `unittest`.

**Global constraints:**

- Preserve the current `hermes_messages` delivery ledger.
- Reuse `HERMES_TOOL_SHARED_SECRET` and the existing request-signing contract.
- Keep transcript synchronization disabled unless `INSIGHT_HERMES_TRANSCRIPT_SYNC_ENABLED=true`.
- Never expose the transcript table to browser clients, `anon`, or `authenticated`.
- Never persist system/developer prompts, reasoning, tool calls/results, session JSON, model data, tokens, or internal filesystem/media metadata.
- Do not let synchronization failure block WhatsApp delivery.
- Make every write replay-safe with both request-ID replay protection and `(hermes_session_id, hermes_message_id)` uniqueness.

---

### Task 1: Define and migrate the transcript storage contract

**Files:**

- Create with `supabase migration new add_hermes_transcript_messages`: `supabase/migrations/*_add_hermes_transcript_messages.sql`
- Create: `src/lib/hermes/transcripts.ts`
- Create: `src/lib/hermes/transcripts.test.cjs`

**Step 1: Write failing contract tests**

Add Node tests that import or inspect the transcript contract and assert:

- Speakers are limited to `contact | kitty`.
- WhatsApp IDs accept only 8–15 digits after normalization.
- A batch contains 1–100 messages with positive, strictly increasing safe-integer IDs.
- Session IDs are non-empty, at most 128 characters, and contain no control characters.
- Bodies are non-empty after trimming and at most 65,536 characters.
- Timestamps are valid ISO timestamps.
- Unknown fields and mixed invalid/valid batches are rejected as a whole.

Use representative cases:

```js
const valid = {
  sessionId: "whatsapp_cloud:919876543210",
  whatsappUserId: "919876543210",
  messages: [{
    messageId: 41,
    speaker: "contact",
    text: "Thank you, I will pay tomorrow.",
    occurredAt: "2026-07-27T14:30:00.000Z",
  }],
};
```

**Step 2: Run the test and confirm it fails**

Run:

```bash
node --test src/lib/hermes/transcripts.test.cjs
```

Expected: FAIL because the parser does not exist.

**Step 3: Implement the TypeScript contract**

In `src/lib/hermes/transcripts.ts`:

- Export `TranscriptSpeaker`, `TranscriptSyncMessage`, and `TranscriptSyncRequest`.
- Export `parseTranscriptSyncRequest(input: unknown)` returning the normalized typed request or a structured validation error.
- Export `normalizeWhatsAppUserId(value: string)` returning digits only when the final value is 8–15 digits.
- Reject non-plain objects, extra properties, duplicate/non-increasing message IDs, invalid dates, oversized text, and control characters in session IDs.
- Normalize message text only by trimming surrounding whitespace; do not rewrite content.

**Step 4: Run the contract tests**

Run:

```bash
node --test src/lib/hermes/transcripts.test.cjs
```

Expected: PASS.

**Step 5: Create the migration through the Supabase CLI**

Run:

```bash
supabase migration new add_hermes_transcript_messages
```

In the generated file, create `public.hermes_transcript_messages` with:

```sql
id uuid primary key default gen_random_uuid(),
contact_id uuid not null references public.hermes_contacts(id) on delete cascade,
hermes_session_id text not null check (char_length(hermes_session_id) between 1 and 128),
hermes_message_id bigint not null check (hermes_message_id > 0),
speaker text not null check (speaker in ('contact', 'kitty')),
body text not null check (char_length(btrim(body)) between 1 and 65536),
occurred_at timestamptz not null,
created_at timestamptz not null default now(),
unique (hermes_session_id, hermes_message_id)
```

Add:

```sql
create index hermes_transcript_messages_contact_time_idx
  on public.hermes_transcript_messages
  (contact_id, occurred_at desc, hermes_message_id desc);

alter table public.hermes_transcript_messages enable row level security;
alter table public.hermes_transcript_messages force row level security;
revoke all on public.hermes_transcript_messages from public, anon, authenticated;
grant select, insert, update on public.hermes_transcript_messages to service_role;
```

Do not add browser RLS policies.

**Step 6: Validate the migration**

Run:

```bash
supabase db lint --local
```

If the local stack is unavailable, run the repository’s migration validation command and record that local Supabase was unavailable.

**Step 7: Commit**

```bash
git add src/lib/hermes/transcripts.ts src/lib/hermes/transcripts.test.cjs supabase/migrations
git commit -m "feat: add Hermes transcript storage contract"
```

---

### Task 2: Add the signed internal transcript ingestion route

**Files:**

- Create: `src/app/api/hermes/transcripts/route.ts`
- Create: `src/app/api/hermes/transcripts/route.test.cjs`
- Modify: `src/lib/hermes/transcripts.ts`

**Step 1: Write failing route source-contract tests**

Assert that the route:

- Uses `verifyServiceRequest`.
- Requires `HERMES_TOOL_SHARED_SECRET`.
- Parses the entire body before any transcript write.
- Inserts a request-ID audit event without storing transcript text in audit metadata.
- Resolves one active, non-deleted `hermes_contacts` row by normalized E.164 phone.
- Upserts only the approved transcript columns with conflict target `hermes_session_id,hermes_message_id`.
- Returns `highestMessageId`.
- Returns safe errors and never echoes message text.

Also add unit coverage to `transcripts.test.cjs` for the conversion from a validated request to approved database rows.

**Step 2: Run tests and confirm failure**

Run:

```bash
node --test src/app/api/hermes/transcripts/route.test.cjs src/lib/hermes/transcripts.test.cjs
```

Expected: FAIL because the route is absent.

**Step 3: Implement the route**

Use this request flow:

1. Read the raw body once.
2. Verify `x-hermes-timestamp`, `x-hermes-request-id`, and `x-hermes-signature` with `verifyServiceRequest`.
3. Parse and validate the JSON and every message.
4. Insert a `hermes_audit_events` replay marker using the request ID. Metadata may contain only session ID, normalized WhatsApp ID, and message count.
5. Resolve exactly one `hermes_contacts` row where `phone_e164` matches and `deleted_at is null`; return 404 if absent.
6. Upsert the approved rows using the unique message key.
7. Return `{ ok: true, highestMessageId, accepted: messages.length }`.

Use HTTP 400 for malformed input, 401 for bad signatures, 404 for an unknown contact, 409 for a reused request ID, and 500 for safe server errors. Keep service-role access on the server.

**Step 4: Run targeted tests**

Run:

```bash
node --test src/app/api/hermes/transcripts/route.test.cjs src/lib/hermes/transcripts.test.cjs
```

Expected: PASS.

**Step 5: Run TypeScript and lint checks**

Run:

```bash
npm run typecheck
npm run lint
```

Use the actual repository script names if `package.json` differs.

**Step 6: Commit**

```bash
git add src/app/api/hermes/transcripts src/lib/hermes/transcripts.ts src/lib/hermes/transcripts.test.cjs
git commit -m "feat: ingest signed Hermes transcript batches"
```

---

### Task 3: Add the non-blocking Academy Hermes sync hook

**Files:**

- Create: `infra/hermes-profiles/academy/hooks/insight-transcript-sync/HOOK.yaml`
- Create: `infra/hermes-profiles/academy/hooks/insight-transcript-sync/handler.py`
- Create: `infra/hermes-profiles/academy/hooks/insight-transcript-sync/test_handler.py`
- Modify: `infra/hermes-profiles/academy/test_profile.py`

**Step 1: Write failing Python tests**

Test pure helpers and a fake `SessionDB`/HTTP client:

- Manifest subscribes to `agent:end` and `gateway:startup`.
- Feature flag defaults off.
- Only `whatsapp_cloud` sessions are processed.
- `user` maps to `contact`; final non-tool `assistant` maps to `kitty`.
- `system`, `developer`, `tool`, tool-call assistants, empty text, silent tokens, reasoning fields, and non-text content are omitted.
- Rows are ordered by stable integer DB ID and sent in batches of at most 100.
- The HMAC covers exactly `timestamp.requestId.rawBody`.
- A successful response advances the per-session cursor to the acknowledged highest ID.
- HTTP/validation failure does not advance the cursor.
- Cursor persistence uses write-to-temp plus atomic replace.
- `agent:end` schedules background work and returns without awaiting network I/O.
- `gateway:startup` scans existing WhatsApp sessions for catch-up.

Silent tokens to omit case-insensitively after trimming:

```python
{"[silent]", "silent", "no_reply", "no reply"}
```

**Step 2: Run tests and confirm failure**

Run:

```bash
python3 -m unittest \
  infra.hermes-profiles.academy.hooks.insight-transcript-sync.test_handler
```

If the hyphenated path cannot be imported, run the test file directly.

Expected: FAIL because the hook does not exist.

**Step 3: Implement hook helpers**

Implement:

- `sync_enabled(env)` with an explicit true-value parser.
- `visible_text(row)` that allows only plain message text and text parts, strips surrounding whitespace, and rejects internal/tool/media-only structures.
- `to_transcript_message(row)` using only the row ID, role, visible text, and timestamp.
- `sign_body(raw_body, timestamp, request_id, secret)` matching the Next.js signer.
- `CursorStore` under the Hermes durable home, for example `transcript-sync-cursors.json`, with atomic replacement and an in-process async lock.
- `load_new_rows(session_id, after_id)` through `SessionDB(..., read_only=True)`.
- `post_batch(...)` with a short timeout and fresh request ID per attempt.
- `sync_session(...)` that updates the cursor only after a successful acknowledged batch.
- `sync_all_whatsapp_sessions(...)` for startup catch-up.

Treat stored timestamps as UTC when timezone information is absent.

**Step 4: Implement non-blocking handlers**

In the hook entry point:

- Return immediately when disabled or missing URL/secret.
- On `agent:end`, extract the WhatsApp session and user ID, create a background task, and retain a strong reference until completion.
- Delay the background read briefly so the final assistant row is committed.
- On `gateway:startup`, schedule catch-up for all WhatsApp sessions.
- Log only session IDs, counts, status codes, and safe errors; never log bodies or signatures.
- Swallow sync failures after safe logging so WhatsApp delivery is unaffected.

**Step 5: Run hook/profile tests**

Run:

```bash
python3 infra/hermes-profiles/academy/hooks/insight-transcript-sync/test_handler.py
python3 infra/hermes-profiles/academy/test_profile.py
```

Expected: PASS.

**Step 6: Commit**

```bash
git add infra/hermes-profiles/academy/hooks/insight-transcript-sync infra/hermes-profiles/academy/test_profile.py
git commit -m "feat: sync visible Kitty WhatsApp transcripts"
```

---

### Task 4: Load transcripts only for authorized administrators

**Files:**

- Create: `src/lib/hermes/transcript-queries.ts`
- Create: `src/lib/hermes/transcript-queries.test.cjs`
- Modify: `src/app/(dashboard)/admin/hermes/page.tsx`

**Step 1: Write failing query tests**

Cover:

- A selected contact ID is accepted only as a UUID-shaped string.
- Conversation summaries reduce transcript rows to latest body, latest timestamp, and message count per contact.
- Transcript rows sort oldest-to-newest.
- The selected transcript query is scoped to the selected contact.
- The page still calls `requireRole(["admin"])` before transcript data access.
- The page uses `createAdminClient`, never a browser Supabase client.

**Step 2: Run tests and confirm failure**

Run:

```bash
node --test src/lib/hermes/transcript-queries.test.cjs
```

Expected: FAIL because the helpers do not exist.

**Step 3: Implement server-side query helpers**

Create typed helpers that:

- Fetch all active contacts without the current 12-row display cap.
- Fetch transcript rows for summaries, ordered newest-first.
- Reduce summaries deterministically by `contact_id`.
- Fetch the selected contact transcript ordered by `occurred_at asc, hermes_message_id asc`.
- Cap a single rendered transcript to a documented safe server limit, initially the latest 500 messages, while preserving chronological display order.

Do not expose the service-role credential or transcript table through a client component query.

**Step 4: Update the admin page**

Read `searchParams.contact` using the Next.js 16 async page API. After `requireRole(["admin"])`, run the existing dashboard queries plus transcript summaries. If the selected UUID corresponds to an active contact, load that contact’s transcript. Pass only the contact display fields, counts, visible message text, direction, and timestamps into the dashboard component.

Handle transcript-query errors with the existing load-error pattern without weakening authorization.

**Step 5: Run targeted tests**

Run:

```bash
node --test src/lib/hermes/transcript-queries.test.cjs
npm run typecheck
```

Expected: PASS.

**Step 6: Commit**

```bash
git add src/lib/hermes/transcript-queries.ts src/lib/hermes/transcript-queries.test.cjs "src/app/(dashboard)/admin/hermes/page.tsx"
git commit -m "feat: load admin-only Kitty transcripts"
```

---

### Task 5: Build the simple contact-and-transcript interface

**Files:**

- Modify: `src/components/admin/hermes-assistant-dashboard.tsx`
- Modify: `src/components/admin/hermes-assistant-dashboard.test.cjs`

**Step 1: Extend failing component source-contract tests**

Assert:

- Contacts are no longer rendered with `.slice(0, 12)`.
- Each contact is a link to `/admin/hermes?contact=<id>`.
- Each contact shows latest visible message preview/time or “No WhatsApp messages yet”.
- The selected contact has an accessible current-state marker.
- The transcript displays `contact` and `kitty` bubbles, timestamps, and an empty state.
- There are no labels for system prompts, tools, reasoning, model, or tokens.
- Existing quick-add, needs-attention, scheduling, settlements, and recent-activity sections remain.

**Step 2: Run test and confirm failure**

Run:

```bash
node --test src/components/admin/hermes-assistant-dashboard.test.cjs
```

Expected: FAIL on the new assertions.

**Step 3: Implement the master/detail UI**

Keep the current visual language and make these focused changes:

- Rename the contact card to “WhatsApp conversations”.
- Render every active contact in a scrollable list.
- Use normal Next.js links with `contact` in the query string so authorization and data loading remain server-side.
- Show contact name, phone, last-message preview, relative/absolute time, and message count.
- Show a selected-state border/background and `aria-current`.
- Beside or below the list, render a “Conversation with {name}” panel.
- Align contact bubbles left and Kitty bubbles right with clear text labels; show precise timestamps.
- Render plain text safely; do not use `dangerouslySetInnerHTML`.
- Show “Select a contact to view their WhatsApp conversation” before selection and a friendly no-message state for empty transcripts.

Preserve responsive behavior: stacked on narrow screens, two-column layout on wide screens.

**Step 4: Run component and full local tests**

Run:

```bash
node --test src/components/admin/hermes-assistant-dashboard.test.cjs
npm test
npm run lint
npm run typecheck
```

Use available repository scripts and report any unrelated pre-existing failures separately.

**Step 5: Commit**

```bash
git add src/components/admin/hermes-assistant-dashboard.tsx src/components/admin/hermes-assistant-dashboard.test.cjs
git commit -m "feat: show Kitty WhatsApp conversations to admins"
```

---

### Task 6: Document configuration, deploy safely, and verify the whole feature

**Files:**

- Modify: `.env.example`
- Modify: `README.md`
- Modify: `infra/hermes-profiles/academy/AGENTS.md`
- Modify if generated types are tracked: `src/lib/database.types.ts`

**Step 1: Add configuration documentation**

Document:

```dotenv
INSIGHT_HERMES_TRANSCRIPT_SYNC_ENABLED=false
INSIGHT_HERMES_TRANSCRIPT_URL=https://<insight-host>/api/hermes/transcripts
```

Explain that `HERMES_TOOL_SHARED_SECRET` is reused on both sides, the feature flag is off by default, synchronization is incremental, and failures do not block WhatsApp.

Document privacy boundaries: visible WhatsApp text only; no system/tool/reasoning data.

**Step 2: Update Academy operating guidance**

Add:

- How to enable after the database/API deployment is live.
- How to inspect safe hook logs.
- How startup catch-up works.
- How to disable immediately by setting the flag false.
- How cursor retry/idempotency prevents duplicates.
- A warning never to log transcript bodies or shared secrets.

**Step 3: Regenerate/check database types if this repository tracks them**

Use the repository’s established Supabase type-generation command. Do not hand-edit generated types.

**Step 4: Run comprehensive verification**

Run:

```bash
node --test \
  src/lib/hermes/transcripts.test.cjs \
  src/app/api/hermes/transcripts/route.test.cjs \
  src/lib/hermes/transcript-queries.test.cjs \
  src/components/admin/hermes-assistant-dashboard.test.cjs
python3 infra/hermes-profiles/academy/hooks/insight-transcript-sync/test_handler.py
python3 infra/hermes-profiles/academy/test_profile.py
npm test
npm run lint
npm run typecheck
npm run build
```

Also manually verify:

- An unauthenticated request redirects away from `/admin/hermes`.
- A non-admin authenticated user cannot access `/admin/hermes`.
- A valid signed batch stores messages once; resending it with a fresh request ID does not duplicate rows.
- A reused request ID is rejected.
- System/tool rows in a Hermes fixture never appear in Supabase.
- A failed endpoint leaves the cursor unchanged; the next success catches up.
- Contact selection persists in the URL and no transcript fetch occurs in the browser.

**Step 5: Run Supabase security checks**

When a linked/local project is available:

```bash
supabase db lint
```

Run Supabase security/performance advisors and confirm:

- Forced RLS is enabled.
- No `anon` or `authenticated` grants exist.
- The service role can select/insert/upsert.
- The contact/time and unique indexes cover the route and page queries.

**Step 6: Perform a deployment canary**

Deploy in this order:

1. Database migration.
2. Insight API and admin UI.
3. Hermes profile with the flag still false.
4. Set the transcript URL and shared secret.
5. Enable sync for Academy.
6. Send one test inbound and one test outbound WhatsApp message.
7. Confirm both appear once under the correct admin contact.
8. Restart the Academy gateway and confirm startup catch-up creates no duplicates.

Rollback is non-destructive: turn the feature flag off. Keep already stored transcript rows for audit/history unless the user separately authorizes deletion.

**Step 7: Final commit**

```bash
git add .env.example README.md infra/hermes-profiles/academy/AGENTS.md
git commit -m "docs: configure Kitty transcript synchronization"
```

**Step 8: Final review**

Inspect `git diff` and `git status`, verify that the unrelated pre-existing `docs/strategy/` files were not staged or modified, then summarize:

- What changed.
- Tests/checks run and their results.
- Any deployment-only steps not executable locally.
- The exact feature flag required to activate synchronization.

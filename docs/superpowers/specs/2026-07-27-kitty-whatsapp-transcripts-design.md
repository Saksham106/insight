# Kitty WhatsApp Transcript Sync Design

## Summary

Give MyInsightAcademy administrators a read-only view of every text conversation between an Academy WhatsApp contact and Kitty. Extend the existing `/admin/hermes` Kitty workspace: its Contacts card becomes a conversation directory, and selecting a contact opens that contact's transcript.

The feature must not expose Hermes system prompts, reasoning, tool calls, tool results, model details, credentials, or runtime diagnostics. It must not let an administrator reply, edit, export, rename, delete, or otherwise manage a Hermes session.

## Existing System

MyInsightAcademy already:

- requires the `admin` role before rendering `/admin/hermes`;
- stores Academy contacts in `hermes_contacts`;
- records inbound WhatsApp messages and approved-purpose outbound messages in `hermes_messages`;
- forwards eligible inbound Meta webhooks to Kitty's `academy` Hermes profile;
- accepts HMAC-signed server-to-server requests from Hermes using `HERMES_TOOL_SHARED_SECRET`; and
- deploys profile-scoped Hermes gateway hooks under `infra/hermes-profiles/academy/hooks`.

`hermes_messages` is an operational delivery ledger. It does not contain every ordinary response that the Hermes WhatsApp Cloud adapter sends directly to a contact, so it cannot by itself render a complete conversation.

Hermes stores the complete conversation in the profile's SQLite `state.db`. Each stored message has a stable database ID, session ID, role, content, and timestamp.

## Chosen Approach

Install a profile-scoped `agent:end`/`gateway:startup` hook in Kitty's existing Academy profile. The hook reads the local Hermes session database in read-only mode, selects visible messages newer than the session's last acknowledged cursor, and sends those messages to a narrow HMAC-authenticated MyInsightAcademy endpoint.

MyInsightAcademy validates the request, resolves the WhatsApp user to an existing active Academy contact, validates every message, and idempotently stores the sanitized records in Supabase. The admin UI reads this sanitized projection; it never reads Hermes directly.

This approach adds no Fly app, Machine, CPU allocation, public Hermes port, scheduled worker, or polling loop.

The hook is controlled by `INSIGHT_HERMES_TRANSCRIPT_SYNC_ENABLED`, which defaults to disabled. It posts to the server-only `INSIGHT_HERMES_TRANSCRIPT_URL` and reuses the existing `HERMES_TOOL_SHARED_SECRET`; no second signing secret is introduced.

## Why Not a Live Hermes Reader

MyInsightAcademy runs on Vercel while Hermes' Sessions API normally listens on the Hermes Machine's private port. A live reader would require a new cross-application network and authorization bridge or a publicly reachable API credential that grants more than transcript reads. It would also make the transcript UI unavailable whenever the Hermes Machine is restarting or unreachable.

The event-driven projection reuses the existing Hermes-to-MyInsightAcademy signed-request direction, keeps the dashboard available during Hermes downtime, and strips internal data before anything leaves the Machine.

## Data Flow

### Normal turn

1. An eligible contact sends a WhatsApp message.
2. MyInsightAcademy's existing webhook records and forwards it to Kitty.
3. Hermes runs Kitty and persists the user and assistant messages in `state.db`.
4. Hermes emits `agent:end`.
5. The Academy transcript hook returns immediately after scheduling a background synchronization task, so transcript work cannot delay the WhatsApp reply.
6. The task opens the profile's `state.db` through Hermes' read-only `SessionDB`.
7. It selects messages for the current session whose numeric Hermes message ID is greater than the locally acknowledged cursor.
8. It retains only:
   - `user` messages as `contact`;
   - text-bearing `assistant` messages as `kitty`.
9. It sends a bounded JSON batch to MyInsightAcademy with a fresh request ID, timestamp, and HMAC signature.
10. MyInsightAcademy validates and upserts the batch.
11. Only after a successful response does the hook atomically advance the local session cursor.

### Retry and recovery

- A failed request does not advance the cursor. The next `agent:end` retries the same unsynchronized messages.
- A duplicate request is harmless because the database enforces uniqueness on `(hermes_session_id, hermes_message_id)`.
- On `gateway:startup`, the hook schedules a background catch-up across Academy WhatsApp sessions. It uses the same cursors and bounded batches.
- If the cursor file is missing or restored from an older backup, messages are resent and deduplicated by Supabase.
- Cursor state lives under the Academy profile's durable Hermes home and is written atomically.
- Synchronization is a no-op unless `INSIGHT_HERMES_TRANSCRIPT_SYNC_ENABLED=true`.

### Batching

Synchronize after every completed turn rather than waiting for five messages. A normal payload contains only the new user/assistant pair, keeps the UI current, and requires no timer. Catch-up work uses bounded batches so a long historical session cannot create an oversized request.

## Ingestion Contract

The Hermes hook sends:

```ts
interface TranscriptSyncRequest {
  sessionId: string;
  whatsappUserId: string;
  messages: Array<{
    messageId: number;
    speaker: "contact" | "kitty";
    text: string;
    occurredAt: string;
  }>;
}
```

Constraints:

- `sessionId`: non-empty, at most 128 characters, no control characters;
- `whatsappUserId`: 8-15 ASCII digits with no leading `+`;
- `messages`: 1-100 items per request;
- `messageId`: positive safe integer;
- `speaker`: exactly `contact` or `kitty`;
- `text`: non-empty UTF-8 text, at most 65,536 characters;
- `occurredAt`: a valid ISO timestamp; and
- message IDs in one request must be unique and strictly increasing.

The endpoint:

1. verifies the existing timestamped HMAC request scheme;
2. records the request ID in `hermes_audit_events` before processing so replays fail closed;
3. normalizes the sender to E.164 and resolves exactly one active, non-deleted `hermes_contact`;
4. rejects an unknown or ambiguous contact without storing transcript text;
5. validates every message before writing any message;
6. upserts only the approved fields; and
7. returns the highest committed message ID.

The endpoint never accepts system, tool, reasoning, model, token, cost, configuration, file-path, or credential fields.

## Supabase Model

Create `public.hermes_transcript_messages`:

| Column | Type | Rules |
| --- | --- | --- |
| `id` | `uuid` | primary key, generated |
| `contact_id` | `uuid` | required FK to `hermes_contacts`, cascade delete |
| `hermes_session_id` | `text` | required |
| `hermes_message_id` | `bigint` | required, positive |
| `speaker` | `text` | `contact` or `kitty` |
| `body` | `text` | required, non-empty, length capped |
| `occurred_at` | `timestamptz` | required |
| `created_at` | `timestamptz` | defaults to `now()` |

Indexes and constraints:

- unique `(hermes_session_id, hermes_message_id)`;
- index `(contact_id, occurred_at desc, hermes_message_id desc)`;
- checks for speaker, positive message ID, non-empty body, and maximum body length.

Security:

- enable and force RLS;
- revoke all privileges from `public`, `anon`, and `authenticated`;
- grant only `service_role`;
- define no browser-readable policy; and
- query the table only through server components after `requireRole(["admin"])`.

This table is a customer-readable transcript projection. Existing `hermes_messages` remains the source of truth for Meta acceptance, delivery, read, failure, opt-out, and operational audit state.

## Admin Experience

Keep the feature inside `/admin/hermes`.

### Conversation directory

Replace the Contacts card's current 12-row display cap with the complete contact list. Each row shows:

- display name;
- WhatsApp number;
- role/link badges;
- latest transcript preview;
- latest transcript time; or
- `No messages yet`.

Contacts with messages sort by most recent transcript activity, then contacts without messages sort by display name.

### Transcript

Selecting a contact navigates to the same Kitty page with an opaque contact UUID in the query string. The server validates the admin again, resolves the contact, and loads only rows matching that contact ID.

Render:

- contact messages on the left;
- Kitty messages on the right;
- plain text preserving line breaks;
- timestamps in the administrator's browser locale; and
- an empty state for a known contact with no synchronized messages.

The transcript is read-only. Do not add reply, edit, export, search, delete, session-title, tool-detail, or raw JSON controls in this release.

## Error Handling

- Hook discovery or synchronization failure never blocks the gateway or WhatsApp delivery.
- Network failure leaves the local cursor unchanged.
- Unknown contacts, malformed requests, expired signatures, and replayed request IDs fail without storing message bodies.
- `/admin/hermes` continues rendering its existing operational cards if transcript loading fails and displays `Transcript temporarily unavailable` only in the conversation area.
- The website logs only safe identifiers and error categories, never transcript text.
- The hook logs session IDs and status categories but not message bodies or shared secrets.

## Testing

### Hermes hook

- ignores non-`whatsapp_cloud` `agent:end` events;
- schedules synchronization without awaiting network completion;
- filters system, tool, reasoning-only, empty, and non-text messages;
- preserves full messages longer than the hook context's 500-character preview;
- sends only IDs newer than the acknowledged cursor;
- advances the cursor only after a successful commit;
- retries after failure;
- atomically persists cursor state;
- chunks catch-up into batches of at most 100; and
- performs startup catch-up without blocking gateway startup.

### Signed ingestion

- accepts a valid Academy transcript batch;
- rejects missing, invalid, expired, and replayed signatures;
- rejects malformed IDs, timestamps, speakers, ordering, oversized batches, and oversized bodies;
- rejects unknown/deleted contacts;
- maps digit-only WhatsApp IDs to exact E.164 contacts;
- stores only the approved columns;
- deduplicates retries;
- isolates contacts; and
- writes safe audit metadata without message bodies.

### Admin UI

- preserves the page-level admin role requirement;
- shows every contact, not only twelve;
- sorts conversation summaries correctly;
- shows preview/time and no-message states;
- loads only the selected contact's transcript;
- renders contact and Kitty bubbles with timestamps;
- renders no internal Hermes fields or mutation controls; and
- degrades only the conversation area when transcript loading fails.

### Regression and release verification

- existing WhatsApp webhook, signed tools, delivery ledger, approvals, and contact import tests remain green;
- Academy profile tests confirm the new hook manifest and safe filtering;
- lint and the production Next.js build pass;
- Supabase advisors report no new security or performance findings; and
- a staging probe verifies a real parent message and Kitty reply appear once, in order, without tool or reasoning content.

## Rollout

1. Apply the Supabase migration.
2. Deploy the MyInsightAcademy ingestion endpoint and admin UI.
3. Install the hook in the Academy profile with `INSIGHT_HERMES_TRANSCRIPT_URL` configured and `INSIGHT_HERMES_TRANSCRIPT_SYNC_ENABLED=false`.
4. Restart the existing Hermes gateway to load the hook.
5. Set `INSIGHT_HERMES_TRANSCRIPT_SYNC_ENABLED=true`, restart the gateway, and verify startup catch-up counts against Hermes sessions.
6. Send a staging WhatsApp turn and verify ordering, isolation, and retry behavior.
7. Keep synchronization enabled in production.

Rollback by setting `INSIGHT_HERMES_TRANSCRIPT_SYNC_ENABLED=false` and restarting the gateway. Existing transcript rows remain read-only and can be retained or deleted under the Academy's data-retention policy. Rollback does not affect WhatsApp intake, Kitty responses, contact policy, scheduling, approvals, settlements, or the operational `hermes_messages` ledger.

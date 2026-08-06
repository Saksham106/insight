# Academy profile deployment

Apply `config.override.yaml` as the Academy-only managed overlay. It keeps this
profile on DeepSeek even when Swati's default profile is centrally pinned to a
Codex model, resets conversations after four idle hours (or at 4 AM), and keeps
all reset/compression lifecycle notices in the background.

Create the profile from the current Hermes configuration, then restrict the WhatsApp-facing toolsets:

```yaml
platform_toolsets:
  whatsapp_cloud:
    - web
    - browser
    - file
    - vision
    - skills
    - todo
    - memory
    - session_search
    - insight_scheduling
    - clarify
    - cronjob

plugins:
  enabled:
    - insight-scheduling

onboarding:
  # Keep this quoted: Hermes expects the string "off", not YAML boolean false.
  profile_build: "off"

memory:
  user_profile_enabled: false

display:
  platforms:
    # The official Meta adapter uses the whatsapp_cloud platform key.
    whatsapp_cloud:
      busy_ack_detail: false
      busy_steer_ack_enabled: false
      interim_assistant_messages: false
      long_running_notifications: false
      tool_progress: "off"

gateway:
  platforms:
    whatsapp_cloud:
      # Hermes sender IDs contain digits only, without a leading plus sign.
      allow_admin_from: ["84917583553"]
      user_allowed_commands: []
```

The onboarding setting disables Hermes's generic first-contact request to build a personal user profile. The memory setting independently prevents `USER.md` profile loading for external contacts. It does not disable the general memory tool retained for the pilot. Keep `memory.mnemosyne.profile_isolation` enabled so Academy conversations cannot share Swati's private-profile memory. The display overrides keep customer-facing Cloud API chats limited to Kitty's final answer rather than internal progress or busy-state commentary. The WhatsApp Cloud command policy makes Swati the only slash-command administrator; ordinary contacts can still chat normally and use the Academy capabilities through natural language.

Copy `hooks/academy-help` to the profile's `hooks/academy-help` directory. This supported Hermes gateway hook replaces `/help` and `/whoami` output for non-admin WhatsApp contacts with the small Academy help message while leaving Swati's operator help intact.

## Admin transcript synchronization

Copy `hooks/insight-transcript-sync` to the profile's `hooks/insight-transcript-sync` directory. It reads `state.db` through Hermes `SessionDB(read_only=True)` and incrementally reads Hermes's exact Meta sent-message index. Insight uses its existing inbound webhook ledger plus those exact sent deliveries, with final Kitty session text only as a historical fallback. System/developer prompts, reasoning, tool calls/results, model metadata, tokens, raw session JSON, media paths, and credentials never enter the request.

Configure the Academy profile with the existing tool secret and keep the new switch off:

```dotenv
HERMES_TOOL_SHARED_SECRET=<same server-only value configured on Insight>
INSIGHT_HERMES_TRANSCRIPT_SYNC_ENABLED=false
INSIGHT_HERMES_TRANSCRIPT_URL=https://<insight-host>/api/hermes/transcripts
```

The `agent:end` handler schedules background work and returns immediately, so Insight or network failure cannot delay a WhatsApp reply. Successful batches atomically advance the session and exact-delivery cursors; failed batches remain eligible for the next turn. The `gateway:startup` hook performs startup catch-up for every Academy WhatsApp session and every retained Meta sent delivery. Stable Hermes and Meta message IDs plus Insight's unique constraints make retries idempotent.

Deploy and activate in this order:

1. Apply `20260727114418_add_hermes_transcript_messages.sql`.
2. Deploy Insight with `/api/hermes/transcripts` and the admin UI.
3. Install the hook with `INSIGHT_HERMES_TRANSCRIPT_SYNC_ENABLED=false`, then restart the Academy gateway and confirm the hook loads.
4. Set the full transcript URL and confirm the existing shared secret matches Insight.
5. Enable the flag and restart the gateway.
6. Send one inbound staging message and one Kitty outbound text, then confirm each appears once under the correct contact in `/admin/hermes`.
7. Restart the gateway again and confirm startup catch-up creates no duplicates.

Safe hook logs contain only status categories and exception classes. Never log a transcript body, HMAC signature, or shared secret. If synchronization fails, verify the URL, secret, feature flag, hook discovery, and safe error category. Do not inspect or paste customer message text into deployment logs.

Rollback is immediate and does not require a database or Fly resource change: set `INSIGHT_HERMES_TRANSCRIPT_SYNC_ENABLED=false` and restart the Academy gateway. Leave the transcript table and cursor in place so re-enabling can resume safely. Do not delete transcript rows during incident response.

## Inbound authorization boundary

Insight is the single contact-authorization gate. Set this in the Academy profile `.env`:

```dotenv
WHATSAPP_CLOUD_ALLOW_ALL_USERS=true
```

This setting removes Hermes's duplicate phone allowlist; it does not make the Academy publicly conversational. The Meta callback must remain the signed Insight webhook. Insight verifies Meta's signature and forwards only an imported, active, consent-attested, classified contact with `communication_policy=direct`. Unknown, unclassified, paused, guardian-only, approval-required, and opted-out contacts are recorded safely and are not forwarded to Kitty. Insight re-signs the filtered payload with the Meta app secret before sending it to the Academy Cloud adapter.

## Isolated Kitty group class calendar

Kitty Classes is a separate calendar owned by Kitty. It does not create or edit Academy sessions, assignments, availability, lesson-ledger evidence, settlements, Google Calendar events, or ordinary chats. A class has one teacher and one or more independently configured student enrollments. Each enrollment may notify the student, one or more parents or guardians, or both. Apply the complete reviewed Kitty migration chain from `20260805120000_add_kitty_class_calendar.sql` through `20260806114049_index_kitty_foreign_keys.sql`, deploy `/api/hermes/class-tools` and `/api/cron/kitty-classes`, install the `kitty-classes` skill in both relevant profiles, and configure:

```dotenv
KITTY_CLASS_CALENDAR_ENABLED=false
INSIGHT_KITTY_CLASS_TOOL_URL=https://<insight-host>/api/hermes/class-tools
WHATSAPP_TEMPLATE_CLASS_CHANGE_REQUEST=<approved Utility template>
WHATSAPP_TEMPLATE_CLASS_CHANGE_PROPOSAL=<approved Utility template>
WHATSAPP_TEMPLATE_CLASS_CANCELLED=<approved Utility template>
WHATSAPP_TEMPLATE_CLASS_RESCHEDULED=<approved Utility template>
WHATSAPP_TEMPLATE_CLASS_CHANGE_REJECTED=<approved Utility template>
WHATSAPP_TEMPLATE_CLASS_ATTENDANCE_UPDATE=<approved Utility template>
WHATSAPP_TEMPLATE_CLASS_TEACHER_DELAY=<approved Utility template>
WHATSAPP_TEMPLATE_CLASS_OPERATIONAL_UPDATE=<approved Utility template>
```

Each template contains only the bounded fields needed for its purpose: recipient name, class description, relevant time, optional replacement or estimated time, and reference code. It never contains a raw inbound message or free-form absence reason. A sender first selects and confirms the exact occurrence and scope. Only then does Insight reserve a notice. An individual absence, late arrival, or early departure updates only that enrollment and notifies the teacher; it does not cancel the group occurrence or identify the student to other families. A teacher-confirmed whole-class cancellation notifies every configured enrollment without waiting for family approval. A whole-class reschedule requires the teacher and one authorized decision for every active enrollment on the same request version. Final notices go to the teacher and each enrollment's configured recipients.

Run a shadow pilot while the flag remains false: use a disposable database or staging project and synthetic contacts to create one individual class and one group class, including a weekly series and a one-off. Snapshot the Academy tables before the pilot and prove they are unchanged afterward. Exercise student and parent absence reports, teacher cancellation, whole-class reschedule approval by every enrollment, ambiguous class and scope selection, stale versions, rejection, duplicate delivery, failed or indeterminate delivery, idempotent retry, privacy between families, Swati override, expiration/recovery, and the daily maintenance job. Confirm that external contacts cannot create or edit classes and that the admin Classes tab shows Upcoming, Needs attention, Recurring, and History.

Before any live send, list environment-variable names without values and confirm the feature flag is false, the dedicated tool URL is exact, all eight Kitty Utility template variables above are present, and the existing Meta sender secrets remain configured. Use only a provider sandbox or explicitly selected contacts for the pilot. If Meta template approval, a safe recipient, or an exact environment value is missing, stop at the database/application pilot and leave the flag false.

After the database, application, template, and selected-contact delivery probes all pass, enable `KITTY_CLASS_CALENDAR_ENABLED=true` in Insight and restart the two Hermes profiles with the dedicated tool URL. Immediately run safe smoke checks. Then prove rollback by setting the flag to `false`: class tools, notification draining, and maintenance must stop while Kitty history remains readable to administrators. Restore `true` only when the smoke checks and rollback proof both pass. Keep the old scheduling-case reschedule path available during the pilot; do not migrate existing cases automatically.

Rollback is immediate: set `KITTY_CLASS_CALENDAR_ENABLED=false`, restart the profiles, and leave all Kitty class, audit, and outbox rows intact. The flag blocks new tools, sends, and maintenance without changing any Academy session or the existing WhatsApp intake path. Resolve any already-finalized class changes manually from the Kitty Classes audit history.

## Swati approval notifications

Insight can notify Swati on WhatsApp when Kitty creates a pending class proposal or monthly settlement. This is an Insight webhook and database capability, not an Academy-profile credential: the Academy profile never receives the Meta token, approval codes, Google authorization, or database service key. A valid WhatsApp or iMessage decision is sufficient; `/admin/hermes` is the audit and fallback path when delivery fails.

Keep the server switch off until the Meta template and staging probes pass:

```dotenv
HERMES_WHATSAPP_APPROVALS_ENABLED=false
HERMES_ADMIN_WHATSAPP_E164=<Swati's verified E.164 number>
WHATSAPP_TEMPLATE_ADMIN_APPROVAL=<approved Utility template name>
WHATSAPP_TEMPLATE_SETTLEMENT_APPROVAL=<approved Utility template name>
WHATSAPP_TEMPLATE_LOCALE=en_US
```

Create and obtain Meta approval for fixed class and settlement Utility templates. The class body has class start, class end, timezone, and reference code. The settlement body has month, total family charges, total tutor claims, currency, and reference code. Neither includes participant names, phone numbers, free-form notes, or Calendar details. Both use quick-reply buttons in this order: `Approve` and `Reject`. Insight supplies the code-bound payloads `approval:approve:<CODE>` and `approval:reject:<CODE>`; do not put a fixed code into a template. Meta template creation and approval happen outside this repository.

Swati can use either quick reply or send exactly `APPROVE <CODE>` or `REJECT <CODE>`. Generic replies such as “yes”, “ok”, or emoji are not decisions. Insight accepts a decision only when the feature is enabled, the sender exactly matches `HERMES_ADMIN_WHATSAPP_E164`, the six-character code is pending and unexpired, and that approval has not already been consumed. A recognized admin command is handled before contact forwarding and is never sent to Kitty as conversation text. Codes expire after 48 hours and expose no case data by themselves.

Before production activation, test all of these in staging:

1. Request a synthetic approval and confirm the approved Utility template reaches only Swati's verified number.
2. Approve with each quick reply and with `APPROVE <CODE>`; reject a separate proposal with `REJECT <CODE>`.
3. Send the same command from the wrong number and confirm it cannot decide the approval.
4. Try an expired code, a replayed Meta message, a reused code, and a generic “yes”; each must fail without changing the approval.
5. Race a WhatsApp reply against a decision in `/admin/hermes`; exactly one path may consume the pending approval.
6. Force template delivery failure and confirm the proposal remains pending and usable in `/admin/hermes`.
7. Confirm audit records contain the channel and outcome but not message text, the approval code, or participant details.

Enable `HERMES_WHATSAPP_APPROVALS_ENABLED=true` only after those probes pass. The current release does not send automatic class reminders.

## Flexible lesson ledger (Phase 1)

The lesson ledger is an evidence workflow separate from settlements and Calendar. Apply `20260728120052_add_flexible_lesson_ledger.sql`, reuse the approved `class_human_attention` Utility template, and keep it disabled until synthetic staging verification is complete:

```dotenv
HERMES_LESSON_LEDGER_ENABLED=false
WHATSAPP_TEMPLATE_LESSON_REPORT_REQUEST=class_human_attention
```

Swati explicitly selects the tutors Kitty should contact for a month and may include herself as a teacher. The request template contains only the month. Each selected tutor replies with a natural lesson list; Kitty stores normalized individual lesson rows, shows a normalized summary, and requires confirmation of the exact pending revision. Corrections create a new revision and require confirmation again. Server-side session identity limits an external tutor to their own collection and report, regardless of any actor or tutor identifier in model-generated input.

Swati can edit teacher–student and guardian–student relationships, import her own normalized Sheet rows, resolve an unexpected or ambiguous student, inspect consolidation across teachers, and perform final cycle confirmation. The ledger remains authoritative after import; Google Sheets and Calendar are inputs, not evidence that silently creates lessons.

Phase 1 stores dates, whole-minute durations, subjects, teacher/student links, revisions, and confirmation state. It does not calculate invoices, family charges, tutor payouts, taxes, exchange rates, or currency conversion, and Kitty does not move money. VND, INR, or other financial fields belong to a later reviewed billing layer.

Rollback is to set `HERMES_LESSON_LEDGER_ENABLED=false`. Leave relationships, lesson reports, revisions, and audit records intact. Disabling this flag does not disable scheduling or the older settlement feature.

## Contact open-objective continuity

The signed `get_my_open_objectives` action derives a contact's unfinished lesson-report or sent family-invoice objective from existing Mindset Academy records. It adds no table, migration, cron job, environment variable, or new outbound sender. The Academy profile checks it on every eligible external inbound WhatsApp turn, answers the immediate message first, and may add at most one friendly reminder when the objective was not already mentioned in the visible recent exchange. Database state, not conversation memory, decides completion.

Deploy Insight before replacing the Academy profile's `AGENTS.md` and `insight-scheduling` skill. Back up both live files, copy the verified versions into the Academy profile only, and restart only the Academy gateway. Do not change the default profile or either profile's approvals configuration.

Verify with a consent-attested synthetic contact: requested ledger work returns `awaiting_report`, a submitted revision returns `awaiting_confirmation`, confirmation removes the objective, a sent family invoice returns `awaiting_payment`, and recorded payment removes it. Confirm another contact sees none of those details. Do not send unsolicited production reminders during the probe.

Rollback by restoring the backed-up Academy files and restarting only the Academy gateway. The action is read-only and existing ledger, invoice, contact, and message records remain unchanged.

## Monthly tutor settlements

Enable the settlement tools independently and only after applying `20260717022438_add_academy_settlements.sql` and completing staging probes:

```dotenv
HERMES_SETTLEMENTS_ENABLED=false
WHATSAPP_TEMPLATE_TUTOR_REPORT_REQUEST=<approved Utility template name>
WHATSAPP_TEMPLATE_FAMILY_INVOICE=<approved Utility template name>
WHATSAPP_TEMPLATE_PAYMENT_REMINDER=<approved Utility template name>
WHATSAPP_TEMPLATE_PAYMENT_RECEIVED=<approved Utility template name>
```

The tutor-report request template parameters are month and currency. The family invoice, reminder, and payment-received templates use month, class count, total minutes, and the locale-formatted amount, in that order. Insight derives every value and any in-window free-form copy from the stored settlement or approved invoice snapshot; the agent cannot supply financial wording or amounts.

For this release, the tutor report is the financial source of truth. Kitty asks each tutor to report the students taught, class count, total minutes, optional lesson dates, and the tutor's claimed payout. Insight and Google Calendar are not used to infer or reconcile those numbers. Swati resolves each student and billing contact and enters the family charges. Kitty then creates one immutable approval snapshot containing the invoice and payout totals. Swati may approve that exact snapshot using the code-bound WhatsApp message, her verified iMessage conversation, or the Kitty dashboard; the first valid decision is authoritative across all three channels.

After approval, Kitty may send the approved family invoice, payment reminder, payment-received acknowledgement, or tutor-report request using the configured templates. Swati still verifies incoming payment and sends each tutor's share herself. Recording a family payment or tutor payout only changes Insight's bookkeeping status; Kitty does not move money, connect to a bank, or initiate a transfer. Keep source reports, approval snapshots, invoice records, payout records, messages, and audit events for traceability.

In staging, use synthetic contacts and verify tutor self-submission, Swati-only charge entry, rejection and revision, cross-channel approval races, template failure, payment eligibility only after related family invoices are paid, idempotent status recording, and feature-flag rollback. Set `HERMES_SETTLEMENTS_ENABLED=true` only after all probes pass. Rollback by setting it to `false`; leave records intact and finish any real payments manually.

### Approval notification rollback

Set `HERMES_WHATSAPP_APPROVALS_ENABLED=false` first. Pending proposals remain available in `/admin/hermes`; do not delete approval bindings or audit rows. Removing `WHATSAPP_TEMPLATE_ADMIN_APPROVAL` also makes new notifications fail closed, but the feature flag is the primary kill switch. Disabling this path does not change contact intake, Academy messaging, the default-profile Calendar worker, or existing Calendar events.

Keep the previous `WHATSAPP_CLOUD_ALLOWED_USERS` value as rollback data. If Meta's callback is ever restored directly to Hermes, set `WHATSAPP_CLOUD_ALLOW_ALL_USERS=false` before or at the same time so the explicit Hermes allowlist becomes authoritative again.

Do not enable terminal, code execution, image generation, computer control, delegation, TTS, or unrestricted Google Workspace credentials for this profile. The pilot intentionally retains web/browser, file, vision, skills, todo, memory, session search, clarification, and cron capabilities; revisit that broader set only after observing real usage.

The deployed Hermes revision must provide `gateway.session_context` backed by Python `ContextVar`, and its WhatsApp Cloud adapter must set equal DM `chat_id` and `user_id` values while rejecting group-shaped payloads. Fail the deployment if that integration probe or `hermes -p academy config check` fails.

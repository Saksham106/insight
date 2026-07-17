# Academy profile deployment

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

## Inbound authorization boundary

Insight is the single contact-authorization gate. Set this in the Academy profile `.env`:

```dotenv
WHATSAPP_CLOUD_ALLOW_ALL_USERS=true
```

This setting removes Hermes's duplicate phone allowlist; it does not make the Academy publicly conversational. The Meta callback must remain the signed Insight webhook. Insight verifies Meta's signature and forwards only an imported, active, consent-attested, classified contact with `communication_policy=direct`. Unknown, unclassified, paused, guardian-only, approval-required, and opted-out contacts are recorded safely and are not forwarded to Kitty. Insight re-signs the filtered payload with the Meta app secret before sending it to the Academy Cloud adapter.

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

## Monthly tutor settlements

Enable the settlement tools independently and only after applying `20260717022438_add_academy_settlements.sql` and completing staging probes:

```dotenv
HERMES_SETTLEMENTS_ENABLED=false
WHATSAPP_TEMPLATE_TUTOR_REPORT_REQUEST=<approved Utility template name>
WHATSAPP_TEMPLATE_FAMILY_INVOICE=<approved Utility template name>
WHATSAPP_TEMPLATE_PAYMENT_REMINDER=<approved Utility template name>
WHATSAPP_TEMPLATE_PAYMENT_RECEIVED=<approved Utility template name>
```

For this release, the tutor report is the financial source of truth. Kitty asks each tutor to report the students taught, class count, total minutes, optional lesson dates, and the tutor's claimed payout. Insight and Google Calendar are not used to infer or reconcile those numbers. Swati resolves each student and billing contact and enters the family charges. Kitty then creates one immutable approval snapshot containing the invoice and payout totals. Swati may approve that exact snapshot using the code-bound WhatsApp message, her verified iMessage conversation, or the Kitty dashboard; the first valid decision is authoritative across all three channels.

After approval, Kitty may send the approved family invoice, payment reminder, payment-received acknowledgement, or tutor-report request using the configured templates. Swati still verifies incoming payment and sends each tutor's share herself. Recording a family payment or tutor payout only changes Insight's bookkeeping status; Kitty does not move money, connect to a bank, or initiate a transfer. Keep source reports, approval snapshots, invoice records, payout records, messages, and audit events for traceability.

In staging, use synthetic contacts and verify tutor self-submission, Swati-only charge entry, rejection and revision, cross-channel approval races, template failure, payment eligibility only after related family invoices are paid, idempotent status recording, and feature-flag rollback. Set `HERMES_SETTLEMENTS_ENABLED=true` only after all probes pass. Rollback by setting it to `false`; leave records intact and finish any real payments manually.

### Approval notification rollback

Set `HERMES_WHATSAPP_APPROVALS_ENABLED=false` first. Pending proposals remain available in `/admin/hermes`; do not delete approval bindings or audit rows. Removing `WHATSAPP_TEMPLATE_ADMIN_APPROVAL` also makes new notifications fail closed, but the feature flag is the primary kill switch. Disabling this path does not change contact intake, Academy messaging, the default-profile Calendar worker, or existing Calendar events.

Keep the previous `WHATSAPP_CLOUD_ALLOWED_USERS` value as rollback data. If Meta's callback is ever restored directly to Hermes, set `WHATSAPP_CLOUD_ALLOW_ALL_USERS=false` before or at the same time so the explicit Hermes allowlist becomes authoritative again.

Do not enable terminal, code execution, image generation, computer control, delegation, TTS, or unrestricted Google Workspace credentials for this profile. The pilot intentionally retains web/browser, file, vision, skills, todo, memory, session search, clarification, and cron capabilities; revisit that broader set only after observing real usage.

The deployed Hermes revision must provide `gateway.session_context` backed by Python `ContextVar`, and its WhatsApp Cloud adapter must set equal DM `chat_id` and `user_id` values while rejecting group-shaped payloads. Fail the deployment if that integration probe or `hermes -p academy config check` fails.

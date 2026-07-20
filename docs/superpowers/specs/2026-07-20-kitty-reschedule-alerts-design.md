# Kitty Reschedule Alerts and Template Contracts

## Goal

Make student/tutor reschedule requests reliably reach Swati on WhatsApp, while preventing Hermes profiles from breaking scheduling calls through field-name or Meta-template parameter mistakes.

## Confirmed failure

Little's WhatsApp profile found both cases, but called `request_reschedule`, `get_case`, and `escalate_to_swati` with `case_id`. The API accepted only `caseId`, so each mutation failed. The agent then described an escalation that had not happened. Swati's profile repeated the same mismatch and could not use `list_my_cases`, which is deliberately contact-only. Even a successful escalation currently only changes the case row; it does not notify Swati.

## Design

1. Normalize a small allowlist of legacy snake_case payload aliases at the authenticated API boundary. Camel-case remains canonical. Unknown fields and nested business data are not rewritten.
2. Add an admin-only `list_cases` action with bounded filters and participant summaries. Keep `list_my_cases` contact-only.
3. Replace agent-authored scheduling template arrays with semantic scheduling fields. The sender obtains the recipient name from the contact and constructs the exact approved-template parameters. Raw arrays remain accepted only as a temporary, strictly validated compatibility path.
4. Add `admin_reschedule_alert` as an internal-only WhatsApp intent. A reschedule/escalation records a case state transition, then calls the signed sender for Swati's contact. The sender constructs both the service-window text and the purpose-built template parameters.
5. Store the outbound alert in `hermes_messages`, using a deterministic idempotency key. Report `accepted`, `duplicate`, `blocked`, or `failed` truthfully in the tool result. Never describe Meta acceptance as delivery.
6. Add and configure an approved Utility template named `kitty_reschedule_alert`. Until Meta approves it, alerts can still use free-form text inside Swati's 24-hour service window; outside it they fail closed as `template_unavailable` while the case remains visibly flagged.

## Security and privacy

- Only the backend can request `admin_reschedule_alert`; it is not exposed in either agent plugin.
- The recipient must match `HERMES_ADMIN_WHATSAPP_E164` and an active, attested direct-contact record.
- Student/tutor tools remain case-membership scoped. Admin listing is available only through the verified iMessage/protected CLI admin route.
- Alert text contains a contact display name, case title, and concise reason, but no transcript.

## Operational behavior

- The case transition succeeds even if WhatsApp is temporarily unavailable; the response includes the notification failure so the agent cannot claim Swati was reached.
- Repeating the same action does not send duplicate alerts.
- The dashboard and admin agent can retrieve all `needs_attention` cases with `list_cases`.
- The existing Calendar worker is unchanged: a reschedule request pauses automation for that case; Swati must review it before a new proposal/approval/calendar write.

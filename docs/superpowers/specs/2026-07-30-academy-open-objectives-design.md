# Academy WhatsApp Open Objectives

## Goal

Keep Kitty aware of an Academy contact's unfinished lesson-ledger or payment task when that contact changes the subject in WhatsApp. Kitty should answer the contact's immediate message normally and then, when appropriate, add one brief and friendly reminder about the outstanding task.

The authoritative state remains in Mindset Academy. Kitty's conversation memory must never be treated as proof that a lesson report was submitted, confirmed, or paid.

## Scope

This release covers two contact-scoped objectives:

1. A selected tutor has an unfinished monthly lesson-ledger collection.
2. A billed parent or guardian has an invoice that was sent but is not recorded as paid.

It does not add scheduled reminders, automatic follow-up jobs, a persistent reminder cooldown, a generic objective-management system, or new financial behavior. It does not change Meta's 24-hour service-window rules or send a new outbound message merely because an objective exists.

## Architecture

Add one read-only Hermes tool action named `get_my_open_objectives`.

For an external WhatsApp contact, the server derives identity exclusively from the signed Hermes WhatsApp session. It ignores model-supplied contact identity and returns only objectives belonging to that authenticated contact. The action is contact-only; Swati continues to use the existing admin ledger and settlement actions for administrative visibility.

The action derives current objectives from existing tables:

- `academy_teacher_collections` joined to `academy_lesson_cycles` for tutor ledger state.
- `academy_lesson_report_revisions` when a submitted revision is awaiting the tutor's confirmation.
- `academy_family_invoices` joined to `academy_settlement_cycles` for sent, unpaid family invoices.
- `hermes_contacts` for the server-resolved actor.

No new Supabase table or migration is required. The queries run concurrently, are bounded, select explicit columns, and return a small projection rather than raw database rows.

The projection is produced by a focused pure module:

```ts
type OpenObjective =
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
```

The API returns at most three objectives, ordered deterministically:

1. A submitted lesson report awaiting confirmation.
2. A requested lesson report awaiting submission.
3. A sent family invoice awaiting payment.

Within a category, older accounting periods come first. The response also identifies the first item as `primaryObjective`.

## Objective Rules

### Lesson ledger

A lesson objective is open when:

- The authenticated contact is the collection's `tutor_contact_id`.
- The parent lesson cycle is not finally confirmed.
- The collection is in an unfinished state.

The stages are:

- `awaiting_report` when the collection status is `requested`, `awaiting_reply`, or `needs_attention` and there is no current submitted report awaiting confirmation.
- `awaiting_confirmation` when the latest non-superseded report revision is pending confirmation.

Collections in `not_requested` are not exposed as conversational objectives because Swati has not asked Kitty to contact that tutor yet. Confirmed collections and confirmed cycles are not open objectives.

### Family payment

A payment objective is open when:

- The authenticated contact is the invoice's `billed_contact_id`.
- The invoice status is `sent`.

Invoices in `approved` have not yet been sent and are not conversational objectives. Invoices in `paid` or `void` are complete and are not returned.

The projection may include a server-derived invoice reference but must not expose internal approval data, other family members, another student's records, raw item snapshots, or private amounts that are unnecessary for the redirect.

## Academy Behavior

`infra/hermes-profiles/academy/AGENTS.md` and the `insight-scheduling` skill will require Kitty to call `get_my_open_objectives` near the beginning of every eligible external inbound WhatsApp turn before deciding whether to redirect. Swati's administrator conversation is excluded because she already has the complete admin workflows and is not the subject of a contact reminder.

When an objective is open, Kitty:

1. Answers the contact's immediate legitimate question.
2. Adds at most one short reminder about the primary objective when the objective has not already been mentioned in the visible recent conversation.
3. Uses the returned period, stage, and reference only; it does not invent completion state, lesson details, amounts, or deadlines.
4. Asks for the lesson list when `awaiting_report`.
5. Asks the tutor to confirm or correct the exact pending summary when `awaiting_confirmation`.
6. Gently mentions the outstanding invoice when `awaiting_payment`.

Kitty does not remind when:

- The immediate message is itself supplying or correcting the requested information.
- The objective was already mentioned in the visible recent exchange.
- The contact says `STOP`, opts out, disputes consent, requests Swati, or raises a safety-sensitive issue.
- The tool is unavailable or returns an error. Failure must not cause Kitty to guess an objective.

The existing `SOUL.md` already defines a warm, concise, non-pressuring tone and does not need operational state. The operational rule belongs in `AGENTS.md` and the skill.

## WhatsApp Delivery Boundary

This feature affects Kitty's response to an inbound WhatsApp message. That inbound message opens or refreshes the contact's customer-service window, so Kitty's ordinary conversational reply can contain the gentle redirect.

The feature does not create a new proactive free-form sender. Outside the customer-service window, existing Meta template selection and backend message validation remain authoritative. The initial business template does not itself prove that a free-form window is open.

## Files

Expected implementation changes:

- `src/lib/hermes/open-objectives.ts`
  - Objective types, validation, deterministic prioritization, and contact-safe projection.
- `src/app/api/hermes/tools/route.ts`
  - Register `get_my_open_objectives`, run bounded self-scoped queries, and return the projection.
- `src/lib/hermes/cases.ts`
  - Grant the action self-only scope for authenticated contacts.
- `infra/hermes-skills/insight-scheduling/SKILL.md`
  - Document the action and the required inbound objective check.
- `infra/hermes-profiles/academy/AGENTS.md`
  - Define answer-then-redirect behavior and suppression rules.
- `src/lib/hermes/open-objectives.test.cjs`
  - Test objective derivation, ordering, completion filtering, and bounded output.
- `src/lib/hermes/cases.test.cjs`
  - Test self-only authorization and route source boundaries.
- `infra/hermes-profiles/academy/test_profile.py`
  - Test that Academy deployment instructions retain the objective behavior.

Documentation or focused route tests may be updated if required by the existing test organization.

## Security

- External contacts can retrieve only objectives associated with their server-resolved contact ID.
- The action accepts no `contactId`, phone number, actor, role, or authorization override.
- It exposes no message transcript bodies, raw invoice snapshots, approval codes, other contacts, or internal notes.
- It remains behind the existing signed Hermes tool endpoint.
- Database access remains server-side through the existing admin client.
- No Supabase grants or RLS policies change because no table is added.

## Errors and Limits

- Unknown, inactive, unclassified, unconsented, or disallowed contacts continue to be rejected by the existing inbound boundary.
- A database failure returns the standard safe tool error and no objective.
- The result is capped at three objectives.
- Invalid or unexpected database states are ignored by the pure projector rather than converted into conversational claims.
- The action is read-only and idempotent.

## Verification

Automated tests will cover:

- A requested tutor collection becomes `awaiting_report`.
- `not_requested`, confirmed, and final-cycle collections are excluded.
- A pending current report becomes `awaiting_confirmation`.
- Superseded revisions do not become the current objective.
- A sent invoice becomes `awaiting_payment`; approved, paid, and void invoices are excluded.
- Another contact's objectives cannot enter the response.
- Ordering and the three-objective cap are deterministic.
- The Academy profile instructs Kitty to answer first, redirect once, avoid repetition, fail closed, and honor `STOP`.
- The action accepts no caller-supplied identity.

After deployment, a synthetic WhatsApp probe will verify:

1. A tutor with an outstanding collection changes the subject.
2. Kitty answers and adds one concise ledger reminder.
3. A second immediate unrelated message does not produce repetitive pressure when the objective is visible in recent context.
4. Submitting the report changes the reminder to confirmation guidance.
5. Confirming the report removes the objective.
6. A sent family invoice produces a payment reminder for its billed contact only.
7. Recording payment removes the payment objective.
8. A different contact receives none of those private objective details.

## Rollback

Rollback consists of removing the Academy instruction and disabling or removing the read-only action. Existing ledger, invoice, contact, and message records remain unchanged. No database rollback is necessary.

## Kitty Handoff Text

After implementation and deployment, provide the user with:

- One short instruction block for the Academy WhatsApp profile explaining the live open-objective behavior.
- One short instruction block for Swati's default profile explaining that Mindset Academy, not conversational memory, controls ledger and payment completion.

The Academy block is the operationally important one. Both instruction blocks must match the deployed behavior and must not teach Kitty to bypass the signed tools, Meta policy, contact authorization, or completion checks.

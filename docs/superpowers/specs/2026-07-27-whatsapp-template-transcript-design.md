# WhatsApp Template Transcript Design

## Goal

Show the exact successful WhatsApp template that opened a conversation as the
first message in the admin-only transcript, while continuing to exclude system
prompts, tool calls, reasoning, failed delivery attempts, and other internal
events.

## Design

The admin transcript remains a projection of the WhatsApp delivery ledger.
Successful inbound and outbound text messages continue to appear exactly as
stored. Successful outbound template rows are added to the same projection when
they contain a non-empty rendered body.

Current sends already snapshot the rendered, user-visible template body in
`hermes_messages.body`. One older successful template row predates that behavior.
Its body can be recovered from the immediately preceding failed send attempt
only when contact, scheduling case, intent, template name, and locale all match.
This uses an authoritative prior delivery record instead of reconstructing or
manually copying customer text.

Failed template attempts remain hidden. A bodyless template that cannot be
matched safely remains hidden rather than displaying invented content.

## Verification

- Regression tests assert that the migration includes successful text and
  template deliveries.
- Regression tests assert that failed template attempts cannot appear.
- Regression tests assert that legacy recovery requires the full delivery
  identity and a prior non-empty body.
- The production row counts are checked before applying the migration.
- The admin transcript is checked after migration to confirm chronological
  placement and message totals.


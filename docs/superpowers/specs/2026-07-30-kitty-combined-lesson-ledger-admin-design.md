# Kitty Combined Lesson Ledger Admin Design

**Date:** 2026-07-30
**Status:** Approved for implementation
**Product:** MyInsightAcademy
**Route:** `/admin/hermes`

## Objective

Make Kitty's existing flexible lesson ledger visible to authenticated Academy
administrators without replacing or conflating the older financial settlement
records. The current `Settlements` tab becomes a combined monthly ledger
surface:

1. lesson collection and confirmed lesson evidence first; and
2. financial settlement, invoice, and payout tracking second.

The page remains read-only. Routine collection, correction, confirmation, and
messaging continue through Kitty's bounded tools.

## Existing State

The flexible lesson ledger is already deployed and enabled. Its authoritative
records are:

- `academy_lesson_cycles`;
- `academy_teacher_collections`;
- `academy_lesson_report_revisions`; and
- `academy_lessons`.

Kitty already has session-bound actions for starting cycles, requesting tutor
reports, submitting and revising lesson lists, confirming exact report
revisions, resolving students, consolidating lessons, confirming cycles, and
reopening confirmed cycles.

The admin page currently loads only `academy_settlement_cycles` and its
financial children. It therefore cannot display the lesson cycle that already
exists in production.

## Admin Data Projection

The server-rendered `/admin/hermes` page loads at most twelve recent lesson
cycles. Each cycle projection contains:

- cycle ID, month, status, version, confirmation time, and update time;
- each selected tutor's ID, display name, and collection status;
- the active report revision only, including revision number, source,
  submission time, confirmation time, and report status;
- each active lesson's ID, resolved student name when available, originally
  reported student name, date, duration, and optional subject; and
- aggregate counts for tutors requested, tutor reports confirmed, unresolved
  students, and recorded lessons.

Superseded report revisions are not mixed into the current evidence view. The
UI states that corrections are preserved in audit history.

The existing financial-settlement projection remains unchanged and appears
below the lesson ledger in the same tab.

## Interface

Rename the tab from `Settlements` to `Ledger`. Its count badge reflects recent
lesson cycles plus financial cycles.

The first panel is **Lesson collection**:

- newest month first;
- the newest cycle expanded by default;
- a status badge and compact progress counters in each cycle summary;
- tutor sections showing request/report status;
- chronological lesson rows grouped under the active tutor report;
- visible warnings for unresolved students and delivery/import failures; and
- clear empty states for no cycle, no report, and a confirmed zero-lesson
  report.

The second panel remains **Financial settlements** and preserves the existing
report, invoice, and payout counters. Copy explicitly distinguishes lesson
evidence from financial bookkeeping.

The interface adds no visual calendar, editing form, financial calculation, or
message-send control.

## Authorization and Privacy

- The route continues to require the `admin` role before creating the
  service-role Supabase client.
- No public, tutor, parent, or student route receives the combined projection.
- The view includes structured lesson evidence only, never raw agent prompts,
  reasoning, tool calls, credentials, or copied WhatsApp transcripts.
- Phone numbers are not needed in the ledger projection.
- Tutors remain restricted to their own requested collection through the
  session-bound tool API.
- Parents and students receive no ledger lookup action.

## Tutor and Parent Messaging Boundary

Tutor outreach remains deterministic:

- Kitty calls `request_lesson_report`;
- the Academy backend selects the `lesson_report_request` intent;
- production maps that intent to the configured approved Meta template;
- the backend fills the verified tutor name and month-specific request text;
- tutors reply naturally;
- Kitty stores normalized individual lessons and asks the tutor to confirm the
  exact report revision.

Parent messaging belongs to the separate financial settlement workflow:

- Kitty may prepare and send a family invoice, payment reminder, or
  payment-received acknowledgement only from the matching approved family
  invoice record;
- the billed contact must match the recipient;
- messages outside the recipient's WhatsApp service window require the
  configured approved Meta template;
- Kitty never exposes another family's data; and
- Kitty never moves money or infers that payment occurred.

The combined admin surface observes both workflows but does not loosen their
authorization or approval rules.

## Error Handling

- If lesson-ledger loading fails, show a lesson-specific unavailable message
  while preserving the rest of the Kitty admin page.
- If a tutor contact was deactivated after a historical report, retain a safe
  fallback label instead of dropping the collection.
- Missing active reports display as awaiting data.
- An unresolved lesson is visibly marked and counted.
- A confirmed report with no lessons is shown as a valid zero-lesson report.
- Existing financial data continues to render even if lesson data is
  unavailable, and vice versa.

## Testing

Add test-first coverage for:

- the admin page querying all four lesson-ledger tables with bounded, explicit
  columns;
- projecting only active report revisions;
- tutor names, progress counts, unresolved lessons, zero-lesson reports, and
  chronological rows;
- the `Ledger` tab and combined count;
- admin authorization occurring before privileged access;
- separate failure states for lesson and financial data; and
- preservation of the existing financial settlement panel.

Repair the stale conversation-link source assertion introduced by the mobile
master/detail refactor without changing runtime behavior.

Run the focused Node tests, Python profile/plugin tests, lint, and production
build before completion.

## Acceptance Criteria

- An authenticated administrator can open `/admin/hermes?tab=ledger` and see
  the production lesson cycle, its selected tutor, request state, active
  report, and lesson rows.
- Unresolved students and missing reports are immediately visible.
- Superseded revisions never appear as current evidence.
- Existing financial settlement tracking remains available below the lesson
  ledger.
- No non-admin receives ledger data.
- The admin UI does not send messages, change records, calculate money, or move
  money.

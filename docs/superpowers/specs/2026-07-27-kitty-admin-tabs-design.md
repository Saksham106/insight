# Kitty admin page — tabbed redesign

Date: 2026-07-27
Scope: `/admin/hermes` presentation only. No behaviour, data, or API changes.

## Problem

`/admin/hermes` renders seven stacked cards in a single column:

1. Quick add contact (form)
2. Import iPhone contacts (file upload + per-row role picker)
3. WhatsApp conversations (contact list + transcript, full width)
4. Needs attention (pending approvals + contacts needing classification)
5. Active scheduling (open cases)
6. Monthly settlements (up to 12 cycles, three progress counters each)
7. Recent activity (raw message delivery log)

Two setup forms that an admin touches occasionally sit above the work they
open the page to do. Everything competes for the same vertical column, so
nothing reads as primary. `hermes-assistant-dashboard.tsx` is 306 lines with
several 200-character JSX lines.

## Solution

A tab bar under the page header. Five tabs, each an ordinary link that sets a
`tab` search param, so the page stays a server component, deep-links, and
works with the browser back button. The existing `contact` search param is
preserved across tab links.

Default tab (no param, or an unrecognised value): **Conversations**.

### Tabs

| Tab | Contents |
| --- | --- |
| Conversations (default) | The existing contact list + transcript two-pane, now occupying the full content area |
| Needs attention | Pending approvals with Approve/Reject, plus contacts needing a role or with a non-direct policy. Recent activity moves here as a collapsed "Delivery log" disclosure |
| Scheduling | Active scheduling cases |
| Settlements | Monthly cycles; each cycle is a `<details>` whose summary shows month + status and whose body holds tutor reports / family invoices / tutor payouts |
| Contacts | "Add a contact" and "Import from a contact file" as collapsed `<details>`, above a read-only contact directory |

Each tab that has a countable backlog carries a count badge, so a collapsed
tab never hides the fact that work is waiting.

A compact stat strip under the title shows contacts / pending approvals /
active cases at all times.

### Contact directory

The Contacts tab lists every loaded contact with name, WhatsApp number, role,
profile link status, communication policy, and consent status. These fields
are already fetched by `page.tsx` today and used only to compute the
"needs attention" filter. Rendering them adds no query and no mutation.

## Files

- `src/components/admin/hermes-dashboard-shared.ts` — shared types
  (`HermesContactIdentity`, `HermesAdminContact`, panel prop types),
  `formatMessageTime`, `Empty`, `PanelCard`.
- `src/components/admin/hermes-assistant-dashboard.tsx` — header, stat strip,
  tab bar, panel dispatch.
- `src/components/admin/hermes-conversations-panel.tsx`
- `src/components/admin/hermes-attention-panel.tsx`
- `src/components/admin/hermes-scheduling-panel.tsx`
- `src/components/admin/hermes-settlements-panel.tsx`
- `src/components/admin/hermes-contacts-panel.tsx`
- `src/app/(dashboard)/admin/hermes/page.tsx` — parses `tab`; all six Supabase
  queries stay exactly as they are.

`hermes-contact-quick-add.tsx`, `hermes-contact-import.tsx`, and
`hermes-approval-actions.tsx` are reused unchanged.

## Non-goals

- No change to any query, route handler, or database object.
- No per-tab lazy loading. Every tab renders from the same single page load,
  so switching tabs cannot show staler data than the page already had.
- No new mutations. The contact directory is read-only.

## Tests

`src/components/admin/hermes-assistant-dashboard.test.cjs` asserts on file
source text. Each `read()` target is repointed at the panel file that now owns
the label. Every asserted string is kept; no assertion is loosened or removed.
New assertions cover the tab bar, the default tab, and `contact` param
preservation across tab links.

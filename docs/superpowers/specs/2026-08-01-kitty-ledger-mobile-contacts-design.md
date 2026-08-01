# Kitty admin — ledger accordion, mobile tabs, contact names

Date: 2026-08-01
Scope: `/admin/hermes`. Four independent changes. Three are presentation-only;
the fourth adds one nullable column to `hermes_contacts` and changes the name
Kitty puts in outbound WhatsApp messages.

## Problems

1. **Ledger is a wall.** The Lesson collection card opens the latest month and
   renders *every* teacher collection fully expanded, each with its complete
   lesson list. Seven tutors with six lessons each is one long scroll with no
   way to collapse a tutor you have already reviewed.
2. **Mobile section bar scrolls sideways.** Under 768px `.kitty-tabs` is
   `flex-wrap: nowrap; overflow-x: auto`, so reaching Contacts or Ledger on a
   phone means dragging a strip horizontally. Chips past the fold are invisible.
3. **Imported names go out verbatim.** `hermes_contacts.display_name` holds the
   name exactly as Swati saved it on her phone, which often carries context she
   added for herself — `Anjali Chemistry Teacher 12/15`, `C.A. Ritesh Sir`.
   Both Meta template call sites in `src/app/api/whatsapp/send/route.ts` pass
   `contact.display_name` into the template's *recipient name* parameter, so
   WhatsApp sends "Hi Anjali Chemistry Teacher 12/15, …".
4. **Contacts are unsearchable and read-only.** The directory renders every
   active contact as a flat list with no filter and no way to correct anything.
5. **Tab order does not match use.** Ledger and Contacts are the tabs Swati
   opens most, and they sit third and fifth.

## 1 · Tab order

New order, left to right:

`Conversations → Ledger → Contacts → Scheduling → Needs attention`

Landing tab stays Conversations. Two literals move — `HERMES_TABS` in
`hermes-dashboard-shared.tsx` and the `tabs` array in
`hermes-assistant-dashboard.tsx`. Tabs resolve by name, not index, so existing
deep links keep working.

## 2 · Mobile chip grid

In the max-width 768px block of `src/app/globals.css`, delete both the
`.kitty-tabs { flex-wrap: nowrap; overflow-x: auto; scroll-padding-inline }`
rule and the `.kitty-tabs > * { flex-shrink: 0 }` rule that supports it,
leaving the base `.kitty-tabs` (which already wraps), and add:

```css
@media (max-width: 768px) {
  .kitty-tabs > * {
    flex: 1 1 calc(50% - 3px);
    justify-content: center;
  }
}
```

Five chips lay out 2 / 2 / 1; the lone fifth chip grows to full width. Desktop
is untouched — chips keep their auto width in a single row. Badge counts stay
visible at every size. No JavaScript, no new component.

## 3 · Ledger accordion

`hermes-settlements-panel.tsx` only. `loadAdminLessonCycles` and the Financial
settlements card are unchanged.

Each teacher collection becomes a `<details>` closed by default, inside the
month `<details>` (which keeps its current behaviour: latest month open). The
expanded body is exactly what renders today — delivery status, failure line,
revision line, lesson list.

The collapsed summary must carry enough to triage without opening:

```
▸ Anjali Sharma      confirmed · 6 lessons
▸ Meera Nair         submitted · 5 lessons · ⚠ 1 unresolved
▸ Karan Shah         awaiting report
▸ Ravi Menon         confirmed · 4 lessons · ⚠ delivery failed
```

Summary rules:

| Element | Source |
| --- | --- |
| Name | `collection.tutorName`, or "Tutor unavailable" |
| Status badge | `humanize(collection.status)` |
| Lesson count | `report.lessons.length`; omitted when `report` is null |
| "awaiting report" | shown when `report` is null |
| Unresolved warning | count of lessons where `studentName === null`; shown only when > 0 |
| Delivery warning | shown when `requestDeliveryStatus === "failed"` |

The two warnings are the reason the summary is not just name + status: they are
the things you would otherwise miss while every tutor is folded shut.

Several tutors can be open at once — plain `<details>`, no coordinating state.

## 4 · Contacts: search + messaging name

### 4.1 Schema

One migration adds to `public.hermes_contacts`:

```sql
alter table public.hermes_contacts
  add column if not exists preferred_name text
    check (preferred_name is null
           or length(btrim(preferred_name)) between 1 and 100);
```

Nullable, no backfill, no default.

### 4.2 Derivation

`preferred_name` stays null until an admin types one. A single helper resolves
the name to use in messages:

```ts
messagingName(contact) = contact.preferred_name ?? deriveMessagingName(contact.display_name)
```

Deriving instead of backfilling means: no wrong guesses baked into rows that
then need manual cleanup; clearing the field returns to the derived default
rather than to the full imported string; and fixing a mis-imported
`display_name` automatically fixes the messaging name.

`deriveMessagingName` operates on whitespace-separated tokens. Comparison
normalises a token by lowercasing it and stripping `.` and `'`.

1. Drop leading tokens matching **qualification prefixes**:
   `ca`, `er`, `adv`, `advocate`, `eng`, `engr`, `cs`, `cma`.
2. Drop trailing tokens matching **honorifics**:
   `sir`, `madam`, `maam`, `mam`, `ji`.
3. If the first remaining token matches an **address title** —
   `dr`, `mr`, `mrs`, `ms`, `miss`, `prof` — and a further token follows,
   return both, as originally written.
4. Otherwise return the first remaining token, as originally written (so a
   title with nothing after it returns just the title).
5. If no tokens remain after steps 1–2, return the first token of the original
   `display_name`; if that is empty, return the trimmed `display_name`.

Address titles are kept because dropping one leaves a bare surname that reads
wrong in a greeting — "Hi Sharma". Qualification prefixes are dropped because
the token after them is a given name that stands alone fine — "Hi Ritesh".

Worked cases, all of which become test cases:

| `display_name` | Derived |
| --- | --- |
| `Anjali Chemistry Teacher 12/15` | `Anjali` |
| `Dr. Sharma` | `Dr. Sharma` |
| `C.A. Ritesh Sir` | `Ritesh` |
| `Priya Ma'am` | `Priya` |
| `Mrs Kulkarni Maths` | `Mrs Kulkarni` |
| `Ravi` | `Ravi` |
| `Ravi Uncle` | `Ravi` (first-word rule reaches it anyway) |
| `Maths Sameer` | `Maths` (wrong; edited by hand) |
| `Sir` | `Sir` (nothing survives stripping; step 5) |

The lists stop here deliberately. Relationship words (Uncle, Aunty, Bhaiya)
need no list at all — they trail the name, so the first-word rule already skips
them. Role words (Teacher, Tutor) and leading date/subject junk are **not**
stripped:
longer lists misfire on names that legitimately contain those words, and every
derived name is visible in the directory and editable in one tap.

The helper lives in `src/lib/hermes/contact-name.ts` with a
`contact-name.test.cjs` beside the other hermes lib tests, covering the table
above plus explicit-override precedence and whitespace-only input.

### 4.3 Where the messaging name is used

- `src/app/api/whatsapp/send/route.ts` — all four recipient-name call sites
  switch from `contact.display_name` to `messagingName(contact)`: the lesson
  report request, the family invoice `recipientName`, and both scheduling
  paths (`buildSchedulingMessageContent` and
  `validateSchedulingBodyParameters`). The contact select must add
  `preferred_name`.
- `src/app/api/hermes/tools/route.ts` — `preferred_name` joins `CONTACT_FIELDS`
  and each contact is serialised to the agent with an added `messagingName`.
  This covers Kitty's free-text replies, which the template path does not.
- `infra/hermes-profiles/default-insight/AGENTS.md` — one line: address
  contacts by `messagingName`, never `displayName`.

`display_name` remains the heading everywhere in the admin UI — conversations
list, transcripts, ledger tutor rows, contact directory — so Swati still
recognises people by the context she saved. Only outbound messages use the
short name.

### 4.4 API

`PATCH /api/admin/hermes/contacts/[id]` gains a `preferredName` branch:

- string → trimmed; empty after trim is rejected with 400
- `null` → clears the column, reverting to the derived default
- anything else → 400

It joins the existing `fields` list in the `contact_updated` audit event, and
`preferred_name` is added to the route's `select` so the response carries it.

### 4.5 UI

`hermes-contacts-panel.tsx` becomes a client component. It still receives the
same `contacts` prop from the server page — no new fetch on load.

```
┌────────────────────────────────────────────┐
│ 🔍  Search contacts…                       │
└────────────────────────────────────────────┘
   3 of 247 contacts

   Anjali Chemistry Teacher 12/15    +91…
   Messages as: Anjali  ✎            [teacher]
```

**Search** filters the already-loaded array in the browser, case-insensitively,
across `display_name`, the resolved messaging name, and `whatsapp_e164`. The
page already loads every active contact, so no endpoint is needed at this
scale; if the directory ever outgrows a client-side filter, this becomes a
server query without touching anything else. The header shows
`N of M contacts` while filtering, and an empty result says so.

**Editing** — the pencil swaps the messaging name for an input seeded with the
current resolved value. Save PATCHes `preferredName` and refreshes via
`router.refresh()`, matching `hermes-contact-quick-add.tsx`. Submitting an
empty input sends `null`, resetting to the derived default. A derived (not yet
overridden) name is rendered in muted text so it is distinguishable from one
Swati chose; failures show an inline error and leave the input open.

The existing "Add a contact" and "Import a contact file" disclosures above the
directory are untouched.

## Testing

- `contact-name.test.cjs` — the derivation table, override precedence,
  whitespace-only and title-only input.
- `hermes-assistant-dashboard.test.cjs` — extend for the new tab order.
- Existing whatsapp send tests — extend to assert the template recipient
  parameter uses the messaging name, both when `preferred_name` is set and when
  it is derived.
- `tsc`, lint, and the full test suite before the PR.

## Out of scope

- Backfilling `preferred_name` for existing contacts.
- Changing which name the admin UI displays.
- Editing anything other than the messaging name from the directory (role,
  policy, and profile links keep their existing paths).
- The Financial settlements card and any ledger data loading.
```

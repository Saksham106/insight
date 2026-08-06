# Contact import de-duplication and directory editing

Importing a phone book into Kitty asks the admin to classify every contact in
the file, including the ones already in the directory. Importing 150 contacts
when 100 are already known means 150 role decisions to gain 50 contacts. The
directory itself has no way to remove a contact or correct a role, so mistakes
made during that import are permanent.

This work makes the import ask only about what is new, and makes the directory
editable.

## Current behaviour

Duplicate detection already exists on the server. `buildImportPreview` sets
`existingContactId` on every row whose normalized phone matches a contact in
the directory, and counts them into `summary.existing`
(`src/lib/hermes/import.ts`). No client reads either field.
`HermesContactImport` renders every row in one flat list and refuses to import
until a role is chosen for each one.

The gap has been there since the component was added; nothing regressed. The
recent de-duplication work was for chat rosters, and the recent role
reassignment work was for Insight profiles. Neither touched contact import.

Two consequences follow from the missing UI:

- Re-importing a phone book overwrites known contacts. The commit RPC upserts
  on `whatsapp_e164` and its conflict branch overwrites `display_name`, `role`,
  `profile_id`, and `profile_link_status`. Because the UI forces a fresh role
  choice for contacts that already exist, a re-import resets their roles and
  clears confirmed Insight profile links.
- A soft-deleted contact is invisible to the preview, which filters
  `deleted_at is null`. It reappears as a new contact, and the RPC's
  `deleted_at = null` revives it.

## Scope

In scope: import bucketing, the review screen, commit validation, the RPC
conflict branch, directory editing and deletion, and the inbound-message bug
that deletion exposes.

Out of scope: linking a contact to an Insight profile from the directory. The
`PATCH` route already supports `profileId`, but exposing it needs a searchable
profile picker and a path for "that profile is already linked to another
contact". It is worth doing as separate work.

The vCard parser keeps names and phone numbers only. Emails, notes, and
birthdays in the source file are discarded, as they are today, and the card
copy continues to say so.

## Design

### Row classification

`ImportPreviewRow` gains a `status` computed in `buildImportPreview`, so no
client re-derives it:

| status     | meaning                                              |
| ---------- | ---------------------------------------------------- |
| `new`      | phone is not in the directory; needs a role          |
| `existing` | already an active contact; left alone                |
| `removed`  | matches a soft-deleted contact; ignored              |
| `error`    | unparseable, or a repeat within the uploaded file    |

`existingContactId: string | null` is replaced by:

```ts
existing: { id: string; displayName: string; role: string; deleted: boolean } | null
```

so the review screen can show a contact's current role without a second fetch.
`summary` becomes `{ total, new, existing, removed, errors }`.

Rows classified `existing` or `removed` skip profile-match suggestion, which is
only meaningful for a contact being created.

To see soft-deleted contacts, the preview route drops its `deleted_at is null`
filter and selects `role` and `deleted_at` alongside the existing columns.
`ExistingHermesContact` gains those two fields.

### Review screen

```
150 in file · 50 new · 97 already yours · 2 previously removed · 1 needs fixing

▸ New contacts (50)              open; role picker per contact
▸ Already in your directory (97) collapsed: "Left as they are."
▸ Previously removed (2)         collapsed: "Ignored." per-row [Restore]
▸ Needs fixing (1)               collapsed; read-only reasons

☐ I confirm these contacts agreed to receive MyInsightAcademy WhatsApp messages.
[ Import 50 contacts ]
```

Only unresolved `new` rows block the import button. Contacts that already exist
never block it. This is the central change.

Expanding "Already in your directory" lists each contact with its current role
and a dropdown to change it. A changed row is marked as pending an update, and
the button label reflects the real work: `Import 50 · update 3`.

Expanding "Previously removed" offers a per-contact Restore. A restored contact
keeps the role it had when it was removed, shown on the row; the same dropdown
is there to change it. Nothing about a contact is re-decided just because it
passed through the file again.

The consent checkbox governs the new contacts only. Contacts that already exist
were attested in an earlier batch and are not re-attested.

When a file contains no new contacts, the button applies any updates and
restores, or is disabled with "Nothing to import" when there are none.

### Commit

The request body becomes:

```ts
{
  previewToken: string
  previewRows: ImportPreviewRow[]
  consentAttested: boolean
  contacts: CommitContact[]                        // status === "new" only
  updates: Array<{ contactId: string; role: string }>
  restores: Array<{ contactId: string; role: string | null }>  // null keeps the stored role
}
```

`previewRows` is still digest-checked against the signed token, so the row
classifications are trustworthy. Each `updates` and `restores` entry must match
a signed row whose `existing.id` equals `contactId` and whose `status` is
`existing` or `removed` respectively. Without that check the import endpoint
would be a way to edit any contact by id.

`validateImportSelection` is narrowed to consider only `new` rows, so a client
cannot route an existing contact through the create path.

Execution order is: create new contacts through the RPC, then apply updates,
then apply restores. The response reports
`{ created, skipped, updated, restored }` and the UI states the outcome
plainly. If updates or restores fail after contacts are created, the response
reports what succeeded rather than claiming the whole import failed.

### RPC conflict branch

Only genuinely new contacts now reach `import_hermes_contacts`, so a conflict
on `whatsapp_e164` means the contact was created between preview and commit.
The conflict branch stops overwriting. A migration replaces the `do update set`
body with a no-op self-assignment of `display_name`, which preserves every
column and still returns the row id for the audit event. Those rows are counted
as `skipped` rather than `updated`, and the batch summary gains that field.

This removes the re-import data loss path even if a stale preview is replayed.

### Directory editing

Each row in `HermesContactsPanel` gains an actions cluster:

- **Role** — dropdown, `PATCH { role }`.
- **Name** — inline edit of `display_name`, beside the existing messaging-name
  edit. An empty value is rejected, matching the route.
- **Pause / Resume** — `PATCH { communicationPolicy: "paused" | "direct" }`.
  Kitty stops messaging the contact without removing them.
- **Delete** — a confirm naming the contact, then `DELETE`.

A new `DELETE` handler on `/api/admin/hermes/contacts/[id]` sets `deleted_at`
and `is_active: false` and writes a `contact_deleted` audit event. Nothing is
erased: transcripts, audit events, and case participation are retained.

`PATCH` gains `restore: true`, which clears `deleted_at` and sets
`is_active: true`. Its query filters on `deleted_at is null`, so the restore
path must skip that filter; every other field keeps it, so a deleted contact
cannot otherwise be edited.

A collapsed "Removed contacts" section makes restore reachable outside an
import. The admin page loader fetches deleted rows alongside active ones, and
the panel splits them; the active count in the header excludes them.

### Inbound messages from a deleted contact

Deletion exposes an existing bug. The WhatsApp webhook looks a contact up with
`deleted_at is null`, misses a deleted row, and inserts a new contact. But
`whatsapp_e164` is `not null unique` with no partial index, so the insert
fails, the contact stays null, and the handler skips the event. A deleted
contact's inbound message is silently dropped.

The lookup drops its `deleted_at` filter. When the contact is found and
deleted, the message is stored against that contact and a
`deleted_contact_received` audit event is written, but the contact stays
ineligible so Kitty does not reply and the contact is not revived. Deletion
stays deliberate, and a mistaken removal is recoverable rather than invisible.

The unknown-number insert path is unchanged.

## Testing

`src/lib/hermes/import.test.cjs`:

- each status is assigned correctly, including a soft-deleted contact
  classified `removed` rather than `existing` or `new`
- summary counts match the rows
- a repeat within the uploaded file stays an `error`, not a duplicate of an
  existing contact
- `validateImportSelection` rejects an `existing` row routed through `contacts`
- update and restore entries are rejected when the contact id does not match a
  signed row of the right status

`src/lib/hermes/webhook.test.cjs`:

- an inbound message from a soft-deleted contact is stored, is not eligible for
  a reply, and does not revive the contact
- an inbound message from an unknown number still creates a contact

Bucketing and validation live in `src/lib/hermes/import.ts` so they are
testable without a DOM, matching how the existing tests are written.

Manual check on the admin Kitty page: import a file overlapping the directory
and confirm only new contacts ask for a role; change a duplicate's role from
the collapsed section; delete a contact, confirm it leaves the directory and
does not return on a re-import of the same file; restore it.

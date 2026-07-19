# Kitty Quick Add Contact Design

**Date:** 2026-07-19
**Status:** Approved

## Objective

Let an Insight administrator add one Academy WhatsApp contact directly from the Kitty dashboard without creating or uploading a vCard file. Preserve the existing bulk vCard importer for larger batches.

## User Experience

Add an always-visible **Quick add contact** card above the existing **Import iPhone contacts** card. The form contains:

- contact name;
- WhatsApp phone number;
- optional default country calling code for a local number;
- one required role: Teacher, Student, Parent, Employee, or Other;
- a required checkbox confirming that the contact agreed to receive MyInsightAcademy WhatsApp messages;
- an **Add contact** submit button.

After a successful submission, clear the name, phone, role, and consent state, retain the default calling code for fast repeated entry, show a concise success message, and refresh the dashboard contact list. Invalid and duplicate numbers remain in the form and produce an inline error.

## Architecture and Data Flow

Create a focused client component for the quick-add form and render it from the Kitty dashboard before the vCard importer. Submit JSON to the existing admin-only `POST /api/admin/hermes/contacts` route. Reuse its existing phone normalization, required role, consent attestation, direct communication policy, duplicate-number handling, and audit event.

No schema, RLS, import RPC, WhatsApp sender, profile-linking, or Meta configuration changes are required. Quick add creates an independent Hermes contact; linking it to an existing portal profile remains a separate administrator action.

## Error Handling

- Disable submission until name, phone, role, and consent are present.
- Show the server's safe validation, duplicate, or creation error inline.
- Prevent double submission while a request is running.
- Do not clear any form value after a failed request.
- Do not claim success until the server returns `201`.

## Testing

Extend the Kitty dashboard contract test to require the quick-add component, all five roles, the consent control, the existing contacts endpoint, and the refresh/reset behavior. Run that test red before implementation, then green after implementation. Run focused Hermes admin tests, lint the changed files, and run the production build.

## Non-Goals

- adding multiple editable rows in one submission;
- profile-match suggestions during quick add;
- modifying existing contacts;
- bypassing consent attestation;
- changing the bulk vCard workflow.

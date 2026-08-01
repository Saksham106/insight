-- The name Kitty uses when addressing a contact in an outbound message.
-- Null means "derive it from display_name" (see src/lib/hermes/contact-name.ts).
-- Deliberately not backfilled: a derived default self-corrects when
-- display_name is fixed, and clearing an override returns to that default.
alter table public.hermes_contacts
  add column if not exists preferred_name text;

alter table public.hermes_contacts
  drop constraint if exists hermes_contacts_preferred_name_length;

alter table public.hermes_contacts
  add constraint hermes_contacts_preferred_name_length
  check (
    preferred_name is null
    or length(btrim(preferred_name)) between 1 and 100
  );

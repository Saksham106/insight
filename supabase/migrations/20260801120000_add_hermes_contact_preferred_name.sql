-- The name Kitty uses when addressing a contact in an outbound message.
-- Null means "not confirmed"; Kitty uses a neutral greeting until an admin
-- confirms the derived suggestion in the contact directory.
-- Deliberately not backfilled: no heuristic guess is persisted as client data.
alter table public.hermes_contacts
  add column if not exists preferred_name text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'hermes_contacts_preferred_name_length'
      and conrelid = 'public.hermes_contacts'::regclass
  ) then
    alter table public.hermes_contacts
      add constraint hermes_contacts_preferred_name_length
      check (
        preferred_name is null
        or length(btrim(preferred_name)) between 1 and 100
      ) not valid;
  end if;
end
$$;

alter table public.hermes_contacts
  validate constraint hermes_contacts_preferred_name_length;

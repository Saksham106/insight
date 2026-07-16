create or replace function public.preserve_hermes_profile_link_on_reimport()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.profile_id is not null
    and new.profile_id is null
    and new.import_batch_id is distinct from old.import_batch_id then
    new.profile_id := old.profile_id;
    new.profile_link_status := old.profile_link_status;
    new.profile_link_confirmed_by := old.profile_link_confirmed_by;
    new.profile_link_confirmed_at := old.profile_link_confirmed_at;
    new.timezone := coalesce(new.timezone, old.timezone);
    new.timezone_source := coalesce(new.timezone_source, old.timezone_source);
  end if;
  return new;
end;
$$;

drop trigger if exists preserve_hermes_profile_link_on_reimport on public.hermes_contacts;
create trigger preserve_hermes_profile_link_on_reimport
  before update on public.hermes_contacts
  for each row execute function public.preserve_hermes_profile_link_on_reimport();

revoke execute on function public.preserve_hermes_profile_link_on_reimport() from public, anon, authenticated;
grant execute on function public.preserve_hermes_profile_link_on_reimport() to service_role;

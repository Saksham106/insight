-- Keep the multi-role capability table aligned with the primary profile role.
-- Explicit secondary grants (for example, Swati's admin role) remain intact.
create or replace function public.sync_primary_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if tg_op = 'UPDATE' and old.role is distinct from new.role then
    delete from public.profile_roles
    where profile_id = new.id
      and role = old.role;
  end if;

  insert into public.profile_roles (profile_id, role)
  values (new.id, new.role)
  on conflict (profile_id, role) do nothing;

  return new;
end;
$$;

revoke all on function public.sync_primary_profile_role() from public, anon;

drop trigger if exists sync_primary_profile_role on public.profiles;
create trigger sync_primary_profile_role
after insert or update of role on public.profiles
for each row execute function public.sync_primary_profile_role();

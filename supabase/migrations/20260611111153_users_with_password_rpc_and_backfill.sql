-- RPC: list auth user ids that have a password set (service-role use only)
create or replace function public.users_with_password()
returns setof uuid
language sql
security definer
set search_path to 'auth', 'public'
as $$
  select id
  from auth.users
  where encrypted_password is not null and encrypted_password != '';
$$;

revoke execute on function public.users_with_password() from public, anon, authenticated;

-- Backfill: users who have a password but were never marked as password_set
update public.profiles p
set password_set_at = coalesce(u.last_sign_in_at, now())
from auth.users u
where u.id = p.id
  and p.password_set_at is null
  and u.encrypted_password is not null
  and u.encrypted_password != '';;

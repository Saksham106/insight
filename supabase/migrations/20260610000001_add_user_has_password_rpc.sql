-- RPC that checks auth.users directly; bypasses PostgREST's auth-schema restriction.
-- Used by invite-user route to distinguish "active user" from "invited but incomplete".
create or replace function public.user_has_password(p_email text)
returns boolean
language sql
security definer
set search_path = auth, public
as $$
  select (encrypted_password is not null and encrypted_password != '')
  from auth.users
  where lower(email) = lower(p_email)
  limit 1;
$$;

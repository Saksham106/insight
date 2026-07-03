-- Replaces user_has_password: the invite redesign needs more than a boolean —
-- it needs to know whether an existing account has ever been used at all
-- (last_sign_in_at) or had its password manually changed (profiles.password_set_at),
-- so a duplicate invite can safely regenerate credentials for a never-used
-- account while refusing to touch an active one.
drop function if exists public.user_has_password(text);

create or replace function public.get_invite_user_state(p_email text)
returns table (
  auth_user_id uuid,
  last_sign_in_at timestamptz,
  password_set_at timestamptz
)
language sql
security definer
set search_path = auth, public
as $$
  select u.id, u.last_sign_in_at, p.password_set_at
  from auth.users u
  left join public.profiles p on p.id = u.id
  where lower(u.email) = lower(p_email)
  limit 1;
$$;

-- SECURITY DEFINER functions are PUBLIC EXECUTE by default in Postgres.
-- This function reads auth.users (email enumeration + PII) and must only
-- ever be called via the service-role admin client from the invite API route.
revoke execute on function public.get_invite_user_state(text) from public, anon, authenticated;

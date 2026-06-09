update public.profiles as profile
set invite_sent_at = auth_user.invited_at
from auth.users as auth_user
where auth_user.id = profile.id
  and profile.invite_sent_at is null
  and auth_user.invited_at is not null
  and auth_user.email_confirmed_at is null;

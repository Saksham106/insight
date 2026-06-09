alter table public.profiles
  add column if not exists invite_sent_at timestamptz,
  add column if not exists invite_accepted_at timestamptz,
  add column if not exists password_set_at timestamptz;

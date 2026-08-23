-- Browser Push API subscriptions for installed PWAs.
-- The private VAPID key stays in the server environment; this table only stores
-- browser-generated public subscription material.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_push_subscriptions_user_id
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy push_subscriptions_select_own
  on public.push_subscriptions for select
  using (user_id = (select auth.uid()));

create policy push_subscriptions_insert_own
  on public.push_subscriptions for insert
  with check (user_id = (select auth.uid()));

create policy push_subscriptions_update_own
  on public.push_subscriptions for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy push_subscriptions_delete_own
  on public.push_subscriptions for delete
  using (user_id = (select auth.uid()));

create trigger set_push_subscriptions_updated_at
  before update on public.push_subscriptions
  for each row execute function public.set_updated_at();

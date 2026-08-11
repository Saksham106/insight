create table public.academy_agent_routines (
  id uuid primary key default gen_random_uuid(),
  routine_key text not null unique check (char_length(routine_key) between 1 and 200),
  owner_actor_key text not null check (char_length(owner_actor_key) between 3 and 240),
  creator_actor_key text not null check (char_length(creator_actor_key) between 3 and 240),
  capability_name text not null check (char_length(capability_name) between 3 and 120),
  capability_version integer not null check (capability_version > 0),
  entity_references jsonb not null check (jsonb_typeof(entity_references) = 'object'),
  schedule jsonb not null check (jsonb_typeof(schedule) = 'object'),
  timezone text not null check (char_length(timezone) between 1 and 100),
  recipient_rule jsonb not null check (jsonb_typeof(recipient_rule) = 'object'),
  status text not null default 'disabled' check (status in ('disabled', 'active', 'paused')),
  policy_version text not null check (char_length(policy_version) between 1 and 40),
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_outcome jsonb check (last_outcome is null or jsonb_typeof(last_outcome) = 'object'),
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index academy_agent_routines_due_idx
  on public.academy_agent_routines (next_run_at, id)
  where status = 'active' and next_run_at is not null;

alter table public.academy_agent_routines enable row level security;
alter table public.academy_agent_routines force row level security;
revoke all on table public.academy_agent_routines from public, anon, authenticated;
grant all on table public.academy_agent_routines to service_role;

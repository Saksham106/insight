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
  run_claim_token uuid,
  run_claimed_until timestamptz,
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

create or replace function public.claim_due_academy_agent_routines(
  p_claim_token uuid,
  p_limit integer default 20,
  p_now timestamptz default now(),
  p_lease_seconds integer default 300
)
returns setof public.academy_agent_routines
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_claim_token is null or p_limit < 1 or p_limit > 100 or p_lease_seconds < 30 or p_lease_seconds > 1800 then
    raise exception 'invalid_routine_claim';
  end if;
  return query
  with due as (
    select id
    from public.academy_agent_routines
    where status = 'active'
      and next_run_at <= p_now
      and (run_claimed_until is null or run_claimed_until < p_now)
    order by next_run_at, id
    for update skip locked
    limit p_limit
  )
  update public.academy_agent_routines as routine
  set run_claim_token = p_claim_token,
      run_claimed_until = p_now + make_interval(secs => p_lease_seconds),
      updated_at = p_now
  from due
  where routine.id = due.id
  returning routine.*;
end;
$$;

revoke all on function public.claim_due_academy_agent_routines(uuid, integer, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.claim_due_academy_agent_routines(uuid, integer, timestamptz, integer) to service_role;

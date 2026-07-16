alter table public.hermes_scheduling_cases
  add column if not exists workspace_state text not null default 'not_required';

alter table public.hermes_scheduling_cases
  drop constraint if exists hermes_scheduling_cases_workspace_state_check,
  add constraint hermes_scheduling_cases_workspace_state_check
    check (workspace_state in ('not_required', 'pending', 'ready', 'failed', 'stale'));

create table if not exists public.hermes_workspace_jobs (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.hermes_scheduling_cases(id) on delete cascade,
  job_type text not null check (job_type in ('calendar_freebusy')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  payload_digest text not null check (payload_digest ~ '^[a-f0-9]{64}$'),
  idempotency_key text not null unique check (length(idempotency_key) between 16 and 160),
  status text not null default 'queued'
    check (status in ('queued', 'leased', 'succeeded', 'retryable_failed', 'permanent_failed', 'cancelled')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 10),
  available_at timestamptz not null default now(),
  lease_owner text,
  lease_expires_at timestamptz,
  result jsonb check (result is null or jsonb_typeof(result) = 'object'),
  error_code text check (error_code is null or length(error_code) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  check (
    (status = 'leased' and lease_owner is not null and lease_expires_at is not null)
    or status <> 'leased'
  )
);

create index if not exists hermes_workspace_jobs_claim
  on public.hermes_workspace_jobs(status, available_at, created_at);
create index if not exists hermes_workspace_jobs_case
  on public.hermes_workspace_jobs(case_id, created_at desc);

alter table public.hermes_workspace_jobs enable row level security;
revoke all on table public.hermes_workspace_jobs from anon, authenticated;

create or replace function public.claim_hermes_workspace_jobs(p_worker_id text, p_limit integer default 5)
returns setof public.hermes_workspace_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_worker_id !~ '^[A-Za-z0-9_-]{8,80}$' then
    raise exception 'invalid_worker_id';
  end if;

  return query
  with candidates as (
    select id
    from public.hermes_workspace_jobs
    where attempt_count < max_attempts
      and (
        (status in ('queued', 'retryable_failed') and available_at <= now())
        or (status = 'leased' and lease_expires_at <= now())
      )
    order by available_at, created_at
    for update skip locked
    limit least(greatest(p_limit, 1), 10)
  )
  update public.hermes_workspace_jobs as jobs
  set status = 'leased',
      attempt_count = jobs.attempt_count + 1,
      lease_owner = p_worker_id,
      lease_expires_at = now() + interval '5 minutes',
      updated_at = now(),
      error_code = null
  from candidates
  where jobs.id = candidates.id
  returning jobs.*;
end;
$$;

create or replace function public.complete_hermes_workspace_job(
  p_job_id uuid,
  p_worker_id text,
  p_status text,
  p_result jsonb default null,
  p_error_code text default null
)
returns public.hermes_workspace_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.hermes_workspace_jobs;
begin
  if p_status not in ('succeeded', 'retryable_failed', 'permanent_failed') then
    raise exception 'invalid_completion_status';
  end if;
  if p_status = 'succeeded' and (p_result is null or jsonb_typeof(p_result) <> 'object') then
    raise exception 'result_required';
  end if;

  update public.hermes_workspace_jobs
  set status = p_status,
      result = case when p_status = 'succeeded' then p_result else null end,
      error_code = case when p_status = 'succeeded' then null else left(coalesce(p_error_code, 'workspace_error'), 100) end,
      available_at = case
        when p_status = 'retryable_failed'
          then now() + make_interval(secs => least(300, (power(2, attempt_count)::integer * 5)))
        else available_at
      end,
      lease_owner = null,
      lease_expires_at = null,
      completed_at = case when p_status in ('succeeded', 'permanent_failed') then now() else null end,
      updated_at = now()
  where id = p_job_id
    and status = 'leased'
    and lease_owner = p_worker_id
  returning * into v_job;

  if not found then
    raise exception 'workspace_job_lease_mismatch';
  end if;

  update public.hermes_scheduling_cases
  set workspace_state = case when p_status = 'succeeded' then 'ready' else 'failed' end,
      updated_at = now()
  where id = v_job.case_id;

  return v_job;
end;
$$;

revoke execute on function public.claim_hermes_workspace_jobs(text, integer) from public, anon, authenticated;
revoke execute on function public.complete_hermes_workspace_job(uuid, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.claim_hermes_workspace_jobs(text, integer) to service_role;
grant execute on function public.complete_hermes_workspace_job(uuid, text, text, jsonb, text) to service_role;

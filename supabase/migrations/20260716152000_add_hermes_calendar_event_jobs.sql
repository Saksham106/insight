alter table public.hermes_scheduling_cases
  add column if not exists tutor_kind text not null default 'academy_tutor';

alter table public.hermes_scheduling_cases
  drop constraint if exists hermes_scheduling_cases_tutor_kind_check,
  add constraint hermes_scheduling_cases_tutor_kind_check
    check (tutor_kind in ('swati', 'academy_tutor'));

alter table public.hermes_workspace_jobs
  drop constraint if exists hermes_workspace_jobs_job_type_check,
  add constraint hermes_workspace_jobs_job_type_check
    check (job_type in ('calendar_freebusy', 'calendar_create_event'));

create table public.hermes_calendar_links (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null unique references public.hermes_scheduling_cases(id) on delete cascade,
  workspace_job_id uuid not null unique references public.hermes_workspace_jobs(id) on delete restrict,
  calendar_event_id text not null unique check (calendar_event_id ~ '^[a-v0-9]{5,1024}$'),
  event_etag text not null check (length(event_etag) between 1 and 500),
  proposal_version integer not null check (proposal_version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.hermes_calendar_links enable row level security;
revoke all on table public.hermes_calendar_links from anon, authenticated;
grant all on table public.hermes_calendar_links to service_role;

drop function if exists public.complete_hermes_workspace_job(uuid, text, text, jsonb, text);

create function public.complete_hermes_workspace_job(
  p_job_id uuid,
  p_worker_id text,
  p_job_type text,
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
  if p_job_type not in ('calendar_freebusy', 'calendar_create_event') then
    raise exception 'invalid_job_type';
  end if;
  if p_status not in ('succeeded', 'retryable_failed', 'permanent_failed') then
    raise exception 'invalid_completion_status';
  end if;
  if p_status = 'succeeded' and (p_result is null or jsonb_typeof(p_result) <> 'object') then
    raise exception 'result_required';
  end if;
  if p_status = 'succeeded' and p_job_type = 'calendar_create_event' and (
    coalesce(p_result->>'eventId', '') !~ '^[a-v0-9]{5,1024}$'
    or length(coalesce(p_result->>'etag', '')) not between 1 and 500
  ) then
    raise exception 'invalid_calendar_result';
  end if;

  update public.hermes_workspace_jobs
  set status = case
        when p_status = 'retryable_failed' and attempt_count >= max_attempts then 'permanent_failed'
        else p_status
      end,
      result = case when p_status = 'succeeded' then p_result else null end,
      error_code = case when p_status = 'succeeded' then null else left(coalesce(p_error_code, 'workspace_error'), 100) end,
      available_at = case
        when p_status = 'retryable_failed' and attempt_count < max_attempts
          then now() + make_interval(secs => least(300, (power(2, attempt_count)::integer * 5)))
        else available_at
      end,
      lease_owner = null,
      lease_expires_at = null,
      completed_at = case
        when p_status in ('succeeded', 'permanent_failed')
          or (p_status = 'retryable_failed' and attempt_count >= max_attempts)
          then now()
        else null
      end,
      updated_at = now()
  where id = p_job_id
    and job_type = p_job_type
    and status = 'leased'
    and lease_owner = p_worker_id
  returning * into v_job;

  if not found then
    raise exception 'workspace_job_lease_mismatch';
  end if;

  if v_job.job_type = 'calendar_create_event' and v_job.status = 'succeeded' then
    insert into public.hermes_calendar_links(
      case_id, workspace_job_id, calendar_event_id, event_etag, proposal_version
    ) values (
      v_job.case_id,
      v_job.id,
      p_result->>'eventId',
      p_result->>'etag',
      (v_job.payload->>'proposalVersion')::integer
    )
    on conflict (case_id) do update
      set workspace_job_id = excluded.workspace_job_id,
          calendar_event_id = excluded.calendar_event_id,
          event_etag = excluded.event_etag,
          proposal_version = excluded.proposal_version,
          updated_at = now();
  end if;

  if v_job.job_type = 'calendar_create_event' and v_job.error_code = 'calendar_conflict' then
    update public.hermes_scheduling_cases
      set workspace_state = 'stale', status = 'needs_attention', human_takeover = true, updated_at = now()
      where id = v_job.case_id;
    update public.hermes_approvals
      set status = 'cancelled', updated_at = now()
      where case_id = v_job.case_id and consumed_at is null and status in ('pending', 'approved');
  else
    update public.hermes_scheduling_cases
      set workspace_state = case when v_job.status = 'succeeded' then 'ready' else 'failed' end,
          updated_at = now()
      where id = v_job.case_id;
  end if;

  return v_job;
end;
$$;

revoke execute on function public.complete_hermes_workspace_job(uuid, text, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.complete_hermes_workspace_job(uuid, text, text, text, jsonb, text) to service_role;

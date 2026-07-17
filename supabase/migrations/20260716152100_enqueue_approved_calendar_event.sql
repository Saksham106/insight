drop function if exists public.confirm_hermes_class(uuid, uuid, jsonb);

create function public.confirm_hermes_class(
  p_case_id uuid,
  p_approval_id uuid,
  p_resolution jsonb,
  p_calendar_writes_enabled boolean
)
returns public.hermes_scheduling_cases
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_case public.hermes_scheduling_cases;
  v_approval public.hermes_approvals;
  v_start timestamptz;
  v_end timestamptz;
  v_event_id text;
  v_job_payload jsonb;
  v_digest text;
begin
  if jsonb_typeof(p_resolution) <> 'object' or p_resolution = '{}'::jsonb then
    raise exception 'resolution_required';
  end if;
  select * into v_case from public.hermes_scheduling_cases where id = p_case_id for update;
  if not found then raise exception 'case_not_found'; end if;
  select * into v_approval from public.hermes_approvals
    where id = p_approval_id and case_id = p_case_id for update;
  if not found or v_approval.status <> 'approved' or v_approval.action <> 'confirm_class'
    or v_approval.consumed_at is not null then raise exception 'approved_confirmation_required'; end if;
  if v_case.status <> 'awaiting_approval' or v_approval.proposal_version <> v_case.proposal_version
    or v_approval.payload <> p_resolution then raise exception 'approval_payload_mismatch'; end if;

  if v_case.tutor_kind = 'swati' then
    if not p_calendar_writes_enabled then raise exception 'calendar_writes_disabled'; end if;
    begin
      v_start := (p_resolution->>'start')::timestamptz;
      v_end := (p_resolution->>'end')::timestamptz;
    exception when others then
      raise exception 'invalid_calendar_resolution';
    end;
    if v_end <= v_start or v_end - v_start > interval '24 hours'
      or coalesce(p_resolution->>'timezone', '') !~ '^(UTC|[A-Za-z_]+(/[A-Za-z0-9_+.-]+)+)$' then
      raise exception 'invalid_calendar_resolution';
    end if;
    v_event_id := 'insight' || substr(encode(digest(
      convert_to(v_case.id::text || ':' || v_case.proposal_version::text, 'UTF8'), 'sha256'
    ), 'hex'), 1, 40);
    v_job_payload := jsonb_build_object(
      'start', to_char(v_start at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'end', to_char(v_end at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'timezone', p_resolution->>'timezone',
      'summary', left(v_case.title, 240),
      'eventId', v_event_id,
      'proposalVersion', v_case.proposal_version
    );
    v_digest := encode(digest(convert_to(v_job_payload::text, 'UTF8'), 'sha256'), 'hex');
    insert into public.hermes_workspace_jobs(
      case_id, job_type, payload, payload_digest, idempotency_key
    ) values (
      v_case.id, 'calendar_create_event', v_job_payload, v_digest, 'event:' || v_digest
    ) on conflict (idempotency_key) do nothing;
  end if;

  update public.hermes_approvals set consumed_at = now(), updated_at = now() where id = p_approval_id;
  update public.hermes_scheduling_cases
    set status = 'confirmed',
        resolution = p_resolution,
        workspace_state = case when tutor_kind = 'swati' then 'pending' else 'not_required' end,
        updated_at = now()
    where id = p_case_id returning * into v_case;
  return v_case;
end;
$$;

revoke execute on function public.confirm_hermes_class(uuid, uuid, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.confirm_hermes_class(uuid, uuid, jsonb, boolean) to service_role;

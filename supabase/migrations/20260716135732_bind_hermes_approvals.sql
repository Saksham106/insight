alter table public.hermes_scheduling_cases
  add column if not exists proposal_version integer not null default 0;

alter table public.hermes_approvals
  add column if not exists proposal_version integer not null default 0,
  add column if not exists payload_digest text,
  add column if not exists consumed_at timestamptz;

update public.hermes_approvals
set payload_digest = encode(digest(convert_to(payload::text, 'UTF8'), 'sha256'), 'hex')
where payload_digest is null;

alter table public.hermes_approvals alter column payload_digest set not null;

create or replace function public.propose_hermes_times(p_case_id uuid, p_proposed_times jsonb)
returns public.hermes_scheduling_cases
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_case public.hermes_scheduling_cases;
begin
  if jsonb_typeof(p_proposed_times) <> 'array' or jsonb_array_length(p_proposed_times) = 0 then
    raise exception 'proposed_times_required';
  end if;
  select * into v_case from public.hermes_scheduling_cases where id = p_case_id for update;
  if not found then raise exception 'case_not_found'; end if;
  if v_case.status not in ('collecting_availability', 'proposing') then raise exception 'invalid_case_transition'; end if;

  update public.hermes_approvals
    set status = 'cancelled', updated_at = now()
    where case_id = p_case_id and consumed_at is null and status in ('pending', 'approved');
  update public.hermes_scheduling_cases
    set status = 'proposing', proposed_times = p_proposed_times,
        proposal_version = proposal_version + 1, updated_at = now()
    where id = p_case_id returning * into v_case;
  return v_case;
end;
$$;

create or replace function public.request_hermes_approval(p_case_id uuid, p_payload jsonb)
returns public.hermes_approvals
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_case public.hermes_scheduling_cases; v_approval public.hermes_approvals;
begin
  if jsonb_typeof(p_payload) <> 'object' or p_payload = '{}'::jsonb then raise exception 'approval_payload_required'; end if;
  select * into v_case from public.hermes_scheduling_cases where id = p_case_id for update;
  if not found then raise exception 'case_not_found'; end if;
  if v_case.status not in ('proposing', 'awaiting_approval') then raise exception 'invalid_case_transition'; end if;

  update public.hermes_approvals set status = 'cancelled', updated_at = now()
    where case_id = p_case_id and status = 'pending' and consumed_at is null;
  insert into public.hermes_approvals(case_id, action, payload, proposal_version, payload_digest)
    values (p_case_id, 'confirm_class', p_payload, v_case.proposal_version,
      encode(digest(convert_to(p_payload::text, 'UTF8'), 'sha256'), 'hex'))
    returning * into v_approval;
  update public.hermes_scheduling_cases set status = 'awaiting_approval', updated_at = now() where id = p_case_id;
  return v_approval;
end;
$$;

create or replace function public.confirm_hermes_class(p_case_id uuid, p_approval_id uuid, p_resolution jsonb)
returns public.hermes_scheduling_cases
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_case public.hermes_scheduling_cases; v_approval public.hermes_approvals;
begin
  if jsonb_typeof(p_resolution) <> 'object' or p_resolution = '{}'::jsonb then raise exception 'resolution_required'; end if;
  select * into v_case from public.hermes_scheduling_cases where id = p_case_id for update;
  if not found then raise exception 'case_not_found'; end if;
  select * into v_approval from public.hermes_approvals
    where id = p_approval_id and case_id = p_case_id for update;
  if not found or v_approval.status <> 'approved' or v_approval.action <> 'confirm_class'
    or v_approval.consumed_at is not null then raise exception 'approved_confirmation_required'; end if;
  if v_case.status <> 'awaiting_approval' or v_approval.proposal_version <> v_case.proposal_version
    or v_approval.payload <> p_resolution then raise exception 'approval_payload_mismatch'; end if;

  update public.hermes_approvals set consumed_at = now(), updated_at = now() where id = p_approval_id;
  update public.hermes_scheduling_cases set status = 'confirmed', resolution = p_resolution, updated_at = now()
    where id = p_case_id returning * into v_case;
  return v_case;
end;
$$;

create or replace function public.decide_hermes_approval(
  p_approval_id uuid, p_decided_by uuid, p_decision text, p_note text default null
)
returns public.hermes_approvals
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_case_id uuid; v_approval public.hermes_approvals;
begin
  if p_decision not in ('approved', 'rejected') then raise exception 'invalid_decision'; end if;
  if not exists (select 1 from public.profiles where id = p_decided_by and role = 'admin' and is_active = true and deleted_at is null) then
    raise exception 'administrator_required';
  end if;
  select case_id into v_case_id from public.hermes_approvals where id = p_approval_id;
  if not found then raise exception 'approval_not_found'; end if;
  perform 1 from public.hermes_scheduling_cases where id = v_case_id for update;
  select * into v_approval from public.hermes_approvals where id = p_approval_id for update;
  if v_approval.status <> 'pending' or v_approval.consumed_at is not null then raise exception 'approval_not_pending'; end if;
  update public.hermes_approvals set status = p_decision, decided_by = p_decided_by,
    decided_at = now(), decision_note = nullif(left(btrim(coalesce(p_note, '')), 500), ''), updated_at = now()
    where id = p_approval_id returning * into v_approval;
  insert into public.hermes_audit_events(actor_type, actor_profile_id, event_type, entity_type, entity_id, metadata)
    values ('admin', p_decided_by, 'approval_' || p_decision, 'scheduling_case', v_case_id,
      jsonb_build_object('approvalId', p_approval_id, 'action', v_approval.action, 'payloadDigest', v_approval.payload_digest));
  return v_approval;
end;
$$;

revoke execute on function public.propose_hermes_times(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.request_hermes_approval(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.confirm_hermes_class(uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.decide_hermes_approval(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.propose_hermes_times(uuid, jsonb) to service_role;
grant execute on function public.request_hermes_approval(uuid, jsonb) to service_role;
grant execute on function public.confirm_hermes_class(uuid, uuid, jsonb) to service_role;
grant execute on function public.decide_hermes_approval(uuid, uuid, text, text) to service_role;

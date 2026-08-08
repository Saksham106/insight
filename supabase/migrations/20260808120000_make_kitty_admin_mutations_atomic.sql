create function public.admin_upsert_hermes_guardian_relationship(
  p_source_contact_id uuid,
  p_target_contact_id uuid,
  p_is_active boolean,
  p_actor_profile_id uuid,
  p_source_channel text default 'admin'
)
returns public.hermes_contact_relationships
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source public.hermes_contacts;
  v_target public.hermes_contacts;
  v_relationship public.hermes_contact_relationships;
begin
  if not exists (select 1 from public.profiles where id = p_actor_profile_id and role = 'admin') then
    raise exception 'admin_required';
  end if;
  if p_source_contact_id = p_target_contact_id then raise exception 'invalid_relationship_contacts'; end if;
  if p_source_channel <> 'admin' then raise exception 'invalid_source_channel'; end if;
  select * into v_source from public.hermes_contacts
    where id = p_source_contact_id and is_active = true and deleted_at is null;
  select * into v_target from public.hermes_contacts
    where id = p_target_contact_id and is_active = true and deleted_at is null;
  if v_source.id is null or v_target.id is null then raise exception 'relationship_contact_unavailable'; end if;
  if v_source.role <> 'parent' then raise exception 'relationship_source_role_invalid'; end if;
  if v_target.role <> 'student' then raise exception 'relationship_student_required'; end if;

  insert into public.hermes_contact_relationships(
    source_contact_id, target_contact_id, relationship_type, is_active,
    effective_start, effective_end, source_channel
  ) values (
    p_source_contact_id, p_target_contact_id, 'parent_guardian', p_is_active,
    case when p_is_active then current_date else null end,
    case when p_is_active then null else current_date end,
    p_source_channel
  )
  on conflict (source_contact_id, target_contact_id, relationship_type) do update
    set is_active = excluded.is_active,
        effective_start = case when excluded.is_active then coalesce(public.hermes_contact_relationships.effective_start, current_date) else public.hermes_contact_relationships.effective_start end,
        effective_end = case when excluded.is_active then null else current_date end,
        source_channel = excluded.source_channel,
        updated_at = now()
  returning * into v_relationship;
  if p_is_active and 1 = (
    select count(*)
    from public.hermes_contact_relationships relationship
    join public.hermes_contacts guardian on guardian.id = relationship.source_contact_id
    where relationship.target_contact_id = p_target_contact_id
      and relationship.relationship_type = 'parent_guardian'
      and relationship.is_active
      and guardian.is_active
      and guardian.deleted_at is null
      and guardian.role = 'parent'
      and guardian.communication_policy = 'direct'
      and guardian.consent_status = 'attested'
  ) then
    update public.kitty_class_enrollment_contacts recipient
    set receives_notifications = false
    from public.kitty_class_enrollments enrollment
    join public.hermes_contacts student on student.id = enrollment.student_contact_id
    where recipient.enrollment_id = enrollment.id
      and enrollment.student_contact_id = p_target_contact_id
      and enrollment.is_active
      and recipient.contact_role = 'student'
      and recipient.is_active
      and student.communication_policy = 'guardian_only';

    insert into public.kitty_class_enrollment_contacts(
      enrollment_id, contact_id, contact_role, receives_notifications,
      confirms_cancellation, confirms_reschedule, is_active
    )
    select enrollment.id, p_source_contact_id, 'parent_guardian', true, false, true, true
    from public.kitty_class_enrollments enrollment
    where enrollment.student_contact_id = p_target_contact_id
      and enrollment.is_active
      and not exists (
        select 1 from public.kitty_class_enrollment_contacts recipient
        where recipient.enrollment_id = enrollment.id
          and recipient.is_active
          and recipient.receives_notifications
      )
    on conflict (enrollment_id, contact_id) do update
      set contact_role = 'parent_guardian',
          receives_notifications = true,
          confirms_reschedule = true,
          is_active = true;
  end if;
  insert into public.hermes_audit_events(
    actor_type, actor_profile_id, event_type, entity_type, entity_id, metadata
  ) values (
    'admin', p_actor_profile_id,
    case when p_is_active then 'contact_relationship_linked' else 'contact_relationship_unlinked' end,
    'contact_relationship', v_relationship.id,
    jsonb_build_object(
      'relationshipType', 'parent_guardian',
      'sourceChannel', p_source_channel,
      'parentContactId', p_source_contact_id,
      'studentContactId', p_target_contact_id,
      'active', p_is_active
    )
  );
  return v_relationship;
end;
$$;

create function public.admin_close_hermes_scheduling_case(
  p_case_id uuid,
  p_reason text,
  p_actor_profile_id uuid
)
returns public.hermes_scheduling_cases
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_case public.hermes_scheduling_cases;
  v_previous_status text;
  v_reason text := left(trim(coalesce(p_reason, '')), 200);
begin
  if not exists (select 1 from public.profiles where id = p_actor_profile_id and role = 'admin') then
    raise exception 'admin_required';
  end if;
  if v_reason = '' then raise exception 'close_reason_required'; end if;

  select status into v_previous_status
  from public.hermes_scheduling_cases
  where id = p_case_id
  for update;
  if v_previous_status is null then raise exception 'case_not_found'; end if;
  if v_previous_status = 'cancelled' then raise exception 'stale_case'; end if;

  update public.hermes_scheduling_cases
  set status = 'cancelled',
      resolution = jsonb_build_object(
        'outcome', 'closed_by_admin',
        'reason', v_reason,
        'closedAt', now()
      ),
      updated_at = now()
  where id = p_case_id
    and status in ('draft', 'collecting_availability', 'proposing', 'awaiting_approval', 'confirmed', 'needs_attention')
  returning * into v_case;
  if v_case.id is null then raise exception 'stale_case'; end if;

  insert into public.hermes_audit_events(
    actor_type, actor_profile_id, event_type, entity_type, entity_id, metadata
  ) values (
    'admin', p_actor_profile_id, 'case_closed_by_admin', 'scheduling_case', p_case_id,
    jsonb_build_object('reason', v_reason, 'previousStatus', v_previous_status)
  );
  return v_case;
end;
$$;

create function public.mark_hermes_participant_contacted(
  p_case_id uuid,
  p_contact_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_updated boolean := false;
begin
  perform 1
  from public.hermes_scheduling_cases
  where id = p_case_id and status = 'collecting_availability'
  for update;
  if not found then return false; end if;

  update public.hermes_case_participants
  set response_status = 'contacted', updated_at = now()
  where case_id = p_case_id
    and contact_id = p_contact_id
    and response_status = 'pending';
  v_updated := found;

  if v_updated then
    update public.hermes_scheduling_cases set updated_at = now() where id = p_case_id;
    insert into public.hermes_audit_events(
      actor_type, event_type, entity_type, entity_id, metadata
    ) values (
      'hermes', 'availability_requested', 'scheduling_case', p_case_id,
      jsonb_build_object('contactId', p_contact_id)
    );
    return true;
  end if;

  return exists (
    select 1 from public.hermes_case_participants
    where case_id = p_case_id
      and contact_id = p_contact_id
      and response_status in ('contacted', 'responded', 'declined', 'failed')
  );
end;
$$;

create function public.admin_reconcile_hermes_phantom_case(
  p_case_id uuid,
  p_actor_profile_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_case public.hermes_scheduling_cases;
  v_reason text;
begin
  if not exists (select 1 from public.profiles where id = p_actor_profile_id and role = 'admin') then
    raise exception 'admin_required';
  end if;

  select * into v_case
  from public.hermes_scheduling_cases
  where id = p_case_id
  for update;
  if v_case.id is null
    or v_case.status <> 'collecting_availability'
    or coalesce(v_case.human_takeover, false)
    or jsonb_array_length(coalesce(v_case.proposed_times, '[]'::jsonb)) > 0
    or v_case.resolution is not null
  then return false;
  end if;

  if exists (
    select 1 from public.hermes_case_participants participant
    where participant.case_id = p_case_id
      and (
        participant.response_status <> 'pending'
        or jsonb_array_length(coalesce(participant.availability, '[]'::jsonb)) > 0
      )
  ) then return false;
  end if;
  if exists (select 1 from public.hermes_approvals approval where approval.case_id = p_case_id) then
    return false;
  end if;
  if exists (
    select 1 from public.hermes_audit_events event
    where event.entity_id = p_case_id
      and event.event_type in (
        'availability_recorded', 'availability_requested', 'times_proposed',
        'approval_requested', 'approval_decided', 'class_confirmed',
        'reschedule_requested', 'human_escalation', 'case_status_changed'
      )
  ) then return false;
  end if;
  if exists (
    select 1 from public.hermes_messages message
    where message.case_id = p_case_id
      and (message.intent is null or message.intent not in ('class_reminder', 'human_attention'))
  ) then return false;
  end if;

  v_reason := case when exists (select 1 from public.hermes_messages where case_id = p_case_id)
    then 'Closed by reconciliation: only carried class reminder or human attention messages, with no scheduling activity.'
    else 'Closed by reconciliation: no participants were contacted and no scheduling activity was recorded.'
  end;
  update public.hermes_scheduling_cases
  set status = 'cancelled',
      resolution = jsonb_build_object('outcome', 'reconciled_phantom', 'reason', v_reason, 'closedAt', now()),
      updated_at = now()
  where id = p_case_id;
  insert into public.hermes_audit_events(
    actor_type, actor_profile_id, event_type, entity_type, entity_id, metadata
  ) values (
    'admin', p_actor_profile_id, 'phantom_case_reconciled', 'scheduling_case', p_case_id,
    jsonb_build_object('reason', v_reason, 'previousStatus', v_case.status)
  );
  return true;
end;
$$;

revoke execute on function public.admin_upsert_hermes_guardian_relationship(uuid, uuid, boolean, uuid, text) from public, anon, authenticated;
revoke execute on function public.admin_close_hermes_scheduling_case(uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.admin_reconcile_hermes_phantom_case(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.mark_hermes_participant_contacted(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_upsert_hermes_guardian_relationship(uuid, uuid, boolean, uuid, text) to service_role;
grant execute on function public.admin_close_hermes_scheduling_case(uuid, text, uuid) to service_role;
grant execute on function public.admin_reconcile_hermes_phantom_case(uuid, uuid) to service_role;
grant execute on function public.mark_hermes_participant_contacted(uuid, uuid) to service_role;

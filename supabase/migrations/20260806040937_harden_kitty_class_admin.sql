-- The legacy roster RPCs silently chose series scope for recurring classes.
-- Keep their definitions for migration compatibility, but remove every Data API
-- execution path so only the explicit-scope overloads below are callable.
revoke execute on function public.add_kitty_class_enrollment(uuid, integer, date, jsonb, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.end_kitty_class_enrollment(uuid, uuid, integer, date, uuid)
  from public, anon, authenticated, service_role;

create function public.add_kitty_class_enrollment(
  p_occurrence_id uuid,
  p_expected_version integer,
  p_effective_date date,
  p_scope text,
  p_enrollment jsonb,
  p_profile_id uuid
) returns public.kitty_class_occurrences
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_occurrence public.kitty_class_occurrences;
  v_series public.kitty_class_series;
  v_series_id uuid;
  v_normalized jsonb;
begin
  if p_occurrence_id is null
    or p_expected_version is null
    or p_expected_version < 1
    or p_effective_date is null
    or p_scope is null
    or p_scope not in ('occurrence', 'this_and_future')
  then
    raise exception 'invalid_scope';
  end if;

  select occurrence.series_id into v_series_id
  from public.kitty_class_occurrences occurrence
  where occurrence.id = p_occurrence_id;
  if not found then raise exception 'class_not_found'; end if;

  if v_series_id is null then
    select * into v_occurrence
    from public.kitty_class_occurrences occurrence
    where occurrence.id = p_occurrence_id
      and occurrence.series_id is null
    for update;
  else
    select * into v_series
    from public.kitty_class_series series
    where series.id = v_series_id
    for update;
    if not found then raise exception 'class_not_found'; end if;

    select * into v_occurrence
    from public.kitty_class_occurrences occurrence
    where occurrence.id = p_occurrence_id
      and occurrence.series_id = v_series_id
    for update;
  end if;

  if not found then raise exception 'class_not_found'; end if;
  if v_occurrence.version <> p_expected_version then raise exception 'stale_class'; end if;
  if v_occurrence.status not in ('scheduled', 'change_requested') then
    raise exception 'class_not_editable';
  end if;

  if v_occurrence.series_id is null then
    if p_scope <> 'occurrence' or p_effective_date <> v_occurrence.local_date then
      raise exception 'invalid_scope';
    end if;
  elsif p_scope = 'occurrence' then
    if p_effective_date <> v_occurrence.local_date then
      raise exception 'invalid_effective_date';
    end if;
  elsif p_effective_date < v_occurrence.local_date
    or p_effective_date < v_series.effective_start
    or (v_series.effective_end is not null and p_effective_date > v_series.effective_end)
  then
    raise exception 'invalid_effective_date';
  end if;

  v_normalized := public.kitty_class_normalize_group_enrollments(
    pg_catalog.jsonb_build_array(p_enrollment)
  );
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(v_normalized) enrollment,
      lateral pg_catalog.jsonb_array_elements(enrollment->'contacts') contact
    join public.kitty_class_participants teacher
      on teacher.contact_id = (contact->>'contactId')::uuid
      and teacher.participant_role = 'teacher'
      and teacher.is_active
      and (teacher.occurrence_id = v_occurrence.id or teacher.series_id = v_occurrence.series_id)
  ) then
    raise exception 'teacher_cannot_be_enrollment_contact';
  end if;

  if p_scope = 'occurrence' then
    perform public.kitty_class_insert_group_enrollments(
      null, v_occurrence.id, v_occurrence.local_date, v_normalized
    );
  else
    perform public.kitty_class_insert_group_enrollments(
      v_series.id, null, p_effective_date, v_normalized
    );
  end if;

  update public.kitty_class_occurrences occurrence
  set version = occurrence.version + 1
  where occurrence.id = v_occurrence.id
    or (
      p_scope = 'this_and_future'
      and occurrence.series_id = v_occurrence.series_id
      and occurrence.local_date >= p_effective_date
    );

  insert into public.kitty_class_audit_events(
    actor_type, actor_profile_id, event_type, entity_type, entity_id, metadata
  ) values (
    'admin', p_profile_id, 'enrollment_added', 'occurrence', v_occurrence.id,
    pg_catalog.jsonb_build_object(
      'scope', p_scope,
      'effectiveDate', p_effective_date,
      'studentContactId', v_normalized->0->>'studentContactId'
    )
  );

  select * into v_occurrence
  from public.kitty_class_occurrences occurrence
  where occurrence.id = p_occurrence_id;
  return v_occurrence;
end;
$$;

create function public.end_kitty_class_enrollment(
  p_occurrence_id uuid,
  p_enrollment_id uuid,
  p_expected_version integer,
  p_effective_date date,
  p_scope text,
  p_profile_id uuid
) returns public.kitty_class_occurrences
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_occurrence public.kitty_class_occurrences;
  v_series public.kitty_class_series;
  v_series_id uuid;
  v_enrollment public.kitty_class_enrollments;
begin
  if p_occurrence_id is null
    or p_enrollment_id is null
    or p_expected_version is null
    or p_expected_version < 1
    or p_effective_date is null
    or p_scope is null
    or p_scope not in ('occurrence', 'this_and_future')
  then
    raise exception 'invalid_scope';
  end if;

  select occurrence.series_id into v_series_id
  from public.kitty_class_occurrences occurrence
  where occurrence.id = p_occurrence_id;
  if not found then raise exception 'class_not_found'; end if;

  if v_series_id is null then
    select * into v_occurrence
    from public.kitty_class_occurrences occurrence
    where occurrence.id = p_occurrence_id
      and occurrence.series_id is null
    for update;
  else
    select * into v_series
    from public.kitty_class_series series
    where series.id = v_series_id
    for update;
    if not found then raise exception 'class_not_found'; end if;

    select * into v_occurrence
    from public.kitty_class_occurrences occurrence
    where occurrence.id = p_occurrence_id
      and occurrence.series_id = v_series_id
    for update;
  end if;

  if not found then raise exception 'class_not_found'; end if;
  if v_occurrence.version <> p_expected_version then raise exception 'stale_class'; end if;
  if v_occurrence.status not in ('scheduled', 'change_requested') then
    raise exception 'class_not_editable';
  end if;

  if v_occurrence.series_id is null then
    if p_scope <> 'occurrence' or p_effective_date <> v_occurrence.local_date then
      raise exception 'invalid_scope';
    end if;
    select * into v_enrollment
    from public.kitty_class_enrollments enrollment
    where enrollment.id = p_enrollment_id
      and enrollment.occurrence_id = v_occurrence.id
      and enrollment.is_active
    for update;
  else
    if p_scope <> 'this_and_future' then
      raise exception 'invalid_scope';
    end if;
    select * into v_enrollment
    from public.kitty_class_enrollments enrollment
    where enrollment.id = p_enrollment_id
      and enrollment.series_id = v_occurrence.series_id
      and enrollment.is_active
    for update;
  end if;

  if not found then raise exception 'enrollment_not_found'; end if;
  if p_effective_date < v_enrollment.active_from then raise exception 'invalid_effective_date'; end if;

  if v_enrollment.occurrence_id is not null then
    update public.kitty_class_enrollments enrollment
    set is_active = false
    where enrollment.id = v_enrollment.id;
    update public.kitty_class_enrollment_contacts enrollment_contact
    set is_active = false
    where enrollment_contact.enrollment_id = v_enrollment.id;
    if not exists (
      select 1
      from public.kitty_class_enrollments enrollment
      where enrollment.occurrence_id = v_occurrence.id
        and enrollment.is_active
    ) then
      raise exception 'enrollment_required';
    end if;
  else
    if p_effective_date < v_occurrence.local_date
      or (v_series.effective_end is not null and p_effective_date > v_series.effective_end)
    then
      raise exception 'invalid_effective_date';
    end if;

    -- active_until is inclusive. A one-class absence belongs in the append-only
    -- attendance stream and must not rewrite recurring membership.
    update public.kitty_class_enrollments enrollment
    set active_until = p_effective_date
    where enrollment.id = v_enrollment.id;
    if exists (
      select 1
      from public.kitty_class_occurrences future_occurrence
      where future_occurrence.series_id = v_occurrence.series_id
        and future_occurrence.local_date > p_effective_date
        and future_occurrence.status in ('scheduled', 'change_requested')
        and not exists (
          select 1
          from public.kitty_class_enrollments remaining
          where remaining.series_id = v_occurrence.series_id
            and remaining.is_active
            and remaining.active_from <= future_occurrence.local_date
            and (remaining.active_until is null or remaining.active_until >= future_occurrence.local_date)
        )
    ) then
      raise exception 'enrollment_required';
    end if;
  end if;

  update public.kitty_class_occurrences occurrence
  set version = occurrence.version + 1
  where occurrence.id = v_occurrence.id
    or (
      p_scope = 'this_and_future'
      and occurrence.series_id = v_occurrence.series_id
      and occurrence.local_date > p_effective_date
    );

  insert into public.kitty_class_audit_events(
    actor_type, actor_profile_id, event_type, entity_type, entity_id, metadata
  ) values (
    'admin', p_profile_id, 'enrollment_ended', 'occurrence', v_occurrence.id,
    pg_catalog.jsonb_build_object(
      'scope', p_scope,
      'effectiveDate', p_effective_date,
      'enrollmentId', v_enrollment.id
    )
  );

  select * into v_occurrence
  from public.kitty_class_occurrences occurrence
  where occurrence.id = p_occurrence_id;
  return v_occurrence;
end;
$$;

create or replace function public.retry_kitty_class_notification(
  p_notification_id uuid,
  p_profile_id uuid
) returns public.kitty_class_notification_outbox
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_notification public.kitty_class_notification_outbox;
begin
  update public.kitty_class_notification_outbox notification
  set status = 'pending',
    attempt_count = 0,
    available_at = pg_catalog.now(),
    last_error_code = null
  where notification.id = p_notification_id
    and notification.status = 'failed'
  returning * into v_notification;
  if not found then raise exception 'notification_not_retryable'; end if;

  insert into public.kitty_class_audit_events(
    actor_type, actor_profile_id, event_type, entity_type, entity_id
  ) values (
    'admin', p_profile_id, 'notification_retry_requested', 'notification', p_notification_id
  );
  return v_notification;
end;
$$;

create function public.get_kitty_class_admin_detail_events(p_occurrence_id uuid)
returns table (
  id uuid,
  actor_type text,
  event_type text,
  entity_type text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select audit.id, audit.actor_type, audit.event_type, audit.entity_type, audit.created_at
  from public.kitty_class_audit_events audit
  where p_occurrence_id is not null
    and (
      (audit.entity_type = 'occurrence' and audit.entity_id = p_occurrence_id)
      or (
        audit.entity_type = 'attendance_update'
        and exists (
          select 1
          from public.kitty_class_attendance_updates attendance
          where attendance.id = audit.entity_id
            and attendance.occurrence_id = p_occurrence_id
        )
      )
      or (
        audit.entity_type = 'change_request'
        and exists (
          select 1
          from public.kitty_class_change_requests change_request
          where change_request.id = audit.entity_id
            and change_request.occurrence_id = p_occurrence_id
        )
      )
      or (
        audit.entity_type = 'notification'
        and exists (
          select 1
          from public.kitty_class_notification_outbox notification
          where notification.id = audit.entity_id
            and notification.occurrence_id = p_occurrence_id
        )
      )
      or (
        audit.entity_type = 'operational_relay'
        and exists (
          select 1
          from public.kitty_class_operational_relays relay
          where relay.id = audit.entity_id
            and relay.occurrence_id = p_occurrence_id
        )
      )
    )
  order by audit.created_at desc, audit.id desc
  limit 50
$$;

revoke execute on function public.add_kitty_class_enrollment(uuid, integer, date, text, jsonb, uuid)
  from public, anon, authenticated;
revoke execute on function public.end_kitty_class_enrollment(uuid, uuid, integer, date, text, uuid)
  from public, anon, authenticated;
revoke execute on function public.retry_kitty_class_notification(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.get_kitty_class_admin_detail_events(uuid)
  from public, anon, authenticated;

grant execute on function public.add_kitty_class_enrollment(uuid, integer, date, text, jsonb, uuid)
  to service_role;
grant execute on function public.end_kitty_class_enrollment(uuid, uuid, integer, date, text, uuid)
  to service_role;
grant execute on function public.retry_kitty_class_notification(uuid, uuid)
  to service_role;
grant execute on function public.get_kitty_class_admin_detail_events(uuid)
  to service_role;

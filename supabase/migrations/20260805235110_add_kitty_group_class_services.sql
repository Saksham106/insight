-- Group-class mutations are exposed through service-role-only RPCs.  They use
-- SECURITY DEFINER because the server-side Supabase client must perform each
-- roster mutation atomically across RLS-protected Kitty-owned tables.

create function public.kitty_class_normalize_group_enrollments(p_enrollments jsonb)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_enrollment jsonb;
  v_contacts jsonb;
  v_normalized jsonb := '[]'::jsonb;
begin
  if pg_catalog.jsonb_typeof(p_enrollments) is distinct from 'array'
    or pg_catalog.jsonb_array_length(p_enrollments) = 0
  then
    raise exception 'enrollment_required';
  end if;

  if (
    select pg_catalog.count(distinct item->>'studentContactId')
    from pg_catalog.jsonb_array_elements(p_enrollments) item
  ) <> pg_catalog.jsonb_array_length(p_enrollments) then
    raise exception 'duplicate_student';
  end if;

  for v_enrollment in
    select item
    from pg_catalog.jsonb_array_elements(p_enrollments) item
    order by item->>'studentContactId'
  loop
    if pg_catalog.jsonb_typeof(v_enrollment) is distinct from 'object'
      or coalesce(pg_catalog.btrim(v_enrollment->>'studentContactId'), '') = ''
      or pg_catalog.jsonb_typeof(v_enrollment->'contacts') is distinct from 'array'
      or pg_catalog.jsonb_array_length(v_enrollment->'contacts') = 0
    then
      raise exception 'invalid_enrollment';
    end if;

    -- Cast once during validation so malformed identifiers cannot reach writes.
    perform (v_enrollment->>'studentContactId')::uuid;

    if (
      select pg_catalog.count(distinct contact->>'contactId')
      from pg_catalog.jsonb_array_elements(v_enrollment->'contacts') contact
    ) <> pg_catalog.jsonb_array_length(v_enrollment->'contacts') then
      raise exception 'duplicate_enrollment_contact';
    end if;

    if exists (
      select 1
      from pg_catalog.jsonb_array_elements(v_enrollment->'contacts') contact
      where pg_catalog.jsonb_typeof(contact) is distinct from 'object'
        or coalesce(pg_catalog.btrim(contact->>'contactId'), '') = ''
        or contact->>'role' is null
        or contact->>'role' not in ('student', 'parent_guardian')
        or pg_catalog.jsonb_typeof(contact->'receivesNotifications') is distinct from 'boolean'
        or pg_catalog.jsonb_typeof(contact->'confirmsCancellation') is distinct from 'boolean'
        or pg_catalog.jsonb_typeof(contact->'confirmsReschedule') is distinct from 'boolean'
    ) then
      raise exception 'invalid_enrollment_contact';
    end if;

    perform (contact->>'contactId')::uuid
    from pg_catalog.jsonb_array_elements(v_enrollment->'contacts') contact;

    if (
      select pg_catalog.count(*)
      from pg_catalog.jsonb_array_elements(v_enrollment->'contacts') contact
      where contact->>'role' = 'student'
        and contact->>'contactId' = v_enrollment->>'studentContactId'
    ) <> 1 or exists (
      select 1
      from pg_catalog.jsonb_array_elements(v_enrollment->'contacts') contact
      where contact->>'role' = 'student'
        and contact->>'contactId' <> v_enrollment->>'studentContactId'
    ) then
      raise exception 'student_contact_required';
    end if;

    if not exists (
      select 1
      from pg_catalog.jsonb_array_elements(v_enrollment->'contacts') contact
      where (contact->>'confirmsReschedule')::boolean
    ) then
      raise exception 'reschedule_decision_maker_required';
    end if;

    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'contactId', contact->>'contactId',
        'role', contact->>'role',
        'receivesNotifications', (contact->>'receivesNotifications')::boolean,
        'confirmsCancellation', (contact->>'confirmsCancellation')::boolean,
        'confirmsReschedule', (contact->>'confirmsReschedule')::boolean
      )
      order by contact->>'contactId'
    ) into v_contacts
    from pg_catalog.jsonb_array_elements(v_enrollment->'contacts') contact;

    v_normalized := v_normalized || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'studentContactId', v_enrollment->>'studentContactId',
        'contacts', v_contacts
      )
    );
  end loop;

  return v_normalized;
end;
$$;

create function public.kitty_class_insert_group_enrollments(
  p_series_id uuid,
  p_occurrence_id uuid,
  p_active_from date,
  p_enrollments jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enrollment jsonb;
  v_enrollment_id uuid;
begin
  if pg_catalog.num_nonnulls(p_series_id, p_occurrence_id) <> 1 then
    raise exception 'invalid_class_scope';
  end if;

  for v_enrollment in
    select item
    from pg_catalog.jsonb_array_elements(
      public.kitty_class_normalize_group_enrollments(p_enrollments)
    ) item
  loop
    insert into public.kitty_class_enrollments(
      series_id, occurrence_id, student_contact_id, active_from
    ) values (
      p_series_id, p_occurrence_id,
      (v_enrollment->>'studentContactId')::uuid, p_active_from
    ) returning id into v_enrollment_id;

    insert into public.kitty_class_enrollment_contacts(
      enrollment_id, contact_id, contact_role, receives_notifications,
      confirms_cancellation, confirms_reschedule
    )
    select v_enrollment_id, (contact->>'contactId')::uuid, contact->>'role',
      (contact->>'receivesNotifications')::boolean,
      (contact->>'confirmsCancellation')::boolean,
      (contact->>'confirmsReschedule')::boolean
    from pg_catalog.jsonb_array_elements(v_enrollment->'contacts') contact;
  end loop;
end;
$$;

create function public.create_kitty_group_one_off(
  p_title text,
  p_subject text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_local_date date,
  p_timezone text,
  p_origin_channel text,
  p_created_by uuid,
  p_teacher_contact_id uuid,
  p_enrollments jsonb,
  p_client_request_id text
) returns public.kitty_class_occurrences
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_occurrence public.kitty_class_occurrences;
  v_existing public.kitty_class_audit_events;
  v_normalized_enrollments jsonb;
  v_payload jsonb;
  v_payload_digest text;
  v_request_id text := pg_catalog.btrim(p_client_request_id);
begin
  if coalesce(pg_catalog.btrim(p_title), '') = ''
    or pg_catalog.length(pg_catalog.btrim(p_title)) > 240
    or coalesce(pg_catalog.btrim(p_timezone), '') = ''
    or pg_catalog.length(pg_catalog.btrim(p_timezone)) > 100
    or p_starts_at is null
    or p_ends_at is null
    or p_ends_at <= p_starts_at
    or p_ends_at - p_starts_at > interval '24 hours'
    or p_local_date is null
    or p_origin_channel not in ('dashboard', 'imessage')
    or p_teacher_contact_id is null
    or coalesce(v_request_id, '') = ''
    or pg_catalog.length(v_request_id) > 200
  then
    raise exception 'invalid_class';
  end if;
  if p_subject is not null and (
    coalesce(pg_catalog.btrim(p_subject), '') = ''
    or pg_catalog.length(pg_catalog.btrim(p_subject)) > 120
  ) then
    raise exception 'invalid_class';
  end if;

  v_normalized_enrollments := public.kitty_class_normalize_group_enrollments(p_enrollments);
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(v_normalized_enrollments) enrollment,
      lateral pg_catalog.jsonb_array_elements(enrollment->'contacts') contact
    where (contact->>'contactId')::uuid = p_teacher_contact_id
  ) then
    raise exception 'teacher_cannot_be_enrollment_contact';
  end if;

  v_payload := pg_catalog.jsonb_build_object(
    'kind', 'one_off',
    'title', pg_catalog.btrim(p_title),
    'subject', nullif(pg_catalog.btrim(p_subject), ''),
    'startsAt', p_starts_at,
    'endsAt', p_ends_at,
    'localDate', p_local_date,
    'timezone', pg_catalog.btrim(p_timezone),
    'teacherContactId', p_teacher_contact_id,
    'enrollments', v_normalized_enrollments
  );
  v_payload_digest := pg_catalog.encode(
    public.digest(pg_catalog.convert_to(v_payload::text, 'UTF8'), 'sha256'), 'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_request_id, 0)
  );
  select * into v_existing
  from public.kitty_class_audit_events
  where request_id = v_request_id
  for update;
  if found then
    if v_existing.event_type <> 'occurrence_created'
      or v_existing.entity_type <> 'occurrence'
      or v_existing.metadata->>'payloadDigest' is distinct from v_payload_digest
    then
      raise exception 'client_request_payload_mismatch';
    end if;
    select * into v_occurrence
    from public.kitty_class_occurrences
    where id = v_existing.entity_id;
    if not found then
      raise exception 'idempotency_target_missing';
    end if;
    return v_occurrence;
  end if;

  insert into public.kitty_class_occurrences(
    occurrence_key, title, subject, starts_at, ends_at, local_date, timezone,
    origin_channel, created_by_profile_id
  ) values (
    'group-one-off:' || v_payload_digest,
    pg_catalog.btrim(p_title), nullif(pg_catalog.btrim(p_subject), ''),
    p_starts_at, p_ends_at, p_local_date, pg_catalog.btrim(p_timezone),
    p_origin_channel, p_created_by
  ) returning * into v_occurrence;

  insert into public.kitty_class_participants(
    occurrence_id, contact_id, participant_role, receives_notifications,
    confirms_cancellation, confirms_reschedule, decision_side
  ) values (
    v_occurrence.id, p_teacher_contact_id, 'teacher', true, true, true, 'teacher'
  );
  perform public.kitty_class_insert_group_enrollments(
    null, v_occurrence.id, p_local_date, v_normalized_enrollments
  );
  insert into public.kitty_class_audit_events(
    actor_type, actor_profile_id, event_type, entity_type, entity_id,
    request_id, metadata
  ) values (
    'admin', p_created_by, 'occurrence_created', 'occurrence', v_occurrence.id,
    v_request_id, pg_catalog.jsonb_build_object('payloadDigest', v_payload_digest)
  );
  return v_occurrence;
end;
$$;

create function public.create_kitty_group_series(
  p_title text,
  p_subject text,
  p_timezone text,
  p_local_time time,
  p_duration_minutes integer,
  p_weekdays smallint[],
  p_effective_start date,
  p_effective_end date,
  p_origin_channel text,
  p_created_by uuid,
  p_teacher_contact_id uuid,
  p_enrollments jsonb,
  p_client_request_id text
) returns public.kitty_class_series
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_series public.kitty_class_series;
  v_existing public.kitty_class_audit_events;
  v_normalized_enrollments jsonb;
  v_normalized_weekdays smallint[];
  v_payload jsonb;
  v_payload_digest text;
  v_request_id text := pg_catalog.btrim(p_client_request_id);
  v_from date;
  v_through date;
begin
  select pg_catalog.array_agg(day order by day)
    into v_normalized_weekdays
  from (
    select distinct day
    from pg_catalog.unnest(p_weekdays) day
  ) normalized;

  if coalesce(pg_catalog.btrim(p_title), '') = ''
    or pg_catalog.length(pg_catalog.btrim(p_title)) > 240
    or coalesce(pg_catalog.btrim(p_timezone), '') = ''
    or pg_catalog.length(pg_catalog.btrim(p_timezone)) > 100
    or p_local_time is null
    or p_duration_minutes is null
    or p_duration_minutes not between 5 and 1440
    or p_weekdays is null
    or pg_catalog.cardinality(v_normalized_weekdays) not between 1 and 7
    or not (v_normalized_weekdays <@ array[0,1,2,3,4,5,6]::smallint[])
    or pg_catalog.cardinality(v_normalized_weekdays) <> pg_catalog.cardinality(p_weekdays)
    or p_effective_start is null
    or (p_effective_end is not null and p_effective_end < p_effective_start)
    or p_origin_channel not in ('dashboard', 'imessage')
    or p_teacher_contact_id is null
    or coalesce(v_request_id, '') = ''
    or pg_catalog.length(v_request_id) > 200
  then
    raise exception 'invalid_class';
  end if;
  if p_subject is not null and (
    coalesce(pg_catalog.btrim(p_subject), '') = ''
    or pg_catalog.length(pg_catalog.btrim(p_subject)) > 120
  ) then
    raise exception 'invalid_class';
  end if;

  v_normalized_enrollments := public.kitty_class_normalize_group_enrollments(p_enrollments);
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(v_normalized_enrollments) enrollment,
      lateral pg_catalog.jsonb_array_elements(enrollment->'contacts') contact
    where (contact->>'contactId')::uuid = p_teacher_contact_id
  ) then
    raise exception 'teacher_cannot_be_enrollment_contact';
  end if;

  v_payload := pg_catalog.jsonb_build_object(
    'kind', 'weekly',
    'title', pg_catalog.btrim(p_title),
    'subject', nullif(pg_catalog.btrim(p_subject), ''),
    'timezone', pg_catalog.btrim(p_timezone),
    'localTime', p_local_time,
    'durationMinutes', p_duration_minutes,
    'weekdays', v_normalized_weekdays,
    'effectiveStart', p_effective_start,
    'effectiveEnd', p_effective_end,
    'teacherContactId', p_teacher_contact_id,
    'enrollments', v_normalized_enrollments
  );
  v_payload_digest := pg_catalog.encode(
    public.digest(pg_catalog.convert_to(v_payload::text, 'UTF8'), 'sha256'), 'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_request_id, 0)
  );
  select * into v_existing
  from public.kitty_class_audit_events
  where request_id = v_request_id
  for update;
  if found then
    if v_existing.event_type <> 'series_created'
      or v_existing.entity_type <> 'series'
      or v_existing.metadata->>'payloadDigest' is distinct from v_payload_digest
    then
      raise exception 'client_request_payload_mismatch';
    end if;
    select * into v_series
    from public.kitty_class_series
    where id = v_existing.entity_id;
    if not found then
      raise exception 'idempotency_target_missing';
    end if;
    return v_series;
  end if;

  v_through := current_date + 90;
  v_from := greatest(p_effective_start, current_date);
  insert into public.kitty_class_series(
    title, subject, timezone, local_time, duration_minutes, weekdays,
    effective_start, effective_end, expanded_through, origin_channel,
    created_by_profile_id
  ) values (
    pg_catalog.btrim(p_title), nullif(pg_catalog.btrim(p_subject), ''),
    pg_catalog.btrim(p_timezone), p_local_time, p_duration_minutes,
    v_normalized_weekdays, p_effective_start, p_effective_end, v_through,
    p_origin_channel, p_created_by
  ) returning * into v_series;

  insert into public.kitty_class_participants(
    series_id, contact_id, participant_role, receives_notifications,
    confirms_cancellation, confirms_reschedule, decision_side
  ) values (
    v_series.id, p_teacher_contact_id, 'teacher', true, true, true, 'teacher'
  );
  perform public.kitty_class_insert_group_enrollments(
    v_series.id, null, p_effective_start, v_normalized_enrollments
  );

  if v_from <= least(coalesce(p_effective_end, v_through), v_through) then
    insert into public.kitty_class_occurrences(
      series_id, occurrence_key, title, subject, starts_at, ends_at,
      local_date, timezone, origin_channel, created_by_profile_id
    )
    select v_series.id,
      'series:' || v_series.id::text || ':' || generated.day::date::text,
      v_series.title, v_series.subject,
      (generated.day::date + p_local_time) at time zone pg_catalog.btrim(p_timezone),
      ((generated.day::date + p_local_time) at time zone pg_catalog.btrim(p_timezone))
        + pg_catalog.make_interval(mins => p_duration_minutes),
      generated.day::date, v_series.timezone, 'system', p_created_by
    from pg_catalog.generate_series(
      v_from::timestamp,
      least(coalesce(p_effective_end, v_through), v_through)::timestamp,
      interval '1 day'
    ) generated(day)
    where extract(dow from generated.day)::smallint = any(v_normalized_weekdays)
    on conflict (occurrence_key) do nothing;
  end if;

  insert into public.kitty_class_audit_events(
    actor_type, actor_profile_id, event_type, entity_type, entity_id,
    request_id, metadata
  ) values (
    'admin', p_created_by, 'series_created', 'series', v_series.id,
    v_request_id, pg_catalog.jsonb_build_object('payloadDigest', v_payload_digest)
  );
  return v_series;
end;
$$;

create function public.add_kitty_class_enrollment(
  p_occurrence_id uuid,
  p_expected_version integer,
  p_effective_date date,
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
  v_normalized jsonb;
begin
  if p_occurrence_id is null
    or p_expected_version is null
    or p_expected_version < 1
    or p_effective_date is null
  then
    raise exception 'invalid_class';
  end if;
  select * into v_occurrence
  from public.kitty_class_occurrences
  where id = p_occurrence_id
  for update;
  if not found then raise exception 'class_not_found'; end if;
  if v_occurrence.version <> p_expected_version then raise exception 'stale_class'; end if;
  if v_occurrence.status not in ('scheduled', 'change_requested') then
    raise exception 'class_not_editable';
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

  if v_occurrence.series_id is null then
    if p_effective_date <> v_occurrence.local_date then raise exception 'invalid_effective_date'; end if;
    perform public.kitty_class_insert_group_enrollments(
      null, v_occurrence.id, p_effective_date, v_normalized
    );
  else
    select * into v_series
    from public.kitty_class_series
    where id = v_occurrence.series_id
    for update;
    if p_effective_date < v_occurrence.local_date
      or p_effective_date < v_series.effective_start
      or (v_series.effective_end is not null and p_effective_date > v_series.effective_end)
    then
      raise exception 'invalid_effective_date';
    end if;
    perform public.kitty_class_insert_group_enrollments(
      v_series.id, null, p_effective_date, v_normalized
    );
  end if;

  update public.kitty_class_occurrences occurrence
  set version = occurrence.version + 1
  where occurrence.id = v_occurrence.id
    or (
      v_occurrence.series_id is not null
      and occurrence.series_id = v_occurrence.series_id
      and occurrence.local_date >= p_effective_date
    );
  insert into public.kitty_class_audit_events(
    actor_type, actor_profile_id, event_type, entity_type, entity_id, metadata
  ) values (
    'admin', p_profile_id, 'enrollment_added', 'occurrence', v_occurrence.id,
    pg_catalog.jsonb_build_object(
      'effectiveDate', p_effective_date,
      'studentContactId', v_normalized->0->>'studentContactId'
    )
  );
  select * into v_occurrence
  from public.kitty_class_occurrences
  where id = p_occurrence_id;
  return v_occurrence;
end;
$$;

create function public.end_kitty_class_enrollment(
  p_occurrence_id uuid,
  p_enrollment_id uuid,
  p_expected_version integer,
  p_effective_date date,
  p_profile_id uuid
) returns public.kitty_class_occurrences
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_occurrence public.kitty_class_occurrences;
  v_enrollment public.kitty_class_enrollments;
begin
  if p_occurrence_id is null
    or p_enrollment_id is null
    or p_expected_version is null
    or p_expected_version < 1
    or p_effective_date is null
  then
    raise exception 'invalid_class';
  end if;
  select * into v_occurrence
  from public.kitty_class_occurrences
  where id = p_occurrence_id
  for update;
  if not found then raise exception 'class_not_found'; end if;
  if v_occurrence.version <> p_expected_version then raise exception 'stale_class'; end if;
  if v_occurrence.status not in ('scheduled', 'change_requested') then
    raise exception 'class_not_editable';
  end if;

  select * into v_enrollment
  from public.kitty_class_enrollments enrollment
  where enrollment.id = p_enrollment_id
    and (
      enrollment.occurrence_id = v_occurrence.id
      or (v_occurrence.series_id is not null and enrollment.series_id = v_occurrence.series_id)
    )
  for update;
  if not found then raise exception 'enrollment_not_found'; end if;
  if p_effective_date < v_enrollment.active_from then raise exception 'invalid_effective_date'; end if;

  if v_enrollment.occurrence_id is not null then
    if p_effective_date <> v_occurrence.local_date then raise exception 'invalid_effective_date'; end if;
    update public.kitty_class_enrollments
    set is_active = false
    where id = v_enrollment.id;
    update public.kitty_class_enrollment_contacts
    set is_active = false
    where enrollment_id = v_enrollment.id;
    if not exists (
      select 1
      from public.kitty_class_enrollments enrollment
      where enrollment.occurrence_id = v_occurrence.id
        and enrollment.is_active
    ) then
      raise exception 'enrollment_required';
    end if;
  else
    if p_effective_date < v_occurrence.local_date then raise exception 'invalid_effective_date'; end if;
    update public.kitty_class_enrollments
    set active_until = p_effective_date
    where id = v_enrollment.id;
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
      v_occurrence.series_id is not null
      and occurrence.series_id = v_occurrence.series_id
      and occurrence.local_date > p_effective_date
    );
  insert into public.kitty_class_audit_events(
    actor_type, actor_profile_id, event_type, entity_type, entity_id, metadata
  ) values (
    'admin', p_profile_id, 'enrollment_ended', 'occurrence', v_occurrence.id,
    pg_catalog.jsonb_build_object(
      'effectiveDate', p_effective_date,
      'enrollmentId', v_enrollment.id
    )
  );
  select * into v_occurrence
  from public.kitty_class_occurrences
  where id = p_occurrence_id;
  return v_occurrence;
end;
$$;

revoke execute on function public.kitty_class_normalize_group_enrollments(jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function public.kitty_class_insert_group_enrollments(uuid, uuid, date, jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function public.create_kitty_group_one_off(text, text, timestamptz, timestamptz, date, text, text, uuid, uuid, jsonb, text)
  from public, anon, authenticated;
revoke execute on function public.create_kitty_group_series(text, text, text, time, integer, smallint[], date, date, text, uuid, uuid, jsonb, text)
  from public, anon, authenticated;
revoke execute on function public.add_kitty_class_enrollment(uuid, integer, date, jsonb, uuid)
  from public, anon, authenticated;
revoke execute on function public.end_kitty_class_enrollment(uuid, uuid, integer, date, uuid)
  from public, anon, authenticated;

grant execute on function public.create_kitty_group_one_off(text, text, timestamptz, timestamptz, date, text, text, uuid, uuid, jsonb, text)
  to service_role;
grant execute on function public.create_kitty_group_series(text, text, text, time, integer, smallint[], date, date, text, uuid, uuid, jsonb, text)
  to service_role;
grant execute on function public.add_kitty_class_enrollment(uuid, integer, date, jsonb, uuid)
  to service_role;
grant execute on function public.end_kitty_class_enrollment(uuid, uuid, integer, date, uuid)
  to service_role;

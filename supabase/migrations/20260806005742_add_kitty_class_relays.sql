-- Kitty attendance and operational relays remain isolated from Academy state.
-- All callable mutations are server-only, payload-bound, and transactional.

alter table public.kitty_class_audit_events
  drop constraint if exists kitty_class_audit_events_entity_type_check;
alter table public.kitty_class_audit_events
  add constraint kitty_class_audit_events_entity_type_check check (
    entity_type in (
      'series', 'occurrence', 'change_request', 'notification',
      'attendance_update', 'operational_relay'
    )
  ),
  add constraint kitty_class_audit_relay_payload_digest_check check (
    event_type not in ('attendance_recorded', 'attendance_corrected', 'operational_relay_created')
    or metadata->>'payloadDigest' ~ '^[a-f0-9]{64}$'
  );

alter table public.kitty_class_notification_outbox
  drop constraint if exists kitty_class_notification_outbox_intent_check;
alter table public.kitty_class_notification_outbox
  add constraint kitty_class_notification_outbox_intent_check check (
    intent in (
      'class_change_request', 'class_change_proposal', 'class_cancelled',
      'class_rescheduled', 'class_change_rejected', 'class_attendance_update',
      'class_teacher_delay', 'class_operational_update'
    )
  ),
  add constraint kitty_class_outbox_relay_payload_check check (
    intent not in ('class_attendance_update', 'class_teacher_delay', 'class_operational_update')
    or (
      pg_catalog.jsonb_typeof(payload) = 'object'
      and pg_catalog.jsonb_typeof(payload->'relaySummary') = 'string'
      and pg_catalog.length(payload->>'relaySummary') between 1 and 500
      and not (payload ?| array['rawMessage', 'note', 'studentName', 'reason'])
    )
  );

alter table public.kitty_class_attendance_updates
  add column payload_digest text not null
    check (payload_digest ~ '^[a-f0-9]{64}$'),
  add constraint kitty_class_attendance_estimate_check check (
    (status in ('late', 'leaving_early')) or estimated_at is null
  );

alter table public.kitty_class_operational_relays
  add column payload_digest text not null
    check (payload_digest ~ '^[a-f0-9]{64}$'),
  add constraint kitty_class_relay_structured_payload_check check (
    not (structured_payload ?| array['rawMessage', 'note', 'studentName', 'reason'])
    and pg_catalog.length(coalesce(structured_payload->>'locationLabel', '')) <= 120
    and pg_catalog.length(coalesce(structured_payload->>'preparationNote', '')) <= 240
  );

create unique index kitty_class_attendance_one_correction_unique
  on public.kitty_class_attendance_updates(supersedes_attendance_id)
  where supersedes_attendance_id is not null;

create function public.prevent_kitty_class_attendance_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'kitty_class_attendance_is_append_only';
end;
$$;

create trigger prevent_kitty_class_attendance_mutation
  before update or delete on public.kitty_class_attendance_updates
  for each row execute function public.prevent_kitty_class_attendance_mutation();

revoke execute on function public.prevent_kitty_class_attendance_mutation()
  from public, anon, authenticated, service_role;

create function public.record_kitty_class_attendance(
  p_occurrence_id uuid,
  p_enrollment_id uuid,
  p_actor_contact_id uuid,
  p_status text,
  p_estimated_at timestamptz,
  p_note text,
  p_selection_token text,
  p_client_request_id text
) returns public.kitty_class_attendance_updates
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_occurrence public.kitty_class_occurrences;
  v_enrollment public.kitty_class_enrollments;
  v_attendance public.kitty_class_attendance_updates;
  v_existing_audit public.kitty_class_audit_events;
  v_request_id text := pg_catalog.btrim(p_client_request_id);
  v_note text := nullif(pg_catalog.btrim(p_note), '');
  v_selection_digest text;
  v_payload jsonb;
  v_payload_digest text;
begin
  if p_occurrence_id is null
    or p_enrollment_id is null
    or p_actor_contact_id is null
    or p_status not in ('expected', 'absent', 'late', 'leaving_early')
    or (p_estimated_at is not null and p_status not in ('late', 'leaving_early'))
    or coalesce(v_request_id, '') = ''
    or pg_catalog.length(v_request_id) > 200
    or p_selection_token is null
    or p_selection_token !~ '^[a-f0-9]{64}$'
    or pg_catalog.length(coalesce(v_note, '')) > 240
    or coalesce(v_note, '') ~* '\m(diagnos(is|ed)|medical|medication|therapy|disab(ility|led)|grade|gpa|exam score|tuition|payment|invoice|debt|disciplin(e|ary)|suspension|expulsion|abuse|violence)\M'
  then
    raise exception 'invalid_attendance';
  end if;

  select * into v_occurrence
  from public.kitty_class_occurrences occurrence
  where occurrence.id = p_occurrence_id
  for update;
  if not found or v_occurrence.status not in ('scheduled', 'change_requested') then
    raise exception 'occurrence_unavailable';
  end if;

  select enrollment.* into v_enrollment
  from public.kitty_class_enrollments enrollment
  join public.kitty_class_enrollment_contacts enrollment_contact
    on enrollment_contact.enrollment_id = enrollment.id
  where enrollment.id = p_enrollment_id
    and public.kitty_class_enrollment_applies_to_occurrence(enrollment.id, v_occurrence.id)
    and enrollment_contact.contact_id = p_actor_contact_id
    and enrollment_contact.is_active
  for update of enrollment;
  if not found then
    raise exception 'attendance_not_permitted';
  end if;

  v_selection_digest := pg_catalog.encode(
    public.digest(pg_catalog.convert_to(p_selection_token, 'UTF8'), 'sha256'), 'hex'
  );
  if not exists (
    select 1
    from public.kitty_class_audit_events selection
    where selection.actor_contact_id = p_actor_contact_id
      and selection.event_type = 'occurrence_selection_confirmed'
      and selection.entity_type = 'occurrence'
      and selection.entity_id = v_occurrence.id
      and selection.metadata->>'selectionTokenDigest' = v_selection_digest
      and (selection.metadata->>'occurrenceVersion')::integer = v_occurrence.version
      and (selection.metadata->>'expiresAt')::timestamptz > pg_catalog.now()
  ) then
    raise exception 'selection_confirmation_required';
  end if;

  v_payload := pg_catalog.jsonb_build_object(
    'operation', 'record',
    'occurrenceId', v_occurrence.id,
    'enrollmentId', v_enrollment.id,
    'actorContactId', p_actor_contact_id,
    'status', p_status,
    'estimatedAt', p_estimated_at,
    'note', v_note
  );
  v_payload_digest := pg_catalog.encode(
    public.digest(pg_catalog.convert_to(v_payload::text, 'UTF8'), 'sha256'), 'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_request_id, 0));
  select * into v_existing_audit
  from public.kitty_class_audit_events audit
  where audit.request_id = v_request_id
  for update;
  if found then
    if v_existing_audit.event_type <> 'attendance_recorded'
      or v_existing_audit.entity_type <> 'attendance_update'
      or v_existing_audit.metadata->>'payloadDigest' is distinct from v_payload_digest
    then
      raise exception 'client_request_payload_mismatch';
    end if;
    select * into v_attendance
    from public.kitty_class_attendance_updates attendance
    where attendance.id = v_existing_audit.entity_id;
    if not found then raise exception 'idempotency_target_missing'; end if;
    return v_attendance;
  end if;

  insert into public.kitty_class_attendance_updates(
    occurrence_id, enrollment_id, reported_by_contact_id, status, estimated_at,
    note, version, client_request_id, payload_digest
  ) values (
    v_occurrence.id, v_enrollment.id, p_actor_contact_id, p_status, p_estimated_at,
    v_note, 1, v_request_id, v_payload_digest
  ) returning * into v_attendance;

  insert into public.kitty_class_notification_outbox(
    occurrence_id, contact_id, intent, payload, idempotency_key
  )
  select v_occurrence.id, recipient.contact_id, 'class_attendance_update',
    pg_catalog.jsonb_build_object(
      'relaySummary', case
        when p_status = 'expected' and recipient.audience = 'teacher' then 'A student is expected to attend.'
        when p_status = 'expected' then 'Your student is expected to attend.'
        when p_status = 'absent' and recipient.audience = 'teacher' then 'A student will be absent.'
        when p_status = 'absent' then 'Your student will be absent.'
        when p_status = 'late' and p_estimated_at is not null and recipient.audience = 'teacher'
          then 'A student expects to arrive at ' || pg_catalog.to_char(p_estimated_at at time zone 'UTC', 'FMHH12:MI AM') || ' UTC.'
        when p_status = 'late' and p_estimated_at is not null
          then 'Your student expects to arrive at ' || pg_catalog.to_char(p_estimated_at at time zone 'UTC', 'FMHH12:MI AM') || ' UTC.'
        when p_status = 'late' and recipient.audience = 'teacher' then 'A student will arrive late.'
        when p_status = 'late' then 'Your student will arrive late.'
        when p_estimated_at is not null and recipient.audience = 'teacher'
          then 'A student expects to leave at ' || pg_catalog.to_char(p_estimated_at at time zone 'UTC', 'FMHH12:MI AM') || ' UTC.'
        when p_estimated_at is not null
          then 'Your student expects to leave at ' || pg_catalog.to_char(p_estimated_at at time zone 'UTC', 'FMHH12:MI AM') || ' UTC.'
        when recipient.audience = 'teacher' then 'A student will leave early.'
        else 'Your student will leave early.'
      end
    ),
    'attendance:' || v_attendance.id::text || ':' || recipient.contact_id::text
  from (
    select distinct candidate.contact_id, candidate.audience
    from (
      select participant.contact_id, 'teacher'::text as audience
      from public.kitty_class_participants participant
      where participant.participant_role = 'teacher'
        and participant.is_active
        and participant.receives_notifications
        and (
          participant.occurrence_id = v_occurrence.id
          or (v_occurrence.series_id is not null and participant.series_id = v_occurrence.series_id)
        )
      union all
      select enrollment_contact.contact_id, 'family'::text
      from public.kitty_class_enrollment_contacts enrollment_contact
      where enrollment_contact.enrollment_id = v_enrollment.id
        and enrollment_contact.is_active
        and enrollment_contact.receives_notifications
    ) candidate
  ) recipient;

  insert into public.kitty_class_audit_events(
    actor_type, actor_contact_id, event_type, entity_type, entity_id,
    request_id, metadata
  ) values (
    'contact', p_actor_contact_id, 'attendance_recorded', 'attendance_update',
    v_attendance.id, v_request_id,
    pg_catalog.jsonb_build_object(
      'payloadDigest', v_payload_digest,
      'occurrenceId', v_occurrence.id,
      'enrollmentId', v_enrollment.id
    )
  );
  return v_attendance;
end;
$$;

create function public.correct_kitty_class_attendance(
  p_supersedes_attendance_id uuid,
  p_occurrence_id uuid,
  p_enrollment_id uuid,
  p_actor_contact_id uuid,
  p_status text,
  p_estimated_at timestamptz,
  p_note text,
  p_selection_token text,
  p_client_request_id text
) returns public.kitty_class_attendance_updates
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_occurrence public.kitty_class_occurrences;
  v_enrollment public.kitty_class_enrollments;
  v_previous public.kitty_class_attendance_updates;
  v_attendance public.kitty_class_attendance_updates;
  v_existing_audit public.kitty_class_audit_events;
  v_request_id text := pg_catalog.btrim(p_client_request_id);
  v_note text := nullif(pg_catalog.btrim(p_note), '');
  v_selection_digest text;
  v_payload jsonb;
  v_payload_digest text;
begin
  if p_supersedes_attendance_id is null
    or p_occurrence_id is null
    or p_enrollment_id is null
    or p_actor_contact_id is null
    or p_status not in ('expected', 'absent', 'late', 'leaving_early')
    or (p_estimated_at is not null and p_status not in ('late', 'leaving_early'))
    or coalesce(v_request_id, '') = ''
    or pg_catalog.length(v_request_id) > 200
    or p_selection_token is null
    or p_selection_token !~ '^[a-f0-9]{64}$'
    or pg_catalog.length(coalesce(v_note, '')) > 240
    or coalesce(v_note, '') ~* '\m(diagnos(is|ed)|medical|medication|therapy|disab(ility|led)|grade|gpa|exam score|tuition|payment|invoice|debt|disciplin(e|ary)|suspension|expulsion|abuse|violence)\M'
  then
    raise exception 'invalid_attendance';
  end if;

  select * into v_occurrence
  from public.kitty_class_occurrences occurrence
  where occurrence.id = p_occurrence_id
  for update;
  if not found or v_occurrence.status not in ('scheduled', 'change_requested') then
    raise exception 'occurrence_unavailable';
  end if;

  select enrollment.* into v_enrollment
  from public.kitty_class_enrollments enrollment
  join public.kitty_class_enrollment_contacts enrollment_contact
    on enrollment_contact.enrollment_id = enrollment.id
  where enrollment.id = p_enrollment_id
    and public.kitty_class_enrollment_applies_to_occurrence(enrollment.id, v_occurrence.id)
    and enrollment_contact.contact_id = p_actor_contact_id
    and enrollment_contact.is_active
  for update of enrollment;
  if not found then
    raise exception 'attendance_not_permitted';
  end if;

  v_selection_digest := pg_catalog.encode(
    public.digest(pg_catalog.convert_to(p_selection_token, 'UTF8'), 'sha256'), 'hex'
  );
  if not exists (
    select 1
    from public.kitty_class_audit_events selection
    where selection.actor_contact_id = p_actor_contact_id
      and selection.event_type = 'occurrence_selection_confirmed'
      and selection.entity_type = 'occurrence'
      and selection.entity_id = v_occurrence.id
      and selection.metadata->>'selectionTokenDigest' = v_selection_digest
      and (selection.metadata->>'occurrenceVersion')::integer = v_occurrence.version
      and (selection.metadata->>'expiresAt')::timestamptz > pg_catalog.now()
  ) then
    raise exception 'selection_confirmation_required';
  end if;

  v_payload := pg_catalog.jsonb_build_object(
    'operation', 'correct',
    'supersedesAttendanceId', p_supersedes_attendance_id,
    'occurrenceId', v_occurrence.id,
    'enrollmentId', v_enrollment.id,
    'actorContactId', p_actor_contact_id,
    'status', p_status,
    'estimatedAt', p_estimated_at,
    'note', v_note
  );
  v_payload_digest := pg_catalog.encode(
    public.digest(pg_catalog.convert_to(v_payload::text, 'UTF8'), 'sha256'), 'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_request_id, 0));
  select * into v_existing_audit
  from public.kitty_class_audit_events audit
  where audit.request_id = v_request_id
  for update;
  if found then
    if v_existing_audit.event_type <> 'attendance_corrected'
      or v_existing_audit.entity_type <> 'attendance_update'
      or v_existing_audit.metadata->>'payloadDigest' is distinct from v_payload_digest
    then
      raise exception 'client_request_payload_mismatch';
    end if;
    select * into v_attendance
    from public.kitty_class_attendance_updates attendance
    where attendance.id = v_existing_audit.entity_id;
    if not found then raise exception 'idempotency_target_missing'; end if;
    return v_attendance;
  end if;

  select * into v_previous
  from public.kitty_class_attendance_updates attendance
  where attendance.id = p_supersedes_attendance_id
    and attendance.occurrence_id = v_occurrence.id
    and attendance.enrollment_id = v_enrollment.id
  for update;
  if not found then raise exception 'attendance_not_found'; end if;
  if exists (
    select 1
    from public.kitty_class_attendance_updates correction
    where correction.supersedes_attendance_id = v_previous.id
  ) then
    raise exception 'stale_attendance';
  end if;

  insert into public.kitty_class_attendance_updates(
    occurrence_id, enrollment_id, reported_by_contact_id, status, estimated_at,
    note, version, supersedes_attendance_id, client_request_id, payload_digest
  ) values (
    v_occurrence.id, v_enrollment.id, p_actor_contact_id, p_status, p_estimated_at,
    v_note, v_previous.version + 1, v_previous.id, v_request_id, v_payload_digest
  ) returning * into v_attendance;

  insert into public.kitty_class_notification_outbox(
    occurrence_id, contact_id, intent, payload, idempotency_key
  )
  select v_occurrence.id, recipient.contact_id, 'class_attendance_update',
    pg_catalog.jsonb_build_object(
      'relaySummary', case
        when p_status = 'expected' and recipient.audience = 'teacher' then 'A student is expected to attend.'
        when p_status = 'expected' then 'Your student is expected to attend.'
        when p_status = 'absent' and recipient.audience = 'teacher' then 'A student will be absent.'
        when p_status = 'absent' then 'Your student will be absent.'
        when p_status = 'late' and p_estimated_at is not null and recipient.audience = 'teacher'
          then 'A student expects to arrive at ' || pg_catalog.to_char(p_estimated_at at time zone 'UTC', 'FMHH12:MI AM') || ' UTC.'
        when p_status = 'late' and p_estimated_at is not null
          then 'Your student expects to arrive at ' || pg_catalog.to_char(p_estimated_at at time zone 'UTC', 'FMHH12:MI AM') || ' UTC.'
        when p_status = 'late' and recipient.audience = 'teacher' then 'A student will arrive late.'
        when p_status = 'late' then 'Your student will arrive late.'
        when p_estimated_at is not null and recipient.audience = 'teacher'
          then 'A student expects to leave at ' || pg_catalog.to_char(p_estimated_at at time zone 'UTC', 'FMHH12:MI AM') || ' UTC.'
        when p_estimated_at is not null
          then 'Your student expects to leave at ' || pg_catalog.to_char(p_estimated_at at time zone 'UTC', 'FMHH12:MI AM') || ' UTC.'
        when recipient.audience = 'teacher' then 'A student will leave early.'
        else 'Your student will leave early.'
      end
    ),
    'attendance:' || v_attendance.id::text || ':' || recipient.contact_id::text
  from (
    select distinct candidate.contact_id, candidate.audience
    from (
      select participant.contact_id, 'teacher'::text as audience
      from public.kitty_class_participants participant
      where participant.participant_role = 'teacher'
        and participant.is_active
        and participant.receives_notifications
        and (
          participant.occurrence_id = v_occurrence.id
          or (v_occurrence.series_id is not null and participant.series_id = v_occurrence.series_id)
        )
      union all
      select enrollment_contact.contact_id, 'family'::text
      from public.kitty_class_enrollment_contacts enrollment_contact
      where enrollment_contact.enrollment_id = v_enrollment.id
        and enrollment_contact.is_active
        and enrollment_contact.receives_notifications
    ) candidate
  ) recipient;

  insert into public.kitty_class_audit_events(
    actor_type, actor_contact_id, event_type, entity_type, entity_id,
    request_id, metadata
  ) values (
    'contact', p_actor_contact_id, 'attendance_corrected', 'attendance_update',
    v_attendance.id, v_request_id,
    pg_catalog.jsonb_build_object(
      'payloadDigest', v_payload_digest,
      'occurrenceId', v_occurrence.id,
      'enrollmentId', v_enrollment.id,
      'supersedesAttendanceId', v_previous.id
    )
  );
  return v_attendance;
end;
$$;

create function public.create_kitty_class_operational_relay(
  p_occurrence_id uuid,
  p_enrollment_id uuid,
  p_actor_contact_id uuid,
  p_intent text,
  p_estimated_at timestamptz,
  p_mode text,
  p_location_label text,
  p_preparation_note text,
  p_selection_token text,
  p_client_request_id text
) returns public.kitty_class_operational_relays
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_occurrence public.kitty_class_occurrences;
  v_enrollment public.kitty_class_enrollments;
  v_relay public.kitty_class_operational_relays;
  v_existing_audit public.kitty_class_audit_events;
  v_request_id text := pg_catalog.btrim(p_client_request_id);
  v_location_label text := nullif(pg_catalog.btrim(p_location_label), '');
  v_preparation_note text := nullif(pg_catalog.btrim(p_preparation_note), '');
  v_selection_digest text;
  v_payload jsonb;
  v_payload_digest text;
  v_is_teacher boolean;
  v_is_enrollment_actor boolean;
  v_summary_teacher text;
  v_summary_family text;
  v_whatsapp_intent text;
begin
  if p_occurrence_id is null
    or p_actor_contact_id is null
    or p_intent not in (
      'student_absent', 'student_late', 'student_leaving_early', 'teacher_late',
      'mode_changed', 'location_changed', 'meeting_link_requested',
      'class_status_requested', 'substitute_teacher', 'preparation_note'
    )
    or (p_estimated_at is not null and p_intent not in ('student_late', 'student_leaving_early', 'teacher_late'))
    or (p_intent = 'mode_changed' and p_mode not in ('online', 'in_person'))
    or (p_intent <> 'mode_changed' and p_mode is not null)
    or (p_intent = 'location_changed' and v_location_label is null)
    or (p_intent <> 'location_changed' and v_location_label is not null)
    or (p_intent = 'preparation_note' and v_preparation_note is null)
    or (p_intent <> 'preparation_note' and v_preparation_note is not null)
    or pg_catalog.length(coalesce(v_location_label, '')) > 120
    or pg_catalog.length(coalesce(v_preparation_note, '')) > 240
    or coalesce(v_location_label, '') ~* '\m(diagnos(is|ed)|medical|medication|therapy|disab(ility|led)|grade|gpa|exam score|tuition|payment|invoice|debt|disciplin(e|ary)|suspension|expulsion|abuse|violence)\M'
    or coalesce(v_preparation_note, '') ~* '\m(diagnos(is|ed)|medical|medication|therapy|disab(ility|led)|grade|gpa|exam score|tuition|payment|invoice|debt|disciplin(e|ary)|suspension|expulsion|abuse|violence)\M'
    or coalesce(v_request_id, '') = ''
    or pg_catalog.length(v_request_id) > 200
    or p_selection_token is null
    or p_selection_token !~ '^[a-f0-9]{64}$'
  then
    raise exception 'invalid_relay';
  end if;

  select * into v_occurrence
  from public.kitty_class_occurrences occurrence
  where occurrence.id = p_occurrence_id
  for update;
  if not found or v_occurrence.status not in ('scheduled', 'change_requested') then
    raise exception 'occurrence_unavailable';
  end if;

  select exists (
    select 1
    from public.kitty_class_participants participant
    where participant.contact_id = p_actor_contact_id
      and participant.participant_role = 'teacher'
      and participant.is_active
      and (
        participant.occurrence_id = v_occurrence.id
        or (v_occurrence.series_id is not null and participant.series_id = v_occurrence.series_id)
      )
  ) into v_is_teacher;

  v_is_enrollment_actor := false;
  if p_enrollment_id is not null then
    select enrollment.* into v_enrollment
    from public.kitty_class_enrollments enrollment
    join public.kitty_class_enrollment_contacts enrollment_contact
      on enrollment_contact.enrollment_id = enrollment.id
    where enrollment.id = p_enrollment_id
      and public.kitty_class_enrollment_applies_to_occurrence(enrollment.id, v_occurrence.id)
      and enrollment_contact.contact_id = p_actor_contact_id
      and enrollment_contact.is_active
    for update of enrollment;
    v_is_enrollment_actor := found;
  end if;

  if p_intent in (
      'student_absent', 'student_late', 'student_leaving_early',
      'meeting_link_requested', 'class_status_requested'
    )
  then
    if p_enrollment_id is null or not v_is_enrollment_actor then
      raise exception 'relay_not_permitted';
    end if;
  elsif p_enrollment_id is not null or not v_is_teacher then
    raise exception 'relay_not_permitted';
  end if;

  v_selection_digest := pg_catalog.encode(
    public.digest(pg_catalog.convert_to(p_selection_token, 'UTF8'), 'sha256'), 'hex'
  );
  if not exists (
    select 1
    from public.kitty_class_audit_events selection
    where selection.actor_contact_id = p_actor_contact_id
      and selection.event_type = 'occurrence_selection_confirmed'
      and selection.entity_type = 'occurrence'
      and selection.entity_id = v_occurrence.id
      and selection.metadata->>'selectionTokenDigest' = v_selection_digest
      and (selection.metadata->>'occurrenceVersion')::integer = v_occurrence.version
      and (selection.metadata->>'expiresAt')::timestamptz > pg_catalog.now()
  ) then
    raise exception 'selection_confirmation_required';
  end if;

  v_payload := pg_catalog.jsonb_build_object(
    'operation', 'relay',
    'occurrenceId', v_occurrence.id,
    'enrollmentId', p_enrollment_id,
    'actorContactId', p_actor_contact_id,
    'intent', p_intent,
    'estimatedAt', p_estimated_at,
    'mode', p_mode,
    'locationLabel', v_location_label,
    'preparationNote', v_preparation_note
  );
  v_payload_digest := pg_catalog.encode(
    public.digest(pg_catalog.convert_to(v_payload::text, 'UTF8'), 'sha256'), 'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_request_id, 0));
  select * into v_existing_audit
  from public.kitty_class_audit_events audit
  where audit.request_id = v_request_id
  for update;
  if found then
    if v_existing_audit.event_type <> 'operational_relay_created'
      or v_existing_audit.entity_type <> 'operational_relay'
      or v_existing_audit.metadata->>'payloadDigest' is distinct from v_payload_digest
    then
      raise exception 'client_request_payload_mismatch';
    end if;
    select * into v_relay
    from public.kitty_class_operational_relays relay
    where relay.id = v_existing_audit.entity_id;
    if not found then raise exception 'idempotency_target_missing'; end if;
    return v_relay;
  end if;

  insert into public.kitty_class_operational_relays(
    occurrence_id, enrollment_id, sent_by_contact_id, intent,
    structured_payload, client_request_id, payload_digest
  ) values (
    v_occurrence.id, p_enrollment_id, p_actor_contact_id, p_intent,
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'estimatedAt', p_estimated_at,
      'mode', p_mode,
      'locationLabel', v_location_label,
      'preparationNote', v_preparation_note
    )),
    v_request_id, v_payload_digest
  ) returning * into v_relay;

  case p_intent
    when 'student_absent' then
      v_summary_teacher := 'A student will be absent.';
      v_summary_family := 'Your student will be absent.';
      v_whatsapp_intent := 'class_attendance_update';
    when 'student_late' then
      v_summary_teacher := case when p_estimated_at is null
        then 'A student will arrive late.'
        else 'A student expects to arrive at ' || pg_catalog.to_char(p_estimated_at at time zone 'UTC', 'FMHH12:MI AM') || ' UTC.' end;
      v_summary_family := case when p_estimated_at is null
        then 'Your student will arrive late.'
        else 'Your student expects to arrive at ' || pg_catalog.to_char(p_estimated_at at time zone 'UTC', 'FMHH12:MI AM') || ' UTC.' end;
      v_whatsapp_intent := 'class_attendance_update';
    when 'student_leaving_early' then
      v_summary_teacher := case when p_estimated_at is null
        then 'A student will leave early.'
        else 'A student expects to leave at ' || pg_catalog.to_char(p_estimated_at at time zone 'UTC', 'FMHH12:MI AM') || ' UTC.' end;
      v_summary_family := case when p_estimated_at is null
        then 'Your student will leave early.'
        else 'Your student expects to leave at ' || pg_catalog.to_char(p_estimated_at at time zone 'UTC', 'FMHH12:MI AM') || ' UTC.' end;
      v_whatsapp_intent := 'class_attendance_update';
    when 'teacher_late' then
      v_summary_family := case when p_estimated_at is null
        then 'The teacher is running a few minutes late.'
        else 'The teacher expects to start at ' || pg_catalog.to_char(p_estimated_at at time zone 'UTC', 'FMHH12:MI AM') || ' UTC.' end;
      v_summary_teacher := v_summary_family;
      v_whatsapp_intent := 'class_teacher_delay';
    when 'mode_changed' then
      v_summary_family := case when p_mode = 'online'
        then 'This class will be online.' else 'This class will be in person.' end;
      v_summary_teacher := v_summary_family;
      v_whatsapp_intent := 'class_operational_update';
    when 'location_changed' then
      v_summary_family := 'The class location is now ' || v_location_label || '.';
      v_summary_teacher := v_summary_family;
      v_whatsapp_intent := 'class_operational_update';
    when 'meeting_link_requested' then
      v_summary_teacher := 'A family has requested the configured meeting link.';
      v_summary_family := v_summary_teacher;
      v_whatsapp_intent := 'class_operational_update';
    when 'class_status_requested' then
      v_summary_teacher := 'A family has asked whether this class is still happening.';
      v_summary_family := v_summary_teacher;
      v_whatsapp_intent := 'class_operational_update';
    when 'substitute_teacher' then
      v_summary_family := 'A substitute teacher will lead this class.';
      v_summary_teacher := v_summary_family;
      v_whatsapp_intent := 'class_operational_update';
    when 'preparation_note' then
      v_summary_family := 'Preparation for class: ' || v_preparation_note;
      v_summary_teacher := v_summary_family;
      v_whatsapp_intent := 'class_operational_update';
  end case;

  insert into public.kitty_class_notification_outbox(
    occurrence_id, contact_id, intent, payload, idempotency_key
  )
  select v_occurrence.id, recipient.contact_id, v_whatsapp_intent,
    pg_catalog.jsonb_build_object(
      'relaySummary', case when recipient.audience = 'teacher'
        then v_summary_teacher else v_summary_family end
    ),
    'relay:' || v_relay.id::text || ':' || recipient.contact_id::text
  from (
    select distinct candidate.contact_id, candidate.audience
    from (
      select participant.contact_id, 'teacher'::text as audience
      from public.kitty_class_participants participant
      where p_intent in (
          'student_absent', 'student_late', 'student_leaving_early',
          'meeting_link_requested', 'class_status_requested'
        )
        and participant.participant_role = 'teacher'
        and participant.is_active
        and participant.receives_notifications
        and (
          participant.occurrence_id = v_occurrence.id
          or (v_occurrence.series_id is not null and participant.series_id = v_occurrence.series_id)
        )
      union all
      select enrollment_contact.contact_id, 'family'::text
      from public.kitty_class_enrollment_contacts enrollment_contact
      where p_intent in ('student_absent', 'student_late', 'student_leaving_early')
        and enrollment_contact.enrollment_id = v_enrollment.id
        and enrollment_contact.is_active
        and enrollment_contact.receives_notifications
      union all
      select enrollment_contact.contact_id, 'family'::text
      from public.kitty_class_enrollments enrollment
      join public.kitty_class_enrollment_contacts enrollment_contact
        on enrollment_contact.enrollment_id = enrollment.id
      where p_intent in (
          'teacher_late', 'mode_changed', 'location_changed',
          'substitute_teacher', 'preparation_note'
        )
        and public.kitty_class_enrollment_applies_to_occurrence(enrollment.id, v_occurrence.id)
        and enrollment_contact.is_active
        and enrollment_contact.receives_notifications
    ) candidate
  ) recipient;

  insert into public.kitty_class_audit_events(
    actor_type, actor_contact_id, event_type, entity_type, entity_id,
    request_id, metadata
  ) values (
    'contact', p_actor_contact_id, 'operational_relay_created',
    'operational_relay', v_relay.id, v_request_id,
    pg_catalog.jsonb_build_object(
      'payloadDigest', v_payload_digest,
      'occurrenceId', v_occurrence.id,
      'enrollmentId', p_enrollment_id,
      'intent', p_intent
    )
  );
  return v_relay;
end;
$$;

revoke execute on function public.record_kitty_class_attendance(
  uuid, uuid, uuid, text, timestamptz, text, text, text
) from public, anon, authenticated;
revoke execute on function public.correct_kitty_class_attendance(
  uuid, uuid, uuid, uuid, text, timestamptz, text, text, text
) from public, anon, authenticated;
revoke execute on function public.create_kitty_class_operational_relay(
  uuid, uuid, uuid, text, timestamptz, text, text, text, text, text
) from public, anon, authenticated;

grant execute on function public.record_kitty_class_attendance(
  uuid, uuid, uuid, text, timestamptz, text, text, text
) to service_role;
grant execute on function public.correct_kitty_class_attendance(
  uuid, uuid, uuid, uuid, text, timestamptz, text, text, text
) to service_role;
grant execute on function public.create_kitty_class_operational_relay(
  uuid, uuid, uuid, text, timestamptz, text, text, text, text, text
) to service_role;

do $$
declare
  v_request public.kitty_class_change_requests;
  v_series_enrollment uuid;
  v_occurrence_enrollment uuid;
begin
  select id into v_series_enrollment
  from public.kitty_class_enrollments
  where series_id = '00000000-0000-0000-0000-000000000301'
    and student_contact_id = '00000000-0000-0000-0000-000000000102';
  select id into v_occurrence_enrollment
  from public.kitty_class_enrollments
  where occurrence_id = '00000000-0000-0000-0000-000000000402'
    and student_contact_id = '00000000-0000-0000-0000-000000000202';
  if v_series_enrollment is null or v_occurrence_enrollment is null then
    raise exception 'legacy enrollment backfill missing';
  end if;

  insert into public.kitty_class_enrollments(
    id, series_id, student_contact_id, active_from
  ) values (
    '00000000-0000-0000-0000-000000000602',
    '00000000-0000-0000-0000-000000000301',
    '00000000-0000-0000-0000-000000000104',
    '2026-08-01'
  );
  insert into public.kitty_class_enrollment_contacts(
    enrollment_id, contact_id, contact_role, confirms_cancellation, confirms_reschedule
  ) values
    ('00000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000104', 'student', true, true),
    ('00000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000105', 'parent_guardian', true, true);

  select * into v_request
  from public.request_kitty_class_change(
    '00000000-0000-0000-0000-000000000401', 'reschedule',
    '00000000-0000-0000-0000-000000000101', 'teacher', null,
    null, null, 'UTC', repeat('a', 64)
  );
  if v_request.status <> 'collecting_alternatives'
    or cardinality(v_request.required_enrollment_ids) <> 2
  then
    raise exception 'new request did not snapshot both enrollments';
  end if;

  select * into v_request
  from public.propose_kitty_class_replacement(
    v_request.id, v_request.version, v_request.payload_digest,
    '00000000-0000-0000-0000-000000000101',
    '2026-08-12 10:00+00', '2026-08-12 11:00+00', 'UTC', repeat('b', 64)
  );
  if v_request.version <> 2 or cardinality(v_request.required_enrollment_ids) <> 2 then
    raise exception 'versioned proposal did not refresh its enrollment snapshot';
  end if;
  if not exists (
    select 1 from public.kitty_class_change_confirmations confirmation
    where confirmation.change_request_id = v_request.id
      and confirmation.request_version = 2
      and confirmation.decision_side = 'teacher'
      and confirmation.enrollment_id is null
      and confirmation.decision = 'approved'
  ) then
    raise exception 'versioned teacher proposal did not store teacher confirmation';
  end if;

  select * into v_request
  from public.decide_kitty_class_change(
    v_request.id, v_request.version, v_request.payload_digest,
    '00000000-0000-0000-0000-000000000103', 'approved', 'runtime-family-one'
  );
  if v_request.status = 'finalized' then
    raise exception 'reschedule finalized before every enrollment approved';
  end if;

  select * into v_request
  from public.decide_kitty_class_change(
    v_request.id, v_request.version, v_request.payload_digest,
    '00000000-0000-0000-0000-000000000104', 'approved', 'runtime-family-two'
  );
  if v_request.status <> 'finalized' then
    raise exception 'reschedule did not finalize after teacher and exact enrollment snapshot approved';
  end if;
  if (
    select count(*) from public.kitty_class_change_confirmations confirmation
    where confirmation.change_request_id = v_request.id
      and confirmation.request_version = 2
      and confirmation.decision_side = 'student'
      and confirmation.decision = 'approved'
  ) <> 2 then
    raise exception 'reschedule approval cardinality mismatch';
  end if;
  if not exists (
    select 1 from public.kitty_class_occurrences replacement
    where replacement.predecessor_occurrence_id = '00000000-0000-0000-0000-000000000401'
      and replacement.status = 'scheduled'
  ) then
    raise exception 'reschedule replacement occurrence missing';
  end if;

  insert into public.kitty_class_enrollments(
    id, occurrence_id, student_contact_id, active_from
  ) values (
    '00000000-0000-0000-0000-000000000604',
    '00000000-0000-0000-0000-000000000402',
    '00000000-0000-0000-0000-000000000204',
    '2026-08-11'
  );
  insert into public.kitty_class_enrollment_contacts(
    enrollment_id, contact_id, contact_role, confirms_cancellation, confirms_reschedule
  ) values
    ('00000000-0000-0000-0000-000000000604', '00000000-0000-0000-0000-000000000204', 'student', true, true),
    ('00000000-0000-0000-0000-000000000604', '00000000-0000-0000-0000-000000000205', 'parent_guardian', true, true);

  select * into v_request
  from public.request_kitty_class_change(
    '00000000-0000-0000-0000-000000000402', 'cancel',
    '00000000-0000-0000-0000-000000000201', 'teacher', 'teacher unavailable',
    null, null, null, repeat('c', 64)
  );
  if v_request.status <> 'finalized' then
    raise exception 'teacher-confirmed cancellation did not finalize immediately';
  end if;
  if exists (
    select 1 from public.kitty_class_change_confirmations confirmation
    where confirmation.change_request_id = v_request.id
      and confirmation.decision_side = 'student'
  ) then
    raise exception 'teacher cancellation incorrectly waited for family approval';
  end if;
  if exists (
    select 1
    from unnest(public.kitty_class_active_enrollment_ids(
      '00000000-0000-0000-0000-000000000402'
    )) active_enrollment_id
    join public.kitty_class_enrollment_contacts recipient
      on recipient.enrollment_id = active_enrollment_id
      and recipient.is_active
      and recipient.receives_notifications
    where not exists (
      select 1 from public.kitty_class_notification_outbox notification
      where notification.change_request_id = v_request.id
        and notification.contact_id = recipient.contact_id
        and notification.intent = 'class_cancelled'
    )
  ) then
    raise exception 'teacher cancellation missed an active enrollment recipient';
  end if;

  begin
    insert into public.kitty_class_attendance_updates(
      occurrence_id, enrollment_id, reported_by_contact_id, status, client_request_id
    ) values (
      '00000000-0000-0000-0000-000000000401',
      '00000000-0000-0000-0000-000000000604',
      '00000000-0000-0000-0000-000000000204', 'absent', 'runtime-cross-attendance'
    );
    raise exception 'cross-class attendance was accepted';
  exception when check_violation then null;
  end;

  begin
    insert into public.kitty_class_operational_relays(
      occurrence_id, enrollment_id, sent_by_contact_id, intent, client_request_id
    ) values (
      '00000000-0000-0000-0000-000000000401',
      '00000000-0000-0000-0000-000000000604',
      '00000000-0000-0000-0000-000000000204', 'student_absent', 'runtime-cross-relay'
    );
    raise exception 'cross-class relay was accepted';
  exception when check_violation then null;
  end;

  begin
    insert into public.kitty_class_change_requests(
      occurrence_id, change_type, scope, enrollment_id, required_enrollment_ids,
      payload_digest
    ) values (
      '00000000-0000-0000-0000-000000000401', 'reschedule',
      'individual_reschedule', '00000000-0000-0000-0000-000000000604',
      array['00000000-0000-0000-0000-000000000604']::uuid[], repeat('d', 64)
    );
    raise exception 'cross-class scoped request was accepted';
  exception when check_violation then null;
  end;

  begin
    insert into public.kitty_class_change_confirmations(
      change_request_id, request_version, decision_side, enrollment_id,
      decided_by_contact_id, decision, payload_digest, source_channel
    ) values (
      v_request.id, v_request.version, 'student',
      '00000000-0000-0000-0000-000000000602',
      '00000000-0000-0000-0000-000000000104', 'approved', repeat('c', 64), 'whatsapp'
    );
    raise exception 'cancellation accepted a non-snapshot enrollment confirmation';
  exception when check_violation then null;
  end;

  begin
    insert into public.kitty_class_change_confirmations(
      change_request_id, request_version, decision_side, enrollment_id,
      decided_by_contact_id, decision, payload_digest, source_channel
    ) values (
      v_request.id, v_request.version, 'student', v_occurrence_enrollment,
      '00000000-0000-0000-0000-000000000202', 'approved', repeat('c', 64), 'whatsapp'
    );
    raise exception 'cancellation accepted a same-class enrollment outside its empty snapshot';
  exception when check_violation then null;
  end;

  begin
    update public.kitty_class_enrollments
    set is_active = false
    where series_id = '00000000-0000-0000-0000-000000000301';
    set constraints enforce_kitty_class_active_enrollment immediate;
    raise exception 'all enrollments were deactivated';
  exception when check_violation then null;
  end;
end;
$$;

select 'kitty group runtime probe passed' as result;

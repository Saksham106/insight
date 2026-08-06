do $$
declare
  v_occurrence public.kitty_class_occurrences;
  v_attendance public.kitty_class_attendance_updates;
  v_replayed_attendance public.kitty_class_attendance_updates;
  v_correction public.kitty_class_attendance_updates;
  v_teacher_relay public.kitty_class_operational_relays;
  v_replayed_relay public.kitty_class_operational_relays;
  v_family_relay public.kitty_class_operational_relays;
  v_enrollment_a uuid;
  v_enrollment_b uuid;
  v_student_token text := repeat('a', 64);
  v_teacher_token text := repeat('b', 64);
  v_student_token_digest text;
  v_teacher_token_digest text;
begin
  if has_function_privilege(
    'anon',
    'public.record_kitty_class_attendance(uuid,uuid,uuid,text,timestamp with time zone,text,text,text)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'public.correct_kitty_class_attendance(uuid,uuid,uuid,uuid,text,timestamp with time zone,text,text,text)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'public.create_kitty_class_operational_relay(uuid,uuid,uuid,text,timestamp with time zone,text,text,text,text,text)',
    'execute'
  ) or not has_function_privilege(
    'service_role',
    'public.record_kitty_class_attendance(uuid,uuid,uuid,text,timestamp with time zone,text,text,text)',
    'execute'
  ) then
    raise exception 'relay RPC grants are not service-role-only';
  end if;

  insert into public.hermes_contacts(id) values
    ('10000000-0000-0000-0000-000000000001'),
    ('10000000-0000-0000-0000-000000000002'),
    ('10000000-0000-0000-0000-000000000003'),
    ('10000000-0000-0000-0000-000000000004'),
    ('10000000-0000-0000-0000-000000000005');

  select * into v_occurrence
  from public.create_kitty_group_one_off(
    'Relay privacy probe', 'Mathematics',
    (current_date + 5 + time '16:00') at time zone 'UTC',
    (current_date + 5 + time '17:00') at time zone 'UTC',
    current_date + 5, 'UTC', 'dashboard', null,
    '10000000-0000-0000-0000-000000000001',
    jsonb_build_array(
      jsonb_build_object(
        'studentContactId', '10000000-0000-0000-0000-000000000002',
        'contacts', jsonb_build_array(
          jsonb_build_object(
            'contactId', '10000000-0000-0000-0000-000000000002',
            'role', 'student', 'receivesNotifications', true,
            'confirmsCancellation', true, 'confirmsReschedule', true
          ),
          jsonb_build_object(
            'contactId', '10000000-0000-0000-0000-000000000003',
            'role', 'parent_guardian', 'receivesNotifications', true,
            'confirmsCancellation', false, 'confirmsReschedule', true
          )
        )
      ),
      jsonb_build_object(
        'studentContactId', '10000000-0000-0000-0000-000000000004',
        'contacts', jsonb_build_array(
          jsonb_build_object(
            'contactId', '10000000-0000-0000-0000-000000000004',
            'role', 'student', 'receivesNotifications', true,
            'confirmsCancellation', true, 'confirmsReschedule', true
          ),
          jsonb_build_object(
            'contactId', '10000000-0000-0000-0000-000000000005',
            'role', 'parent_guardian', 'receivesNotifications', true,
            'confirmsCancellation', false, 'confirmsReschedule', true
          )
        )
      )
    ),
    'relay-runtime-class'
  );

  select enrollment.id into strict v_enrollment_a
  from public.kitty_class_enrollments enrollment
  where enrollment.occurrence_id = v_occurrence.id
    and enrollment.student_contact_id = '10000000-0000-0000-0000-000000000002';
  select enrollment.id into strict v_enrollment_b
  from public.kitty_class_enrollments enrollment
  where enrollment.occurrence_id = v_occurrence.id
    and enrollment.student_contact_id = '10000000-0000-0000-0000-000000000004';

  v_student_token_digest := encode(digest(convert_to(v_student_token, 'UTF8'), 'sha256'), 'hex');
  v_teacher_token_digest := encode(digest(convert_to(v_teacher_token, 'UTF8'), 'sha256'), 'hex');
  insert into public.kitty_class_audit_events(
    actor_type, actor_contact_id, event_type, entity_type, entity_id, metadata
  ) values
    (
      'contact', '10000000-0000-0000-0000-000000000002',
      'occurrence_selection_confirmed', 'occurrence', v_occurrence.id,
      jsonb_build_object(
        'occurrenceVersion', v_occurrence.version,
        'selectionTokenDigest', v_student_token_digest,
        'expiresAt', now() + interval '15 minutes'
      )
    ),
    (
      'contact', '10000000-0000-0000-0000-000000000001',
      'occurrence_selection_confirmed', 'occurrence', v_occurrence.id,
      jsonb_build_object(
        'occurrenceVersion', v_occurrence.version,
        'selectionTokenDigest', v_teacher_token_digest,
        'expiresAt', now() + interval '15 minutes'
      )
    );

  select * into v_attendance
  from public.record_kitty_class_attendance(
    v_occurrence.id, v_enrollment_a,
    '10000000-0000-0000-0000-000000000002',
    'absent', null, 'Family conflict', v_student_token, 'relay-runtime-attendance'
  );

  if (
    select count(*)
    from public.kitty_class_notification_outbox outbox
    where outbox.idempotency_key like 'attendance:' || v_attendance.id::text || ':%'
  ) <> 3 then
    raise exception 'private attendance did not select exactly its teacher and family';
  end if;
  if exists (
    select 1
    from public.kitty_class_notification_outbox outbox
    where outbox.idempotency_key like 'attendance:' || v_attendance.id::text || ':%'
      and outbox.contact_id in (
        '10000000-0000-0000-0000-000000000004',
        '10000000-0000-0000-0000-000000000005'
      )
  ) then
    raise exception 'private attendance leaked to another enrollment';
  end if;
  if exists (
    select 1
    from public.kitty_class_notification_outbox outbox
    where outbox.idempotency_key like 'attendance:' || v_attendance.id::text || ':%'
      and (
        outbox.payload ?| array['rawMessage', 'note', 'studentName', 'reason']
        or outbox.payload::text ~* 'family conflict|10000000-0000-0000-0000-000000000002'
      )
  ) then
    raise exception 'private attendance note or identity reached the outbox';
  end if;

  select * into v_replayed_attendance
  from public.record_kitty_class_attendance(
    v_occurrence.id, v_enrollment_a,
    '10000000-0000-0000-0000-000000000002',
    'absent', null, 'Family conflict', v_student_token, 'relay-runtime-attendance'
  );
  if v_replayed_attendance.id <> v_attendance.id then
    raise exception 'attendance replay created a second record';
  end if;
  begin
    perform public.record_kitty_class_attendance(
      v_occurrence.id, v_enrollment_a,
      '10000000-0000-0000-0000-000000000002',
      'expected', null, null, v_student_token, 'relay-runtime-attendance'
    );
    raise exception 'attendance payload mismatch was accepted';
  exception when others then
    if sqlerrm <> 'client_request_payload_mismatch' then raise; end if;
  end;

  select * into v_correction
  from public.correct_kitty_class_attendance(
    v_attendance.id, v_occurrence.id, v_enrollment_a,
    '10000000-0000-0000-0000-000000000002',
    'late', (current_date + 5 + time '16:15') at time zone 'UTC', null,
    v_student_token, 'relay-runtime-correction'
  );
  if v_correction.supersedes_attendance_id <> v_attendance.id
    or v_correction.version <> v_attendance.version + 1
  then
    raise exception 'attendance correction did not append a versioned successor';
  end if;
  begin
    perform public.correct_kitty_class_attendance(
      v_attendance.id, v_occurrence.id, v_enrollment_a,
      '10000000-0000-0000-0000-000000000002',
      'expected', null, null, v_student_token, 'relay-runtime-stale-correction'
    );
    raise exception 'a superseded attendance record accepted another correction';
  exception when others then
    if sqlerrm <> 'stale_attendance' then raise; end if;
  end;
  begin
    update public.kitty_class_attendance_updates
    set note = 'mutated'
    where id = v_attendance.id;
    raise exception 'attendance history accepted an update';
  exception when others then
    if sqlerrm <> 'kitty_class_attendance_is_append_only' then raise; end if;
  end;
  begin
    delete from public.kitty_class_attendance_updates where id = v_attendance.id;
    raise exception 'attendance history accepted a delete';
  exception when others then
    if sqlerrm <> 'kitty_class_attendance_is_append_only' then raise; end if;
  end;

  select * into v_teacher_relay
  from public.create_kitty_class_operational_relay(
    v_occurrence.id, null,
    '10000000-0000-0000-0000-000000000001',
    'teacher_late', (current_date + 5 + time '16:10') at time zone 'UTC',
    null, null, null, v_teacher_token, 'relay-runtime-teacher-delay'
  );
  if (
    select count(*)
    from public.kitty_class_notification_outbox outbox
    where outbox.idempotency_key like 'relay:' || v_teacher_relay.id::text || ':%'
  ) <> 4 or exists (
    select 1
    from public.kitty_class_notification_outbox outbox
    where outbox.idempotency_key like 'relay:' || v_teacher_relay.id::text || ':%'
      and outbox.contact_id = '10000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'teacher delay did not select every active family exactly once';
  end if;

  select * into v_replayed_relay
  from public.create_kitty_class_operational_relay(
    v_occurrence.id, null,
    '10000000-0000-0000-0000-000000000001',
    'teacher_late', (current_date + 5 + time '16:10') at time zone 'UTC',
    null, null, null, v_teacher_token, 'relay-runtime-teacher-delay'
  );
  if v_replayed_relay.id <> v_teacher_relay.id then
    raise exception 'relay replay created a second record';
  end if;

  select * into v_family_relay
  from public.create_kitty_class_operational_relay(
    v_occurrence.id, v_enrollment_a,
    '10000000-0000-0000-0000-000000000002',
    'meeting_link_requested', null, null, null, null,
    v_student_token, 'relay-runtime-link-request'
  );
  if (
    select array_agg(outbox.contact_id order by outbox.contact_id)
    from public.kitty_class_notification_outbox outbox
    where outbox.idempotency_key like 'relay:' || v_family_relay.id::text || ':%'
  ) <> array['10000000-0000-0000-0000-000000000001'::uuid] then
    raise exception 'family link request was not scoped to the teacher';
  end if;

  begin
    perform public.create_kitty_class_operational_relay(
      v_occurrence.id, v_enrollment_b,
      '10000000-0000-0000-0000-000000000002',
      'student_absent', null, null, null, null,
      v_student_token, 'relay-runtime-cross-enrollment'
    );
    raise exception 'cross-enrollment relay was accepted';
  exception when others then
    if sqlerrm <> 'relay_not_permitted' then raise; end if;
  end;
  begin
    perform public.create_kitty_class_operational_relay(
      v_occurrence.id, null,
      '10000000-0000-0000-0000-000000000001',
      'preparation_note', null, null, null, 'Bring the medical diagnosis',
      v_teacher_token, 'relay-runtime-sensitive'
    );
    raise exception 'sensitive preparation content was accepted';
  exception when others then
    if sqlerrm <> 'invalid_relay' then raise; end if;
  end;

  if not exists (
    select 1
    from public.kitty_class_audit_events audit
    where audit.event_type = 'attendance_corrected'
      and audit.entity_id = v_correction.id
      and audit.metadata->>'payloadDigest' = v_correction.payload_digest
  ) or not exists (
    select 1
    from public.kitty_class_audit_events audit
    where audit.event_type = 'operational_relay_created'
      and audit.entity_id = v_teacher_relay.id
      and audit.metadata->>'payloadDigest' = v_teacher_relay.payload_digest
  ) then
    raise exception 'relay audit chain is incomplete';
  end if;
end;
$$;

select 'kitty class relays runtime probe passed';

do $$
declare
  v_occurrence public.kitty_class_occurrences;
  v_attendance public.kitty_class_attendance_updates;
  v_replayed_attendance public.kitty_class_attendance_updates;
  v_correction public.kitty_class_attendance_updates;
  v_teacher_relay public.kitty_class_operational_relays;
  v_replayed_relay public.kitty_class_operational_relays;
  v_family_relay public.kitty_class_operational_relays;
  v_preparation_relay public.kitty_class_operational_relays;
  v_enrollment_a uuid;
  v_enrollment_b uuid;
  v_student_token text := repeat('a', 64);
  v_teacher_token text := repeat('b', 64);
  v_student_token_digest text;
  v_teacher_token_digest text;
  v_open_ended_preparation text;
  v_task4_outbox_intent text;
  v_malformed_payload jsonb;
  v_valid_estimate text;
  v_invalid_estimate text;
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
      'mode_changed', null, null, null, null,
      v_teacher_token, 'relay-runtime-null-mode'
    );
    raise exception 'mode change without a mode was accepted';
  exception when others then
    if sqlerrm <> 'invalid_relay' then raise; end if;
  end;
  begin
    insert into public.kitty_class_operational_relays(
      occurrence_id, sent_by_contact_id, intent, structured_payload,
      client_request_id, payload_digest
    ) values (
      v_occurrence.id, '10000000-0000-0000-0000-000000000001',
      'mode_changed', '{}'::jsonb, 'relay-runtime-structural-null-mode', repeat('c', 64)
    );
    raise exception 'relay table accepted mode_changed without a structured mode';
  exception when check_violation then null;
  end;
  begin
    insert into public.kitty_class_notification_outbox(
      occurrence_id, contact_id, intent, payload, idempotency_key
    ) values (
      v_occurrence.id, '10000000-0000-0000-0000-000000000002',
      'class_operational_update', '{}'::jsonb, 'relay-runtime-missing-summary'
    );
    raise exception 'relay outbox accepted a missing summary';
  exception when check_violation then null;
  end;
  begin
    insert into public.kitty_class_operational_relays(
      occurrence_id, enrollment_id, sent_by_contact_id, intent, structured_payload,
      client_request_id, payload_digest
    ) values (
      v_occurrence.id, v_enrollment_a, '10000000-0000-0000-0000-000000000001',
      'student_late', jsonb_build_object('estimatedAt', 42),
      'relay-runtime-numeric-estimate', repeat('d', 64)
    );
    raise exception 'relay table accepted a numeric estimatedAt';
  exception when check_violation then null;
  end;
  foreach v_task4_outbox_intent in array array[
    'class_attendance_update', 'class_teacher_delay', 'class_operational_update'
  ] loop
    begin
      insert into public.kitty_class_notification_outbox(
        occurrence_id, contact_id, intent, payload, idempotency_key
      ) values (
        v_occurrence.id, '10000000-0000-0000-0000-000000000002',
        v_task4_outbox_intent,
        jsonb_build_object(
          'relaySummary', 'Canonical summary',
          'medicalDetails', 'ADHD accommodation'
        ),
        'relay-runtime-extra-outbox-key:' || v_task4_outbox_intent
      );
      raise exception 'Task 4 outbox accepted an extra sensitive payload key';
    exception when check_violation then null;
    end;
  end loop;
  foreach v_malformed_payload in array array[
    '[]'::jsonb, '"Canonical summary"'::jsonb, 'null'::jsonb
  ] loop
    begin
      insert into public.kitty_class_notification_outbox(
        occurrence_id, contact_id, intent, payload, idempotency_key
      ) values (
        v_occurrence.id, '10000000-0000-0000-0000-000000000002',
        'class_operational_update', v_malformed_payload,
        'relay-runtime-malformed-outbox:' || md5(v_malformed_payload::text)
      );
      raise exception 'Task 4 outbox accepted a non-object payload';
    exception when check_violation then null;
    end;
  end loop;
  insert into public.kitty_class_notification_outbox(
    occurrence_id, contact_id, intent, payload, idempotency_key
  ) values (
    v_occurrence.id, '10000000-0000-0000-0000-000000000002',
    'class_change_request',
    jsonb_build_object('existingClassChangeField', 'preserved'),
    'relay-runtime-existing-outbox-unaffected'
  );
  foreach v_invalid_estimate in array array[
    '2026-08-10T24:00:00Z',
    '2026-08-10T23:60:00Z',
    '2026-08-10T23:59:61Z',
    '2026-08-10T23:59:59+24:00',
    '2026-08-10T23:59:59+05:60',
    '2026-08-10',
    '16:10:00Z',
    '2026-08-10T16:10:00',
    '2026-02-30T16:10:00Z',
    '2026-08-10T25:10:00Z',
    'not-a-timestamp'
  ] loop
    begin
      insert into public.kitty_class_operational_relays(
        occurrence_id, enrollment_id, sent_by_contact_id, intent, structured_payload,
        client_request_id, payload_digest
      ) values (
        v_occurrence.id, v_enrollment_a, '10000000-0000-0000-0000-000000000001',
        'student_late', jsonb_build_object('estimatedAt', v_invalid_estimate),
        'relay-runtime-invalid-estimate:' || md5(v_invalid_estimate), repeat('e', 64)
      );
      raise exception 'relay table accepted a non-instant estimatedAt: %', v_invalid_estimate;
    exception when check_violation then null;
    end;
  end loop;
  foreach v_valid_estimate in array array[
    '2026-08-10T00:00:00Z',
    '2026-08-10T23:59:59Z',
    '2026-08-10T16:10:00.123456Z',
    '2026-08-10T16:10:00Z',
    '2026-08-10T21:40:00+05:30',
    '2026-08-10T12:10:00-04:00'
  ] loop
    insert into public.kitty_class_operational_relays(
      occurrence_id, enrollment_id, sent_by_contact_id, intent, structured_payload,
      client_request_id, payload_digest
    ) values (
      v_occurrence.id, v_enrollment_a, '10000000-0000-0000-0000-000000000001',
      'student_late', jsonb_build_object('estimatedAt', v_valid_estimate),
      'relay-runtime-valid-estimate:' || md5(v_valid_estimate), repeat('e', 64)
    );
  end loop;
  begin
    insert into public.kitty_class_operational_relays(
      occurrence_id, enrollment_id, sent_by_contact_id, intent, structured_payload,
      client_request_id, payload_digest
    ) values (
      v_occurrence.id, v_enrollment_a, '10000000-0000-0000-0000-000000000001',
      'student_late', jsonb_build_object(
        'estimatedAt', (current_date + 5 + time '16:10') at time zone 'UTC',
        'medicalDetails', 'ADHD accommodation'
      ),
      'relay-runtime-extra-structured-key', repeat('f', 64)
    );
    raise exception 'relay table accepted an extra structured payload key';
  exception when check_violation then null;
  end;

  foreach v_open_ended_preparation in array array[
    'Bring allergy medication and an EpiPen',
    'Provide an ADHD accommodation',
    'Bring the custody order'
  ] loop
    begin
      perform public.create_kitty_class_operational_relay(
        v_occurrence.id, null,
        '10000000-0000-0000-0000-000000000001',
        'preparation_note', null, null, null, v_open_ended_preparation,
        v_teacher_token, 'relay-runtime-unsafe-preparation:' || v_open_ended_preparation
      );
      raise exception 'open-ended preparation content was accepted';
    exception when others then
      if sqlerrm <> 'invalid_relay' then raise; end if;
    end;
  end loop;

  select * into v_preparation_relay
  from public.create_kitty_class_operational_relay(
    v_occurrence.id, null,
    '10000000-0000-0000-0000-000000000001',
    'preparation_note', null, null, null, 'review_prior_material',
    v_teacher_token, 'relay-runtime-safe-preparation'
  );
  if exists (
    select 1
    from public.kitty_class_notification_outbox outbox
    where outbox.idempotency_key like 'relay:' || v_preparation_relay.id::text || ':%'
      and (
        outbox.payload ? 'preparationCategory'
        or outbox.payload::text not like '%Please review the previous class material before class.%'
      )
  ) then
    raise exception 'preparation category or noncanonical text reached the outbox';
  end if;

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

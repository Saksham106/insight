do $$
declare
  v_one_off public.kitty_class_occurrences;
  v_replayed_one_off public.kitty_class_occurrences;
  v_distinct_one_off public.kitty_class_occurrences;
  v_tool_one_off public.kitty_class_occurrences;
  v_replayed_tool_one_off public.kitty_class_occurrences;
  v_series public.kitty_class_series;
  v_replayed_series public.kitty_class_series;
  v_occurrence public.kitty_class_occurrences;
  v_new_enrollment_id uuid;
  v_count_before integer;
  v_enrollments jsonb := jsonb_build_array(
    jsonb_build_object(
      'studentContactId', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa902',
      'contacts', jsonb_build_array(
        jsonb_build_object(
          'contactId', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa902',
          'role', 'student', 'receivesNotifications', true,
          'confirmsCancellation', true, 'confirmsReschedule', true
        ),
        jsonb_build_object(
          'contactId', '00000000-0000-0000-0000-000000000903',
          'role', 'parent_guardian', 'receivesNotifications', true,
          'confirmsCancellation', false, 'confirmsReschedule', true
        )
      )
    ),
    jsonb_build_object(
      'studentContactId', '00000000-0000-0000-0000-000000000904',
      'contacts', jsonb_build_array(
        jsonb_build_object(
          'contactId', '00000000-0000-0000-0000-000000000904',
          'role', 'student', 'receivesNotifications', true,
          'confirmsCancellation', true, 'confirmsReschedule', true
        ),
        jsonb_build_object(
          'contactId', '00000000-0000-0000-0000-000000000905',
          'role', 'parent_guardian', 'receivesNotifications', true,
          'confirmsCancellation', false, 'confirmsReschedule', true
        )
      )
    )
  );
  v_reordered_enrollments jsonb := jsonb_build_array(
    jsonb_build_object(
      'studentContactId', '00000000-0000-0000-0000-000000000904',
      'contacts', jsonb_build_array(
        jsonb_build_object(
          'contactId', '00000000-0000-0000-0000-000000000905',
          'role', 'parent_guardian', 'receivesNotifications', true,
          'confirmsCancellation', false, 'confirmsReschedule', true
        ),
        jsonb_build_object(
          'contactId', '00000000-0000-0000-0000-000000000904',
          'role', 'student', 'receivesNotifications', true,
          'confirmsCancellation', true, 'confirmsReschedule', true
        )
      )
    ),
    jsonb_build_object(
      'studentContactId', '  AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAA902  ',
      'contacts', jsonb_build_array(
        jsonb_build_object(
          'contactId', '00000000-0000-0000-0000-000000000903',
          'role', 'parent_guardian', 'receivesNotifications', true,
          'confirmsCancellation', false, 'confirmsReschedule', true
        ),
        jsonb_build_object(
          'contactId', ' AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAA902 ',
          'role', 'student', 'receivesNotifications', true,
          'confirmsCancellation', true, 'confirmsReschedule', true
        )
      )
    )
  );
  v_third_enrollment jsonb := jsonb_build_object(
    'studentContactId', '00000000-0000-0000-0000-000000000906',
    'contacts', jsonb_build_array(
      jsonb_build_object(
        'contactId', '00000000-0000-0000-0000-000000000906',
        'role', 'student', 'receivesNotifications', true,
        'confirmsCancellation', true, 'confirmsReschedule', true
      )
    )
  );
begin
  if has_function_privilege(
    'anon',
    'public.create_kitty_group_one_off(text,text,timestamp with time zone,timestamp with time zone,date,text,text,uuid,uuid,jsonb,text)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'public.add_kitty_class_enrollment(uuid,integer,date,jsonb,uuid)',
    'execute'
  ) or not has_function_privilege(
    'service_role',
    'public.create_kitty_group_series(text,text,text,time without time zone,integer,smallint[],date,date,text,uuid,uuid,jsonb,text)',
    'execute'
  ) then
    raise exception 'group service RPC grants are not service-role-only';
  end if;

  insert into public.hermes_contacts(id) values
    ('00000000-0000-0000-0000-000000000901'),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa902'),
    ('00000000-0000-0000-0000-000000000903'),
    ('00000000-0000-0000-0000-000000000904'),
    ('00000000-0000-0000-0000-000000000905'),
    ('00000000-0000-0000-0000-000000000906');

  insert into public.kitty_class_audit_events(
    id, actor_type, event_type, entity_type, entity_id, request_id, metadata
  ) values (
    '00000000-0000-0000-0000-000000000907', 'admin',
    'class_tool_requested', 'notification',
    '00000000-0000-0000-0000-000000000907',
    'runtime-tool-request', jsonb_build_object('action', 'create_class')
  );
  select * into v_tool_one_off
  from public.create_kitty_group_one_off(
    'Runtime tool one-off', 'Math',
    (current_date + 4 + time '10:00') at time zone 'UTC',
    (current_date + 4 + time '11:00') at time zone 'UTC',
    current_date + 4, 'UTC', 'imessage', null,
    '00000000-0000-0000-0000-000000000901', v_enrollments,
    'class-create:runtime-tool-request'
  );
  select * into v_replayed_tool_one_off
  from public.create_kitty_group_one_off(
    'Runtime tool one-off', 'Math',
    (current_date + 4 + time '10:00') at time zone 'UTC',
    (current_date + 4 + time '11:00') at time zone 'UTC',
    current_date + 4, 'UTC', 'imessage', null,
    '00000000-0000-0000-0000-000000000901', v_reordered_enrollments,
    'class-create:runtime-tool-request'
  );
  if v_tool_one_off.id <> v_replayed_tool_one_off.id then
    raise exception 'namespaced tool creation did not replay its class';
  end if;
  if not exists (
    select 1 from public.kitty_class_audit_events audit
    where audit.request_id = 'runtime-tool-request'
      and audit.event_type = 'class_tool_requested'
  ) or not exists (
    select 1 from public.kitty_class_audit_events audit
    where audit.request_id = 'class-create:runtime-tool-request'
      and audit.event_type = 'occurrence_created'
      and audit.entity_id = v_tool_one_off.id
  ) then
    raise exception 'tool audit and class creation identities were not isolated';
  end if;

  select * into v_one_off
  from public.create_kitty_group_one_off(
    'Runtime group one-off', 'Math',
    (current_date + 5 + time '10:00') at time zone 'UTC',
    (current_date + 5 + time '11:00') at time zone 'UTC',
    current_date + 5, 'UTC', 'dashboard', null,
    '00000000-0000-0000-0000-000000000901', v_enrollments,
    'runtime-group-one-off'
  );
  if (
    select count(*) from public.kitty_class_participants participant
    where participant.occurrence_id = v_one_off.id
      and participant.participant_role = 'teacher'
  ) <> 1 or (
    select count(*) from public.kitty_class_enrollments enrollment
    where enrollment.occurrence_id = v_one_off.id
  ) <> 2 or (
    select count(*)
    from public.kitty_class_enrollments enrollment
    join public.kitty_class_enrollment_contacts enrollment_contact
      on enrollment_contact.enrollment_id = enrollment.id
    where enrollment.occurrence_id = v_one_off.id
  ) <> 4 then
    raise exception 'group one-off was not written atomically';
  end if;

  select * into v_replayed_one_off
  from public.create_kitty_group_one_off(
    'Runtime group one-off', 'Math',
    (current_date + 5 + time '10:00') at time zone 'UTC',
    (current_date + 5 + time '11:00') at time zone 'UTC',
    current_date + 5, 'UTC', 'dashboard', null,
    '00000000-0000-0000-0000-000000000901', v_reordered_enrollments,
    'runtime-group-one-off'
  );
  if v_replayed_one_off.id <> v_one_off.id then
    raise exception 'normalized one-off replay created a second class';
  end if;

  select * into v_distinct_one_off
  from public.create_kitty_group_one_off(
    'Runtime group one-off', 'Math',
    (current_date + 5 + time '10:00') at time zone 'UTC',
    (current_date + 5 + time '11:00') at time zone 'UTC',
    current_date + 5, 'UTC', 'dashboard', null,
    '00000000-0000-0000-0000-000000000901', v_enrollments,
    'runtime-group-one-off-distinct-request'
  );
  if v_distinct_one_off.id = v_one_off.id then
    raise exception 'different requests with the same payload reused one class';
  end if;

  begin
    perform public.kitty_class_normalize_group_enrollments(jsonb_build_array(
      jsonb_build_object(
        'studentContactId', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa902',
        'contacts', jsonb_build_array(
          jsonb_build_object(
            'contactId', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa902',
            'role', 'student', 'receivesNotifications', true,
            'confirmsCancellation', true, 'confirmsReschedule', true
          ),
          jsonb_build_object(
            'contactId', ' AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAA902 ',
            'role', 'parent_guardian', 'receivesNotifications', true,
            'confirmsCancellation', false, 'confirmsReschedule', true
          )
        )
      )
    ));
    raise exception 'canonical duplicate enrollment contacts were accepted';
  exception when others then
    if sqlerrm <> 'duplicate_enrollment_contact' then raise; end if;
  end;

  begin
    perform public.create_kitty_group_one_off(
      'Mismatched title', 'Math',
      (current_date + 5 + time '10:00') at time zone 'UTC',
      (current_date + 5 + time '11:00') at time zone 'UTC',
      current_date + 5, 'UTC', 'dashboard', null,
      '00000000-0000-0000-0000-000000000901', v_enrollments,
      'runtime-group-one-off'
    );
    raise exception 'mismatched one-off replay was accepted';
  exception when others then
    if sqlerrm <> 'client_request_payload_mismatch' then raise; end if;
  end;

  select count(*) into v_count_before from public.kitty_class_occurrences;
  begin
    perform public.create_kitty_group_one_off(
      'Atomic failure', null,
      (current_date + 6 + time '10:00') at time zone 'UTC',
      (current_date + 6 + time '11:00') at time zone 'UTC',
      current_date + 6, 'UTC', 'dashboard', null,
      '00000000-0000-0000-0000-000000000901',
      jsonb_build_array(jsonb_build_object(
        'studentContactId', '00000000-0000-0000-0000-000000009999',
        'contacts', jsonb_build_array(jsonb_build_object(
          'contactId', '00000000-0000-0000-0000-000000009999',
          'role', 'student', 'receivesNotifications', true,
          'confirmsCancellation', true, 'confirmsReschedule', true
        ))
      )),
      'runtime-group-atomic-failure'
    );
    raise exception 'invalid enrollment contact was accepted';
  exception when foreign_key_violation then null;
  end;
  if (select count(*) from public.kitty_class_occurrences) <> v_count_before
    or exists (
      select 1 from public.kitty_class_audit_events
      where request_id = 'runtime-group-atomic-failure'
    )
  then
    raise exception 'failed group creation left partial state';
  end if;

  select * into v_series
  from public.create_kitty_group_series(
    'Runtime daily group', 'Music', 'UTC', time '16:00', 60,
    array[0,1,2,3,4,5,6]::smallint[], current_date, null,
    'imessage', null, '00000000-0000-0000-0000-000000000901',
    v_enrollments, 'runtime-group-series'
  );
  if (
    select count(*) from public.kitty_class_occurrences occurrence
    where occurrence.series_id = v_series.id
  ) <> 91 then
    raise exception 'initial recurring occurrence horizon was not atomic';
  end if;

  select * into v_replayed_series
  from public.create_kitty_group_series(
    'Runtime daily group', 'Music', 'UTC', time '16:00', 60,
    array[6,5,4,3,2,1,0]::smallint[], current_date, null,
    'imessage', null, '00000000-0000-0000-0000-000000000901',
    v_reordered_enrollments, 'runtime-group-series'
  );
  if v_replayed_series.id <> v_series.id or (
    select count(*) from public.kitty_class_occurrences occurrence
    where occurrence.series_id = v_series.id
  ) <> 91 then
    raise exception 'normalized series replay duplicated data';
  end if;

  select * into v_occurrence
  from public.kitty_class_occurrences occurrence
  where occurrence.series_id = v_series.id
  order by occurrence.local_date
  limit 1;
  select * into v_occurrence
  from public.add_kitty_class_enrollment(
    v_occurrence.id, v_occurrence.version, current_date + 10,
    v_third_enrollment, null
  );
  if v_occurrence.version <> 2 then
    raise exception 'add enrollment did not advance the selected occurrence version';
  end if;
  select id into v_new_enrollment_id
  from public.kitty_class_enrollments enrollment
  where enrollment.series_id = v_series.id
    and enrollment.student_contact_id = '00000000-0000-0000-0000-000000000906';
  if v_new_enrollment_id is null then raise exception 'new enrollment missing'; end if;

  begin
    perform public.add_kitty_class_enrollment(
      v_occurrence.id, 1, current_date + 11, v_third_enrollment, null
    );
    raise exception 'stale enrollment add was accepted';
  exception when others then
    if sqlerrm <> 'stale_class' then raise; end if;
  end;

  select * into v_occurrence
  from public.kitty_class_occurrences occurrence
  where occurrence.series_id = v_series.id
    and occurrence.local_date = current_date + 10;
  select * into v_occurrence
  from public.end_kitty_class_enrollment(
    v_occurrence.id, v_new_enrollment_id, v_occurrence.version,
    current_date + 20, null
  );
  if not exists (
    select 1 from public.kitty_class_enrollments enrollment
    where enrollment.id = v_new_enrollment_id
      and enrollment.active_from = current_date + 10
      and enrollment.active_until = current_date + 20
  ) or not public.kitty_class_enrollment_applies_to_occurrence(
    v_new_enrollment_id,
    (select id from public.kitty_class_occurrences
      where series_id = v_series.id and local_date = current_date + 15)
  ) or public.kitty_class_enrollment_applies_to_occurrence(
    v_new_enrollment_id,
    (select id from public.kitty_class_occurrences
      where series_id = v_series.id and local_date = current_date + 21)
  ) then
    raise exception 'ending enrollment rewrote history or leaked into future occurrences';
  end if;

  if (
    select count(*) from public.kitty_class_audit_events audit
    where audit.request_id in (
      'runtime-group-one-off', 'runtime-group-one-off-distinct-request',
      'runtime-group-series', 'class-create:runtime-tool-request'
    )
  ) <> 4 then
    raise exception 'creation audit/idempotency records missing';
  end if;
end;
$$;

select 'kitty group service runtime probe passed';

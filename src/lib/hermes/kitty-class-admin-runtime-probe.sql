do $$
declare
  v_series_id uuid;
  v_one_off public.kitty_class_occurrences;
  v_occurrence public.kitty_class_occurrences;
  v_enrollment_id uuid;
  v_existing_enrollment_id uuid;
  v_failed_id uuid := '00000000-0000-0000-0000-000000000921';
  v_blocked_id uuid := '00000000-0000-0000-0000-000000000922';
  v_attendance_id uuid := '00000000-0000-0000-0000-000000000923';
  v_change_id uuid := '00000000-0000-0000-0000-000000000924';
  v_linked_count integer;
  v_third_enrollment jsonb := pg_catalog.jsonb_build_object(
    'studentContactId', '00000000-0000-0000-0000-000000000910',
    'contacts', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'contactId', '00000000-0000-0000-0000-000000000910',
      'role', 'student', 'receivesNotifications', true,
      'confirmsCancellation', true, 'confirmsReschedule', true
    ))
  );
  v_future_enrollment jsonb := pg_catalog.jsonb_build_object(
    'studentContactId', '00000000-0000-0000-0000-000000000911',
    'contacts', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'contactId', '00000000-0000-0000-0000-000000000911',
      'role', 'student', 'receivesNotifications', true,
      'confirmsCancellation', true, 'confirmsReschedule', true
    ))
  );
begin
  if pg_catalog.has_function_privilege(
    'service_role',
    'public.add_kitty_class_enrollment(uuid,integer,date,jsonb,uuid)',
    'execute'
  ) or pg_catalog.has_function_privilege(
    'service_role',
    'public.end_kitty_class_enrollment(uuid,uuid,integer,date,uuid)',
    'execute'
  ) or pg_catalog.has_function_privilege(
    'anon',
    'public.add_kitty_class_enrollment(uuid,integer,date,text,jsonb,uuid)',
    'execute'
  ) or not pg_catalog.has_function_privilege(
    'service_role',
    'public.add_kitty_class_enrollment(uuid,integer,date,text,jsonb,uuid)',
    'execute'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'public.get_kitty_class_admin_detail_events(uuid)',
    'execute'
  ) or not pg_catalog.has_function_privilege(
    'service_role',
    'public.get_kitty_class_admin_detail_events(uuid)',
    'execute'
  ) then
    raise exception 'admin RPC grants are not service-role-only';
  end if;

  insert into public.hermes_contacts(id) values
    ('00000000-0000-0000-0000-000000000910'),
    ('00000000-0000-0000-0000-000000000911'),
    ('00000000-0000-0000-0000-000000000912'),
    ('00000000-0000-0000-0000-000000000913')
  on conflict (id) do nothing;

  select audit.entity_id into strict v_series_id
  from public.kitty_class_audit_events audit
  where audit.request_id = 'runtime-group-series'
    and audit.entity_type = 'series';

  select occurrence.* into strict v_occurrence
  from public.kitty_class_occurrences occurrence
  where occurrence.series_id = v_series_id
    and occurrence.local_date = current_date + 30;
  select * into v_occurrence
  from public.add_kitty_class_enrollment(
    v_occurrence.id, v_occurrence.version, v_occurrence.local_date,
    'occurrence', v_third_enrollment, null
  );
  if not exists (
    select 1
    from public.kitty_class_enrollments enrollment
    where enrollment.occurrence_id = v_occurrence.id
      and enrollment.series_id is null
      and enrollment.student_contact_id = '00000000-0000-0000-0000-000000000910'
  ) or exists (
    select 1
    from public.kitty_class_enrollments enrollment
    where enrollment.series_id = v_series_id
      and enrollment.student_contact_id = '00000000-0000-0000-0000-000000000910'
  ) then
    raise exception 'recurring occurrence-only add leaked into series membership';
  end if;

  select occurrence.* into strict v_occurrence
  from public.kitty_class_occurrences occurrence
  where occurrence.series_id = v_series_id
    and occurrence.local_date = current_date + 31;
  select * into v_occurrence
  from public.add_kitty_class_enrollment(
    v_occurrence.id, v_occurrence.version, current_date + 35,
    'this_and_future', v_future_enrollment, null
  );
  select enrollment.id into strict v_enrollment_id
  from public.kitty_class_enrollments enrollment
  where enrollment.series_id = v_series_id
    and enrollment.student_contact_id = '00000000-0000-0000-0000-000000000911';

  select occurrence.* into strict v_occurrence
  from public.kitty_class_occurrences occurrence
  where occurrence.series_id = v_series_id
    and occurrence.local_date = current_date + 35;
  begin
    perform public.end_kitty_class_enrollment(
      v_occurrence.id, v_enrollment_id, v_occurrence.version,
      current_date + 35, 'occurrence', null
    );
    raise exception 'recurring occurrence-only end was accepted';
  exception when others then
    if sqlerrm <> 'invalid_scope' then raise; end if;
  end;

  select occurrence.* into strict v_occurrence
  from public.kitty_class_occurrences occurrence
  where occurrence.series_id = v_series_id
    and occurrence.local_date = current_date + 35;
  perform public.end_kitty_class_enrollment(
    v_occurrence.id, v_enrollment_id, v_occurrence.version,
    current_date + 40, 'this_and_future', null
  );
  if not public.kitty_class_enrollment_applies_to_occurrence(
    v_enrollment_id,
    (select occurrence.id from public.kitty_class_occurrences occurrence
      where occurrence.series_id = v_series_id and occurrence.local_date = current_date + 40)
  ) or public.kitty_class_enrollment_applies_to_occurrence(
    v_enrollment_id,
    (select occurrence.id from public.kitty_class_occurrences occurrence
      where occurrence.series_id = v_series_id and occurrence.local_date = current_date + 41)
  ) then
    raise exception 'recurring enrollment last-active date was not inclusive';
  end if;

  select occurrence.* into strict v_one_off
  from public.kitty_class_occurrences occurrence
  join public.kitty_class_audit_events audit
    on audit.entity_type = 'occurrence' and audit.entity_id = occurrence.id
  where audit.request_id = 'runtime-group-one-off';

  select * into v_one_off
  from public.add_kitty_class_enrollment(
    v_one_off.id, v_one_off.version, v_one_off.local_date,
    'occurrence', pg_catalog.jsonb_build_object(
      'studentContactId', '00000000-0000-0000-0000-000000000912',
      'contacts', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'contactId', '00000000-0000-0000-0000-000000000912',
        'role', 'student', 'receivesNotifications', true,
        'confirmsCancellation', true, 'confirmsReschedule', true
      ))
    ), null
  );
  select enrollment.id into strict v_enrollment_id
  from public.kitty_class_enrollments enrollment
  where enrollment.occurrence_id = v_one_off.id
    and enrollment.student_contact_id = '00000000-0000-0000-0000-000000000912';
  perform public.end_kitty_class_enrollment(
    v_one_off.id, v_enrollment_id, v_one_off.version,
    v_one_off.local_date, 'occurrence', null
  );
  if exists (
    select 1 from public.kitty_class_enrollments enrollment
    where enrollment.id = v_enrollment_id and enrollment.is_active
  ) then
    raise exception 'one-off occurrence enrollment was not ended';
  end if;

  select occurrence.* into strict v_one_off
  from public.kitty_class_occurrences occurrence
  where occurrence.id = v_one_off.id;
  begin
    perform public.add_kitty_class_enrollment(
      v_one_off.id, v_one_off.version, v_one_off.local_date,
      'this_and_future', pg_catalog.jsonb_build_object(
        'studentContactId', '00000000-0000-0000-0000-000000000913',
        'contacts', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
          'contactId', '00000000-0000-0000-0000-000000000913',
          'role', 'student', 'receivesNotifications', true,
          'confirmsCancellation', true, 'confirmsReschedule', true
        ))
      ), null
    );
    raise exception 'one-off this-and-future add was accepted';
  exception when others then
    if sqlerrm <> 'invalid_scope' then raise; end if;
  end;

  insert into public.kitty_class_notification_outbox(
    id, occurrence_id, contact_id, intent, idempotency_key, status, last_error_code
  ) values
    (v_failed_id, v_one_off.id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa902',
      'class_cancelled', 'admin-probe-failed', 'failed', 'provider_rejected'),
    (v_blocked_id, v_one_off.id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa902',
      'class_cancelled', 'admin-probe-blocked', 'blocked', 'provider_indeterminate');

  perform public.retry_kitty_class_notification(v_failed_id, null);
  if not exists (
    select 1 from public.kitty_class_notification_outbox notification
    where notification.id = v_failed_id and notification.status = 'pending'
  ) then
    raise exception 'failed notification was not retried';
  end if;
  begin
    perform public.retry_kitty_class_notification(v_blocked_id, null);
    raise exception 'blocked notification was retried';
  exception when others then
    if sqlerrm <> 'notification_not_retryable' then raise; end if;
  end;
  if not exists (
    select 1 from public.kitty_class_notification_outbox notification
    where notification.id = v_blocked_id
      and notification.status = 'blocked'
      and notification.last_error_code = 'provider_indeterminate'
  ) then
    raise exception 'blocked notification was mutated';
  end if;

  select enrollment.id into strict v_existing_enrollment_id
  from public.kitty_class_enrollments enrollment
  where enrollment.occurrence_id = v_one_off.id
    and enrollment.is_active
  order by enrollment.id
  limit 1;
  insert into public.kitty_class_attendance_updates(
    id, occurrence_id, enrollment_id, reported_by_contact_id, status,
    client_request_id, payload_digest
  ) values (
    v_attendance_id, v_one_off.id, v_existing_enrollment_id,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa902', 'absent',
    'admin-probe-attendance', pg_catalog.repeat('a', 64)
  );
  insert into public.kitty_class_change_requests(
    id, occurrence_id, change_type, status, payload_digest
  ) values (
    v_change_id, v_one_off.id, 'cancel', 'expired', pg_catalog.repeat('b', 64)
  );
  insert into public.kitty_class_audit_events(
    actor_type, event_type, entity_type, entity_id, metadata
  ) values
    ('contact', 'attendance_recorded', 'attendance_update', v_attendance_id,
      pg_catalog.jsonb_build_object('payloadDigest', pg_catalog.repeat('a', 64))),
    ('system', 'request_expired', 'change_request', v_change_id, '{}'::jsonb),
    ('system', 'notification_failed', 'notification', v_blocked_id, '{}'::jsonb);

  select count(*) into v_linked_count
  from public.get_kitty_class_admin_detail_events(v_one_off.id) event
  where event.entity_type in ('occurrence', 'attendance_update', 'change_request', 'notification');
  if v_linked_count < 4 then
    raise exception 'linked audit RPC omitted occurrence detail events';
  end if;

  begin
    update public.kitty_class_attendance_updates
    set note = 'mutated'
    where id = v_attendance_id;
    raise exception 'attendance history was mutable';
  exception when others then
    if sqlerrm <> 'kitty_class_attendance_is_append_only' then raise; end if;
  end;

  insert into public.kitty_class_audit_events(
    actor_type, event_type, entity_type, entity_id
  )
  select 'system', 'bounded_probe_' || generated.value::text,
    'occurrence', v_one_off.id
  from pg_catalog.generate_series(1, 60) generated(value);
  if (select count(*) from public.get_kitty_class_admin_detail_events(v_one_off.id)) <> 50 then
    raise exception 'linked audit RPC was not bounded';
  end if;
end;
$$;

select 'kitty class admin runtime probe passed';

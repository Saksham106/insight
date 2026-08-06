insert into public.hermes_contacts(id) values
  ('00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000201'),
  ('00000000-0000-0000-0000-000000000202'),
  ('00000000-0000-0000-0000-000000000203'),
  ('00000000-0000-0000-0000-000000000301'),
  ('00000000-0000-0000-0000-000000000303'),
  ('00000000-0000-0000-0000-000000000999');

create function pg_temp.create_probe_group(p_request_id text, p_day integer)
returns uuid language plpgsql as $$
declare v_occurrence public.kitty_class_occurrences;
begin
  select created.* into v_occurrence
  from public.create_kitty_group_one_off(
    'Task 5 group', 'Math',
    ('2026-08-' || pg_catalog.lpad(p_day::text, 2, '0') || 'T20:00:00Z')::timestamptz,
    ('2026-08-' || pg_catalog.lpad(p_day::text, 2, '0') || 'T21:00:00Z')::timestamptz,
    ('2026-08-' || pg_catalog.lpad(p_day::text, 2, '0'))::date,
    'America/New_York', 'dashboard', null,
    '00000000-0000-0000-0000-000000000101',
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'studentContactId', '00000000-0000-0000-0000-000000000201',
        'contacts', pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object('contactId', '00000000-0000-0000-0000-000000000201', 'role', 'student', 'receivesNotifications', true, 'confirmsCancellation', false, 'confirmsReschedule', true),
          pg_catalog.jsonb_build_object('contactId', '00000000-0000-0000-0000-000000000301', 'role', 'parent_guardian', 'receivesNotifications', true, 'confirmsCancellation', false, 'confirmsReschedule', true)
        )
      ),
      pg_catalog.jsonb_build_object(
        'studentContactId', '00000000-0000-0000-0000-000000000202',
        'contacts', pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object('contactId', '00000000-0000-0000-0000-000000000202', 'role', 'student', 'receivesNotifications', true, 'confirmsCancellation', false, 'confirmsReschedule', true),
          pg_catalog.jsonb_build_object('contactId', '00000000-0000-0000-0000-000000000301', 'role', 'parent_guardian', 'receivesNotifications', true, 'confirmsCancellation', false, 'confirmsReschedule', true)
        )
      ),
      pg_catalog.jsonb_build_object(
        'studentContactId', '00000000-0000-0000-0000-000000000203',
        'contacts', pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object('contactId', '00000000-0000-0000-0000-000000000203', 'role', 'student', 'receivesNotifications', true, 'confirmsCancellation', false, 'confirmsReschedule', true),
          pg_catalog.jsonb_build_object('contactId', '00000000-0000-0000-0000-000000000303', 'role', 'parent_guardian', 'receivesNotifications', true, 'confirmsCancellation', false, 'confirmsReschedule', true)
        )
      )
    ),
    p_request_id
  ) created;
  return v_occurrence.id;
end;
$$;

create function pg_temp.confirm_probe_selection(
  p_occurrence_id uuid,
  p_contact_id uuid,
  p_token text
) returns void language plpgsql as $$
declare v_occurrence public.kitty_class_occurrences;
begin
  select occurrence.* into strict v_occurrence
  from public.kitty_class_occurrences occurrence
  where occurrence.id = p_occurrence_id;
  insert into public.kitty_class_audit_events(
    actor_type, actor_contact_id, event_type, entity_type, entity_id, metadata
  ) values (
    'contact', p_contact_id, 'occurrence_selection_confirmed',
    'occurrence', v_occurrence.id,
    pg_catalog.jsonb_build_object(
      'occurrenceVersion', v_occurrence.version,
      'selectionTokenDigest', pg_catalog.encode(
        public.digest(pg_catalog.convert_to(p_token, 'UTF8'), 'sha256'), 'hex'
      ),
      'expiresAt', pg_catalog.now() + interval '15 minutes'
    )
  );
end;
$$;

do $$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'public.request_kitty_group_class_change(uuid,integer,text,uuid,uuid,text,timestamptz,timestamptz,text,text,text)',
    'public.propose_kitty_group_class_change(uuid,integer,text,uuid,timestamptz,timestamptz,text,text)',
    'public.decide_kitty_group_class_change(uuid,integer,text,uuid,text,text,text)'
  ] loop
    if not pg_catalog.has_function_privilege('service_role', v_signature, 'EXECUTE')
      or pg_catalog.has_function_privilege('anon', v_signature, 'EXECUTE')
      or pg_catalog.has_function_privilege('authenticated', v_signature, 'EXECUTE')
      or exists (
        select 1
        from pg_catalog.pg_proc procedure
        cross join lateral pg_catalog.aclexplode(
          coalesce(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))
        ) privilege
        where procedure.oid = pg_catalog.to_regprocedure(v_signature)
          and privilege.grantee = 0
          and privilege.privilege_type = 'EXECUTE'
      )
    then raise exception 'new RPC privilege boundary failed for %', v_signature; end if;
  end loop;

  foreach v_signature in array array[
    'public.request_kitty_class_change(uuid,text,uuid,text,text,timestamptz,timestamptz,text,text)',
    'public.propose_kitty_class_replacement(uuid,integer,text,uuid,timestamptz,timestamptz,text,text)',
    'public.decide_kitty_class_change(uuid,integer,text,uuid,text,text)',
    'public.finalize_kitty_class_change(uuid,integer,text)'
  ] loop
    if pg_catalog.has_function_privilege('service_role', v_signature, 'EXECUTE')
      or pg_catalog.has_function_privilege('anon', v_signature, 'EXECUTE')
      or pg_catalog.has_function_privilege('authenticated', v_signature, 'EXECUTE')
      or exists (
        select 1
        from pg_catalog.pg_proc procedure
        cross join lateral pg_catalog.aclexplode(
          coalesce(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))
        ) privilege
        where procedure.oid = pg_catalog.to_regprocedure(v_signature)
          and privilege.grantee = 0
          and privilege.privilege_type = 'EXECUTE'
      )
    then raise exception 'legacy RPC remains executable for %', v_signature; end if;
  end loop;

  if pg_catalog.has_function_privilege(
    'service_role', 'public.finalize_kitty_group_class_change(uuid)', 'EXECUTE'
  ) then raise exception 'internal finalizer is externally executable'; end if;
end;
$$;

-- Three-enrollment reschedule: the shared guardian approves only the two
-- siblings they represent; the final enrollment approval completes the set.
do $$
declare
  v_occurrence_id uuid := pg_temp.create_probe_group('probe-group-main', 10);
  v_occurrence public.kitty_class_occurrences;
  v_request public.kitty_class_change_requests;
  v_result public.kitty_class_change_requests;
  v_token text := pg_catalog.repeat('a', 64);
  v_outsider_rejected boolean := false;
  v_stale_rejected boolean := false;
  v_selection_rejected boolean := false;
  v_pending jsonb;
begin
  perform pg_temp.confirm_probe_selection(
    v_occurrence_id, '00000000-0000-0000-0000-000000000101', v_token
  );
  select occurrence.* into strict v_occurrence
  from public.kitty_class_occurrences occurrence where occurrence.id = v_occurrence_id;
  begin
    perform public.request_kitty_group_class_change(
      v_occurrence.id, v_occurrence.version + 1, 'whole_occurrence', null,
      '00000000-0000-0000-0000-000000000101', 'reschedule',
      '2026-08-11T20:00:00Z', '2026-08-11T21:00:00Z', 'America/New_York',
      v_token, 'probe-stale-selection-request'
    );
  exception when others then
    v_stale_rejected := sqlerrm like '%stale_class%';
  end;
  if not v_stale_rejected then raise exception 'stale occurrence selection was accepted'; end if;
  begin
    perform public.request_kitty_group_class_change(
      v_occurrence.id, v_occurrence.version, 'whole_occurrence', null,
      '00000000-0000-0000-0000-000000000101', 'reschedule',
      '2026-08-11T20:00:00Z', '2026-08-11T21:00:00Z', 'America/New_York',
      pg_catalog.repeat('f', 64), 'probe-wrong-selection-request'
    );
  exception when others then
    v_selection_rejected := sqlerrm like '%selection_confirmation_required%';
  end;
  if not v_selection_rejected then raise exception 'wrong selection token was accepted'; end if;
  select requested.* into v_request
  from public.request_kitty_group_class_change(
    v_occurrence.id, v_occurrence.version, 'whole_occurrence', null,
    '00000000-0000-0000-0000-000000000101', 'reschedule',
    '2026-08-11T20:00:00Z', '2026-08-11T21:00:00Z', 'America/New_York',
    v_token, 'probe-main-request'
  ) requested;
  if v_request.status <> 'awaiting_counterparty'
    or pg_catalog.cardinality(v_request.required_enrollment_ids) <> 3
  then raise exception 'group request did not snapshot three enrollments'; end if;
  select pg_catalog.to_jsonb(pending) into strict v_pending
  from public.find_my_pending_kitty_class_changes(
    '00000000-0000-0000-0000-000000000301', null
  ) pending
  where pending.id = v_request.id;
  if (v_pending->>'required_enrollment_approvals')::integer <> 3
    or (v_pending->>'received_enrollment_approvals')::integer <> 0
    or v_pending ? 'required_enrollment_ids'
  then raise exception 'pending projection did not expose private-safe 0/3 progress'; end if;

  begin
    perform public.decide_kitty_group_class_change(
      v_request.id, v_request.version, v_request.payload_digest,
      '00000000-0000-0000-0000-000000000999', 'approved', null,
      'probe-outsider-decision'
    );
  exception when others then
    v_outsider_rejected := sqlerrm like '%change_not_permitted%';
  end;
  if not v_outsider_rejected then raise exception 'outsider approved a group request'; end if;

  select decided.* into v_result
  from public.decide_kitty_group_class_change(
    v_request.id, v_request.version, v_request.payload_digest,
    '00000000-0000-0000-0000-000000000301', 'approved', null,
    'probe-shared-guardian-decision'
  ) decided;
  if v_result.status <> 'awaiting_counterparty' then
    raise exception 'two of three approvals finalized the group';
  end if;
  if (select count(*) from public.kitty_class_change_confirmations confirmation
      where confirmation.change_request_id = v_request.id
        and confirmation.request_version = v_request.version
        and confirmation.decision_side = 'student'
        and confirmation.decision = 'approved') <> 2 then
    raise exception 'shared guardian did not atomically approve two siblings';
  end if;
  select pg_catalog.to_jsonb(pending) into strict v_pending
  from public.find_my_pending_kitty_class_changes(
    '00000000-0000-0000-0000-000000000301', null
  ) pending
  where pending.id = v_request.id;
  if (v_pending->>'required_enrollment_approvals')::integer <> 3
    or (v_pending->>'received_enrollment_approvals')::integer <> 2
  then raise exception 'pending projection did not expose current-version 2/3 progress'; end if;

  select decided.* into v_result
  from public.decide_kitty_group_class_change(
    v_request.id, v_request.version, v_request.payload_digest,
    '00000000-0000-0000-0000-000000000203', 'approved', null,
    'probe-third-student-decision'
  ) decided;
  if v_result.status <> 'finalized' or v_result.replacement_occurrence_id is null then
    raise exception 'three of three enrollment approvals did not finalize';
  end if;
  if (select status from public.kitty_class_occurrences where id = v_occurrence.id) <> 'rescheduled' then
    raise exception 'whole-group original was not rescheduled';
  end if;
  if (select count(*) from public.kitty_class_enrollments enrollment
      where enrollment.occurrence_id = v_result.replacement_occurrence_id) <> 3 then
    raise exception 'whole-group replacement did not copy three enrollments';
  end if;
  if (select count(*) from public.kitty_class_notification_outbox outbox
      where outbox.change_request_id = v_request.id and outbox.intent = 'class_rescheduled') <> 6 then
    raise exception 'whole-group final outcome did not notify teacher plus five family recipients';
  end if;
  if exists (
    select 1 from public.find_my_pending_kitty_class_changes(
      '00000000-0000-0000-0000-000000000301', null
    ) pending where pending.id = v_request.id
  ) or (select count(*) from public.kitty_class_change_confirmations confirmation
      where confirmation.change_request_id = v_request.id
        and confirmation.request_version = v_request.version
        and confirmation.decision_side = 'student'
        and confirmation.decision = 'approved'
        and confirmation.payload_digest = v_request.payload_digest) <> 3
  then raise exception 'finalized projection/evidence did not preserve current-version 3/3 progress'; end if;
end;
$$;

-- A changed proposal starts a new approval version. Version-one family
-- approvals must not satisfy the new time.
do $$
declare
  v_occurrence_id uuid := pg_temp.create_probe_group('probe-group-reproposal', 12);
  v_occurrence public.kitty_class_occurrences;
  v_request public.kitty_class_change_requests;
  v_result public.kitty_class_change_requests;
  v_token text := pg_catalog.repeat('b', 64);
begin
  perform pg_temp.confirm_probe_selection(
    v_occurrence_id, '00000000-0000-0000-0000-000000000101', v_token
  );
  select occurrence.* into strict v_occurrence from public.kitty_class_occurrences occurrence
  where occurrence.id = v_occurrence_id;
  select requested.* into v_request
  from public.request_kitty_group_class_change(
    v_occurrence.id, v_occurrence.version, 'whole_occurrence', null,
    '00000000-0000-0000-0000-000000000101', 'reschedule',
    '2026-08-13T20:00:00Z', '2026-08-13T21:00:00Z', 'America/New_York',
    v_token, 'probe-reproposal-request'
  ) requested;
  perform public.decide_kitty_group_class_change(
    v_request.id, v_request.version, v_request.payload_digest,
    '00000000-0000-0000-0000-000000000301', 'approved', null,
    'probe-reproposal-old-family'
  );
  select proposed.* into v_request
  from public.propose_kitty_group_class_change(
    v_request.id, v_request.version, v_request.payload_digest,
    '00000000-0000-0000-0000-000000000101',
    '2026-08-14T20:00:00Z', '2026-08-14T21:00:00Z', 'America/New_York',
    'probe-reproposal-new-time'
  ) proposed;
  if v_request.version <> 2 then raise exception 'proposal version was not advanced'; end if;
  if exists (
    select 1 from public.kitty_class_change_confirmations confirmation
    where confirmation.change_request_id = v_request.id
      and confirmation.request_version = 2
      and confirmation.decision_side = 'student'
  ) then raise exception 'old family approvals leaked into the new proposal version'; end if;
  select decided.* into v_result
  from public.decide_kitty_group_class_change(
    v_request.id, v_request.version, v_request.payload_digest,
    '00000000-0000-0000-0000-000000000203', 'approved', null,
    'probe-reproposal-third-only'
  ) decided;
  if v_result.status <> 'awaiting_counterparty' then
    raise exception 'new proposal finalized without refreshed sibling approvals';
  end if;
  select decided.* into v_result
  from public.decide_kitty_group_class_change(
    v_request.id, v_request.version, v_request.payload_digest,
    '00000000-0000-0000-0000-000000000301', 'approved', null,
    'probe-reproposal-shared-refresh'
  ) decided;
  if v_result.status <> 'finalized' then raise exception 'refreshed approvals did not finalize'; end if;
end;
$$;

-- Teacher cancellation finalizes immediately and reserves final notifications
-- for every configured unique family recipient plus the teacher.
do $$
declare
  v_occurrence_id uuid := pg_temp.create_probe_group('probe-group-cancel', 15);
  v_occurrence public.kitty_class_occurrences;
  v_request public.kitty_class_change_requests;
  v_replay public.kitty_class_change_requests;
  v_token text := pg_catalog.repeat('c', 64);
  v_mismatch_rejected boolean := false;
  v_version_mismatch_rejected boolean := false;
  v_token_mismatch_rejected boolean := false;
begin
  perform pg_temp.confirm_probe_selection(
    v_occurrence_id, '00000000-0000-0000-0000-000000000101', v_token
  );
  select occurrence.* into strict v_occurrence from public.kitty_class_occurrences occurrence
  where occurrence.id = v_occurrence_id;
  select requested.* into v_request
  from public.request_kitty_group_class_change(
    v_occurrence.id, v_occurrence.version, 'whole_occurrence', null,
    '00000000-0000-0000-0000-000000000101', 'cancel',
    null, null, null, v_token, 'probe-cancel-request'
  ) requested;
  if v_request.status <> 'finalized'
    or (select status from public.kitty_class_occurrences where id = v_occurrence.id) <> 'cancelled'
  then raise exception 'teacher cancellation was not atomic'; end if;
  if exists (
    select 1 from public.kitty_class_change_confirmations confirmation
    where confirmation.change_request_id = v_request.id
      and confirmation.decision_side = 'student'
  ) then raise exception 'teacher cancellation waited on family approval'; end if;
  if (select count(*) from public.kitty_class_notification_outbox outbox
      where outbox.change_request_id = v_request.id and outbox.intent = 'class_cancelled') <> 6 then
    raise exception 'teacher cancellation recipient fan-out is incomplete';
  end if;

  select replayed.* into v_replay
  from public.request_kitty_group_class_change(
    v_occurrence.id, v_occurrence.version, 'whole_occurrence', null,
    '00000000-0000-0000-0000-000000000101', 'cancel',
    null, null, null, v_token, 'probe-cancel-request'
  ) replayed;
  if v_replay.id <> v_request.id then raise exception 'same-payload cancellation replay duplicated'; end if;
  if not exists (
    select 1
    from public.kitty_class_audit_events audit
    where audit.request_id = 'probe-cancel-request'
      and audit.metadata->>'operationDigest' ~ '^[a-f0-9]{64}$'
      and audit.metadata::text not like '%' || v_token || '%'
  ) then raise exception 'request replay evidence was not stored as a digest'; end if;
  begin
    perform public.request_kitty_group_class_change(
      v_occurrence.id, 999, 'whole_occurrence', null,
      '00000000-0000-0000-0000-000000000101', 'cancel',
      null, null, null, v_token, 'probe-cancel-request'
    );
  exception when others then
    v_version_mismatch_rejected := sqlerrm like '%client_request_payload_mismatch%';
  end;
  if not v_version_mismatch_rejected then
    raise exception 'request id accepted a changed expected occurrence version';
  end if;
  begin
    perform public.request_kitty_group_class_change(
      v_occurrence.id, v_occurrence.version, 'whole_occurrence', null,
      '00000000-0000-0000-0000-000000000101', 'cancel',
      null, null, null, pg_catalog.repeat('9', 64), 'probe-cancel-request'
    );
  exception when others then
    v_token_mismatch_rejected := sqlerrm like '%client_request_payload_mismatch%';
  end;
  if not v_token_mismatch_rejected then
    raise exception 'request id accepted changed selection evidence';
  end if;
  begin
    perform public.request_kitty_group_class_change(
      v_occurrence.id, v_occurrence.version, 'whole_occurrence', null,
      '00000000-0000-0000-0000-000000000101', 'reschedule',
      '2026-08-16T20:00:00Z', '2026-08-16T21:00:00Z', 'America/New_York',
      v_token, 'probe-cancel-request'
    );
  exception when others then
    v_mismatch_rejected := sqlerrm like '%client_request_payload_mismatch%';
  end;
  if not v_mismatch_rejected then raise exception 'request id accepted changed payload'; end if;
end;
$$;

-- Individual replacement leaves the shared occurrence untouched and creates a
-- linked one-off containing only the teacher and selected enrollment.
do $$
declare
  v_occurrence_id uuid := pg_temp.create_probe_group('probe-individual-replacement', 18);
  v_occurrence public.kitty_class_occurrences;
  v_enrollment_id uuid;
  v_request public.kitty_class_change_requests;
  v_result public.kitty_class_change_requests;
  v_token text := pg_catalog.repeat('d', 64);
begin
  select occurrence.* into strict v_occurrence from public.kitty_class_occurrences occurrence
  where occurrence.id = v_occurrence_id;
  select enrollment.id into strict v_enrollment_id
  from public.kitty_class_enrollments enrollment
  where enrollment.occurrence_id = v_occurrence.id
    and enrollment.student_contact_id = '00000000-0000-0000-0000-000000000201';
  perform pg_temp.confirm_probe_selection(
    v_occurrence.id, '00000000-0000-0000-0000-000000000201', v_token
  );
  select requested.* into v_request
  from public.request_kitty_group_class_change(
    v_occurrence.id, v_occurrence.version, 'individual_reschedule', v_enrollment_id,
    '00000000-0000-0000-0000-000000000201', 'reschedule',
    '2026-08-19T20:00:00Z', '2026-08-19T21:00:00Z', 'America/New_York',
    v_token, 'probe-individual-request'
  ) requested;
  if (select status from public.kitty_class_occurrences where id = v_occurrence.id) <> 'scheduled'
    or (select version from public.kitty_class_occurrences where id = v_occurrence.id) <> v_occurrence.version
  then raise exception 'individual request changed the shared occurrence'; end if;
  select decided.* into v_result
  from public.decide_kitty_group_class_change(
    v_request.id, v_request.version, v_request.payload_digest,
    '00000000-0000-0000-0000-000000000101', 'approved', null,
    'probe-individual-teacher-decision'
  ) decided;
  if v_result.status <> 'finalized' or v_result.replacement_occurrence_id is null then
    raise exception 'individual replacement did not finalize';
  end if;
  if (select status from public.kitty_class_occurrences where id = v_occurrence.id) <> 'scheduled' then
    raise exception 'individual finalization moved the shared group';
  end if;
  if (select count(*) from public.kitty_class_enrollments enrollment
      where enrollment.occurrence_id = v_result.replacement_occurrence_id) <> 1 then
    raise exception 'individual replacement copied unrelated enrollments';
  end if;
  if exists (
    select 1
    from public.kitty_class_notification_outbox outbox
    where outbox.change_request_id = v_request.id
      and outbox.contact_id in (
        '00000000-0000-0000-0000-000000000202',
        '00000000-0000-0000-0000-000000000203',
        '00000000-0000-0000-0000-000000000303'
      )
  ) then raise exception 'individual replacement leaked to another family'; end if;
  if (select count(*) from public.kitty_class_notification_outbox outbox
      where outbox.change_request_id = v_request.id and outbox.intent = 'class_rescheduled') <> 3 then
    raise exception 'individual final notification recipient count is wrong';
  end if;
end;
$$;

-- Task 4 attendance and correction are enrollment-private messages, not class
-- scheduling mutations. Both must leave the shared occurrence unchanged.
do $$
declare
  v_occurrence_id uuid := pg_temp.create_probe_group('probe-attendance-no-class-change', 23);
  v_occurrence public.kitty_class_occurrences;
  v_enrollment_id uuid;
  v_attendance public.kitty_class_attendance_updates;
  v_token text := pg_catalog.repeat('8', 64);
begin
  select occurrence.* into strict v_occurrence
  from public.kitty_class_occurrences occurrence where occurrence.id = v_occurrence_id;
  select enrollment.id into strict v_enrollment_id
  from public.kitty_class_enrollments enrollment
  where enrollment.occurrence_id = v_occurrence.id
    and enrollment.student_contact_id = '00000000-0000-0000-0000-000000000201';
  perform pg_temp.confirm_probe_selection(
    v_occurrence.id, '00000000-0000-0000-0000-000000000201', v_token
  );
  select recorded.* into v_attendance
  from public.record_kitty_class_attendance(
    v_occurrence.id, v_enrollment_id,
    '00000000-0000-0000-0000-000000000201',
    'absent', null, null, v_token, 'probe-task4-attendance'
  ) recorded;
  perform public.correct_kitty_class_attendance(
    v_attendance.id, v_occurrence.id, v_enrollment_id,
    '00000000-0000-0000-0000-000000000201',
    'expected', null, null, v_token, 'probe-task4-attendance-correction'
  );
  if (select occurrence.status from public.kitty_class_occurrences occurrence
      where occurrence.id = v_occurrence.id) <> v_occurrence.status
    or (select occurrence.version from public.kitty_class_occurrences occurrence
      where occurrence.id = v_occurrence.id) <> v_occurrence.version
  then raise exception 'attendance or correction changed shared class scheduling state'; end if;
end;
$$;

-- Leave one request awaiting the two concurrent family decisions exercised by
-- the Node harness.
do $$
declare
  v_occurrence_id uuid := pg_temp.create_probe_group('probe-concurrent-group', 21);
  v_occurrence public.kitty_class_occurrences;
  v_token text := pg_catalog.repeat('e', 64);
begin
  perform pg_temp.confirm_probe_selection(
    v_occurrence_id, '00000000-0000-0000-0000-000000000101', v_token
  );
  select occurrence.* into strict v_occurrence from public.kitty_class_occurrences occurrence
  where occurrence.id = v_occurrence_id;
  perform public.request_kitty_group_class_change(
    v_occurrence.id, v_occurrence.version, 'whole_occurrence', null,
    '00000000-0000-0000-0000-000000000101', 'reschedule',
    '2026-08-22T20:00:00Z', '2026-08-22T21:00:00Z', 'America/New_York',
    v_token, 'concurrent-group-request'
  );
  if (select count(*) from public.find_my_pending_kitty_class_changes(
      '00000000-0000-0000-0000-000000000301', null
    )) <> 1 then
    raise exception 'represented guardian cannot find the pending group request';
  end if;
  if (select count(*) from public.find_my_pending_kitty_class_changes(
      '00000000-0000-0000-0000-000000000999', null
    )) <> 0 then
    raise exception 'unrelated contact can see a pending group request';
  end if;
end;
$$;

select 'kitty group change workflow probe passed' as result;

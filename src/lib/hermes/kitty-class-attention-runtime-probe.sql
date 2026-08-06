do $$
declare
  v_actor_id uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa902';
  v_second_actor_id uuid := '00000000-0000-0000-0000-000000000904';
  v_guardian_id uuid := '00000000-0000-0000-0000-000000000903';
  v_first_occurrence_id uuid;
  v_second_occurrence_id uuid;
  v_enrollment_id uuid;
  v_expired_id uuid := '00000000-0000-0000-0000-000000000981';
  v_result jsonb;
  v_count integer;
begin
  if pg_catalog.has_function_privilege(
    'authenticated',
    'public.record_kitty_class_scope_ambiguity(uuid,uuid[],text,text)', 'execute'
  ) or not pg_catalog.has_function_privilege(
    'service_role',
    'public.record_kitty_class_scope_ambiguity(uuid,uuid[],text,text)', 'execute'
  ) or pg_catalog.has_function_privilege(
    'anon',
    'public.get_kitty_class_admin_attention_issues(timestamp with time zone,integer)', 'execute'
  ) or not pg_catalog.has_function_privilege(
    'service_role',
    'public.get_kitty_class_admin_attention_issues(timestamp with time zone,integer)', 'execute'
  ) then
    raise exception 'attention RPC grants are not service-role-only';
  end if;

  select audit.entity_id into strict v_first_occurrence_id
  from public.kitty_class_audit_events audit
  where audit.request_id = 'runtime-group-one-off'
    and audit.entity_type = 'occurrence';
  select audit.entity_id into strict v_second_occurrence_id
  from public.kitty_class_audit_events audit
  where audit.request_id = 'runtime-group-one-off-distinct-request'
    and audit.entity_type = 'occurrence';

  v_result := public.record_kitty_class_scope_ambiguity(
    v_actor_id, array[v_first_occurrence_id, v_second_occurrence_id],
    'class', 'attention-runtime-ambiguity-1'
  );
  if v_result->>'status' <> 'opened' or (v_result->>'candidateCount')::integer <> 2 then
    raise exception 'ambiguity producer did not open the candidate set';
  end if;
  v_result := public.record_kitty_class_scope_ambiguity(
    v_actor_id, array[v_second_occurrence_id, v_first_occurrence_id],
    'class', 'attention-runtime-ambiguity-1'
  );
  if v_result->>'status' <> 'duplicate' then
    raise exception 'request replay was not idempotent';
  end if;
  v_result := public.record_kitty_class_scope_ambiguity(
    v_actor_id, array[v_first_occurrence_id, v_second_occurrence_id],
    'class', 'attention-runtime-ambiguity-2'
  );
  if v_result->>'status' <> 'suppressed' then
    raise exception 'equivalent recent ambiguity was not suppressed';
  end if;

  select pg_catalog.count(*) into v_count
  from public.kitty_class_audit_events audit
  where audit.actor_contact_id = v_actor_id
    and audit.event_type = 'class_scope_ambiguity_opened';
  if v_count <> 2 or exists (
    select 1 from public.kitty_class_audit_events audit
    where audit.actor_contact_id = v_actor_id
      and audit.event_type = 'class_scope_ambiguity_opened'
      and (audit.metadata ? 'message' or audit.metadata ? 'reason' or audit.metadata ? 'contactName')
  ) then
    raise exception 'ambiguity audit was duplicated or retained free-form/PII fields';
  end if;

  v_result := public.record_kitty_class_scope_ambiguity(
    v_second_actor_id, array[v_first_occurrence_id, v_second_occurrence_id],
    'class', 'attention-runtime-ambiguity-1'
  );
  if v_result->>'status' <> 'opened' then
    raise exception 'another authorized contact could not independently reuse the request ID';
  end if;
  if (
    select pg_catalog.count(*)
    from public.kitty_class_audit_events audit
    where audit.actor_contact_id = v_second_actor_id
      and audit.event_type = 'class_scope_ambiguity_opened'
  ) <> 2 then
    raise exception 'second contact did not receive an independent ambiguity group';
  end if;
  if exists (
    select 1
    from public.kitty_class_audit_events audit
    where audit.actor_contact_id in (v_actor_id, v_second_actor_id)
      and audit.event_type = 'class_scope_ambiguity_opened'
      and (
        audit.request_id like '%attention-runtime-ambiguity-1%'
        or audit.metadata::text like '%attention-runtime-ambiguity-1%'
      )
  ) then
    raise exception 'raw ambiguity request ID leaked into persistent audit data';
  end if;
  if (
    select pg_catalog.count(*)
    from public.get_kitty_class_admin_attention_issues(pg_catalog.now(), 500) issue
    where issue.kind = 'ambiguous_scope'
      and issue.occurrence_id = any(array[v_first_occurrence_id, v_second_occurrence_id])
  ) <> 4 then
    raise exception 'open ambiguity was not visible to admin attention';
  end if;

  if public.resolve_kitty_class_scope_ambiguities(v_actor_id, v_first_occurrence_id) <> 2 then
    raise exception 'exact selection did not resolve the complete ambiguity group';
  end if;
  if (
    select pg_catalog.count(*)
    from public.kitty_class_audit_events audit
    where audit.actor_contact_id = v_second_actor_id
      and audit.event_type = 'class_scope_ambiguity_opened'
  ) <> 2 then
    raise exception 'resolving one contact incorrectly resolved another contact ambiguity group';
  end if;
  if public.resolve_kitty_class_scope_ambiguities(v_second_actor_id, v_first_occurrence_id) <> 2 then
    raise exception 'second contact could not independently resolve its ambiguity group';
  end if;
  if exists (
    select 1 from public.get_kitty_class_admin_attention_issues(pg_catalog.now(), 500) issue
    where issue.kind = 'ambiguous_scope'
      and issue.occurrence_id = any(array[v_first_occurrence_id, v_second_occurrence_id])
  ) then
    raise exception 'resolved ambiguity remained in admin attention';
  end if;

  select enrollment.id into strict v_enrollment_id
  from public.kitty_class_enrollments enrollment
  where enrollment.occurrence_id = v_first_occurrence_id
    and enrollment.student_contact_id = v_actor_id;
  update public.hermes_contacts contact
  set is_active = false,
    deleted_at = case when contact.id = v_guardian_id then pg_catalog.now() else contact.deleted_at end
  where contact.id in (
    select enrollment_contact.contact_id
    from public.kitty_class_enrollment_contacts enrollment_contact
    where enrollment_contact.enrollment_id = v_enrollment_id
  );
  if not exists (
    select 1 from public.get_kitty_class_admin_attention_issues(pg_catalog.now(), 500) issue
    where issue.kind = 'missing_decision_maker' and issue.source_id = v_enrollment_id
  ) then
    raise exception 'inactive/deleted Hermes contacts incorrectly counted as decision-makers';
  end if;
  update public.hermes_contacts
  set is_active = true, deleted_at = null
  where id = v_actor_id;
  if exists (
    select 1 from public.get_kitty_class_admin_attention_issues(pg_catalog.now(), 500) issue
    where issue.kind = 'missing_decision_maker' and issue.source_id = v_enrollment_id
  ) then
    raise exception 'active Hermes contact did not clear missing decision-maker attention';
  end if;

  insert into public.kitty_class_change_requests(
    occurrence_id, change_type, status, payload_digest, updated_at
  )
  select v_first_occurrence_id, 'cancel', 'finalized',
    pg_catalog.md5('ordinary-change-' || generated.value) || pg_catalog.md5('ordinary-change-' || generated.value),
    pg_catalog.now() + generated.value * interval '1 second'
  from pg_catalog.generate_series(1, 150) generated(value);
  insert into public.kitty_class_change_requests(
    id, occurrence_id, change_type, status, payload_digest, updated_at
  ) values (
    v_expired_id, v_first_occurrence_id, 'cancel', 'expired', pg_catalog.repeat('e', 64),
    pg_catalog.now() - interval '1 day'
  );
  if not exists (
    select 1 from public.get_kitty_class_admin_attention_issues(pg_catalog.now(), 500) issue
    where issue.source_id = v_expired_id and issue.kind = 'expired_request'
  ) then
    raise exception 'non-attention changes crowded out an expired request before filtering';
  end if;

  insert into public.hermes_contacts(id)
  select pg_catalog.md5('old-enrollment-contact-' || generated.value)::uuid
  from pg_catalog.generate_series(1, 150) generated(value)
  on conflict (id) do nothing;
  insert into public.kitty_class_enrollments(
    occurrence_id, student_contact_id, active_from, active_until, is_active, updated_at
  )
  select v_first_occurrence_id,
    pg_catalog.md5('old-enrollment-contact-' || generated.value)::uuid,
    current_date - 30, current_date - 1, false,
    pg_catalog.now() + generated.value * interval '1 second'
  from pg_catalog.generate_series(1, 150) generated(value);
  update public.hermes_contacts set is_active = false where id = v_actor_id;
  if not exists (
    select 1 from public.get_kitty_class_admin_attention_issues(pg_catalog.now(), 500) issue
    where issue.kind = 'missing_decision_maker' and issue.source_id = v_enrollment_id
  ) then
    raise exception 'inactive/ended enrollments crowded out the current missing decision-maker';
  end if;
  update public.hermes_contacts set is_active = true where id = v_actor_id;

  if (select pg_catalog.count(*) from public.get_kitty_class_admin_attention_issues(pg_catalog.now(), 3)) > 3 then
    raise exception 'admin attention result ignored its global bound';
  end if;
end;
$$;

select 'kitty class attention runtime probe passed';

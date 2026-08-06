-- Scope-aware Kitty group changes. These functions are reachable only through
-- the server-side service-role client; contact identity is resolved from the
-- signed transport session before it reaches this boundary and is revalidated
-- against the locked Kitty roster here.

alter table public.kitty_class_change_requests
  add column replacement_occurrence_id uuid
    references public.kitty_class_occurrences(id) on delete restrict;

create index kitty_class_requests_replacement_occurrence_idx
  on public.kitty_class_change_requests(replacement_occurrence_id)
  where replacement_occurrence_id is not null;

create type public.kitty_group_change_result as (
  id uuid,
  "occurrenceId" uuid,
  "changeType" text,
  scope text,
  status text,
  "proposedStartsAt" timestamptz,
  "proposedEndsAt" timestamptz,
  "proposedTimezone" text,
  "payloadDigest" text,
  version integer,
  "expiresAt" timestamptz,
  "replacementOccurrenceId" uuid,
  "requiredEnrollmentApprovals" integer,
  "receivedEnrollmentApprovals" integer
);

create or replace function public.kitty_class_active_enrollment_ids(p_occurrence_id uuid)
returns uuid[]
language sql stable security invoker set search_path = '' as $$
  select coalesce(
    pg_catalog.array_agg(enrollment.id order by enrollment.id),
    '{}'::uuid[]
  )
  from public.kitty_class_occurrences occurrence
  join public.kitty_class_enrollments enrollment on (
    enrollment.occurrence_id = occurrence.id
    or (
      enrollment.series_id = occurrence.series_id
      and not exists (
        select 1
        from public.kitty_class_enrollments occurrence_enrollment
        where occurrence_enrollment.occurrence_id = occurrence.id
          and occurrence_enrollment.student_contact_id = enrollment.student_contact_id
      )
    )
  )
  where occurrence.id = p_occurrence_id
    and enrollment.is_active
    and enrollment.active_from <= occurrence.local_date
    and (enrollment.active_until is null or enrollment.active_until >= occurrence.local_date)
$$;

create or replace function public.kitty_class_enrollment_applies_to_occurrence(
  p_enrollment_id uuid,
  p_occurrence_id uuid
) returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1
    from public.kitty_class_enrollments enrollment
    join public.kitty_class_occurrences occurrence on occurrence.id = p_occurrence_id
    where enrollment.id = p_enrollment_id
      and (
        enrollment.occurrence_id = occurrence.id
        or (
          enrollment.series_id = occurrence.series_id
          and not exists (
            select 1
            from public.kitty_class_enrollments occurrence_enrollment
            where occurrence_enrollment.occurrence_id = occurrence.id
              and occurrence_enrollment.student_contact_id = enrollment.student_contact_id
          )
        )
      )
      and enrollment.is_active
      and enrollment.active_from <= occurrence.local_date
      and (enrollment.active_until is null or enrollment.active_until >= occurrence.local_date)
  )
$$;

create function public.kitty_group_change_payload_digest(
  p_occurrence_id uuid,
  p_scope text,
  p_enrollment_id uuid,
  p_change_type text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_timezone text
) returns text
language sql immutable security invoker set search_path = '' as $$
  select pg_catalog.encode(
    public.digest(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'occurrenceId', p_occurrence_id,
          'scope', p_scope,
          'enrollmentId', p_enrollment_id,
          'changeType', p_change_type,
          'startsAt', p_starts_at,
          'endsAt', p_ends_at,
          'timezone', p_timezone
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
$$;

create function public.project_kitty_group_change_result(p_request_id uuid)
returns public.kitty_group_change_result
language sql stable security invoker set search_path = '' as $$
  select request.id, request.occurrence_id, request.change_type, request.scope,
    request.status, request.proposed_starts_at, request.proposed_ends_at,
    request.proposed_timezone, request.payload_digest, request.version,
    request.expires_at, request.replacement_occurrence_id,
    coalesce(pg_catalog.cardinality(request.required_enrollment_ids), 0),
    (
      select pg_catalog.count(*)::integer
      from public.kitty_class_change_confirmations confirmation
      where confirmation.change_request_id = request.id
        and confirmation.request_version = request.version
        and confirmation.decision_side = 'student'
        and confirmation.decision = 'approved'
        and confirmation.payload_digest = request.payload_digest
        and confirmation.enrollment_id = any(request.required_enrollment_ids)
    )
  from public.kitty_class_change_requests request
  where request.id = p_request_id
$$;

create function public.kitty_group_change_actor(
  p_occurrence_id uuid,
  p_contact_id uuid,
  p_scope text,
  p_enrollment_id uuid,
  p_required_enrollment_ids uuid[]
) returns table (decision_side text, enrollment_id uuid)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_occurrence public.kitty_class_occurrences;
  v_is_teacher boolean;
  v_enrollment_ids uuid[];
begin
  select occurrence.* into v_occurrence
  from public.kitty_class_occurrences occurrence
  where occurrence.id = p_occurrence_id;
  if not found then raise exception 'occurrence_unavailable'; end if;

  select exists (
    select 1
    from public.kitty_class_participants participant
    where participant.contact_id = p_contact_id
      and participant.participant_role = 'teacher'
      and participant.decision_side = 'teacher'
      and participant.confirms_reschedule
      and participant.is_active
      and (
        participant.occurrence_id = v_occurrence.id
        or (v_occurrence.series_id is not null and participant.series_id = v_occurrence.series_id)
      )
  ) into v_is_teacher;

  select coalesce(
    pg_catalog.array_agg(distinct enrollment.id order by enrollment.id),
    '{}'::uuid[]
  ) into v_enrollment_ids
  from public.kitty_class_enrollments enrollment
  join public.kitty_class_enrollment_contacts enrollment_contact
    on enrollment_contact.enrollment_id = enrollment.id
  where enrollment.id = any(p_required_enrollment_ids)
    and (p_scope <> 'individual_reschedule' or enrollment.id = p_enrollment_id)
    and enrollment_contact.contact_id = p_contact_id
    and enrollment_contact.is_active
    and enrollment_contact.confirms_reschedule;

  if v_is_teacher and pg_catalog.cardinality(v_enrollment_ids) > 0 then
    raise exception 'decision_actor_ambiguous';
  elsif v_is_teacher then
    return query select 'teacher'::text, null::uuid;
  elsif pg_catalog.cardinality(v_enrollment_ids) > 0 then
    return query
      select 'student'::text, represented_enrollment_id
      from pg_catalog.unnest(v_enrollment_ids) represented_enrollment_id;
  else
    raise exception 'change_not_permitted';
  end if;
end;
$$;

create function public.reserve_kitty_group_change_notifications(
  p_occurrence_id uuid,
  p_change_request_id uuid,
  p_enrollment_ids uuid[],
  p_intent text,
  p_payload jsonb,
  p_idempotency_suffix text,
  p_excluded_contact_id uuid default null
) returns void
language sql volatile security definer set search_path = '' as $$
  with occurrence as (
    select occurrence.*
    from public.kitty_class_occurrences occurrence
    where occurrence.id = p_occurrence_id
  ), recipients as (
    select enrollment_contact.contact_id
    from public.kitty_class_enrollment_contacts enrollment_contact
    where enrollment_contact.enrollment_id = any(p_enrollment_ids)
      and enrollment_contact.is_active
      and enrollment_contact.receives_notifications
    union
    select participant.contact_id
    from occurrence
    join public.kitty_class_participants participant on (
      participant.occurrence_id = occurrence.id
      or (occurrence.series_id is not null and participant.series_id = occurrence.series_id)
    )
    where participant.participant_role = 'teacher'
      and participant.is_active
      and participant.receives_notifications
  )
  insert into public.kitty_class_notification_outbox(
    occurrence_id, change_request_id, contact_id, intent, payload, idempotency_key
  )
  select p_occurrence_id, p_change_request_id, recipient.contact_id, p_intent,
    coalesce(p_payload, '{}'::jsonb),
    'group-change:' || p_change_request_id::text || ':' || p_idempotency_suffix
      || ':' || recipient.contact_id::text || ':' || p_intent
  from recipients recipient
  where p_excluded_contact_id is null or recipient.contact_id <> p_excluded_contact_id
  on conflict (idempotency_key) do nothing
$$;

create function public.finalize_kitty_group_class_change(p_request_id uuid)
returns public.kitty_class_change_requests
language plpgsql security definer set search_path = '' as $$
declare
  v_request public.kitty_class_change_requests;
  v_occurrence public.kitty_class_occurrences;
  v_replacement public.kitty_class_occurrences;
  v_source_enrollment public.kitty_class_enrollments;
  v_replacement_enrollment_id uuid;
  v_teacher_approved boolean;
  v_all_enrollments_approved boolean;
  v_final_enrollment_ids uuid[];
  v_intent text;
  v_teacher_count integer;
begin
  select request.* into v_request
  from public.kitty_class_change_requests request
  where request.id = p_request_id
  for update;
  if not found or v_request.status <> 'ready_to_finalize' or v_request.expires_at <= pg_catalog.now() then
    raise exception 'request_not_finalizable';
  end if;

  select occurrence.* into v_occurrence
  from public.kitty_class_occurrences occurrence
  where occurrence.id = v_request.occurrence_id;
  if not found then raise exception 'occurrence_unavailable'; end if;
  if v_occurrence.series_id is not null then
    perform 1 from public.kitty_class_series series
    where series.id = v_occurrence.series_id for update;
  end if;
  select occurrence.* into v_occurrence
  from public.kitty_class_occurrences occurrence
  where occurrence.id = v_request.occurrence_id
  for update;

  select exists (
    select 1
    from public.kitty_class_change_confirmations confirmation
    where confirmation.change_request_id = v_request.id
      and confirmation.request_version = v_request.version
      and confirmation.decision_side = 'teacher'
      and confirmation.enrollment_id is null
      and confirmation.decision = 'approved'
      and confirmation.payload_digest = v_request.payload_digest
  ) into v_teacher_approved;
  select not exists (
    select 1
    from pg_catalog.unnest(v_request.required_enrollment_ids) required_enrollment_id
    where not exists (
      select 1
      from public.kitty_class_change_confirmations confirmation
      where confirmation.change_request_id = v_request.id
        and confirmation.request_version = v_request.version
        and confirmation.decision_side = 'student'
        and confirmation.enrollment_id = required_enrollment_id
        and confirmation.decision = 'approved'
        and confirmation.payload_digest = v_request.payload_digest
    )
  ) into v_all_enrollments_approved;

  if not v_teacher_approved then raise exception 'teacher_confirmation_required'; end if;
  if v_request.change_type = 'reschedule'
    and (pg_catalog.cardinality(v_request.required_enrollment_ids) = 0 or not v_all_enrollments_approved)
  then
    raise exception 'enrollment_approvals_required';
  end if;

  if v_request.change_type = 'cancel' then
    if v_request.scope <> 'whole_occurrence' then raise exception 'invalid_change_scope'; end if;
    v_final_enrollment_ids := public.kitty_class_active_enrollment_ids(v_occurrence.id);
    update public.kitty_class_occurrences
    set status = 'cancelled', cancelled_at = pg_catalog.now(), version = version + 1
    where id = v_occurrence.id;
    v_intent := 'class_cancelled';
  else
    if v_request.proposed_starts_at is null or v_request.proposed_ends_at is null
      or v_request.proposed_ends_at <= v_request.proposed_starts_at
    then
      raise exception 'replacement_time_required';
    end if;
    v_final_enrollment_ids := v_request.required_enrollment_ids;

    insert into public.kitty_class_occurrences(
      occurrence_key, title, subject, starts_at, ends_at, local_date, timezone,
      predecessor_occurrence_id, origin_channel
    ) values (
      case when v_request.scope = 'individual_reschedule'
        then 'individual-replacement:' else 'group-reschedule:' end || v_request.id::text,
      v_occurrence.title, v_occurrence.subject,
      v_request.proposed_starts_at, v_request.proposed_ends_at,
      (v_request.proposed_starts_at at time zone coalesce(
        v_request.proposed_timezone, v_occurrence.timezone
      ))::date,
      coalesce(v_request.proposed_timezone, v_occurrence.timezone),
      v_occurrence.id, 'system'
    ) returning * into v_replacement;

    select pg_catalog.count(*) into v_teacher_count
    from public.kitty_class_participants participant
    where participant.participant_role = 'teacher'
      and participant.is_active
      and (
        participant.occurrence_id = v_occurrence.id
        or (v_occurrence.series_id is not null and participant.series_id = v_occurrence.series_id)
      );
    if v_teacher_count <> 1 then raise exception 'teacher_required'; end if;
    insert into public.kitty_class_participants(
      occurrence_id, contact_id, participant_role, receives_notifications,
      confirms_cancellation, confirms_reschedule, decision_side, is_active
    )
    select v_replacement.id, participant.contact_id, 'teacher',
      participant.receives_notifications, participant.confirms_cancellation,
      participant.confirms_reschedule, 'teacher', true
    from public.kitty_class_participants participant
    where participant.participant_role = 'teacher'
      and participant.is_active
      and (
        participant.occurrence_id = v_occurrence.id
        or (v_occurrence.series_id is not null and participant.series_id = v_occurrence.series_id)
      );

    for v_source_enrollment in
      select enrollment.*
      from public.kitty_class_enrollments enrollment
      where enrollment.id = any(v_request.required_enrollment_ids)
      order by enrollment.id
      for update
    loop
      insert into public.kitty_class_enrollments(
        occurrence_id, student_contact_id, active_from, active_until, is_active
      ) values (
        v_replacement.id, v_source_enrollment.student_contact_id,
        v_replacement.local_date, v_replacement.local_date, true
      ) returning id into v_replacement_enrollment_id;
      insert into public.kitty_class_enrollment_contacts(
        enrollment_id, contact_id, contact_role, receives_notifications,
        confirms_cancellation, confirms_reschedule, is_active
      )
      select v_replacement_enrollment_id, enrollment_contact.contact_id,
        enrollment_contact.contact_role, enrollment_contact.receives_notifications,
        enrollment_contact.confirms_cancellation,
        enrollment_contact.confirms_reschedule, true
      from public.kitty_class_enrollment_contacts enrollment_contact
      where enrollment_contact.enrollment_id = v_source_enrollment.id
        and enrollment_contact.is_active;
    end loop;

    if v_request.scope = 'whole_occurrence' then
      update public.kitty_class_occurrences
      set status = 'rescheduled', version = version + 1
      where id = v_occurrence.id;
    end if;
    v_intent := 'class_rescheduled';
  end if;

  update public.kitty_class_change_requests
  set status = 'finalized', finalized_at = pg_catalog.now(),
    replacement_occurrence_id = v_replacement.id
  where id = v_request.id
  returning * into v_request;

  perform public.reserve_kitty_group_change_notifications(
    v_occurrence.id, v_request.id, v_final_enrollment_ids, v_intent,
    pg_catalog.jsonb_build_object(
      'occurrenceId', v_occurrence.id,
      'replacementOccurrenceId', v_replacement.id
    ),
    v_request.version::text || ':final', null
  );
  insert into public.kitty_class_audit_events(
    actor_type, event_type, entity_type, entity_id,
    metadata
  ) values (
    'system', 'group_change_finalized', 'change_request', v_request.id,
    pg_catalog.jsonb_build_object(
      'scope', v_request.scope,
      'replacementOccurrenceId', v_replacement.id
    )
  );
  return v_request;
end;
$$;

create function public.request_kitty_group_class_change(
  p_occurrence_id uuid,
  p_expected_occurrence_version integer,
  p_scope text,
  p_enrollment_id uuid,
  p_actor_contact_id uuid,
  p_change_type text,
  p_proposed_starts_at timestamptz,
  p_proposed_ends_at timestamptz,
  p_proposed_timezone text,
  p_selection_token text,
  p_client_request_id text
) returns public.kitty_group_change_result
language plpgsql security definer set search_path = '' as $$
declare
  v_occurrence public.kitty_class_occurrences;
  v_request public.kitty_class_change_requests;
  v_existing_audit public.kitty_class_audit_events;
  v_request_id text := pg_catalog.btrim(p_client_request_id);
  v_selection_digest text;
  v_payload_digest text;
  v_operation_digest text;
  v_required_enrollment_ids uuid[];
  v_side text;
  v_actor_enrollment_ids uuid[];
begin
  if p_occurrence_id is null or p_actor_contact_id is null
    or p_expected_occurrence_version < 1
    or p_scope not in ('individual_reschedule', 'whole_occurrence')
    or p_change_type not in ('cancel', 'reschedule')
    or (p_scope = 'individual_reschedule' and (p_change_type <> 'reschedule' or p_enrollment_id is null))
    or (p_scope = 'whole_occurrence' and p_enrollment_id is not null)
    or (p_change_type = 'cancel' and (p_proposed_starts_at is not null or p_proposed_ends_at is not null))
    or (p_change_type = 'reschedule' and ((p_proposed_starts_at is null) <> (p_proposed_ends_at is null)))
    or (p_proposed_starts_at is not null and p_proposed_ends_at <= p_proposed_starts_at)
    or coalesce(v_request_id, '') = '' or pg_catalog.length(v_request_id) > 200
    or p_selection_token is null or p_selection_token !~ '^[a-f0-9]{64}$'
  then
    raise exception 'invalid_change_scope';
  end if;

  v_selection_digest := pg_catalog.encode(
    public.digest(pg_catalog.convert_to(p_selection_token, 'UTF8'), 'sha256'), 'hex'
  );
  v_payload_digest := public.kitty_group_change_payload_digest(
    p_occurrence_id, p_scope, p_enrollment_id, p_change_type,
    p_proposed_starts_at, p_proposed_ends_at, p_proposed_timezone
  );
  v_operation_digest := pg_catalog.encode(public.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object(
      'expectedOccurrenceVersion', p_expected_occurrence_version,
      'payloadDigest', v_payload_digest,
      'selectionTokenDigest', v_selection_digest
    )::text, 'UTF8'
  ), 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_request_id, 0));
  select audit.* into v_existing_audit
  from public.kitty_class_audit_events audit
  where audit.request_id = v_request_id
  for update;
  if found then
    if v_existing_audit.event_type <> 'group_change_requested'
      or v_existing_audit.actor_contact_id is distinct from p_actor_contact_id
      or v_existing_audit.metadata->>'operationDigest' is distinct from v_operation_digest
    then
      raise exception 'client_request_payload_mismatch';
    end if;
    select request.* into v_request
    from public.kitty_class_change_requests request
    where request.id = v_existing_audit.entity_id;
    if not found then raise exception 'idempotency_target_missing'; end if;
    return public.project_kitty_group_change_result(v_request.id);
  end if;

  select occurrence.* into v_occurrence
  from public.kitty_class_occurrences occurrence
  where occurrence.id = p_occurrence_id;
  if not found then raise exception 'occurrence_unavailable'; end if;
  if v_occurrence.series_id is not null then
    perform 1 from public.kitty_class_series series
    where series.id = v_occurrence.series_id for update;
  end if;
  select occurrence.* into v_occurrence
  from public.kitty_class_occurrences occurrence
  where occurrence.id = p_occurrence_id
  for update;
  if v_occurrence.status <> 'scheduled'
    or v_occurrence.version <> p_expected_occurrence_version
  then
    raise exception 'stale_class';
  end if;

  if not exists (
    select 1
    from public.kitty_class_audit_events selection
    where selection.actor_contact_id = p_actor_contact_id
      and selection.event_type = 'occurrence_selection_confirmed'
      and selection.entity_type = 'occurrence'
      and selection.entity_id = v_occurrence.id
      and selection.metadata->>'selectionTokenDigest' = v_selection_digest
      and (selection.metadata->>'occurrenceVersion')::integer = p_expected_occurrence_version
      and (selection.metadata->>'expiresAt')::timestamptz > pg_catalog.now()
  ) then
    raise exception 'selection_confirmation_required';
  end if;

  if p_change_type = 'cancel' then
    v_required_enrollment_ids := '{}'::uuid[];
    select 'teacher'::text into v_side
    from public.kitty_class_participants participant
    where participant.contact_id = p_actor_contact_id
      and participant.participant_role = 'teacher'
      and participant.decision_side = 'teacher'
      and participant.confirms_cancellation
      and participant.is_active
      and (
        participant.occurrence_id = v_occurrence.id
        or (v_occurrence.series_id is not null and participant.series_id = v_occurrence.series_id)
      )
    limit 1;
    if v_side is null then raise exception 'teacher_confirmation_required'; end if;
    v_actor_enrollment_ids := '{}'::uuid[];
  else
    if p_scope = 'individual_reschedule' then
      if not public.kitty_class_enrollment_applies_to_occurrence(p_enrollment_id, v_occurrence.id) then
        raise exception 'change_not_permitted';
      end if;
      v_required_enrollment_ids := array[p_enrollment_id]::uuid[];
    else
      v_required_enrollment_ids := public.kitty_class_active_enrollment_ids(v_occurrence.id);
    end if;
    if pg_catalog.cardinality(v_required_enrollment_ids) = 0 then
      raise exception 'enrollment_approvals_required';
    end if;
    select pg_catalog.min(actor.decision_side),
      coalesce(
        pg_catalog.array_agg(actor.enrollment_id order by actor.enrollment_id)
          filter (where actor.enrollment_id is not null),
        '{}'::uuid[]
      ) into v_side, v_actor_enrollment_ids
    from public.kitty_group_change_actor(
      v_occurrence.id, p_actor_contact_id, p_scope,
      p_enrollment_id, v_required_enrollment_ids
    ) actor;
  end if;

  insert into public.kitty_class_change_requests(
    occurrence_id, change_type, requested_by_contact_id, requester_side,
    proposed_starts_at, proposed_ends_at, proposed_timezone, status,
    payload_digest, scope, enrollment_id, required_enrollment_ids
  ) values (
    v_occurrence.id, p_change_type, p_actor_contact_id, v_side,
    p_proposed_starts_at, p_proposed_ends_at,
    coalesce(p_proposed_timezone, v_occurrence.timezone),
    case
      when p_change_type = 'cancel' then 'ready_to_finalize'
      when p_proposed_starts_at is null then 'collecting_alternatives'
      else 'awaiting_counterparty'
    end,
    v_payload_digest, p_scope, p_enrollment_id, v_required_enrollment_ids
  ) returning * into v_request;

  if v_side = 'teacher' then
    insert into public.kitty_class_change_confirmations(
      change_request_id, request_version, decision_side, enrollment_id,
      decided_by_contact_id, decision, payload_digest, source_channel, decided_at
    ) values (
      v_request.id, v_request.version, 'teacher', null,
      p_actor_contact_id, 'approved', v_request.payload_digest, 'whatsapp', pg_catalog.now()
    );
  else
    insert into public.kitty_class_change_confirmations(
      change_request_id, request_version, decision_side, enrollment_id,
      decided_by_contact_id, decision, payload_digest, source_channel, decided_at
    )
    select v_request.id, v_request.version, 'student', actor_enrollment_id,
      p_actor_contact_id, 'approved', v_request.payload_digest, 'whatsapp', pg_catalog.now()
    from pg_catalog.unnest(v_actor_enrollment_ids) actor_enrollment_id;
  end if;

  if p_scope = 'whole_occurrence' and p_change_type = 'reschedule' then
    update public.kitty_class_occurrences
    set status = 'change_requested', version = version + 1
    where id = v_occurrence.id;
  end if;

  if p_change_type = 'cancel' then
    select finalized.* into v_request
    from public.finalize_kitty_group_class_change(v_request.id) finalized;
  else
    perform public.reserve_kitty_group_change_notifications(
      v_occurrence.id, v_request.id, v_required_enrollment_ids,
      case when p_proposed_starts_at is null
        then 'class_change_request' else 'class_change_proposal' end,
      pg_catalog.jsonb_build_object('occurrenceId', v_occurrence.id),
      v_request.version::text || ':requested', p_actor_contact_id
    );
  end if;

  insert into public.kitty_class_audit_events(
    actor_type, actor_contact_id, event_type, entity_type, entity_id,
    request_id, metadata
  ) values (
    'contact', p_actor_contact_id, 'group_change_requested',
    'change_request', v_request.id, v_request_id,
    pg_catalog.jsonb_build_object(
      'payloadDigest', v_payload_digest,
      'operationDigest', v_operation_digest,
      'scope', p_scope,
      'occurrenceId', v_occurrence.id
    )
  );
  return public.project_kitty_group_change_result(v_request.id);
end;
$$;

create function public.propose_kitty_group_class_change(
  p_request_id uuid,
  p_request_version integer,
  p_payload_digest text,
  p_actor_contact_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_timezone text,
  p_client_request_id text
) returns public.kitty_group_change_result
language plpgsql security definer set search_path = '' as $$
declare
  v_request public.kitty_class_change_requests;
  v_occurrence public.kitty_class_occurrences;
  v_existing_audit public.kitty_class_audit_events;
  v_request_id text := pg_catalog.btrim(p_client_request_id);
  v_operation_digest text;
  v_new_payload_digest text;
  v_side text;
  v_actor_enrollment_ids uuid[];
begin
  if p_request_id is null or p_actor_contact_id is null or p_request_version < 1
    or p_payload_digest !~ '^[a-f0-9]{64}$'
    or p_starts_at is null or p_ends_at <= p_starts_at
    or coalesce(v_request_id, '') = '' or pg_catalog.length(v_request_id) > 200
  then
    raise exception 'invalid_payload';
  end if;
  v_operation_digest := pg_catalog.encode(public.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object(
      'operation', 'propose', 'requestId', p_request_id,
      'requestVersion', p_request_version, 'payloadDigest', p_payload_digest,
      'actorContactId', p_actor_contact_id, 'startsAt', p_starts_at,
      'endsAt', p_ends_at, 'timezone', p_timezone
    )::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_request_id, 0));
  select audit.* into v_existing_audit
  from public.kitty_class_audit_events audit
  where audit.request_id = v_request_id
  for update;
  if found then
    if v_existing_audit.event_type <> 'group_change_proposed'
      or v_existing_audit.actor_contact_id is distinct from p_actor_contact_id
      or v_existing_audit.metadata->>'payloadDigest' is distinct from v_operation_digest
    then raise exception 'client_request_payload_mismatch'; end if;
    select request.* into v_request from public.kitty_class_change_requests request
    where request.id = v_existing_audit.entity_id;
    if not found then raise exception 'idempotency_target_missing'; end if;
    return public.project_kitty_group_change_result(v_request.id);
  end if;

  select request.* into v_request
  from public.kitty_class_change_requests request
  where request.id = p_request_id
  for update;
  if not found or v_request.change_type <> 'reschedule'
    or v_request.status not in ('awaiting_counterparty', 'collecting_alternatives')
    or v_request.expires_at <= pg_catalog.now()
  then raise exception 'request_unavailable'; end if;
  if v_request.version <> p_request_version
    or v_request.payload_digest <> p_payload_digest
  then raise exception 'stale_change_request'; end if;

  select occurrence.* into v_occurrence
  from public.kitty_class_occurrences occurrence
  where occurrence.id = v_request.occurrence_id;
  if v_occurrence.series_id is not null then
    perform 1 from public.kitty_class_series series
    where series.id = v_occurrence.series_id for update;
  end if;
  perform 1 from public.kitty_class_occurrences occurrence
  where occurrence.id = v_request.occurrence_id for update;

  select pg_catalog.min(actor.decision_side),
    coalesce(
      pg_catalog.array_agg(actor.enrollment_id order by actor.enrollment_id)
        filter (where actor.enrollment_id is not null),
      '{}'::uuid[]
    ) into v_side, v_actor_enrollment_ids
  from public.kitty_group_change_actor(
    v_request.occurrence_id, p_actor_contact_id, v_request.scope,
    v_request.enrollment_id, v_request.required_enrollment_ids
  ) actor;

  v_new_payload_digest := public.kitty_group_change_payload_digest(
    v_request.occurrence_id, v_request.scope, v_request.enrollment_id,
    v_request.change_type, p_starts_at, p_ends_at,
    coalesce(p_timezone, v_occurrence.timezone)
  );
  update public.kitty_class_change_requests
  set proposed_starts_at = p_starts_at, proposed_ends_at = p_ends_at,
    proposed_timezone = coalesce(p_timezone, v_occurrence.timezone),
    requester_side = v_side, status = 'awaiting_counterparty',
    version = version + 1, payload_digest = v_new_payload_digest
  where id = v_request.id
  returning * into v_request;

  if v_side = 'teacher' then
    insert into public.kitty_class_change_confirmations(
      change_request_id, request_version, decision_side, enrollment_id,
      decided_by_contact_id, decision, payload_digest, source_channel, decided_at
    ) values (
      v_request.id, v_request.version, 'teacher', null,
      p_actor_contact_id, 'approved', v_request.payload_digest, 'whatsapp', pg_catalog.now()
    );
  else
    insert into public.kitty_class_change_confirmations(
      change_request_id, request_version, decision_side, enrollment_id,
      decided_by_contact_id, decision, payload_digest, source_channel, decided_at
    )
    select v_request.id, v_request.version, 'student', actor_enrollment_id,
      p_actor_contact_id, 'approved', v_request.payload_digest, 'whatsapp', pg_catalog.now()
    from pg_catalog.unnest(v_actor_enrollment_ids) actor_enrollment_id;
  end if;

  perform public.reserve_kitty_group_change_notifications(
    v_request.occurrence_id, v_request.id, v_request.required_enrollment_ids,
    'class_change_proposal',
    pg_catalog.jsonb_build_object('occurrenceId', v_request.occurrence_id),
    v_request.version::text || ':proposed', p_actor_contact_id
  );
  insert into public.kitty_class_audit_events(
    actor_type, actor_contact_id, event_type, entity_type, entity_id,
    request_id, metadata
  ) values (
    'contact', p_actor_contact_id, 'group_change_proposed',
    'change_request', v_request.id, v_request_id,
    pg_catalog.jsonb_build_object('payloadDigest', v_operation_digest)
  );
  return public.project_kitty_group_change_result(v_request.id);
end;
$$;

create function public.decide_kitty_group_class_change(
  p_request_id uuid,
  p_request_version integer,
  p_payload_digest text,
  p_actor_contact_id uuid,
  p_decision text,
  p_provider_message_id text,
  p_client_request_id text
) returns public.kitty_group_change_result
language plpgsql security definer set search_path = '' as $$
declare
  v_request public.kitty_class_change_requests;
  v_occurrence public.kitty_class_occurrences;
  v_existing_audit public.kitty_class_audit_events;
  v_request_id text := pg_catalog.btrim(p_client_request_id);
  v_operation_digest text;
  v_side text;
  v_actor_enrollment_ids uuid[];
  v_teacher_approved boolean;
  v_all_enrollments_approved boolean;
begin
  if p_request_id is null or p_actor_contact_id is null or p_request_version < 1
    or p_payload_digest !~ '^[a-f0-9]{64}$'
    or p_decision not in ('approved', 'rejected')
    or coalesce(v_request_id, '') = '' or pg_catalog.length(v_request_id) > 200
  then raise exception 'invalid_payload'; end if;
  v_operation_digest := pg_catalog.encode(public.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object(
      'operation', 'decide', 'requestId', p_request_id,
      'requestVersion', p_request_version, 'payloadDigest', p_payload_digest,
      'actorContactId', p_actor_contact_id, 'decision', p_decision,
      'providerMessageId', p_provider_message_id
    )::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_request_id, 0));
  select audit.* into v_existing_audit
  from public.kitty_class_audit_events audit
  where audit.request_id = v_request_id
  for update;
  if found then
    if v_existing_audit.event_type <> 'group_change_decided'
      or v_existing_audit.actor_contact_id is distinct from p_actor_contact_id
      or v_existing_audit.metadata->>'payloadDigest' is distinct from v_operation_digest
    then raise exception 'client_request_payload_mismatch'; end if;
    select request.* into v_request from public.kitty_class_change_requests request
    where request.id = v_existing_audit.entity_id;
    if not found then raise exception 'idempotency_target_missing'; end if;
    return public.project_kitty_group_change_result(v_request.id);
  end if;

  select request.* into v_request
  from public.kitty_class_change_requests request
  where request.id = p_request_id
  for update;
  if not found or v_request.status not in ('awaiting_counterparty', 'collecting_alternatives')
    or v_request.expires_at <= pg_catalog.now()
  then raise exception 'request_unavailable'; end if;
  if v_request.version <> p_request_version or v_request.payload_digest <> p_payload_digest
  then raise exception 'stale_change_request'; end if;

  select occurrence.* into v_occurrence
  from public.kitty_class_occurrences occurrence
  where occurrence.id = v_request.occurrence_id;
  if v_occurrence.series_id is not null then
    perform 1 from public.kitty_class_series series
    where series.id = v_occurrence.series_id for update;
  end if;
  perform 1 from public.kitty_class_occurrences occurrence
  where occurrence.id = v_request.occurrence_id for update;

  select pg_catalog.min(actor.decision_side),
    coalesce(
      pg_catalog.array_agg(actor.enrollment_id order by actor.enrollment_id)
        filter (where actor.enrollment_id is not null),
      '{}'::uuid[]
    ) into v_side, v_actor_enrollment_ids
  from public.kitty_group_change_actor(
    v_request.occurrence_id, p_actor_contact_id, v_request.scope,
    v_request.enrollment_id, v_request.required_enrollment_ids
  ) actor;

  if v_side = 'teacher' then
    insert into public.kitty_class_change_confirmations(
      change_request_id, request_version, decision_side, enrollment_id,
      decided_by_contact_id, decision, payload_digest, source_channel,
      provider_message_id, decided_at
    ) values (
      v_request.id, v_request.version, 'teacher', null,
      p_actor_contact_id, p_decision, v_request.payload_digest, 'whatsapp',
      p_provider_message_id, pg_catalog.now()
    ) on conflict (change_request_id, request_version)
      where decision_side = 'teacher' and enrollment_id is null
    do update set decided_by_contact_id = excluded.decided_by_contact_id,
      decision = excluded.decision, payload_digest = excluded.payload_digest,
      provider_message_id = excluded.provider_message_id,
      decided_at = pg_catalog.now(), updated_at = pg_catalog.now();
  else
    insert into public.kitty_class_change_confirmations(
      change_request_id, request_version, decision_side, enrollment_id,
      decided_by_contact_id, decision, payload_digest, source_channel,
      provider_message_id, decided_at
    )
    select v_request.id, v_request.version, 'student', actor_enrollment_id,
      p_actor_contact_id, p_decision, v_request.payload_digest, 'whatsapp',
      p_provider_message_id, pg_catalog.now()
    from pg_catalog.unnest(v_actor_enrollment_ids) actor_enrollment_id
    on conflict (change_request_id, request_version, enrollment_id)
      where decision_side = 'student' and enrollment_id is not null
    do update set decided_by_contact_id = excluded.decided_by_contact_id,
      decision = excluded.decision, payload_digest = excluded.payload_digest,
      provider_message_id = excluded.provider_message_id,
      decided_at = pg_catalog.now(), updated_at = pg_catalog.now();
  end if;

  if p_decision = 'rejected' then
    update public.kitty_class_change_requests
    set status = 'rejected', finalized_at = pg_catalog.now()
    where id = v_request.id returning * into v_request;
    if v_request.scope = 'whole_occurrence' then
      update public.kitty_class_occurrences
      set status = 'scheduled', version = version + 1
      where id = v_request.occurrence_id and status = 'change_requested';
    end if;
    perform public.reserve_kitty_group_change_notifications(
      v_request.occurrence_id, v_request.id, v_request.required_enrollment_ids,
      'class_change_rejected',
      pg_catalog.jsonb_build_object('occurrenceId', v_request.occurrence_id),
      v_request.version::text || ':rejected', null
    );
  else
    select exists (
      select 1 from public.kitty_class_change_confirmations confirmation
      where confirmation.change_request_id = v_request.id
        and confirmation.request_version = v_request.version
        and confirmation.decision_side = 'teacher'
        and confirmation.enrollment_id is null
        and confirmation.decision = 'approved'
        and confirmation.payload_digest = v_request.payload_digest
    ) into v_teacher_approved;
    select not exists (
      select 1
      from pg_catalog.unnest(v_request.required_enrollment_ids) required_enrollment_id
      where not exists (
        select 1 from public.kitty_class_change_confirmations confirmation
        where confirmation.change_request_id = v_request.id
          and confirmation.request_version = v_request.version
          and confirmation.decision_side = 'student'
          and confirmation.enrollment_id = required_enrollment_id
          and confirmation.decision = 'approved'
          and confirmation.payload_digest = v_request.payload_digest
      )
    ) into v_all_enrollments_approved;
    if v_teacher_approved and v_all_enrollments_approved then
      update public.kitty_class_change_requests
      set status = 'ready_to_finalize'
      where id = v_request.id returning * into v_request;
      select finalized.* into v_request
      from public.finalize_kitty_group_class_change(v_request.id) finalized;
    end if;
  end if;

  insert into public.kitty_class_audit_events(
    actor_type, actor_contact_id, event_type, entity_type, entity_id,
    request_id, metadata
  ) values (
    'contact', p_actor_contact_id, 'group_change_decided',
    'change_request', v_request.id, v_request_id,
    pg_catalog.jsonb_build_object('payloadDigest', v_operation_digest)
  );
  return public.project_kitty_group_change_result(v_request.id);
end;
$$;

drop function public.find_my_pending_kitty_class_changes(uuid, text);

create function public.find_my_pending_kitty_class_changes(
  p_contact_id uuid,
  p_reference_code text default null
) returns table (
  id uuid, occurrence_id uuid, change_type text, status text,
  proposed_starts_at timestamptz, proposed_ends_at timestamptz,
  proposed_timezone text, payload_digest text, version integer,
  expires_at timestamptz, required_enrollment_approvals integer,
  received_enrollment_approvals integer
)
language sql stable security definer set search_path = '' as $$
  select request.id, request.occurrence_id, request.change_type, request.status,
    request.proposed_starts_at, request.proposed_ends_at,
    request.proposed_timezone, request.payload_digest, request.version,
    request.expires_at,
    coalesce(pg_catalog.cardinality(request.required_enrollment_ids), 0),
    (
      select pg_catalog.count(*)::integer
      from public.kitty_class_change_confirmations confirmation
      where confirmation.change_request_id = request.id
        and confirmation.request_version = request.version
        and confirmation.decision_side = 'student'
        and confirmation.decision = 'approved'
        and confirmation.payload_digest = request.payload_digest
        and confirmation.enrollment_id = any(request.required_enrollment_ids)
    )
  from public.kitty_class_change_requests request
  join public.kitty_class_occurrences occurrence
    on occurrence.id = request.occurrence_id
  where request.status in (
      'awaiting_counterparty', 'collecting_alternatives', 'ready_to_finalize'
    )
    and request.expires_at > pg_catalog.now()
    and (
      p_reference_code is null
      or pg_catalog.upper(pg_catalog.left(
        pg_catalog.replace(request.id::text, '-', ''), 6
      )) = pg_catalog.upper(p_reference_code)
    )
    and (
      exists (
        select 1
        from public.kitty_class_participants participant
        where participant.contact_id = p_contact_id
          and participant.participant_role = 'teacher'
          and participant.is_active
          and (
            participant.occurrence_id = occurrence.id
            or (occurrence.series_id is not null and participant.series_id = occurrence.series_id)
          )
      )
      or exists (
        select 1
        from public.kitty_class_enrollment_contacts enrollment_contact
        where enrollment_contact.contact_id = p_contact_id
          and enrollment_contact.is_active
          and enrollment_contact.enrollment_id = any(
            case when request.scope = 'individual_reschedule'
              then array[request.enrollment_id]::uuid[]
              else request.required_enrollment_ids
            end
          )
      )
    )
  order by request.created_at desc
  limit 20
$$;

revoke execute on function public.kitty_group_change_payload_digest(uuid, text, uuid, text, timestamptz, timestamptz, text) from public, anon, authenticated, service_role;
revoke execute on function public.project_kitty_group_change_result(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.kitty_group_change_actor(uuid, uuid, text, uuid, uuid[]) from public, anon, authenticated, service_role;
revoke execute on function public.reserve_kitty_group_change_notifications(uuid, uuid, uuid[], text, jsonb, text, uuid) from public, anon, authenticated, service_role;
revoke execute on function public.finalize_kitty_group_class_change(uuid) from public, anon, authenticated, service_role;

revoke execute on function public.request_kitty_group_class_change(uuid, integer, text, uuid, uuid, text, timestamptz, timestamptz, text, text, text) from public, anon, authenticated;
revoke execute on function public.propose_kitty_group_class_change(uuid, integer, text, uuid, timestamptz, timestamptz, text, text) from public, anon, authenticated;
revoke execute on function public.decide_kitty_group_class_change(uuid, integer, text, uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.find_my_pending_kitty_class_changes(uuid, text) from public, anon, authenticated;

revoke execute on function public.request_kitty_class_change(uuid, text, uuid, text, text, timestamptz, timestamptz, text, text) from public, anon, authenticated, service_role;
revoke execute on function public.propose_kitty_class_replacement(uuid, integer, text, uuid, timestamptz, timestamptz, text, text) from public, anon, authenticated, service_role;
revoke execute on function public.decide_kitty_class_change(uuid, integer, text, uuid, text, text) from public, anon, authenticated, service_role;
revoke execute on function public.finalize_kitty_class_change(uuid, integer, text) from public, anon, authenticated, service_role;

revoke usage on type public.kitty_group_change_result from public, anon, authenticated;
grant usage on type public.kitty_group_change_result to service_role;

grant execute on function public.request_kitty_group_class_change(uuid, integer, text, uuid, uuid, text, timestamptz, timestamptz, text, text, text) to service_role;
grant execute on function public.propose_kitty_group_class_change(uuid, integer, text, uuid, timestamptz, timestamptz, text, text) to service_role;
grant execute on function public.decide_kitty_group_class_change(uuid, integer, text, uuid, text, text, text) to service_role;
grant execute on function public.find_my_pending_kitty_class_changes(uuid, text) to service_role;

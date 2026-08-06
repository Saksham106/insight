create index kitty_class_open_ambiguity_actor_idx
  on public.kitty_class_audit_events(actor_contact_id, created_at desc)
  where event_type = 'class_scope_ambiguity_opened';

create function public.record_kitty_class_scope_ambiguity(
  p_actor_contact_id uuid,
  p_candidate_occurrence_ids uuid[],
  p_ambiguity_kind text,
  p_client_request_id text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate_ids uuid[];
  v_request_id text := pg_catalog.btrim(p_client_request_id);
  v_payload jsonb;
  v_payload_digest text;
  v_request_scope_digest text;
  v_existing_digest text;
begin
  select pg_catalog.array_agg(candidate_id order by candidate_id)
  into v_candidate_ids
  from (
    select distinct candidate_id
    from pg_catalog.unnest(p_candidate_occurrence_ids) candidate(candidate_id)
    where candidate_id is not null
  ) normalized;

  if p_actor_contact_id is null
    or p_ambiguity_kind not in ('class', 'scope')
    or v_request_id is null
    or pg_catalog.length(v_request_id) not between 1 and 200
    or coalesce(pg_catalog.cardinality(v_candidate_ids), 0) not between 1 and 5
    or pg_catalog.cardinality(v_candidate_ids) <> pg_catalog.cardinality(p_candidate_occurrence_ids)
  then
    raise exception 'invalid_ambiguity';
  end if;

  if not exists (
    select 1 from public.hermes_contacts contact
    where contact.id = p_actor_contact_id
      and contact.is_active
      and contact.deleted_at is null
  ) or exists (
    select 1
    from pg_catalog.unnest(v_candidate_ids) candidate(occurrence_id)
    where not exists (
      select 1
      from public.kitty_class_occurrences occurrence
      where occurrence.id = candidate.occurrence_id
        and occurrence.status in ('scheduled', 'change_requested')
        and (
          exists (
            select 1
            from public.kitty_class_participants participant
            where participant.contact_id = p_actor_contact_id
              and participant.participant_role = 'teacher'
              and participant.is_active
              and (
                participant.occurrence_id = occurrence.id
                or participant.series_id = occurrence.series_id
              )
          )
          or exists (
            select 1
            from public.kitty_class_enrollment_contacts enrollment_contact
            join public.kitty_class_enrollments enrollment
              on enrollment.id = enrollment_contact.enrollment_id
            where enrollment_contact.contact_id = p_actor_contact_id
              and enrollment_contact.is_active
              and enrollment.is_active
              and public.kitty_class_enrollment_applies_to_occurrence(
                enrollment.id, occurrence.id
              )
          )
        )
    )
  ) then
    raise exception 'ambiguity_not_permitted';
  end if;

  v_payload := pg_catalog.jsonb_build_object(
    'actorContactId', p_actor_contact_id,
    'ambiguityKind', p_ambiguity_kind,
    'candidateOccurrenceIds', pg_catalog.to_jsonb(v_candidate_ids)
  );
  v_payload_digest := pg_catalog.encode(
    public.digest(pg_catalog.convert_to(v_payload::text, 'UTF8'), 'sha256'), 'hex'
  );
  v_request_scope_digest := pg_catalog.encode(
    public.digest(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'actorContactId', p_actor_contact_id,
          'clientRequestId', v_request_id
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_request_scope_digest, 0)
  );
  select audit.metadata->>'payloadDigest' into v_existing_digest
  from public.kitty_class_audit_events audit
  where audit.actor_contact_id = p_actor_contact_id
    and audit.metadata->>'ambiguityRequestDigest' = v_request_scope_digest
  order by audit.created_at
  limit 1;
  if found then
    if v_existing_digest <> v_payload_digest then
      raise exception 'client_request_payload_mismatch';
    end if;
    return pg_catalog.jsonb_build_object(
      'status', 'duplicate', 'candidateCount', pg_catalog.cardinality(v_candidate_ids)
    );
  end if;

  if exists (
    select 1
    from public.kitty_class_audit_events audit
    where audit.actor_contact_id = p_actor_contact_id
      and audit.event_type = 'class_scope_ambiguity_opened'
      and audit.metadata->>'payloadDigest' = v_payload_digest
      and audit.created_at >= pg_catalog.now() - interval '15 minutes'
  ) then
    return pg_catalog.jsonb_build_object(
      'status', 'suppressed', 'candidateCount', pg_catalog.cardinality(v_candidate_ids)
    );
  end if;

  insert into public.kitty_class_audit_events(
    actor_type, actor_contact_id, event_type, entity_type, entity_id,
    request_id, metadata
  )
  select 'contact', p_actor_contact_id, 'class_scope_ambiguity_opened',
    'occurrence', candidate.occurrence_id,
    'class-ambiguity:' || v_request_scope_digest || ':' || candidate.occurrence_id::text,
    pg_catalog.jsonb_build_object(
      'ambiguityKind', p_ambiguity_kind,
      'ambiguityRequestDigest', v_request_scope_digest,
      'payloadDigest', v_payload_digest,
      'expiresAt', pg_catalog.now() + interval '48 hours'
    )
  from pg_catalog.unnest(v_candidate_ids) candidate(occurrence_id);

  return pg_catalog.jsonb_build_object(
    'status', 'opened', 'candidateCount', pg_catalog.cardinality(v_candidate_ids)
  );
end;
$$;

create function public.resolve_kitty_class_scope_ambiguities(
  p_actor_contact_id uuid,
  p_occurrence_id uuid
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resolved integer;
begin
  if p_actor_contact_id is null or p_occurrence_id is null then
    raise exception 'invalid_ambiguity';
  end if;

  with ambiguity_keys as (
    select distinct audit.metadata->>'ambiguityRequestDigest' as request_digest
    from public.kitty_class_audit_events audit
    where audit.actor_contact_id = p_actor_contact_id
      and audit.event_type = 'class_scope_ambiguity_opened'
      and audit.entity_type = 'occurrence'
      and audit.entity_id = p_occurrence_id
      and audit.created_at >= pg_catalog.now() - interval '48 hours'
  ), resolved as (
    update public.kitty_class_audit_events audit
    set event_type = 'class_scope_ambiguity_resolved',
      metadata = audit.metadata || pg_catalog.jsonb_build_object(
        'resolvedAt', pg_catalog.now(),
        'resolvedOccurrenceId', p_occurrence_id
      )
    where audit.actor_contact_id = p_actor_contact_id
      and audit.event_type = 'class_scope_ambiguity_opened'
      and audit.metadata->>'ambiguityRequestDigest' in (
        select ambiguity_keys.request_digest from ambiguity_keys
      )
    returning 1
  )
  select pg_catalog.count(*)::integer into v_resolved from resolved;
  return v_resolved;
end;
$$;

create function public.get_kitty_class_admin_attention_issues(
  p_reference_at timestamptz default pg_catalog.now(),
  p_limit integer default 200
) returns table (
  source_id uuid,
  occurrence_id uuid,
  series_id uuid,
  kind text
)
language sql
stable
security definer
set search_path = ''
as $$
  with change_issues as (
    select request.id as source_id, request.occurrence_id, null::uuid as series_id,
      case request.status
        when 'expired' then 'expired_request'
        else 'rejected_proposal'
      end as kind,
      request.updated_at as happened_at
    from public.kitty_class_change_requests request
    where request.status in ('expired', 'rejected')
    order by request.updated_at desc, request.id desc
    limit 100
  ), ambiguity_issues as (
    select audit.id as source_id, audit.entity_id as occurrence_id,
      null::uuid as series_id, 'ambiguous_scope'::text as kind,
      audit.created_at as happened_at
    from public.kitty_class_audit_events audit
    join public.kitty_class_occurrences occurrence
      on occurrence.id = audit.entity_id
    where audit.event_type = 'class_scope_ambiguity_opened'
      and audit.entity_type = 'occurrence'
      and audit.created_at >= p_reference_at - interval '48 hours'
      and occurrence.status in ('scheduled', 'change_requested')
    order by audit.created_at desc, audit.id desc
    limit 100
  ), missing_decision_makers as (
    select enrollment.id as source_id,
      enrollment.occurrence_id,
      enrollment.series_id,
      'missing_decision_maker'::text as kind,
      enrollment.updated_at as happened_at
    from public.kitty_class_enrollments enrollment
    where enrollment.is_active
      and (
        (
          enrollment.occurrence_id is not null
          and exists (
            select 1 from public.kitty_class_occurrences occurrence
            where occurrence.id = enrollment.occurrence_id
              and occurrence.status in ('scheduled', 'change_requested')
              and occurrence.ends_at >= p_reference_at
              and enrollment.active_from <= occurrence.local_date
              and (enrollment.active_until is null or enrollment.active_until >= occurrence.local_date)
          )
        )
        or (
          enrollment.series_id is not null
          and exists (
            select 1 from public.kitty_class_series series
            where series.id = enrollment.series_id and series.status = 'active'
          )
          and exists (
            select 1 from public.kitty_class_occurrences occurrence
            where occurrence.series_id = enrollment.series_id
              and occurrence.status in ('scheduled', 'change_requested')
              and occurrence.ends_at >= p_reference_at
              and public.kitty_class_enrollment_applies_to_occurrence(
                enrollment.id, occurrence.id
              )
          )
        )
      )
      and not exists (
        select 1
        from public.kitty_class_enrollment_contacts enrollment_contact
        join public.hermes_contacts contact
          on contact.id = enrollment_contact.contact_id
        where enrollment_contact.enrollment_id = enrollment.id
          and enrollment_contact.is_active
          and enrollment_contact.confirms_reschedule
          and contact.is_active
          and contact.deleted_at is null
      )
    order by enrollment.updated_at desc, enrollment.id desc
    limit 100
  )
  select combined.source_id, combined.occurrence_id, combined.series_id, combined.kind
  from (
    select * from change_issues
    union all
    select * from ambiguity_issues
    union all
    select * from missing_decision_makers
  ) combined
  where p_limit between 1 and 500
  order by combined.happened_at desc, combined.source_id desc
  limit p_limit
$$;

revoke execute on function public.record_kitty_class_scope_ambiguity(uuid, uuid[], text, text)
  from public, anon, authenticated;
revoke execute on function public.resolve_kitty_class_scope_ambiguities(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.get_kitty_class_admin_attention_issues(timestamptz, integer)
  from public, anon, authenticated;

grant execute on function public.record_kitty_class_scope_ambiguity(uuid, uuid[], text, text)
  to service_role;
grant execute on function public.resolve_kitty_class_scope_ambiguities(uuid, uuid)
  to service_role;
grant execute on function public.get_kitty_class_admin_attention_issues(timestamptz, integer)
  to service_role;

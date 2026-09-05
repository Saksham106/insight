-- Correct published fee statements without mutating their financial snapshots.
-- The original is revoked and linked to a newly validated immutable statement in one transaction.

alter table public.academy_fee_statements
  add column if not exists replaces_statement_id uuid references public.academy_fee_statements(id) on delete restrict,
  add column if not exists replaced_by_statement_id uuid references public.academy_fee_statements(id) on delete restrict,
  add column if not exists replacement_request_digest text
    check (replacement_request_digest is null or replacement_request_digest ~ '^[a-f0-9]{64}$');

create unique index if not exists academy_fee_statements_replaces_unique
  on public.academy_fee_statements(replaces_statement_id)
  where replaces_statement_id is not null;

create unique index if not exists academy_fee_statements_replaced_by_unique
  on public.academy_fee_statements(replaced_by_statement_id)
  where replaced_by_statement_id is not null;

create or replace function public.replace_academy_fee_statement(
  p_statement_id uuid,
  p_correction_reason text,
  p_public_token_hash text,
  p_student_name text,
  p_billed_to_name text,
  p_period_start date,
  p_period_end date,
  p_due_date date,
  p_currency text,
  p_total_minor bigint,
  p_line_items jsonb,
  p_source_channel text,
  p_actor_profile_id uuid,
  p_actor_identifier_hash text,
  p_client_request_id text
)
returns public.academy_fee_statements
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_original public.academy_fee_statements;
  v_replacement public.academy_fee_statements;
  v_replacement_digest text;
  v_candidates uuid[];
begin
  if nullif(pg_catalog.btrim(p_correction_reason), '') is null
    or length(pg_catalog.btrim(p_correction_reason)) > 240 then
    raise exception 'invalid_fee_statement_replacement';
  end if;

  select * into v_replacement
  from public.academy_fee_statements
  where client_request_id = p_client_request_id
    and public_token_hash = p_public_token_hash;

  if found then
    if v_replacement.replaces_statement_id is null then
      raise exception 'fee_statement_replacement_conflict';
    end if;
    if p_statement_id is not null and p_statement_id <> v_replacement.replaces_statement_id then
      raise exception 'fee_statement_identity_mismatch';
    end if;
    p_statement_id := v_replacement.replaces_statement_id;
  elsif p_statement_id is null then
    select array_agg(candidate.id order by candidate.issued_at)
    into v_candidates
    from (
      select id, issued_at
      from public.academy_fee_statements
      where status = 'published'
        and student_name = pg_catalog.btrim(p_student_name)
        and billed_to_name is not distinct from nullif(pg_catalog.btrim(p_billed_to_name), '')
        and period_start = p_period_start
        and period_end = p_period_end
        and due_date is not distinct from p_due_date
        and currency = p_currency
      order by issued_at
      limit 2
    ) as candidate;

    if coalesce(cardinality(v_candidates), 0) <> 1 then
      raise exception 'fee_statement_selector_ambiguous';
    end if;
    p_statement_id := v_candidates[1];
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_statement_id::text, 0));
  select * into v_original
  from public.academy_fee_statements
  where id = p_statement_id
  for update;

  if not found then
    raise exception 'fee_statement_not_found';
  end if;

  if v_original.student_name <> pg_catalog.btrim(p_student_name)
    or v_original.billed_to_name is distinct from nullif(pg_catalog.btrim(p_billed_to_name), '')
    or v_original.period_start <> p_period_start
    or v_original.period_end <> p_period_end
    or v_original.due_date is distinct from p_due_date
    or v_original.currency <> p_currency then
    raise exception 'fee_statement_identity_mismatch';
  end if;

  v_replacement_digest := encode(public.digest(pg_catalog.convert_to(jsonb_build_object(
    'statementId', p_statement_id,
    'correctionReason', pg_catalog.btrim(p_correction_reason),
    'clientRequestId', p_client_request_id
  )::text, 'UTF8'), 'sha256'), 'hex');

  select * into v_replacement
  from public.create_academy_fee_statement(
    p_public_token_hash,
    p_student_name,
    p_billed_to_name,
    p_period_start,
    p_period_end,
    p_due_date,
    p_currency,
    p_total_minor,
    p_line_items,
    p_source_channel,
    p_actor_profile_id,
    p_actor_identifier_hash,
    p_client_request_id
  );

  if v_original.status = 'void' then
    if v_original.replaced_by_statement_id = v_replacement.id
      and v_replacement.replaces_statement_id = p_statement_id
      and v_replacement.replacement_request_digest = v_replacement_digest then
      return v_replacement;
    end if;
    if v_original.replaced_by_statement_id = v_replacement.id then
      raise exception 'fee_statement_replacement_payload_mismatch';
    end if;
    raise exception 'fee_statement_not_replaceable';
  end if;

  if v_original.status <> 'published' then
    raise exception 'fee_statement_not_replaceable';
  end if;

  update public.academy_fee_statements
  set replaces_statement_id = p_statement_id,
      replacement_request_digest = v_replacement_digest,
      updated_at = now()
  where id = v_replacement.id
    and replaces_statement_id is null;

  if not found then
    raise exception 'fee_statement_replacement_conflict';
  end if;

  update public.academy_fee_statements
  set status = 'void',
      voided_at = now(),
      replaced_by_statement_id = v_replacement.id,
      updated_at = now()
  where id = p_statement_id
    and status = 'published';

  if not found then
    raise exception 'fee_statement_not_replaceable';
  end if;

  insert into public.academy_fee_statement_audit_events (
    statement_id, event_type, actor_profile_id, actor_identifier_hash, source_channel, request_id, details
  ) values (
    p_statement_id,
    'voided',
    p_actor_profile_id,
    p_actor_identifier_hash,
    p_source_channel,
    p_client_request_id || ':void',
    jsonb_build_object(
      'reason', pg_catalog.btrim(p_correction_reason),
      'replacementStatementId', v_replacement.id,
      'replacementStatementReference', v_replacement.statement_reference
    )
  );

  select * into v_replacement
  from public.academy_fee_statements
  where id = v_replacement.id;
  return v_replacement;
end;
$$;

revoke all on function public.replace_academy_fee_statement(uuid,text,text,text,text,date,date,date,text,bigint,jsonb,text,uuid,text,text) from public, anon, authenticated;
grant execute on function public.replace_academy_fee_statement(uuid,text,text,text,text,date,date,date,text,bigint,jsonb,text,uuid,text,text) to service_role;

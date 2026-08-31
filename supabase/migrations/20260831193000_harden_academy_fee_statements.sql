-- Follow-up hardening for fee statements. Keep the original migration immutable because it may already have run.

alter table public.academy_fee_statements
  add column if not exists actor_identifier_hash text
  check (actor_identifier_hash is null or actor_identifier_hash ~ '^[a-f0-9]{64}$');

alter table public.academy_fee_statement_audit_events
  add column if not exists actor_identifier_hash text
  check (actor_identifier_hash is null or actor_identifier_hash ~ '^[a-f0-9]{64}$');

drop function if exists public.create_academy_fee_statement(text,text,text,date,date,date,text,bigint,jsonb,text,uuid,text);

create or replace function public.create_academy_fee_statement(
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
  v_payload jsonb;
  v_digest text;
  v_existing public.academy_fee_statements;
  v_statement public.academy_fee_statements;
  v_computed_total bigint;
  v_item jsonb;
begin
  if p_period_end < p_period_start or (p_due_date is not null and p_due_date < p_period_end)
    or p_total_minor < 0 or p_currency !~ '^[A-Z]{3}$'
    or p_public_token_hash !~ '^[a-f0-9]{64}$'
    or p_line_items is null or jsonb_typeof(p_line_items) <> 'array' or jsonb_array_length(p_line_items) not between 1 and 100
    or nullif(pg_catalog.btrim(p_student_name), '') is null
    or (p_actor_profile_id is null and p_actor_identifier_hash is null)
    or (p_actor_identifier_hash is not null and p_actor_identifier_hash !~ '^[a-f0-9]{64}$')
    or nullif(pg_catalog.btrim(p_client_request_id), '') is null then
    raise exception 'invalid_fee_statement';
  end if;

  for v_item in select value from jsonb_array_elements(p_line_items)
  loop
    if jsonb_typeof(v_item) <> 'object'
      or not (v_item ?& array['lessonDate','teacherName','subject','durationMinutes','rateMinor','amountMinor','source'])
      or jsonb_typeof(v_item -> 'teacherName') <> 'string'
      or length(pg_catalog.btrim(v_item ->> 'teacherName')) not between 1 and 120
      or not (
        jsonb_typeof(v_item -> 'subject') = 'null'
        or (jsonb_typeof(v_item -> 'subject') = 'string' and length(pg_catalog.btrim(v_item ->> 'subject')) between 1 and 120)
      )
      or jsonb_typeof(v_item -> 'durationMinutes') <> 'number' or (v_item ->> 'durationMinutes') !~ '^\d+$'
      or (v_item ->> 'durationMinutes')::bigint not between 1 and 1440
      or jsonb_typeof(v_item -> 'rateMinor') <> 'number' or (v_item ->> 'rateMinor') !~ '^\d+$'
      or (v_item ->> 'rateMinor')::numeric not between 0 and 1000000000000
      or jsonb_typeof(v_item -> 'amountMinor') <> 'number' or (v_item ->> 'amountMinor') !~ '^\d+$'
      or (v_item ->> 'amountMinor')::numeric not between 0 and 1000000000000
      or (v_item ->> 'amountMinor')::numeric * 60
        <> (v_item ->> 'durationMinutes')::numeric * (v_item ->> 'rateMinor')::numeric
      or jsonb_typeof(v_item -> 'source') <> 'object'
      or not ((v_item -> 'source') ?& array['workbook','sheet','row'])
      or jsonb_typeof(v_item -> 'source' -> 'workbook') <> 'string'
      or length(pg_catalog.btrim(v_item -> 'source' ->> 'workbook')) not between 1 and 160
      or jsonb_typeof(v_item -> 'source' -> 'sheet') <> 'string'
      or length(pg_catalog.btrim(v_item -> 'source' ->> 'sheet')) not between 1 and 160
      or jsonb_typeof(v_item -> 'source' -> 'row') <> 'number'
      or (v_item -> 'source' ->> 'row') !~ '^\d+$'
      or (v_item -> 'source' ->> 'row')::bigint not between 1 and 1000000
      or not (
        (jsonb_typeof(v_item -> 'lessonDate') = 'string'
          and (v_item ->> 'lessonDate') ~ '^\d{4}-\d{2}-\d{2}$'
          and (v_item ->> 'lessonDate')::date between p_period_start and p_period_end)
        or (jsonb_typeof(v_item -> 'lessonDate') = 'null'
          and jsonb_typeof(v_item -> 'note') = 'string'
          and length(pg_catalog.btrim(v_item ->> 'note')) between 1 and 240)
      )
      or not (
        v_item -> 'note' is null
        or jsonb_typeof(v_item -> 'note') = 'null'
        or (jsonb_typeof(v_item -> 'note') = 'string' and length(pg_catalog.btrim(v_item ->> 'note')) between 1 and 240)
      ) then
      raise exception 'invalid_fee_statement_line_item';
    end if;
  end loop;

  if exists (
    select 1
    from jsonb_array_elements(p_line_items) as items(item)
    group by item -> 'source' ->> 'workbook', item -> 'source' ->> 'sheet', item -> 'source' ->> 'row'
    having count(*) > 1
  ) then
    raise exception 'duplicate_fee_statement_source';
  end if;

  select coalesce(sum((item ->> 'amountMinor')::bigint), 0)
  into v_computed_total
  from jsonb_array_elements(p_line_items) as items(item);
  if v_computed_total <> p_total_minor then
    raise exception 'fee_statement_total_mismatch';
  end if;

  v_payload := jsonb_build_object(
    'publicTokenHash', p_public_token_hash,
    'studentName', pg_catalog.btrim(p_student_name), 'billedToName', nullif(pg_catalog.btrim(p_billed_to_name), ''),
    'periodStart', p_period_start, 'periodEnd', p_period_end, 'dueDate', p_due_date,
    'currency', p_currency, 'totalMinor', p_total_minor, 'lineItems', p_line_items,
    'sourceChannel', p_source_channel, 'actorProfileId', p_actor_profile_id,
    'actorIdentifierHash', p_actor_identifier_hash
  );
  v_digest := encode(public.digest(pg_catalog.convert_to(v_payload::text, 'UTF8'), 'sha256'), 'hex');

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_client_request_id, 0));
  select * into v_existing from public.academy_fee_statements where client_request_id = p_client_request_id for update;
  if found then
    if v_existing.request_payload_digest <> v_digest then
      raise exception 'client_request_payload_mismatch';
    end if;
    return v_existing;
  end if;

  insert into public.academy_fee_statements (
    statement_reference, public_token_hash, student_name, billed_to_name, period_start, period_end,
    due_date, currency, total_minor, line_items, source_channel, actor_profile_id, actor_identifier_hash,
    client_request_id, request_payload_digest
  ) values (
    'MIA-' || to_char(p_period_start, 'YYYYMM') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
    p_public_token_hash, pg_catalog.btrim(p_student_name), nullif(pg_catalog.btrim(p_billed_to_name), ''),
    p_period_start, p_period_end, p_due_date, p_currency, p_total_minor, p_line_items,
    p_source_channel, p_actor_profile_id, p_actor_identifier_hash, p_client_request_id, v_digest
  ) returning * into v_statement;

  insert into public.academy_fee_statement_audit_events (
    statement_id, event_type, actor_profile_id, actor_identifier_hash, source_channel, request_id, details
  ) values (
    v_statement.id, 'published', p_actor_profile_id, p_actor_identifier_hash, p_source_channel,
    p_client_request_id, jsonb_build_object('statementReference', v_statement.statement_reference)
  );
  return v_statement;
end;
$$;

revoke all on function public.create_academy_fee_statement(text,text,text,date,date,date,text,bigint,jsonb,text,uuid,text,text) from public, anon, authenticated;
grant execute on function public.create_academy_fee_statement(text,text,text,date,date,date,text,bigint,jsonb,text,uuid,text,text) to service_role;

create table if not exists public.academy_fee_statements (
  id uuid primary key default gen_random_uuid(),
  statement_reference text not null unique,
  public_token_hash text not null unique check (public_token_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'published' check (status in ('published', 'paid', 'void')),
  student_name text not null,
  billed_to_name text,
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  due_date date check (due_date is null or due_date >= period_end),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  total_minor bigint not null check (total_minor >= 0),
  line_items jsonb not null check (jsonb_typeof(line_items) = 'array' and jsonb_array_length(line_items) between 1 and 100),
  source_channel text not null check (source_channel in ('dashboard', 'imessage')),
  actor_profile_id uuid references public.profiles(id) on delete set null,
  client_request_id text not null unique,
  request_payload_digest text not null check (request_payload_digest ~ '^[a-f0-9]{64}$'),
  issued_at timestamptz not null default now(),
  paid_at timestamptz,
  voided_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.academy_fee_statement_audit_events (
  id uuid primary key default gen_random_uuid(),
  statement_id uuid not null references public.academy_fee_statements(id) on delete restrict,
  event_type text not null check (event_type in ('published', 'marked_paid', 'voided')),
  actor_profile_id uuid references public.profiles(id) on delete set null,
  source_channel text not null,
  request_id text not null unique,
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists academy_fee_statements_status_issued_idx
  on public.academy_fee_statements(status, issued_at desc);
create index if not exists academy_fee_statement_audit_statement_idx
  on public.academy_fee_statement_audit_events(statement_id, occurred_at desc);

alter table public.academy_fee_statements enable row level security;
alter table public.academy_fee_statement_audit_events enable row level security;

revoke all on public.academy_fee_statements from anon, authenticated;
revoke all on public.academy_fee_statement_audit_events from anon, authenticated;
grant select, insert, update, delete on public.academy_fee_statements to service_role;
grant select, insert, update, delete on public.academy_fee_statement_audit_events to service_role;

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
begin
  if p_period_end < p_period_start or (p_due_date is not null and p_due_date < p_period_end)
    or p_total_minor < 0 or p_currency !~ '^[A-Z]{3}$'
    or p_public_token_hash !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(p_line_items) <> 'array' or jsonb_array_length(p_line_items) not between 1 and 100
    or nullif(pg_catalog.btrim(p_student_name), '') is null
    or nullif(pg_catalog.btrim(p_client_request_id), '') is null then
    raise exception 'invalid_fee_statement';
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
    'currency', p_currency, 'totalMinor', p_total_minor, 'lineItems', p_line_items
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
    due_date, currency, total_minor, line_items, source_channel, actor_profile_id, client_request_id, request_payload_digest
  ) values (
    'MIA-' || to_char(p_period_start, 'YYYYMM') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
    p_public_token_hash, pg_catalog.btrim(p_student_name), nullif(pg_catalog.btrim(p_billed_to_name), ''),
    p_period_start, p_period_end, p_due_date, p_currency, p_total_minor, p_line_items,
    p_source_channel, p_actor_profile_id, p_client_request_id, v_digest
  ) returning * into v_statement;

  insert into public.academy_fee_statement_audit_events (
    statement_id, event_type, actor_profile_id, source_channel, request_id, details
  ) values (
    v_statement.id, 'published', p_actor_profile_id, p_source_channel,
    p_client_request_id, jsonb_build_object('statementReference', v_statement.statement_reference)
  );
  return v_statement;
end;
$$;

revoke all on function public.create_academy_fee_statement(text,text,text,date,date,date,text,bigint,jsonb,text,uuid,text) from public, anon, authenticated;
grant execute on function public.create_academy_fee_statement(text,text,text,date,date,date,text,bigint,jsonb,text,uuid,text) to service_role;

create table public.academy_fee_statement_adjustments (
  id uuid primary key default gen_random_uuid(),
  statement_id uuid not null references public.academy_fee_statements(id) on delete restrict,
  kind text not null check (kind in ('extra_fee','advance')),
  label text not null check (length(btrim(label)) between 1 and 120),
  amount_minor bigint not null check (amount_minor between 1 and 1000000000000),
  reference text not null check (length(btrim(reference)) between 1 and 500),
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  client_request_id uuid not null unique,
  created_at timestamptz not null default now()
);
create unique index academy_fee_statement_adjustments_advance_reference_uidx
  on public.academy_fee_statement_adjustments (lower(regexp_replace(btrim(reference), '\s+', ' ', 'g'))) where kind = 'advance';
create unique index academy_fee_statement_adjustments_fee_reference_uidx
  on public.academy_fee_statement_adjustments (statement_id, lower(regexp_replace(btrim(reference), '\s+', ' ', 'g'))) where kind = 'extra_fee';
create index academy_fee_statement_adjustments_statement_idx on public.academy_fee_statement_adjustments(statement_id, created_at);
alter table public.academy_fee_statement_adjustments enable row level security;
revoke all on public.academy_fee_statement_adjustments from public, anon, authenticated, service_role;
grant select on public.academy_fee_statement_adjustments to service_role;

create or replace function public.reject_void_fee_statement_with_adjustments()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'void' and old.status is distinct from 'void' and exists (
    select 1 from public.academy_fee_statement_adjustments a where a.statement_id = old.id
  ) then raise exception 'fee_statement_has_adjustments'; end if;
  return new;
end; $$;
create trigger academy_fee_statement_adjustments_prevent_void
before update of status on public.academy_fee_statements
for each row execute function public.reject_void_fee_statement_with_adjustments();

create or replace function public.add_academy_fee_statement_adjustment(
  p_statement_id uuid, p_kind text, p_label text, p_amount_minor bigint, p_reference text,
  p_expected_version integer, p_client_request_id uuid, p_actor_profile_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_statement public.academy_fee_statements%rowtype;
  v_existing public.academy_fee_statement_adjustments%rowtype;
  v_base bigint; v_fees numeric; v_advances numeric; v_due numeric; v_version integer; v_norm_ref text;
  v_sum record; v_row public.academy_fee_statement_adjustments%rowtype;
begin
  if p_statement_id is null or p_kind not in ('extra_fee','advance') or p_kind is null
    or nullif(btrim(p_label), '') is null or length(btrim(p_label)) > 120
    or p_amount_minor is null or p_amount_minor < 1 or p_amount_minor > 1000000000000
    or nullif(btrim(p_reference), '') is null or length(btrim(p_reference)) > 500
    or p_expected_version is null or p_expected_version < 0 or p_expected_version > 100
    or p_client_request_id is null or p_actor_profile_id is null then raise exception 'invalid_fee_statement_adjustment'; end if;
  if not exists (select 1 from public.profiles p where p.id=p_actor_profile_id and p.is_active and
      (p.role='admin' or exists (select 1 from public.profile_roles pr where pr.profile_id=p.id and pr.role='admin'))) then raise exception 'ineligible_fee_statement_actor'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_client_request_id::text, 0));
  select * into v_statement from public.academy_fee_statements where id=p_statement_id for update;
  if not found then raise exception 'fee_statement_not_found'; end if;
  select * into v_existing from public.academy_fee_statement_adjustments where client_request_id=p_client_request_id;
  if found then
    if v_existing.statement_id <> p_statement_id or v_existing.kind <> p_kind or v_existing.label <> btrim(p_label)
      or v_existing.amount_minor <> p_amount_minor or v_existing.reference <> btrim(regexp_replace(p_reference, '\s+', ' ', 'g'))
      or v_existing.actor_profile_id <> p_actor_profile_id then raise exception 'client_request_payload_mismatch'; end if;
    return jsonb_build_object('id',v_existing.id,'created_at',v_existing.created_at);
  end if;
  if v_statement.status in ('paid','void') then raise exception 'fee_statement_ineligible'; end if;
  select count(*)::integer into v_version from public.academy_fee_statement_adjustments where statement_id=p_statement_id;
  select coalesce(sum(amount_minor),0) into v_fees from public.academy_fee_statement_adjustments where statement_id=p_statement_id and kind='extra_fee';
  select coalesce(sum(amount_minor),0) into v_advances from public.academy_fee_statement_adjustments where statement_id=p_statement_id and kind='advance';
  if v_version >= 100 then raise exception 'fee_statement_adjustment_limit'; end if;
  if p_expected_version <> v_version then raise exception 'stale_fee_statement_adjustments'; end if;
  v_base:=v_statement.total_minor; v_due:=v_base+v_fees-v_advances;
  if v_due < 0 or v_due > 1000000000000 or v_base + v_fees > 1000000000000
    or (p_kind='extra_fee' and v_base + v_fees + p_amount_minor > 1000000000000) then raise exception 'invalid_fee_statement_balance'; end if;
  if p_kind='advance' and p_amount_minor > v_due then raise exception 'advance_exceeds_current_due'; end if;
  v_norm_ref:=regexp_replace(btrim(p_reference), '\s+', ' ', 'g');
  insert into public.academy_fee_statement_adjustments(statement_id,kind,label,amount_minor,reference,actor_profile_id,client_request_id)
    values(p_statement_id,p_kind,btrim(p_label),p_amount_minor,v_norm_ref,p_actor_profile_id,p_client_request_id) returning * into v_row;
  return jsonb_build_object('id',v_row.id,'created_at',v_row.created_at);
end; $$;
revoke all on function public.add_academy_fee_statement_adjustment(uuid,text,text,bigint,text,integer,uuid,uuid) from public,anon,authenticated;
grant execute on function public.add_academy_fee_statement_adjustment(uuid,text,text,bigint,text,integer,uuid,uuid) to service_role;

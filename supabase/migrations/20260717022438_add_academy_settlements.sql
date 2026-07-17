create table public.academy_settlement_cycles (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  currency text not null,
  status text not null default 'collecting'
    check (status in ('collecting', 'needs_attention', 'ready_for_approval', 'awaiting_approval', 'approved', 'collecting_payments', 'closed')),
  version integer not null default 0 check (version >= 0),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (period_start, currency),
  check (period_start = date_trunc('month', period_start)::date),
  check (currency ~ '^[A-Z]{3}$'),
  check ((status = 'closed') = (closed_at is not null))
);

create table public.academy_tutor_reports (
  id uuid primary key default gen_random_uuid(),
  settlement_cycle_id uuid not null references public.academy_settlement_cycles(id) on delete cascade,
  tutor_contact_id uuid not null references public.hermes_contacts(id) on delete restrict,
  revision integer not null default 1 check (revision > 0),
  supersedes_report_id uuid references public.academy_tutor_reports(id) on delete restrict,
  status text not null default 'submitted'
    check (status in ('submitted', 'needs_attention', 'ready', 'superseded', 'approved')),
  claimed_payout_minor bigint not null check (claimed_payout_minor >= 0),
  source_channel text not null
    check (source_channel in ('whatsapp', 'imessage_admin', 'admin')),
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (settlement_cycle_id, tutor_contact_id, revision),
  check (supersedes_report_id is null or supersedes_report_id <> id)
);

create unique index academy_tutor_reports_one_active
  on public.academy_tutor_reports(settlement_cycle_id, tutor_contact_id)
  where status <> 'superseded';

create table public.academy_tutor_report_lines (
  id uuid primary key default gen_random_uuid(),
  tutor_report_id uuid not null references public.academy_tutor_reports(id) on delete cascade,
  reported_student_name text not null check (length(btrim(reported_student_name)) between 1 and 160),
  student_contact_id uuid references public.hermes_contacts(id) on delete restrict,
  billed_contact_id uuid references public.hermes_contacts(id) on delete restrict,
  class_count integer not null check (class_count between 1 and 200),
  total_minutes integer not null check (total_minutes between 1 and 50000),
  lesson_dates date[] not null default '{}',
  family_charge_minor bigint check (family_charge_minor is null or family_charge_minor >= 0),
  resolution_status text not null default 'unresolved'
    check (resolution_status in ('unresolved', 'resolved', 'confirmed_by_swati')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(lesson_dates) <= class_count),
  check (resolution_status = 'unresolved' or student_contact_id is not null),
  check (resolution_status <> 'confirmed_by_swati' or billed_contact_id is not null)
);

create table public.academy_family_invoices (
  id uuid primary key default gen_random_uuid(),
  settlement_cycle_id uuid not null references public.academy_settlement_cycles(id) on delete restrict,
  approval_id uuid not null references public.hermes_approvals(id) on delete restrict,
  billed_contact_id uuid not null references public.hermes_contacts(id) on delete restrict,
  student_contact_id uuid not null references public.hermes_contacts(id) on delete restrict,
  total_minor bigint not null check (total_minor >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  item_snapshot jsonb not null check (jsonb_typeof(item_snapshot) = 'array'),
  status text not null default 'approved' check (status in ('approved', 'sent', 'paid', 'void')),
  sent_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (settlement_cycle_id, billed_contact_id, student_contact_id),
  check ((status = 'paid') = (paid_at is not null)),
  check (sent_at is null or status in ('sent', 'paid', 'void'))
);

create table public.academy_tutor_payouts (
  id uuid primary key default gen_random_uuid(),
  settlement_cycle_id uuid not null references public.academy_settlement_cycles(id) on delete restrict,
  approval_id uuid not null references public.hermes_approvals(id) on delete restrict,
  tutor_report_id uuid not null unique references public.academy_tutor_reports(id) on delete restrict,
  tutor_contact_id uuid not null references public.hermes_contacts(id) on delete restrict,
  amount_minor bigint not null check (amount_minor >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'approved' check (status in ('approved', 'eligible', 'paid', 'void')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'paid') = (paid_at is not null))
);

create index academy_tutor_reports_cycle_status on public.academy_tutor_reports(settlement_cycle_id, status);
create index academy_tutor_report_lines_report on public.academy_tutor_report_lines(tutor_report_id);
create index academy_family_invoices_cycle_status on public.academy_family_invoices(settlement_cycle_id, status);
create index academy_tutor_payouts_cycle_status on public.academy_tutor_payouts(settlement_cycle_id, status);

alter table public.hermes_approvals alter column case_id drop not null;
alter table public.hermes_approvals
  add column settlement_cycle_id uuid references public.academy_settlement_cycles(id) on delete cascade;
alter table public.hermes_approvals
  add constraint hermes_approvals_exactly_one_subject
  check (num_nonnulls(case_id, settlement_cycle_id) = 1);
create index hermes_approvals_settlement_cycle_idx on public.hermes_approvals(settlement_cycle_id)
  where settlement_cycle_id is not null;

alter table public.hermes_whatsapp_approval_bindings
  add column decision_channel text
  check (decision_channel is null or decision_channel in ('whatsapp', 'imessage', 'dashboard'));
update public.hermes_whatsapp_approval_bindings
  set decision_channel = 'whatsapp'
  where consumed_at is not null and decision_channel is null;

alter table public.academy_settlement_cycles enable row level security;
alter table public.academy_tutor_reports enable row level security;
alter table public.academy_tutor_report_lines enable row level security;
alter table public.academy_family_invoices enable row level security;
alter table public.academy_tutor_payouts enable row level security;

create policy academy_settlement_cycles_admin_all on public.academy_settlement_cycles
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy academy_tutor_reports_admin_all on public.academy_tutor_reports
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy academy_tutor_report_lines_admin_all on public.academy_tutor_report_lines
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy academy_family_invoices_admin_all on public.academy_family_invoices
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy academy_tutor_payouts_admin_all on public.academy_tutor_payouts
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

revoke all on table public.academy_settlement_cycles from anon;
revoke all on table public.academy_tutor_reports from anon;
revoke all on table public.academy_tutor_report_lines from anon;
revoke all on table public.academy_family_invoices from anon;
revoke all on table public.academy_tutor_payouts from anon;
grant select, insert, update, delete on table public.academy_settlement_cycles to authenticated;
grant select, insert, update, delete on table public.academy_tutor_reports to authenticated;
grant select, insert, update, delete on table public.academy_tutor_report_lines to authenticated;
grant select, insert, update, delete on table public.academy_family_invoices to authenticated;
grant select, insert, update, delete on table public.academy_tutor_payouts to authenticated;
grant all on table public.academy_settlement_cycles to service_role;
grant all on table public.academy_tutor_reports to service_role;
grant all on table public.academy_tutor_report_lines to service_role;
grant all on table public.academy_family_invoices to service_role;
grant all on table public.academy_tutor_payouts to service_role;

create trigger set_academy_settlement_cycles_updated_at before update on public.academy_settlement_cycles
  for each row execute function public.set_updated_at();
create trigger set_academy_tutor_reports_updated_at before update on public.academy_tutor_reports
  for each row execute function public.set_updated_at();
create trigger set_academy_tutor_report_lines_updated_at before update on public.academy_tutor_report_lines
  for each row execute function public.set_updated_at();
create trigger set_academy_family_invoices_updated_at before update on public.academy_family_invoices
  for each row execute function public.set_updated_at();
create trigger set_academy_tutor_payouts_updated_at before update on public.academy_tutor_payouts
  for each row execute function public.set_updated_at();

create function public.submit_academy_tutor_report(
  p_cycle_id uuid,
  p_tutor_contact_id uuid,
  p_claimed_payout_minor bigint,
  p_source_channel text,
  p_lines jsonb
)
returns public.academy_tutor_reports
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cycle public.academy_settlement_cycles;
  v_previous public.academy_tutor_reports;
  v_report public.academy_tutor_reports;
  v_revision integer;
begin
  if p_claimed_payout_minor < 0 then raise exception 'invalid_claimed_payout'; end if;
  if p_source_channel not in ('whatsapp', 'imessage_admin', 'admin') then raise exception 'invalid_source_channel'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 100 then
    raise exception 'invalid_report_lines';
  end if;
  select * into v_cycle from public.academy_settlement_cycles where id = p_cycle_id for update;
  if not found then raise exception 'settlement_cycle_not_found'; end if;
  if v_cycle.status not in ('collecting', 'needs_attention', 'ready_for_approval') then
    raise exception 'settlement_not_collecting';
  end if;
  if not exists (
    select 1 from public.hermes_contacts
    where id = p_tutor_contact_id and role = 'teacher' and is_active = true and deleted_at is null
      and consent_status = 'attested' and communication_policy = 'direct'
  ) then raise exception 'approved_tutor_required'; end if;

  select * into v_previous from public.academy_tutor_reports
    where settlement_cycle_id = p_cycle_id and tutor_contact_id = p_tutor_contact_id
      and status <> 'superseded'
    for update;
  select coalesce(max(revision), 0) + 1 into v_revision
    from public.academy_tutor_reports
    where settlement_cycle_id = p_cycle_id and tutor_contact_id = p_tutor_contact_id;
  if v_previous.id is not null then
    update public.academy_tutor_reports set status = 'superseded', updated_at = now()
      where id = v_previous.id;
  end if;

  insert into public.academy_tutor_reports(
    settlement_cycle_id, tutor_contact_id, revision, supersedes_report_id,
    status, claimed_payout_minor, source_channel
  ) values (
    p_cycle_id, p_tutor_contact_id, v_revision, v_previous.id,
    'needs_attention', p_claimed_payout_minor, p_source_channel
  ) returning * into v_report;

  insert into public.academy_tutor_report_lines(
    tutor_report_id, reported_student_name, student_contact_id,
    class_count, total_minutes, lesson_dates, resolution_status
  )
  select v_report.id,
    btrim(item->>'reportedStudentName'),
    nullif(item->>'studentContactId', '')::uuid,
    (item->>'classCount')::integer,
    (item->>'totalMinutes')::integer,
    array(select jsonb_array_elements_text(coalesce(item->'lessonDates', '[]'::jsonb))::date),
    case when nullif(item->>'studentContactId', '') is null then 'unresolved' else 'resolved' end
  from jsonb_array_elements(p_lines) item;

  update public.academy_settlement_cycles set status = 'needs_attention', updated_at = now()
    where id = p_cycle_id;
  insert into public.hermes_audit_events(actor_type, actor_contact_id, event_type, entity_type, entity_id, metadata)
    values ('contact', p_tutor_contact_id, 'tutor_report_submitted', 'tutor_report', v_report.id,
      jsonb_build_object('cycleId', p_cycle_id, 'revision', v_report.revision, 'lineCount', jsonb_array_length(p_lines)));
  return v_report;
end;
$$;

create function public.set_academy_family_charges(p_cycle_id uuid, p_charges jsonb)
returns public.academy_settlement_cycles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cycle public.academy_settlement_cycles;
  v_item jsonb;
  v_line_id uuid;
  v_updated integer := 0;
begin
  if jsonb_typeof(p_charges) <> 'array' or jsonb_array_length(p_charges) not between 1 and 1000 then
    raise exception 'invalid_family_charges';
  end if;
  select * into v_cycle from public.academy_settlement_cycles where id = p_cycle_id for update;
  if not found then raise exception 'settlement_cycle_not_found'; end if;
  if v_cycle.status not in ('collecting', 'needs_attention', 'ready_for_approval') then
    raise exception 'settlement_not_editable';
  end if;

  for v_item in select value from jsonb_array_elements(p_charges) loop
    v_line_id := (v_item->>'reportLineId')::uuid;
    if (v_item->>'familyChargeMinor')::bigint < 0 then raise exception 'invalid_family_charge'; end if;
    if not exists (
      select 1 from public.hermes_contacts
      where id = (v_item->>'studentContactId')::uuid and role = 'student'
        and is_active = true and deleted_at is null
    ) then raise exception 'student_contact_unavailable'; end if;
    if not exists (
      select 1 from public.hermes_contacts
      where id = (v_item->>'billedContactId')::uuid and role in ('parent', 'student')
        and is_active = true and deleted_at is null and consent_status = 'attested'
        and communication_policy = 'direct'
    ) then raise exception 'billing_contact_unavailable'; end if;
    update public.academy_tutor_report_lines l
      set student_contact_id = (v_item->>'studentContactId')::uuid,
          billed_contact_id = (v_item->>'billedContactId')::uuid,
          family_charge_minor = (v_item->>'familyChargeMinor')::bigint,
          resolution_status = 'confirmed_by_swati', updated_at = now()
      from public.academy_tutor_reports r
      where l.id = v_line_id and r.id = l.tutor_report_id
        and r.settlement_cycle_id = p_cycle_id and r.status <> 'superseded';
    if not found then raise exception 'report_line_unavailable'; end if;
    v_updated := v_updated + 1;
  end loop;

  if v_updated <> jsonb_array_length(p_charges) then raise exception 'family_charge_count_mismatch'; end if;
  update public.academy_tutor_reports r set status = 'ready', updated_at = now()
    where r.settlement_cycle_id = p_cycle_id and r.status in ('submitted', 'needs_attention')
      and not exists (
        select 1 from public.academy_tutor_report_lines l
        where l.tutor_report_id = r.id
          and (l.resolution_status <> 'confirmed_by_swati' or l.family_charge_minor is null)
      );
  update public.academy_settlement_cycles
    set status = case when exists (
      select 1 from public.academy_tutor_reports
      where settlement_cycle_id = p_cycle_id and status not in ('ready', 'superseded')
    ) then 'needs_attention' else 'ready_for_approval' end,
    updated_at = now()
    where id = p_cycle_id returning * into v_cycle;
  insert into public.hermes_audit_events(actor_type, event_type, entity_type, entity_id, metadata)
    values ('admin', 'family_charges_set', 'settlement_cycle', p_cycle_id,
      jsonb_build_object('chargeCount', v_updated));
  return v_cycle;
end;
$$;

create function public.build_academy_settlement_payload(p_cycle_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cycle public.academy_settlement_cycles;
  v_invoices jsonb;
  v_payouts jsonb;
begin
  select * into v_cycle from public.academy_settlement_cycles where id = p_cycle_id;
  if not found then raise exception 'settlement_cycle_not_found'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'billedContactId', grouped.billed_contact_id,
    'studentContactId', grouped.student_contact_id,
    'totalMinor', grouped.total_minor,
    'items', grouped.items
  ) order by grouped.billed_contact_id, grouped.student_contact_id), '[]'::jsonb)
  into v_invoices
  from (
    select l.billed_contact_id, l.student_contact_id,
      sum(l.family_charge_minor)::bigint as total_minor,
      jsonb_agg(jsonb_build_object(
        'reportLineId', l.id,
        'reportId', r.id,
        'tutorContactId', r.tutor_contact_id,
        'classCount', l.class_count,
        'totalMinutes', l.total_minutes,
        'amountMinor', l.family_charge_minor
      ) order by r.tutor_contact_id, l.id) as items
    from public.academy_tutor_report_lines l
    join public.academy_tutor_reports r on r.id = l.tutor_report_id
    where r.settlement_cycle_id = p_cycle_id and r.status = 'ready'
    group by l.billed_contact_id, l.student_contact_id
  ) grouped;

  select coalesce(jsonb_agg(jsonb_build_object(
    'reportId', r.id,
    'tutorContactId', r.tutor_contact_id,
    'amountMinor', r.claimed_payout_minor
  ) order by r.tutor_contact_id, r.id), '[]'::jsonb)
  into v_payouts
  from public.academy_tutor_reports r
  where r.settlement_cycle_id = p_cycle_id and r.status = 'ready';

  return jsonb_build_object(
    'settlementCycleId', v_cycle.id,
    'periodStart', v_cycle.period_start,
    'currency', v_cycle.currency,
    'version', v_cycle.version,
    'familyInvoices', v_invoices,
    'tutorPayouts', v_payouts
  );
end;
$$;

create function public.request_academy_settlement_approval(p_cycle_id uuid)
returns public.hermes_approvals
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cycle public.academy_settlement_cycles;
  v_payload jsonb;
  v_approval public.hermes_approvals;
begin
  select * into v_cycle from public.academy_settlement_cycles where id = p_cycle_id for update;
  if not found then raise exception 'settlement_cycle_not_found'; end if;
  if v_cycle.status not in ('collecting', 'needs_attention', 'ready_for_approval', 'awaiting_approval') then
    raise exception 'invalid_settlement_transition';
  end if;
  if not exists (
    select 1 from public.academy_tutor_reports
    where settlement_cycle_id = p_cycle_id and status = 'ready'
  ) then raise exception 'ready_tutor_report_required'; end if;
  if exists (
    select 1
    from public.academy_tutor_report_lines l
    join public.academy_tutor_reports r on r.id = l.tutor_report_id
    where r.settlement_cycle_id = p_cycle_id and r.status = 'ready'
      and (l.resolution_status <> 'confirmed_by_swati' or l.student_contact_id is null
        or l.billed_contact_id is null or l.family_charge_minor is null)
  ) then raise exception 'settlement_lines_incomplete'; end if;

  update public.hermes_approvals set status = 'cancelled', updated_at = now()
    where settlement_cycle_id = p_cycle_id and status = 'pending' and consumed_at is null;
  update public.academy_settlement_cycles
    set version = version + 1, status = 'awaiting_approval', updated_at = now()
    where id = p_cycle_id returning * into v_cycle;
  v_payload := public.build_academy_settlement_payload(p_cycle_id);
  insert into public.hermes_approvals(
    case_id, settlement_cycle_id, action, payload, proposal_version, payload_digest
  ) values (
    null, p_cycle_id, 'approve_monthly_settlement', v_payload, v_cycle.version,
    encode(digest(convert_to(v_payload::text, 'UTF8'), 'sha256'), 'hex')
  ) returning * into v_approval;
  return v_approval;
end;
$$;

create function public.decide_hermes_approval_by_channel(
  p_approval_id uuid,
  p_code text,
  p_decided_by uuid,
  p_decision text,
  p_external_id text,
  p_channel text
)
returns public.hermes_approvals
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_binding public.hermes_whatsapp_approval_bindings;
  v_approval public.hermes_approvals;
  v_case public.hermes_scheduling_cases;
  v_cycle public.academy_settlement_cycles;
  v_subject_type text;
  v_subject_id uuid;
begin
  if p_decision not in ('approved', 'rejected') then raise exception 'invalid_decision'; end if;
  if p_channel not in ('whatsapp', 'imessage', 'dashboard') then raise exception 'invalid_decision_channel'; end if;
  if p_external_id is null or length(p_external_id) not between 8 and 500 then raise exception 'invalid_external_id'; end if;
  if p_channel = 'dashboard' and not exists (
    select 1 from public.profiles
    where id = p_decided_by and role = 'admin' and is_active = true and deleted_at is null
  ) then raise exception 'administrator_required'; end if;

  if p_approval_id is null then
    select * into v_binding from public.hermes_whatsapp_approval_bindings
      where code = upper(p_code) for update;
    if not found or v_binding.expires_at <= now() then raise exception 'approval_code_unavailable'; end if;
    p_approval_id := v_binding.approval_id;
  else
    select * into v_binding from public.hermes_whatsapp_approval_bindings
      where approval_id = p_approval_id for update;
  end if;

  select * into v_approval from public.hermes_approvals where id = p_approval_id for update;
  if not found then raise exception 'approval_not_found'; end if;
  if v_approval.status <> 'pending' or v_approval.consumed_at is not null then
    if v_approval.status = p_decision then return v_approval; end if;
    raise exception 'approval_not_pending';
  end if;
  if p_channel <> 'dashboard' and (v_binding.id is null or v_binding.consumed_at is not null) then
    raise exception 'approval_code_unavailable';
  end if;

  if v_approval.case_id is not null then
    select * into v_case from public.hermes_scheduling_cases where id = v_approval.case_id for update;
    if not found or v_approval.proposal_version <> v_case.proposal_version then raise exception 'approval_stale'; end if;
    v_subject_type := 'scheduling_case';
    v_subject_id := v_case.id;
  else
    select * into v_cycle from public.academy_settlement_cycles where id = v_approval.settlement_cycle_id for update;
    if not found or v_cycle.status <> 'awaiting_approval'
      or v_approval.proposal_version <> v_cycle.version
      or v_approval.payload_digest <> encode(digest(convert_to(v_approval.payload::text, 'UTF8'), 'sha256'), 'hex')
    then raise exception 'approval_stale'; end if;
    v_subject_type := 'settlement_cycle';
    v_subject_id := v_cycle.id;
  end if;

  update public.hermes_approvals
    set status = p_decision, decided_by = case when p_channel = 'dashboard' then p_decided_by else null end,
        decided_at = now(), decision_note = null, updated_at = now()
    where id = v_approval.id returning * into v_approval;
  if v_binding.id is not null then
    update public.hermes_whatsapp_approval_bindings
      set decision = p_decision, decision_message_id = p_external_id,
          decision_channel = p_channel, consumed_at = now(), updated_at = now()
      where id = v_binding.id;
  end if;
  insert into public.hermes_audit_events(
    actor_type, actor_profile_id, event_type, entity_type, entity_id, request_id, metadata
  ) values (
    'admin', case when p_channel = 'dashboard' then p_decided_by else null end,
    'approval_' || p_decision, v_subject_type, v_subject_id, 'approval-decision:' || p_external_id,
    jsonb_build_object('approvalId', v_approval.id, 'payloadDigest', v_approval.payload_digest, 'channel', p_channel)
  );
  return v_approval;
end;
$$;

create or replace function public.decide_hermes_approval_by_whatsapp(
  p_code text,
  p_decision text,
  p_message_id text
)
returns public.hermes_approvals
language sql
security definer
set search_path = public, pg_temp
as $$
  select public.decide_hermes_approval_by_channel(null, p_code, null, p_decision, p_message_id, 'whatsapp');
$$;

create function public.finalize_academy_settlement(p_approval_id uuid)
returns public.academy_settlement_cycles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_approval public.hermes_approvals;
  v_cycle public.academy_settlement_cycles;
  v_payload jsonb;
begin
  select * into v_approval from public.hermes_approvals where id = p_approval_id for update;
  if not found or v_approval.action <> 'approve_monthly_settlement'
    or v_approval.status <> 'approved' or v_approval.consumed_at is not null
  then raise exception 'approved_settlement_required'; end if;
  select * into v_cycle from public.academy_settlement_cycles
    where id = v_approval.settlement_cycle_id for update;
  if not found or v_cycle.status <> 'awaiting_approval'
    or v_approval.proposal_version <> v_cycle.version
    or v_approval.payload_digest <> encode(digest(convert_to(v_approval.payload::text, 'UTF8'), 'sha256'), 'hex')
  then raise exception 'settlement_approval_stale'; end if;
  v_payload := public.build_academy_settlement_payload(v_cycle.id);
  if v_payload <> v_approval.payload then raise exception 'settlement_payload_changed'; end if;

  insert into public.academy_family_invoices(
    settlement_cycle_id, approval_id, billed_contact_id, student_contact_id,
    total_minor, currency, item_snapshot
  )
  select v_cycle.id, v_approval.id,
    (item->>'billedContactId')::uuid, (item->>'studentContactId')::uuid,
    (item->>'totalMinor')::bigint, v_cycle.currency, item->'items'
  from jsonb_array_elements(v_payload->'familyInvoices') item;

  insert into public.academy_tutor_payouts(
    settlement_cycle_id, approval_id, tutor_report_id, tutor_contact_id, amount_minor, currency
  )
  select v_cycle.id, v_approval.id, (item->>'reportId')::uuid,
    (item->>'tutorContactId')::uuid, (item->>'amountMinor')::bigint, v_cycle.currency
  from jsonb_array_elements(v_payload->'tutorPayouts') item;

  update public.academy_tutor_reports set status = 'approved', updated_at = now()
    where settlement_cycle_id = v_cycle.id and status = 'ready';
  update public.hermes_approvals set consumed_at = now(), updated_at = now() where id = v_approval.id;
  update public.academy_settlement_cycles set status = 'collecting_payments', updated_at = now()
    where id = v_cycle.id returning * into v_cycle;
  return v_cycle;
end;
$$;

create function public.record_academy_family_payment(p_invoice_id uuid)
returns public.academy_family_invoices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invoice public.academy_family_invoices;
begin
  select * into v_invoice from public.academy_family_invoices where id = p_invoice_id for update;
  if not found then raise exception 'family_invoice_not_found'; end if;
  if v_invoice.status = 'paid' then return v_invoice; end if;
  if v_invoice.status not in ('approved', 'sent') then raise exception 'family_invoice_not_payable'; end if;
  update public.academy_family_invoices
    set status = 'paid', paid_at = now(), updated_at = now()
    where id = p_invoice_id returning * into v_invoice;

  update public.academy_tutor_payouts p set status = 'eligible', updated_at = now()
  where p.settlement_cycle_id = v_invoice.settlement_cycle_id and p.status = 'approved'
    and not exists (
      select 1 from public.academy_family_invoices i
      where i.settlement_cycle_id = p.settlement_cycle_id and i.status <> 'paid'
        and exists (
          select 1 from jsonb_array_elements(i.item_snapshot) item
          where item->>'reportId' = p.tutor_report_id::text
        )
    );
  return v_invoice;
end;
$$;

create function public.record_academy_tutor_payout(p_payout_id uuid)
returns public.academy_tutor_payouts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payout public.academy_tutor_payouts;
begin
  select * into v_payout from public.academy_tutor_payouts where id = p_payout_id for update;
  if not found then raise exception 'tutor_payout_not_found'; end if;
  if v_payout.status = 'paid' then return v_payout; end if;
  if v_payout.status <> 'eligible' then raise exception 'tutor_payout_not_eligible'; end if;
  update public.academy_tutor_payouts set status = 'paid', paid_at = now(), updated_at = now()
    where id = p_payout_id returning * into v_payout;
  return v_payout;
end;
$$;

revoke execute on function public.build_academy_settlement_payload(uuid) from public, anon, authenticated;
revoke execute on function public.submit_academy_tutor_report(uuid, uuid, bigint, text, jsonb) from public, anon, authenticated;
revoke execute on function public.set_academy_family_charges(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.request_academy_settlement_approval(uuid) from public, anon, authenticated;
revoke execute on function public.decide_hermes_approval_by_channel(uuid, text, uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.decide_hermes_approval_by_whatsapp(text, text, text) from public, anon, authenticated;
revoke execute on function public.finalize_academy_settlement(uuid) from public, anon, authenticated;
revoke execute on function public.record_academy_family_payment(uuid) from public, anon, authenticated;
revoke execute on function public.record_academy_tutor_payout(uuid) from public, anon, authenticated;
grant execute on function public.build_academy_settlement_payload(uuid) to service_role;
grant execute on function public.submit_academy_tutor_report(uuid, uuid, bigint, text, jsonb) to service_role;
grant execute on function public.set_academy_family_charges(uuid, jsonb) to service_role;
grant execute on function public.request_academy_settlement_approval(uuid) to service_role;
grant execute on function public.decide_hermes_approval_by_channel(uuid, text, uuid, text, text, text) to service_role;
grant execute on function public.decide_hermes_approval_by_whatsapp(text, text, text) to service_role;
grant execute on function public.finalize_academy_settlement(uuid) to service_role;
grant execute on function public.record_academy_family_payment(uuid) to service_role;
grant execute on function public.record_academy_tutor_payout(uuid) to service_role;

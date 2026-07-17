create table public.hermes_whatsapp_approval_bindings (
  id uuid primary key default gen_random_uuid(),
  approval_id uuid not null unique references public.hermes_approvals(id) on delete cascade,
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  expires_at timestamptz not null,
  notification_status text not null default 'pending'
    check (notification_status in ('pending', 'sent', 'failed')),
  notification_message_id text unique,
  decision text check (decision is null or decision in ('approved', 'rejected')),
  decision_message_id text unique,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((consumed_at is null and decision is null and decision_message_id is null)
    or (consumed_at is not null and decision is not null and decision_message_id is not null))
);

create index hermes_whatsapp_approval_bindings_active
  on public.hermes_whatsapp_approval_bindings(code, expires_at)
  where consumed_at is null;

alter table public.hermes_whatsapp_approval_bindings enable row level security;
revoke all on table public.hermes_whatsapp_approval_bindings from anon, authenticated;
grant all on table public.hermes_whatsapp_approval_bindings to service_role;

create function public.decide_hermes_approval_by_whatsapp(
  p_code text,
  p_decision text,
  p_message_id text
)
returns public.hermes_approvals
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_binding public.hermes_whatsapp_approval_bindings;
  v_approval public.hermes_approvals;
begin
  if p_decision not in ('approved', 'rejected') then raise exception 'invalid_decision'; end if;
  if p_message_id is null or length(p_message_id) not between 8 and 500 then raise exception 'invalid_message_id'; end if;

  select * into v_binding
    from public.hermes_whatsapp_approval_bindings
    where code = upper(p_code)
    for update;
  if not found or v_binding.consumed_at is not null or v_binding.expires_at <= now() then
    raise exception 'approval_code_unavailable';
  end if;

  select * into v_approval
    from public.hermes_approvals
    where id = v_binding.approval_id
    for update;
  if not found or v_approval.status <> 'pending' or v_approval.consumed_at is not null then
    raise exception 'approval_not_pending';
  end if;
  perform 1 from public.hermes_scheduling_cases where id = v_approval.case_id for update;

  update public.hermes_approvals
    set status = p_decision, decided_at = now(), decision_note = null, updated_at = now()
    where id = v_approval.id
    returning * into v_approval;
  update public.hermes_whatsapp_approval_bindings
    set decision = p_decision, decision_message_id = p_message_id, consumed_at = now(), updated_at = now()
    where id = v_binding.id;

  insert into public.hermes_audit_events(actor_type, event_type, entity_type, entity_id, metadata)
    values ('admin', 'approval_' || p_decision, 'scheduling_case', v_approval.case_id,
      jsonb_build_object('approvalId', v_approval.id, 'payloadDigest', v_approval.payload_digest, 'channel', 'whatsapp'));
  return v_approval;
end;
$$;

revoke execute on function public.decide_hermes_approval_by_whatsapp(text, text, text) from public, anon, authenticated;
grant execute on function public.decide_hermes_approval_by_whatsapp(text, text, text) to service_role;

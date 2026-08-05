alter table public.hermes_messages
  add column if not exists provider_payload_digest text
  check (provider_payload_digest is null or provider_payload_digest ~ '^[a-f0-9]{64}$');

create table public.kitty_class_series (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 240),
  subject text check (subject is null or length(subject) between 1 and 120),
  timezone text not null check (length(timezone) between 1 and 100),
  local_time time not null,
  duration_minutes integer not null check (duration_minutes between 5 and 1440),
  frequency text not null default 'weekly' check (frequency = 'weekly'),
  weekdays smallint[] not null check (
    cardinality(weekdays) between 1 and 7
    and weekdays <@ array[0,1,2,3,4,5,6]::smallint[]
  ),
  interval_weeks integer not null default 1 check (interval_weeks = 1),
  effective_start date not null,
  effective_end date check (effective_end is null or effective_end >= effective_start),
  status text not null default 'active' check (status in ('active', 'paused', 'ended')),
  expansion_horizon_days integer not null default 90 check (expansion_horizon_days = 90),
  expanded_through date,
  origin_channel text not null check (origin_channel in ('dashboard', 'imessage')),
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.kitty_class_occurrences (
  id uuid primary key default gen_random_uuid(),
  series_id uuid references public.kitty_class_series(id) on delete restrict,
  occurrence_key text not null unique check (length(occurrence_key) between 8 and 200),
  title text not null check (length(btrim(title)) between 1 and 240),
  subject text check (subject is null or length(subject) between 1 and 120),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at and ends_at - starts_at <= interval '24 hours'),
  local_date date not null,
  timezone text not null check (length(timezone) between 1 and 100),
  status text not null default 'scheduled'
    check (status in ('scheduled', 'change_requested', 'rescheduled', 'cancelled', 'completed')),
  predecessor_occurrence_id uuid references public.kitty_class_occurrences(id) on delete restrict,
  origin_channel text not null check (origin_channel in ('dashboard', 'imessage', 'whatsapp', 'system')),
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  version integer not null default 1 check (version >= 1),
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.kitty_class_participants (
  id uuid primary key default gen_random_uuid(),
  series_id uuid references public.kitty_class_series(id) on delete cascade,
  occurrence_id uuid references public.kitty_class_occurrences(id) on delete cascade,
  contact_id uuid not null references public.hermes_contacts(id) on delete restrict,
  participant_role text not null check (participant_role in ('teacher', 'student', 'parent_guardian', 'observer')),
  receives_notifications boolean not null default true,
  confirms_cancellation boolean not null default false,
  confirms_reschedule boolean not null default false,
  decision_side text check (decision_side is null or decision_side in ('teacher', 'student')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(series_id, occurrence_id) = 1),
  check ((confirms_cancellation or confirms_reschedule) = false or decision_side is not null),
  check (
    (decision_side = 'teacher' and participant_role = 'teacher')
    or (decision_side = 'student' and participant_role in ('student', 'parent_guardian'))
    or (decision_side is null and not confirms_cancellation and not confirms_reschedule)
  ),
  unique nulls not distinct (series_id, occurrence_id, contact_id)
);

create table public.kitty_class_change_requests (
  id uuid primary key default gen_random_uuid(),
  occurrence_id uuid not null references public.kitty_class_occurrences(id) on delete restrict,
  change_type text not null check (change_type in ('cancel', 'reschedule')),
  requested_by_contact_id uuid references public.hermes_contacts(id) on delete set null,
  requester_side text check (requester_side is null or requester_side in ('teacher', 'student')),
  reason text check (reason is null or length(reason) between 1 and 500),
  proposed_starts_at timestamptz,
  proposed_ends_at timestamptz,
  proposed_timezone text,
  status text not null default 'awaiting_requester_confirmation'
    check (status in ('awaiting_requester_confirmation', 'awaiting_counterparty', 'collecting_alternatives', 'ready_to_finalize', 'finalized', 'rejected', 'expired', 'superseded')),
  payload_digest text not null check (payload_digest ~ '^[a-f0-9]{64}$'),
  version integer not null default 1 check (version >= 1),
  override_reason text check (override_reason is null or length(override_reason) between 1 and 500),
  override_profile_id uuid references public.profiles(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '48 hours'),
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    change_type = 'cancel'
    or (proposed_starts_at is null and proposed_ends_at is null)
    or (proposed_starts_at is not null and proposed_ends_at > proposed_starts_at)
  )
);

create unique index kitty_one_active_change_per_occurrence
  on public.kitty_class_change_requests(occurrence_id)
  where status in ('awaiting_requester_confirmation', 'awaiting_counterparty', 'collecting_alternatives', 'ready_to_finalize');

create table public.kitty_class_change_confirmations (
  id uuid primary key default gen_random_uuid(),
  change_request_id uuid not null references public.kitty_class_change_requests(id) on delete cascade,
  request_version integer not null check (request_version >= 1),
  decision_side text not null check (decision_side in ('teacher', 'student')),
  decided_by_contact_id uuid references public.hermes_contacts(id) on delete set null,
  decision text not null default 'pending' check (decision in ('pending', 'approved', 'rejected')),
  payload_digest text not null check (payload_digest ~ '^[a-f0-9]{64}$'),
  source_channel text not null check (source_channel in ('whatsapp', 'dashboard', 'imessage')),
  provider_message_id text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (change_request_id, request_version, decision_side)
);

create table public.kitty_class_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_type text not null check (actor_type in ('admin', 'contact', 'system', 'kitty')),
  actor_profile_id uuid references public.profiles(id) on delete set null,
  actor_contact_id uuid references public.hermes_contacts(id) on delete set null,
  event_type text not null check (length(event_type) between 1 and 100),
  entity_type text not null check (entity_type in ('series', 'occurrence', 'change_request', 'notification')),
  entity_id uuid not null,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index kitty_class_audit_request_unique
  on public.kitty_class_audit_events(request_id) where request_id is not null;

create table public.kitty_class_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  occurrence_id uuid not null references public.kitty_class_occurrences(id) on delete cascade,
  change_request_id uuid references public.kitty_class_change_requests(id) on delete cascade,
  contact_id uuid not null references public.hermes_contacts(id) on delete restrict,
  intent text not null check (intent in ('class_change_request', 'class_change_proposal', 'class_cancelled', 'class_rescheduled', 'class_change_rejected')),
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text not null unique check (length(idempotency_key) between 8 and 200),
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'blocked')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 10),
  available_at timestamptz not null default now(),
  hermes_message_id uuid references public.hermes_messages(id) on delete set null,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index kitty_class_series_status_idx on public.kitty_class_series(status, effective_start);
create index kitty_class_occurrences_time_idx on public.kitty_class_occurrences(status, starts_at);
create index kitty_class_participants_contact_idx on public.kitty_class_participants(contact_id, is_active);
create index kitty_class_requests_status_idx on public.kitty_class_change_requests(status, updated_at);
create index kitty_class_outbox_ready_idx on public.kitty_class_notification_outbox(status, available_at);

alter table public.kitty_class_series enable row level security;
alter table public.kitty_class_occurrences enable row level security;
alter table public.kitty_class_participants enable row level security;
alter table public.kitty_class_change_requests enable row level security;
alter table public.kitty_class_change_confirmations enable row level security;
alter table public.kitty_class_audit_events enable row level security;
alter table public.kitty_class_notification_outbox enable row level security;

create policy kitty_class_series_admin_read on public.kitty_class_series for select to authenticated
  using ((select public.is_admin()));
create policy kitty_class_occurrences_admin_read on public.kitty_class_occurrences for select to authenticated
  using ((select public.is_admin()));
create policy kitty_class_participants_admin_read on public.kitty_class_participants for select to authenticated
  using ((select public.is_admin()));
create policy kitty_class_change_requests_admin_read on public.kitty_class_change_requests for select to authenticated
  using ((select public.is_admin()));
create policy kitty_class_confirmations_admin_read on public.kitty_class_change_confirmations for select to authenticated
  using ((select public.is_admin()));

revoke all on table public.kitty_class_series from anon;
revoke all on table public.kitty_class_occurrences from anon;
revoke all on table public.kitty_class_participants from anon;
revoke all on table public.kitty_class_change_requests from anon;
revoke all on table public.kitty_class_change_confirmations from anon;
revoke all on table public.kitty_class_audit_events from anon;
revoke all on table public.kitty_class_notification_outbox from anon;
revoke all on table public.kitty_class_audit_events from authenticated;
revoke all on table public.kitty_class_notification_outbox from authenticated;

grant select on table public.kitty_class_series to authenticated;
grant select on table public.kitty_class_occurrences to authenticated;
grant select on table public.kitty_class_participants to authenticated;
grant select on table public.kitty_class_change_requests to authenticated;
grant select on table public.kitty_class_change_confirmations to authenticated;

grant all on table public.kitty_class_series to service_role;
grant all on table public.kitty_class_occurrences to service_role;
grant all on table public.kitty_class_participants to service_role;
grant all on table public.kitty_class_change_requests to service_role;
grant all on table public.kitty_class_change_confirmations to service_role;
grant all on table public.kitty_class_audit_events to service_role;
grant all on table public.kitty_class_notification_outbox to service_role;

create trigger set_kitty_class_series_updated_at before update on public.kitty_class_series
  for each row execute function public.set_updated_at();
create trigger set_kitty_class_occurrences_updated_at before update on public.kitty_class_occurrences
  for each row execute function public.set_updated_at();
create trigger set_kitty_class_participants_updated_at before update on public.kitty_class_participants
  for each row execute function public.set_updated_at();
create trigger set_kitty_class_requests_updated_at before update on public.kitty_class_change_requests
  for each row execute function public.set_updated_at();
create trigger set_kitty_class_confirmations_updated_at before update on public.kitty_class_change_confirmations
  for each row execute function public.set_updated_at();
create trigger set_kitty_class_outbox_updated_at before update on public.kitty_class_notification_outbox
  for each row execute function public.set_updated_at();

create function public.create_kitty_class_series(
  p_title text, p_subject text, p_timezone text, p_local_time time,
  p_duration_minutes integer, p_weekdays smallint[], p_effective_start date,
  p_effective_end date, p_origin_channel text, p_created_by uuid, p_participants jsonb
) returns public.kitty_class_series
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_series public.kitty_class_series;
begin
  if jsonb_typeof(p_participants) <> 'array' or jsonb_array_length(p_participants) < 2 then raise exception 'participants_required'; end if;
  if (select count(*) from jsonb_array_elements(p_participants) item where item->>'role' = 'teacher') <> 1
    or (select count(*) from jsonb_array_elements(p_participants) item where item->>'role' = 'student') <> 1
    or not exists (select 1 from jsonb_array_elements(p_participants) item where item->>'role' = 'teacher' and item->>'decisionSide' = 'teacher')
    or not exists (select 1 from jsonb_array_elements(p_participants) item where item->>'role' in ('student', 'parent_guardian') and item->>'decisionSide' = 'student' and coalesce((item->>'confirmsCancellation')::boolean, false))
    or not exists (select 1 from jsonb_array_elements(p_participants) item where item->>'role' in ('student', 'parent_guardian') and item->>'decisionSide' = 'student' and coalesce((item->>'confirmsReschedule')::boolean, false))
    or not exists (select 1 from jsonb_array_elements(p_participants) item where item->>'role' = 'teacher' and coalesce((item->>'receivesNotifications')::boolean, true) and coalesce((item->>'confirmsCancellation')::boolean, false) and coalesce((item->>'confirmsReschedule')::boolean, false))
  then raise exception 'participant_sides_required'; end if;
  insert into public.kitty_class_series(
    title, subject, timezone, local_time, duration_minutes, weekdays,
    effective_start, effective_end, origin_channel, created_by_profile_id
  ) values (
    btrim(p_title), nullif(btrim(p_subject), ''), p_timezone, p_local_time,
    p_duration_minutes, p_weekdays, p_effective_start, p_effective_end,
    p_origin_channel, p_created_by
  ) returning * into v_series;
  insert into public.kitty_class_participants(
    series_id, contact_id, participant_role, receives_notifications,
    confirms_cancellation, confirms_reschedule, decision_side
  ) select v_series.id, (item->>'contactId')::uuid, item->>'role',
    coalesce((item->>'receivesNotifications')::boolean, true),
    coalesce((item->>'confirmsCancellation')::boolean, false),
    coalesce((item->>'confirmsReschedule')::boolean, false),
    nullif(item->>'decisionSide', '')
  from jsonb_array_elements(p_participants) item;
  insert into public.kitty_class_audit_events(actor_type, actor_profile_id, event_type, entity_type, entity_id)
    values ('admin', p_created_by, 'series_created', 'series', v_series.id);
  return v_series;
end; $$;

create function public.create_kitty_one_off_class(
  p_title text, p_subject text, p_starts_at timestamptz, p_ends_at timestamptz,
  p_local_date date, p_timezone text, p_origin_channel text, p_created_by uuid,
  p_occurrence_key text, p_participants jsonb
) returns public.kitty_class_occurrences
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_occurrence public.kitty_class_occurrences;
begin
  if jsonb_typeof(p_participants) <> 'array' or jsonb_array_length(p_participants) < 2 then raise exception 'participants_required'; end if;
  if (select count(*) from jsonb_array_elements(p_participants) item where item->>'role' = 'teacher') <> 1
    or (select count(*) from jsonb_array_elements(p_participants) item where item->>'role' = 'student') <> 1
    or not exists (select 1 from jsonb_array_elements(p_participants) item where item->>'role' = 'teacher' and item->>'decisionSide' = 'teacher')
    or not exists (select 1 from jsonb_array_elements(p_participants) item where item->>'role' in ('student', 'parent_guardian') and item->>'decisionSide' = 'student' and coalesce((item->>'confirmsCancellation')::boolean, false))
    or not exists (select 1 from jsonb_array_elements(p_participants) item where item->>'role' in ('student', 'parent_guardian') and item->>'decisionSide' = 'student' and coalesce((item->>'confirmsReschedule')::boolean, false))
    or not exists (select 1 from jsonb_array_elements(p_participants) item where item->>'role' = 'teacher' and coalesce((item->>'receivesNotifications')::boolean, true) and coalesce((item->>'confirmsCancellation')::boolean, false) and coalesce((item->>'confirmsReschedule')::boolean, false))
  then raise exception 'participant_sides_required'; end if;
  insert into public.kitty_class_occurrences(
    occurrence_key, title, subject, starts_at, ends_at, local_date, timezone,
    origin_channel, created_by_profile_id
  ) values (
    p_occurrence_key, btrim(p_title), nullif(btrim(p_subject), ''), p_starts_at,
    p_ends_at, p_local_date, p_timezone, p_origin_channel, p_created_by
  ) returning * into v_occurrence;
  insert into public.kitty_class_participants(
    occurrence_id, contact_id, participant_role, receives_notifications,
    confirms_cancellation, confirms_reschedule, decision_side
  ) select v_occurrence.id, (item->>'contactId')::uuid, item->>'role',
    coalesce((item->>'receivesNotifications')::boolean, true),
    coalesce((item->>'confirmsCancellation')::boolean, false),
    coalesce((item->>'confirmsReschedule')::boolean, false),
    nullif(item->>'decisionSide', '')
  from jsonb_array_elements(p_participants) item;
  insert into public.kitty_class_audit_events(actor_type, actor_profile_id, event_type, entity_type, entity_id)
    values ('admin', p_created_by, 'occurrence_created', 'occurrence', v_occurrence.id);
  return v_occurrence;
end; $$;

create function public.request_kitty_class_change(
  p_occurrence_id uuid, p_change_type text, p_requested_by uuid,
  p_requester_side text, p_reason text, p_proposed_starts_at timestamptz,
  p_proposed_ends_at timestamptz, p_proposed_timezone text, p_payload_digest text
) returns public.kitty_class_change_requests
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_occurrence public.kitty_class_occurrences; v_request public.kitty_class_change_requests; v_intent text;
begin
  select * into v_occurrence from public.kitty_class_occurrences where id = p_occurrence_id for update;
  if not found or v_occurrence.status <> 'scheduled' then raise exception 'occurrence_unavailable'; end if;
  if p_change_type not in ('cancel', 'reschedule') or p_requester_side not in ('teacher', 'student') then raise exception 'invalid_change'; end if;
  if not exists (
    select 1 from public.kitty_class_participants
    where contact_id = p_requested_by and is_active and decision_side = p_requester_side
      and case when p_change_type = 'cancel' then confirms_cancellation else confirms_reschedule end
      and (occurrence_id = p_occurrence_id or series_id = v_occurrence.series_id)
  ) then raise exception 'participant_required'; end if;
  insert into public.kitty_class_change_requests(
    occurrence_id, change_type, requested_by_contact_id, requester_side, reason,
    proposed_starts_at, proposed_ends_at, proposed_timezone, status, payload_digest
  ) values (
    p_occurrence_id, p_change_type, p_requested_by, p_requester_side,
    nullif(left(btrim(coalesce(p_reason, '')), 500), ''), p_proposed_starts_at,
    p_proposed_ends_at, p_proposed_timezone,
    case when p_change_type = 'reschedule' and p_proposed_starts_at is null then 'collecting_alternatives' else 'awaiting_counterparty' end,
    p_payload_digest
  ) returning * into v_request;
  insert into public.kitty_class_change_confirmations(
    change_request_id, request_version, decision_side, decided_by_contact_id,
    decision, payload_digest, source_channel, decided_at
  ) values (v_request.id, 1, p_requester_side, p_requested_by, 'approved', p_payload_digest, 'whatsapp', now());
  update public.kitty_class_occurrences set status = 'change_requested', version = version + 1 where id = p_occurrence_id;
  v_intent := case when p_change_type = 'reschedule' and p_proposed_starts_at is not null then 'class_change_proposal' else 'class_change_request' end;
  insert into public.kitty_class_notification_outbox(occurrence_id, change_request_id, contact_id, intent, payload, idempotency_key)
    select v_occurrence.id, v_request.id, participant.contact_id, v_intent,
      jsonb_build_object('occurrenceId', v_occurrence.id),
      'kitty-class:' || v_request.id::text || ':' || participant.contact_id::text || ':' || v_intent
    from public.kitty_class_participants participant
    where participant.is_active and participant.contact_id <> p_requested_by
      and (participant.receives_notifications or (
        participant.decision_side <> p_requester_side
        and case when p_change_type = 'cancel' then participant.confirms_cancellation else participant.confirms_reschedule end
      ))
      and (participant.occurrence_id = v_occurrence.id or participant.series_id = v_occurrence.series_id)
    on conflict (idempotency_key) do nothing;
  insert into public.kitty_class_audit_events(actor_type, actor_contact_id, event_type, entity_type, entity_id)
    values ('contact', p_requested_by, 'change_requested', 'change_request', v_request.id);
  return v_request;
end; $$;

create function public.propose_kitty_class_replacement(
  p_request_id uuid, p_request_version integer, p_payload_digest text,
  p_proposed_by uuid, p_starts_at timestamptz, p_ends_at timestamptz,
  p_timezone text, p_new_payload_digest text
) returns public.kitty_class_change_requests
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_request public.kitty_class_change_requests; v_occurrence public.kitty_class_occurrences; v_side text;
begin
  select * into v_request from public.kitty_class_change_requests where id = p_request_id for update;
  if not found or v_request.change_type <> 'reschedule' or v_request.status <> 'collecting_alternatives' or v_request.expires_at <= now() then raise exception 'request_unavailable'; end if;
  if v_request.version <> p_request_version or v_request.payload_digest <> p_payload_digest then raise exception 'stale_change_request'; end if;
  if p_starts_at is null or p_ends_at <= p_starts_at then raise exception 'replacement_time_required'; end if;
  select * into v_occurrence from public.kitty_class_occurrences where id = v_request.occurrence_id for update;
  select participant.decision_side into v_side from public.kitty_class_participants participant
    where participant.contact_id = p_proposed_by and participant.is_active
      and participant.decision_side is not null and participant.confirms_reschedule
      and (participant.occurrence_id = v_occurrence.id or participant.series_id = v_occurrence.series_id)
    limit 1;
  if v_side is null then raise exception 'participant_required'; end if;
  update public.kitty_class_change_requests set
    proposed_starts_at = p_starts_at, proposed_ends_at = p_ends_at,
    proposed_timezone = coalesce(p_timezone, v_occurrence.timezone),
    status = 'awaiting_counterparty', requester_side = v_side, version = version + 1,
    payload_digest = p_new_payload_digest
    where id = v_request.id returning * into v_request;
  insert into public.kitty_class_change_confirmations(
    change_request_id, request_version, decision_side, decided_by_contact_id,
    decision, payload_digest, source_channel, decided_at
  ) values (v_request.id, v_request.version, v_side, p_proposed_by, 'approved', p_new_payload_digest, 'whatsapp', now());
  insert into public.kitty_class_notification_outbox(occurrence_id, change_request_id, contact_id, intent, payload, idempotency_key)
    select v_occurrence.id, v_request.id, participant.contact_id, 'class_change_proposal',
      jsonb_build_object('occurrenceId', v_occurrence.id),
      'kitty-class:' || v_request.id::text || ':' || v_request.version::text || ':' || participant.contact_id::text || ':class_change_proposal'
    from public.kitty_class_participants participant
    where participant.is_active and participant.contact_id <> p_proposed_by
      and (participant.receives_notifications or (participant.decision_side <> v_side and participant.confirms_reschedule))
      and (participant.occurrence_id = v_occurrence.id or participant.series_id = v_occurrence.series_id)
    on conflict (idempotency_key) do nothing;
  insert into public.kitty_class_audit_events(actor_type, actor_contact_id, event_type, entity_type, entity_id)
    values ('contact', p_proposed_by, 'replacement_proposed', 'change_request', v_request.id);
  return v_request;
end; $$;

create function public.decide_kitty_class_change(
  p_request_id uuid, p_request_version integer, p_payload_digest text,
  p_decided_by uuid, p_decision text, p_provider_message_id text
) returns public.kitty_class_change_requests
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_request public.kitty_class_change_requests; v_occurrence public.kitty_class_occurrences; v_decision_side text; v_approved integer;
begin
  select * into v_request from public.kitty_class_change_requests where id = p_request_id for update;
  if not found or v_request.status not in ('awaiting_counterparty', 'collecting_alternatives') or v_request.expires_at <= now() then raise exception 'request_unavailable'; end if;
  if v_request.version <> p_request_version or v_request.payload_digest <> p_payload_digest then raise exception 'stale_change_request'; end if;
  if p_decision not in ('approved', 'rejected') then raise exception 'invalid_decision'; end if;
  select * into v_occurrence from public.kitty_class_occurrences where id = v_request.occurrence_id for update;
  select participant.decision_side into v_decision_side
  from public.kitty_class_participants participant
  where participant.contact_id = p_decided_by and participant.is_active
    and participant.decision_side is not null
    and case when v_request.change_type = 'cancel' then participant.confirms_cancellation else participant.confirms_reschedule end
    and (participant.occurrence_id = v_occurrence.id or participant.series_id = v_occurrence.series_id)
  limit 1;
  if v_decision_side is null or v_decision_side = v_request.requester_side then raise exception 'decision_not_permitted'; end if;
  insert into public.kitty_class_change_confirmations(
    change_request_id, request_version, decision_side, decided_by_contact_id,
    decision, payload_digest, source_channel, provider_message_id, decided_at
  ) values (
    v_request.id, v_request.version, v_decision_side, p_decided_by,
    p_decision, p_payload_digest, 'whatsapp', p_provider_message_id, now()
  ) on conflict (change_request_id, request_version, decision_side) do update set
    decided_by_contact_id = excluded.decided_by_contact_id, decision = excluded.decision,
    provider_message_id = excluded.provider_message_id, decided_at = now(), updated_at = now();
  if p_decision = 'rejected' then
    update public.kitty_class_change_requests set status = 'rejected', finalized_at = now() where id = v_request.id returning * into v_request;
    update public.kitty_class_occurrences set status = 'scheduled', version = version + 1 where id = v_request.occurrence_id;
    insert into public.kitty_class_notification_outbox(occurrence_id, change_request_id, contact_id, intent, payload, idempotency_key)
      select v_request.occurrence_id, v_request.id, participant.contact_id, 'class_change_rejected',
        jsonb_build_object('occurrenceId', v_request.occurrence_id),
        'kitty-class:' || v_request.id::text || ':' || participant.contact_id::text || ':class_change_rejected'
      from public.kitty_class_participants participant
      join public.kitty_class_occurrences occurrence on occurrence.id = v_request.occurrence_id
      where participant.is_active and participant.receives_notifications
        and (participant.occurrence_id = occurrence.id or participant.series_id = occurrence.series_id)
      on conflict (idempotency_key) do nothing;
  else
    select count(distinct decision_side) into v_approved
    from public.kitty_class_change_confirmations
    where change_request_id = v_request.id and request_version = v_request.version and decision = 'approved';
  if v_approved = 2 then
      update public.kitty_class_change_requests set status = 'ready_to_finalize' where id = v_request.id returning * into v_request;
      select public.finalize_kitty_class_change(v_request.id, v_request.version, v_request.payload_digest) into v_request;
    end if;
  end if;
  insert into public.kitty_class_audit_events(actor_type, actor_contact_id, event_type, entity_type, entity_id)
    values ('contact', p_decided_by, 'change_' || p_decision, 'change_request', v_request.id);
  return v_request;
end; $$;

create function public.finalize_kitty_class_change(
  p_request_id uuid, p_request_version integer, p_payload_digest text
) returns public.kitty_class_change_requests
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_request public.kitty_class_change_requests; v_occurrence public.kitty_class_occurrences; v_replacement public.kitty_class_occurrences; v_intent text;
begin
  select * into v_request from public.kitty_class_change_requests where id = p_request_id for update;
  if not found or v_request.status <> 'ready_to_finalize' or v_request.expires_at <= now() then raise exception 'request_not_ready'; end if;
  if v_request.version <> p_request_version or v_request.payload_digest <> p_payload_digest then raise exception 'stale_change_request'; end if;
  select * into v_occurrence from public.kitty_class_occurrences where id = v_request.occurrence_id for update;
  if v_request.change_type = 'cancel' then
    update public.kitty_class_occurrences set status = 'cancelled', cancelled_at = now(), version = version + 1 where id = v_occurrence.id;
    v_intent := 'class_cancelled';
  else
    if v_request.proposed_starts_at is null or v_request.proposed_ends_at is null then raise exception 'replacement_time_required'; end if;
    update public.kitty_class_occurrences set status = 'rescheduled', version = version + 1 where id = v_occurrence.id;
    insert into public.kitty_class_occurrences(
      series_id, occurrence_key, title, subject, starts_at, ends_at, local_date,
      timezone, predecessor_occurrence_id, origin_channel
    ) values (
      v_occurrence.series_id, 'reschedule:' || v_request.id::text, v_occurrence.title,
      v_occurrence.subject, v_request.proposed_starts_at, v_request.proposed_ends_at,
      (v_request.proposed_starts_at at time zone coalesce(v_request.proposed_timezone, v_occurrence.timezone))::date,
      coalesce(v_request.proposed_timezone, v_occurrence.timezone), v_occurrence.id, 'system'
    ) returning * into v_replacement;
    insert into public.kitty_class_participants(
      occurrence_id, contact_id, participant_role, receives_notifications,
      confirms_cancellation, confirms_reschedule, decision_side, is_active
    ) select v_replacement.id, contact_id, participant_role, receives_notifications,
      confirms_cancellation, confirms_reschedule, decision_side, is_active
    from public.kitty_class_participants where occurrence_id = v_occurrence.id;
    v_intent := 'class_rescheduled';
  end if;
  update public.kitty_class_change_requests set status = 'finalized', finalized_at = now() where id = v_request.id returning * into v_request;
  insert into public.kitty_class_notification_outbox(occurrence_id, change_request_id, contact_id, intent, payload, idempotency_key)
    select v_occurrence.id, v_request.id, p.contact_id, v_intent,
      jsonb_build_object('occurrenceId', v_occurrence.id, 'replacementOccurrenceId', v_replacement.id),
      'kitty-class:' || v_request.id::text || ':' || p.contact_id::text || ':' || v_intent
    from public.kitty_class_participants p
    where p.is_active and p.receives_notifications
      and (p.occurrence_id = v_occurrence.id or p.series_id = v_occurrence.series_id)
    on conflict (idempotency_key) do nothing;
  insert into public.kitty_class_audit_events(actor_type, event_type, entity_type, entity_id)
    values ('system', 'change_finalized', 'change_request', v_request.id);
  return v_request;
end; $$;

create function public.override_kitty_class_occurrence(
  p_occurrence_id uuid, p_change_type text, p_reason text, p_profile_id uuid,
  p_starts_at timestamptz, p_ends_at timestamptz, p_timezone text
) returns public.kitty_class_occurrences
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_occurrence public.kitty_class_occurrences; v_request public.kitty_class_change_requests; v_replacement public.kitty_class_occurrences; v_intent text;
begin
  if coalesce(length(btrim(p_reason)), 0) = 0 then raise exception 'override_reason_required'; end if;
  select * into v_occurrence from public.kitty_class_occurrences where id = p_occurrence_id for update;
  if not found or v_occurrence.status not in ('scheduled', 'change_requested') then raise exception 'occurrence_unavailable'; end if;
  update public.kitty_class_change_requests set status = 'superseded', override_reason = left(btrim(p_reason), 500), override_profile_id = p_profile_id, finalized_at = now()
    where occurrence_id = p_occurrence_id and status in ('awaiting_requester_confirmation', 'awaiting_counterparty', 'collecting_alternatives', 'ready_to_finalize')
    returning * into v_request;
  if p_change_type = 'cancel' then
    update public.kitty_class_occurrences set status = 'cancelled', cancelled_at = now(), version = version + 1 where id = p_occurrence_id returning * into v_occurrence;
    v_intent := 'class_cancelled';
  elsif p_change_type = 'reschedule' and p_starts_at is not null and p_ends_at > p_starts_at then
    update public.kitty_class_occurrences set status = 'rescheduled', version = version + 1 where id = p_occurrence_id returning * into v_occurrence;
    insert into public.kitty_class_occurrences(series_id, occurrence_key, title, subject, starts_at, ends_at, local_date, timezone, predecessor_occurrence_id, origin_channel, created_by_profile_id)
      values (v_occurrence.series_id, 'override:' || p_occurrence_id::text || ':' || v_occurrence.version::text, v_occurrence.title, v_occurrence.subject,
        p_starts_at, p_ends_at, (p_starts_at at time zone coalesce(p_timezone, v_occurrence.timezone))::date,
        coalesce(p_timezone, v_occurrence.timezone), v_occurrence.id, 'imessage', p_profile_id)
      returning * into v_replacement;
    insert into public.kitty_class_participants(
      occurrence_id, contact_id, participant_role, receives_notifications,
      confirms_cancellation, confirms_reschedule, decision_side, is_active
    ) select v_replacement.id, contact_id, participant_role, receives_notifications,
      confirms_cancellation, confirms_reschedule, decision_side, is_active
    from public.kitty_class_participants where occurrence_id = v_occurrence.id;
    v_intent := 'class_rescheduled';
  else raise exception 'invalid_override'; end if;
  insert into public.kitty_class_notification_outbox(occurrence_id, change_request_id, contact_id, intent, payload, idempotency_key)
    select v_occurrence.id, v_request.id, participant.contact_id, v_intent,
      jsonb_build_object('occurrenceId', v_occurrence.id, 'replacementOccurrenceId', v_replacement.id),
      'kitty-class:override:' || v_occurrence.id::text || ':' || v_occurrence.version::text || ':' || participant.contact_id::text || ':' || v_intent
    from public.kitty_class_participants participant
    where participant.is_active and participant.receives_notifications
      and (participant.occurrence_id = v_occurrence.id or participant.series_id = v_occurrence.series_id)
    on conflict (idempotency_key) do nothing;
  insert into public.kitty_class_audit_events(actor_type, actor_profile_id, event_type, entity_type, entity_id, metadata)
    values ('admin', p_profile_id, 'occurrence_overridden', 'occurrence', p_occurrence_id, jsonb_build_object('reason', left(btrim(p_reason), 500)));
  return v_occurrence;
end; $$;

create function public.maintain_kitty_class_state()
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_request record; v_notification record; v_expired integer := 0; v_reclaimed integer := 0;
begin
  for v_request in
    update public.kitty_class_change_requests
      set status = 'expired', finalized_at = now()
      where expires_at <= now()
        and status in ('awaiting_requester_confirmation', 'awaiting_counterparty', 'collecting_alternatives', 'ready_to_finalize')
      returning id, occurrence_id
  loop
    update public.kitty_class_occurrences
      set status = 'scheduled', version = version + 1
      where id = v_request.occurrence_id and status = 'change_requested';
    insert into public.kitty_class_audit_events(actor_type, event_type, entity_type, entity_id)
      values ('system', 'change_expired', 'change_request', v_request.id);
    v_expired := v_expired + 1;
  end loop;

  for v_notification in
    update public.kitty_class_notification_outbox
      set status = 'failed', available_at = now(), last_error_code = 'stale_sending_lease'
      where status = 'sending' and updated_at < now() - interval '10 minutes'
      returning id
  loop
    insert into public.kitty_class_audit_events(actor_type, event_type, entity_type, entity_id)
      values ('system', 'notification_lease_reclaimed', 'notification', v_notification.id);
    v_reclaimed := v_reclaimed + 1;
  end loop;
  return jsonb_build_object('expiredRequests', v_expired, 'reclaimedNotifications', v_reclaimed);
end; $$;

create function public.find_my_pending_kitty_class_changes(p_contact_id uuid, p_reference_code text default null)
returns table (
  id uuid, occurrence_id uuid, change_type text, status text,
  proposed_starts_at timestamptz, proposed_ends_at timestamptz,
  proposed_timezone text, payload_digest text, version integer, expires_at timestamptz
)
language sql stable security definer set search_path = public, pg_temp as $$
  select request.id, request.occurrence_id, request.change_type, request.status,
    request.proposed_starts_at, request.proposed_ends_at, request.proposed_timezone,
    request.payload_digest, request.version, request.expires_at
  from public.kitty_class_change_requests request
  join public.kitty_class_occurrences occurrence on occurrence.id = request.occurrence_id
  where request.status in ('awaiting_counterparty', 'collecting_alternatives', 'ready_to_finalize')
    and request.expires_at > now()
    and (p_reference_code is null or upper(left(replace(request.id::text, '-', ''), 6)) = upper(p_reference_code))
    and exists (
      select 1 from public.kitty_class_participants participant
      where participant.contact_id = p_contact_id and participant.is_active
        and (participant.occurrence_id = occurrence.id or participant.series_id = occurrence.series_id)
    )
  order by request.created_at desc
  limit 20
$$;

create function public.retry_kitty_class_notification(p_notification_id uuid, p_profile_id uuid)
returns public.kitty_class_notification_outbox
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_notification public.kitty_class_notification_outbox;
begin
  update public.kitty_class_notification_outbox
    set status = 'pending', attempt_count = 0, available_at = now(), last_error_code = null
    where id = p_notification_id and status in ('failed', 'blocked')
    returning * into v_notification;
  if not found then raise exception 'notification_not_retryable'; end if;
  insert into public.kitty_class_audit_events(actor_type, actor_profile_id, event_type, entity_type, entity_id)
    values ('admin', p_profile_id, 'notification_retry_requested', 'notification', p_notification_id);
  return v_notification;
end; $$;

revoke execute on function public.create_kitty_class_series(text, text, text, time, integer, smallint[], date, date, text, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.create_kitty_one_off_class(text, text, timestamptz, timestamptz, date, text, text, uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.request_kitty_class_change(uuid, text, uuid, text, text, timestamptz, timestamptz, text, text) from public, anon, authenticated;
revoke execute on function public.propose_kitty_class_replacement(uuid, integer, text, uuid, timestamptz, timestamptz, text, text) from public, anon, authenticated;
revoke execute on function public.decide_kitty_class_change(uuid, integer, text, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.finalize_kitty_class_change(uuid, integer, text) from public, anon, authenticated;
revoke execute on function public.override_kitty_class_occurrence(uuid, text, text, uuid, timestamptz, timestamptz, text) from public, anon, authenticated;
revoke execute on function public.maintain_kitty_class_state() from public, anon, authenticated;
revoke execute on function public.find_my_pending_kitty_class_changes(uuid, text) from public, anon, authenticated;
revoke execute on function public.retry_kitty_class_notification(uuid, uuid) from public, anon, authenticated;

grant execute on function public.create_kitty_class_series(text, text, text, time, integer, smallint[], date, date, text, uuid, jsonb) to service_role;
grant execute on function public.create_kitty_one_off_class(text, text, timestamptz, timestamptz, date, text, text, uuid, text, jsonb) to service_role;
grant execute on function public.request_kitty_class_change(uuid, text, uuid, text, text, timestamptz, timestamptz, text, text) to service_role;
grant execute on function public.propose_kitty_class_replacement(uuid, integer, text, uuid, timestamptz, timestamptz, text, text) to service_role;
grant execute on function public.decide_kitty_class_change(uuid, integer, text, uuid, text, text) to service_role;
grant execute on function public.finalize_kitty_class_change(uuid, integer, text) to service_role;
grant execute on function public.override_kitty_class_occurrence(uuid, text, text, uuid, timestamptz, timestamptz, text) to service_role;
grant execute on function public.maintain_kitty_class_state() to service_role;
grant execute on function public.find_my_pending_kitty_class_changes(uuid, text) to service_role;
grant execute on function public.retry_kitty_class_notification(uuid, uuid) to service_role;

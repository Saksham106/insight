create table if not exists public.hermes_import_batches (
  id uuid primary key default gen_random_uuid(),
  imported_by uuid references public.profiles(id) on delete set null,
  consent_attested boolean not null default false,
  consent_source text not null default 'admin_attestation'
    check (consent_source in ('admin_attestation')),
  source_format text not null default 'vcard'
    check (source_format in ('vcard')),
  source_sha256 text not null,
  total_count integer not null default 0 check (total_count >= 0),
  created_count integer not null default 0 check (created_count >= 0),
  updated_count integer not null default 0 check (updated_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  error_count integer not null default 0 check (error_count >= 0),
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.hermes_contacts (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (length(btrim(display_name)) between 1 and 200),
  whatsapp_e164 text not null unique
    check (whatsapp_e164 ~ '^\+[1-9]\d{7,14}$'),
  role text not null default 'unclassified'
    check (role in ('teacher', 'student', 'parent', 'employee', 'other', 'unclassified')),
  profile_id uuid references public.profiles(id) on delete set null,
  profile_link_status text not null default 'unlinked'
    check (profile_link_status in ('unlinked', 'suggested', 'confirmed', 'rejected')),
  profile_link_confirmed_by uuid references public.profiles(id) on delete set null,
  profile_link_confirmed_at timestamptz,
  timezone text,
  timezone_source text
    check (timezone_source is null or timezone_source in ('profile', 'conversation', 'admin', 'task')),
  communication_policy text not null default 'direct'
    check (communication_policy in ('direct', 'guardian_only', 'approval_required', 'paused', 'opted_out')),
  consent_status text not null default 'attested'
    check (consent_status in ('attested', 'withdrawn')),
  consent_source text not null default 'admin_attestation'
    check (consent_source in ('admin_attestation', 'whatsapp', 'written')),
  consent_attested_by uuid references public.profiles(id) on delete set null,
  consent_attested_at timestamptz not null default now(),
  import_batch_id uuid references public.hermes_import_batches(id) on delete set null,
  last_inbound_at timestamptz,
  service_window_expires_at timestamptz,
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (profile_link_status = 'confirmed' and profile_id is not null and profile_link_confirmed_at is not null)
    or profile_link_status <> 'confirmed'
  )
);

create unique index if not exists hermes_contacts_profile_unique
  on public.hermes_contacts(profile_id)
  where profile_id is not null and deleted_at is null;
create index if not exists hermes_contacts_attention
  on public.hermes_contacts(role, profile_link_status, communication_policy)
  where deleted_at is null;

create table if not exists public.hermes_contact_relationships (
  id uuid primary key default gen_random_uuid(),
  source_contact_id uuid not null references public.hermes_contacts(id) on delete cascade,
  target_contact_id uuid not null references public.hermes_contacts(id) on delete cascade,
  relationship_type text not null
    check (relationship_type in ('parent_guardian', 'student', 'teacher', 'employee', 'other')),
  confirmed_by uuid references public.profiles(id) on delete set null,
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (source_contact_id, target_contact_id, relationship_type),
  check (source_contact_id <> target_contact_id)
);

create index if not exists hermes_relationships_target
  on public.hermes_contact_relationships(target_contact_id, relationship_type);

create table if not exists public.hermes_scheduling_cases (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 240),
  status text not null default 'collecting_availability'
    check (status in ('draft', 'collecting_availability', 'proposing', 'awaiting_approval', 'confirmed', 'cancelled', 'needs_attention')),
  requested_by_contact_id uuid references public.hermes_contacts(id) on delete set null,
  insight_assignment_id uuid references public.teacher_student_assignments(id) on delete set null,
  insight_session_id uuid references public.sessions(id) on delete set null,
  timezone text,
  proposed_times jsonb not null default '[]'::jsonb,
  resolution jsonb,
  human_takeover boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hermes_cases_status
  on public.hermes_scheduling_cases(status, updated_at desc);

create table if not exists public.hermes_case_participants (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.hermes_scheduling_cases(id) on delete cascade,
  contact_id uuid not null references public.hermes_contacts(id) on delete cascade,
  participant_role text not null
    check (participant_role in ('teacher', 'student', 'parent', 'administrator', 'other')),
  availability jsonb not null default '[]'::jsonb,
  response_status text not null default 'pending'
    check (response_status in ('pending', 'contacted', 'responded', 'declined', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (case_id, contact_id)
);

create index if not exists hermes_case_participants_contact
  on public.hermes_case_participants(contact_id, response_status);

create table if not exists public.hermes_messages (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.hermes_contacts(id) on delete cascade,
  case_id uuid references public.hermes_scheduling_cases(id) on delete set null,
  direction text not null check (direction in ('inbound', 'outbound')),
  message_kind text not null
    check (message_kind in ('text', 'template', 'interactive', 'media', 'status', 'unknown')),
  intent text,
  template_name text,
  template_locale text,
  body text,
  meta_message_id text,
  idempotency_key text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'sent', 'delivered', 'read', 'failed', 'received', 'ignored')),
  error_code text,
  error_detail text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hermes_messages_contact_created
  on public.hermes_messages(contact_id, created_at desc);
create unique index if not exists hermes_messages_meta_id_unique
  on public.hermes_messages(meta_message_id)
  where meta_message_id is not null;

create table if not exists public.hermes_approvals (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.hermes_scheduling_cases(id) on delete cascade,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'expired', 'cancelled')),
  requested_at timestamptz not null default now(),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hermes_approvals_pending
  on public.hermes_approvals(status, requested_at)
  where status = 'pending';

create table if not exists public.hermes_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_type text not null check (actor_type in ('admin', 'hermes', 'contact', 'system')),
  actor_profile_id uuid references public.profiles(id) on delete set null,
  actor_contact_id uuid references public.hermes_contacts(id) on delete set null,
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists hermes_audit_entity_created
  on public.hermes_audit_events(entity_type, entity_id, created_at desc);
create unique index if not exists hermes_audit_request_unique
  on public.hermes_audit_events(request_id)
  where request_id is not null;

alter table public.hermes_import_batches enable row level security;
alter table public.hermes_contacts enable row level security;
alter table public.hermes_contact_relationships enable row level security;
alter table public.hermes_scheduling_cases enable row level security;
alter table public.hermes_case_participants enable row level security;
alter table public.hermes_messages enable row level security;
alter table public.hermes_approvals enable row level security;
alter table public.hermes_audit_events enable row level security;

create policy hermes_import_batches_admin_all on public.hermes_import_batches
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy hermes_contacts_admin_all on public.hermes_contacts
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy hermes_relationships_admin_all on public.hermes_contact_relationships
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy hermes_cases_admin_all on public.hermes_scheduling_cases
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy hermes_case_participants_admin_all on public.hermes_case_participants
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy hermes_approvals_admin_all on public.hermes_approvals
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

grant select, insert, update, delete on table public.hermes_import_batches to authenticated;
grant select, insert, update, delete on table public.hermes_contacts to authenticated;
grant select, insert, update, delete on table public.hermes_contact_relationships to authenticated;
grant select, insert, update, delete on table public.hermes_scheduling_cases to authenticated;
grant select, insert, update, delete on table public.hermes_case_participants to authenticated;
grant select, insert, update, delete on table public.hermes_approvals to authenticated;

revoke all on table public.hermes_messages from anon, authenticated;
revoke all on table public.hermes_audit_events from anon, authenticated;

grant all on table public.hermes_import_batches to service_role;
grant all on table public.hermes_contacts to service_role;
grant all on table public.hermes_contact_relationships to service_role;
grant all on table public.hermes_scheduling_cases to service_role;
grant all on table public.hermes_case_participants to service_role;
grant all on table public.hermes_messages to service_role;
grant all on table public.hermes_approvals to service_role;
grant all on table public.hermes_audit_events to service_role;

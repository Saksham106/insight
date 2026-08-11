create table public.academy_agent_action_requests (
  id uuid primary key default gen_random_uuid(),
  actor_key text not null check (char_length(actor_key) between 3 and 240),
  actor_type text not null check (actor_type in ('admin', 'contact')),
  actor_contact_id uuid references public.hermes_contacts(id) on delete restrict,
  channel text not null check (channel in ('dashboard', 'imessage', 'whatsapp')),
  capability_name text not null check (char_length(capability_name) between 3 and 120),
  capability_version integer not null check (capability_version > 0),
  client_request_id text not null check (char_length(client_request_id) between 1 and 200),
  input_digest text not null check (input_digest ~ '^[a-f0-9]{64}$'),
  normalized_input jsonb,
  relevant_versions jsonb not null default '{}'::jsonb check (jsonb_typeof(relevant_versions) = 'object'),
  policy_version text not null check (char_length(policy_version) between 1 and 40),
  decision text not null check (decision in ('allowed', 'needs_clarification', 'needs_approval', 'denied')),
  public_reason_code text,
  missing_fields jsonb check (missing_fields is null or jsonb_typeof(missing_fields) = 'array'),
  approval_id uuid references public.hermes_approvals(id) on delete restrict,
  evaluation_token_hash text check (evaluation_token_hash is null or evaluation_token_hash ~ '^[a-f0-9]{64}$'),
  evaluation_issued_at timestamptz,
  evaluation_expires_at timestamptz,
  execution_status text not null default 'not_executable' check (execution_status in ('not_executable', 'pending', 'executing', 'completed', 'failed')),
  result jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  executed_at timestamptz,
  unique (actor_key, client_request_id),
  check ((actor_type = 'contact') = (actor_contact_id is not null)),
  check (normalized_input is null or jsonb_typeof(normalized_input) = 'object'),
  check (result is null or jsonb_typeof(result) = 'object')
);

create index academy_agent_action_capability_created_idx
  on public.academy_agent_action_requests (capability_name, created_at desc);
create index academy_agent_action_execution_idx
  on public.academy_agent_action_requests (execution_status, evaluation_expires_at)
  where execution_status in ('pending', 'executing');

alter table public.academy_agent_action_requests enable row level security;
alter table public.academy_agent_action_requests force row level security;
revoke all on table public.academy_agent_action_requests from public, anon, authenticated;
grant all on table public.academy_agent_action_requests to service_role;

alter table public.kitty_class_notification_outbox
  drop constraint if exists kitty_class_notification_outbox_intent_check;
alter table public.kitty_class_notification_outbox
  add constraint kitty_class_notification_outbox_intent_check check (
    intent in (
      'class_change_request', 'class_change_proposal', 'class_cancelled',
      'class_rescheduled', 'class_change_rejected', 'class_attendance_update',
      'class_teacher_delay', 'class_operational_update', 'class_reminder'
    )
  );

create table public.hermes_transcript_messages (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.hermes_contacts(id) on delete cascade,
  hermes_session_id text not null
    check (char_length(hermes_session_id) between 1 and 128),
  hermes_message_id bigint not null
    check (hermes_message_id > 0),
  speaker text not null
    check (speaker in ('contact', 'kitty')),
  body text not null
    check (char_length(btrim(body)) between 1 and 65536),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (hermes_session_id, hermes_message_id)
);

create index hermes_transcript_messages_contact_time_idx
  on public.hermes_transcript_messages
  (contact_id, occurred_at desc, hermes_message_id desc);

alter table public.hermes_transcript_messages enable row level security;
alter table public.hermes_transcript_messages force row level security;

revoke all on public.hermes_transcript_messages from public, anon, authenticated;
grant select, insert, update on public.hermes_transcript_messages to service_role;

comment on table public.hermes_transcript_messages is
  'Admin-only visible WhatsApp messages synchronized from Hermes; excludes prompts, tools, and reasoning.';

create view public.hermes_admin_conversation_messages
with (security_invoker = true) as
select
  'session'::text as source,
  transcript.id::text as source_id,
  transcript.contact_id,
  transcript.speaker,
  transcript.body,
  transcript.occurred_at
from public.hermes_transcript_messages transcript
union all
select
  'delivery'::text as source,
  delivery.id::text as source_id,
  delivery.contact_id,
  'kitty'::text as speaker,
  btrim(delivery.body) as body,
  delivery.occurred_at
from public.hermes_messages delivery
where delivery.direction = 'outbound'
  and delivery.message_kind = 'text'
  and delivery.status in ('accepted', 'sent', 'delivered', 'read')
  and delivery.body is not null
  and char_length(btrim(delivery.body)) between 1 and 65536;

create view public.hermes_admin_conversation_summaries
with (security_invoker = true) as
select distinct on (contact_id)
  contact_id,
  body as latest_body,
  speaker as latest_speaker,
  occurred_at as latest_at,
  count(*) over (partition by contact_id) as message_count
from public.hermes_admin_conversation_messages
order by contact_id, occurred_at desc, source_id desc;

revoke all on public.hermes_admin_conversation_messages
  from public, anon, authenticated;
revoke all on public.hermes_admin_conversation_summaries
  from public, anon, authenticated;
grant select on public.hermes_admin_conversation_messages to service_role;
grant select on public.hermes_admin_conversation_summaries to service_role;

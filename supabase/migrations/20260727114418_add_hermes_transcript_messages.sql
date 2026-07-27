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

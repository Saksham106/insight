create or replace view public.hermes_admin_conversation_messages
with (security_invoker = true) as
select
  'delivery'::text as source,
  delivery.id::text as source_id,
  delivery.contact_id,
  case
    when delivery.direction = 'inbound' then 'contact'::text
    else 'kitty'::text
  end as speaker,
  btrim(delivery.body) as body,
  delivery.occurred_at
from public.hermes_messages delivery
where delivery.direction in ('inbound', 'outbound')
  and delivery.message_kind = 'text'
  and (
    (delivery.direction = 'inbound' and delivery.status = 'received')
    or
    (
      delivery.direction = 'outbound'
      and delivery.status in ('accepted', 'sent', 'delivered', 'read')
    )
  )
  and delivery.body is not null
  and char_length(btrim(delivery.body)) between 1 and 65536
union all
select
  'session'::text as source,
  transcript.id::text as source_id,
  transcript.contact_id,
  transcript.speaker,
  transcript.body,
  transcript.occurred_at
from public.hermes_transcript_messages transcript
where transcript.speaker = 'kitty'
  and not exists (
    select 1
    from public.hermes_messages delivery
    where delivery.contact_id = transcript.contact_id
      and delivery.direction = 'outbound'
      and delivery.message_kind = 'text'
      and delivery.status in ('accepted', 'sent', 'delivered', 'read')
      and delivery.body is not null
      and char_length(btrim(delivery.body)) between 1 and 65536
      and delivery.occurred_at between
        transcript.occurred_at - interval '2 minutes'
        and transcript.occurred_at + interval '2 minutes'
  );

create or replace view public.hermes_admin_conversation_summaries
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
grant select on public.hermes_admin_conversation_summaries to service_role;;

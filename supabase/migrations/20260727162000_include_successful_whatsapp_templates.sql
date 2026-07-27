do $migration$
declare
  missing_target_count integer;
  recovery_count integer;
  updated_count integer;
begin
  lock table public.hermes_messages in share row exclusive mode;

  select count(*) into missing_target_count
  from public.hermes_messages target
  where target.direction = 'outbound'
    and target.message_kind = 'template'
    and target.intent = 'class_reminder'
    and target.case_id is not null
    and target.status in ('accepted', 'sent', 'delivered', 'read')
    and nullif(btrim(target.body), '') is null;

  if missing_target_count = 0 then
    return;
  end if;

  if missing_target_count <> 1 then
    raise exception
      'Refusing ambiguous legacy template recovery: % missing targets',
      missing_target_count;
  end if;

  with ranked_template_attempts as (
    select
      attempt.id,
      lag(attempt.id) over (
        partition by
          attempt.contact_id,
          attempt.case_id,
          attempt.intent,
          attempt.template_name,
          attempt.template_locale
        order by attempt.created_at, attempt.id
      ) as previous_attempt_id
    from public.hermes_messages attempt
    where attempt.direction = 'outbound'
      and attempt.message_kind = 'template'
  ),
  recoverable_template_bodies as (
    select target.id
    from ranked_template_attempts ranked
    join public.hermes_messages target
      on target.id = ranked.id
    join public.hermes_messages source
      on source.id = ranked.previous_attempt_id
    where target.intent = 'class_reminder'
      and target.case_id is not null
      and target.status in ('accepted', 'sent', 'delivered', 'read')
      and nullif(btrim(target.body), '') is null
      and source.status = 'failed'
      and source.created_at >= target.created_at - interval '30 minutes'
      and source.body is not null
      and char_length(btrim(source.body)) between 1 and 65536
  )
  select count(*) into recovery_count
  from recoverable_template_bodies;

  if recovery_count <> 1 then
    raise exception
      'Refusing ambiguous legacy template recovery: % candidates',
      recovery_count;
  end if;

  with ranked_template_attempts as (
    select
      attempt.id,
      lag(attempt.id) over (
        partition by
          attempt.contact_id,
          attempt.case_id,
          attempt.intent,
          attempt.template_name,
          attempt.template_locale
        order by attempt.created_at, attempt.id
      ) as previous_attempt_id
    from public.hermes_messages attempt
    where attempt.direction = 'outbound'
      and attempt.message_kind = 'template'
  ),
  recoverable_template_bodies as (
    select
      target.id as target_id,
      source.body
    from ranked_template_attempts ranked
    join public.hermes_messages target
      on target.id = ranked.id
    join public.hermes_messages source
      on source.id = ranked.previous_attempt_id
    where target.intent = 'class_reminder'
      and target.case_id is not null
      and target.status in ('accepted', 'sent', 'delivered', 'read')
      and nullif(btrim(target.body), '') is null
      and source.status = 'failed'
      and source.created_at >= target.created_at - interval '30 minutes'
      and source.body is not null
      and char_length(btrim(source.body)) between 1 and 65536
  )
  update public.hermes_messages target
  set
    body = recovered.body,
    updated_at = now()
  from recoverable_template_bodies recovered
  where target.id = recovered.target_id;

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception
      'Legacy template recovery updated % rows instead of 1',
      updated_count;
  end if;
end
$migration$;

create or replace view public.hermes_admin_conversation_messages
with (security_invoker = true) as
with visible_deliveries as (
  select
    delivery.*,
    case
      when delivery.direction = 'outbound'
        and delivery.intent <> 'gateway_transcript'
        then delivery.created_at
      else delivery.occurred_at
    end as transcript_at
  from public.hermes_messages delivery
  where delivery.direction in ('inbound', 'outbound')
    and delivery.message_kind in ('text', 'template')
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
)
select
  'delivery'::text as source,
  delivery.id::text as source_id,
  delivery.contact_id,
  case
    when delivery.direction = 'inbound' then 'contact'::text
    else 'kitty'::text
  end as speaker,
  delivery.body as body,
  delivery.transcript_at as occurred_at
from visible_deliveries delivery
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
    from visible_deliveries delivery
    where delivery.contact_id = transcript.contact_id
      and delivery.direction = 'outbound'
      and delivery.message_kind in ('text', 'template')
      and delivery.transcript_at between
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
grant select on public.hermes_admin_conversation_summaries to service_role;

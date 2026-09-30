-- The signed Swati profile can invoke the same audited capability pipeline
-- from desktop/CLI/TUI/cron without pretending to be an iMessage sender.
-- Existing service-only grants and RLS policies remain unchanged.
alter table public.academy_agent_action_requests
  drop constraint if exists academy_agent_action_requests_channel_check;
alter table public.academy_agent_action_requests
  add constraint academy_agent_action_requests_channel_check
  check (channel in ('dashboard', 'imessage', 'whatsapp', 'agent_profile'));

alter table public.academy_fee_statements
  drop constraint if exists academy_fee_statements_source_channel_check;
alter table public.academy_fee_statements
  add constraint academy_fee_statements_source_channel_check
  check (source_channel in ('dashboard', 'imessage', 'agent_profile'));

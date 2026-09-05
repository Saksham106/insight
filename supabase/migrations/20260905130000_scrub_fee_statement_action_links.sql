update public.academy_agent_action_requests
set result = result - 'publicUrl' - 'whatsappMessage',
    updated_at = now()
where capability_name like 'fee_statement.%'
  and result is not null
  and (result ? 'publicUrl' or result ? 'whatsappMessage');

alter table public.academy_agent_action_requests
  drop constraint if exists academy_agent_action_fee_statement_result_no_bearer;

alter table public.academy_agent_action_requests
  add constraint academy_agent_action_fee_statement_result_no_bearer check (
    capability_name not like 'fee_statement.%'
    or result is null
    or (
      not (result ? 'publicUrl')
      and not (result ? 'whatsappMessage')
    )
  );

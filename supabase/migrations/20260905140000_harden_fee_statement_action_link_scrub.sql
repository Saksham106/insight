create or replace function public.jsonb_strip_fee_statement_bearer_fields(p_value jsonb)
returns jsonb
language sql
immutable
strict
set search_path = ''
as $$
  select case pg_catalog.jsonb_typeof(p_value)
    when 'object' then coalesce(
      (
        select pg_catalog.jsonb_object_agg(
          item.key,
          public.jsonb_strip_fee_statement_bearer_fields(item.value)
        )
        from pg_catalog.jsonb_each(p_value) as item
        where item.key not in ('publicUrl', 'whatsappMessage')
      ),
      '{}'::jsonb
    )
    when 'array' then coalesce(
      (
        select pg_catalog.jsonb_agg(
          public.jsonb_strip_fee_statement_bearer_fields(item.value)
          order by item.position
        )
        from pg_catalog.jsonb_array_elements(p_value) with ordinality as item(value, position)
      ),
      '[]'::jsonb
    )
    else p_value
  end;
$$;

revoke all on function public.jsonb_strip_fee_statement_bearer_fields(jsonb) from public, anon, authenticated;
grant execute on function public.jsonb_strip_fee_statement_bearer_fields(jsonb) to service_role;

update public.academy_agent_action_requests
set result = public.jsonb_strip_fee_statement_bearer_fields(result),
    updated_at = now()
where pg_catalog.starts_with(capability_name, 'fee_statement.')
  and result is not null
  and (
    pg_catalog.jsonb_path_exists(result, '$.**."publicUrl"')
    or pg_catalog.jsonb_path_exists(result, '$.**."whatsappMessage"')
  );

alter table public.academy_agent_action_requests
  drop constraint if exists academy_agent_action_fee_statement_result_no_bearer;

alter table public.academy_agent_action_requests
  add constraint academy_agent_action_fee_statement_result_no_bearer check (
    not pg_catalog.starts_with(capability_name, 'fee_statement.')
    or result is null
    or (
      not pg_catalog.jsonb_path_exists(result, '$.**."publicUrl"')
      and not pg_catalog.jsonb_path_exists(result, '$.**."whatsappMessage"')
    )
  );

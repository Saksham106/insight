-- Rollback-only behavioral verification. Never publishes or changes real invoices.
begin;
do $$
declare
  admin_id uuid; a public.academy_fee_statements; b public.academy_fee_statements;
  cap public.academy_fee_statements; paid public.academy_fee_statements;
  request_id uuid := gen_random_uuid(); event_id uuid; result jsonb; n integer;
begin
  select id into admin_id from public.profiles where is_active and role='admin' limit 1;
  if admin_id is null then raise exception 'probe_requires_active_admin'; end if;
  if has_table_privilege('service_role','public.academy_fee_statement_adjustments','INSERT')
    or has_table_privilege('service_role','public.academy_fee_statement_adjustments','UPDATE')
    or has_table_privilege('service_role','public.academy_fee_statement_adjustments','DELETE') then
    raise exception 'probe_failed_service_role_direct_write';
  end if;
  if has_function_privilege('anon','public.add_academy_fee_statement_adjustment(uuid,text,text,bigint,text,integer,uuid,uuid)','EXECUTE')
    or has_function_privilege('authenticated','public.add_academy_fee_statement_adjustment(uuid,text,text,bigint,text,integer,uuid,uuid)','EXECUTE') then
    raise exception 'probe_failed_browser_rpc_permission';
  end if;
  select * into a from public.create_academy_fee_statement(encode(digest(gen_random_uuid()::text,'sha256'),'hex'), 'ROLLBACK TEST A', null, '2026-10-01','2026-10-31',null,'VND',1000,
    '[{"kind":"fee","label":"Test fixture","amountMinor":1000,"source":{"kind":"operator","reference":"rollback fixture"}}]'::jsonb,'dashboard',admin_id,null,gen_random_uuid()::text);
  select * into b from public.create_academy_fee_statement(encode(digest(gen_random_uuid()::text,'sha256'),'hex'), 'ROLLBACK TEST B', null, '2026-10-01','2026-10-31',null,'VND',1000,
    '[{"kind":"fee","label":"Test fixture","amountMinor":1000,"source":{"kind":"operator","reference":"rollback fixture"}}]'::jsonb,'dashboard',admin_id,null,gen_random_uuid()::text);
  select * into cap from public.create_academy_fee_statement(encode(digest(gen_random_uuid()::text,'sha256'),'hex'), 'ROLLBACK TEST CAP', null, '2026-10-01','2026-10-31',null,'VND',1000000000000,
    '[{"kind":"fee","label":"Test fixture","amountMinor":1000000000000,"source":{"kind":"operator","reference":"rollback fixture"}}]'::jsonb,'dashboard',admin_id,null,gen_random_uuid()::text);
  select * into paid from public.create_academy_fee_statement(encode(digest(gen_random_uuid()::text,'sha256'),'hex'), 'ROLLBACK TEST PAID', null, '2026-10-01','2026-10-31',null,'VND',1000,
    '[{"kind":"fee","label":"Test fixture","amountMinor":1000,"source":{"kind":"operator","reference":"rollback fixture"}}]'::jsonb,'dashboard',admin_id,null,gen_random_uuid()::text);
  update public.academy_fee_statements set status='paid', paid_at=now() where id=paid.id;
  execute 'set local role service_role';
  result := public.add_academy_fee_statement_adjustment(a.id,'extra_fee','Test fee',200,'fee test',0,request_id,admin_id);
  event_id := (result->>'id')::uuid;
  result := public.add_academy_fee_statement_adjustment(a.id,'extra_fee','Test fee',200,'fee test',0,request_id,admin_id);
  if (result->>'id')::uuid <> event_id then raise exception 'probe_failed_idempotency'; end if;
  begin
    perform public.add_academy_fee_statement_adjustment(a.id,'extra_fee','Changed',200,'fee test',1,request_id,admin_id);
    raise exception 'probe_failed_payload_mismatch';
  exception when raise_exception then if sqlerrm <> 'client_request_payload_mismatch' then raise; end if; end;
  begin
    perform public.add_academy_fee_statement_adjustment(a.id,'extra_fee','Stale',100,'stale',0,gen_random_uuid(),admin_id);
    raise exception 'probe_failed_stale';
  exception when raise_exception then if sqlerrm <> 'stale_fee_statement_adjustments' then raise; end if; end;
  begin
    perform public.add_academy_fee_statement_adjustment(a.id,'extra_fee','Same fee receipt',200,'fee test',1,gen_random_uuid(),admin_id);
    raise exception 'probe_failed_duplicate_fee_reference';
  exception when unique_violation then null; end;
  perform public.add_academy_fee_statement_adjustment(a.id,'advance','Confirmed payment',300,'ROLLBACK PAYMENT ' || request_id,1,gen_random_uuid(),admin_id);
  select count(*) into n from public.academy_fee_statement_adjustments where statement_id=a.id;
  if n <> 2 or (select total_minor from public.academy_fee_statements where id=a.id) <> 1000 then raise exception 'probe_failed_snapshot_or_count'; end if;
  if 1000+(select sum(case when kind='extra_fee' then amount_minor else -amount_minor end) from public.academy_fee_statement_adjustments where statement_id=a.id) <> 900 then raise exception 'probe_failed_balance'; end if;
  begin
    perform public.add_academy_fee_statement_adjustment(b.id,'advance','Duplicate payment',300,' rollback payment ' || request_id || ' ',0,gen_random_uuid(),admin_id);
    raise exception 'probe_failed_duplicate_payment';
  exception when unique_violation then null; end;
  begin
    perform public.add_academy_fee_statement_adjustment(a.id,'advance','Too much',901,'different',2,gen_random_uuid(),admin_id);
    raise exception 'probe_failed_overadvance';
  exception when raise_exception then if sqlerrm <> 'advance_exceeds_current_due' then raise; end if; end;
  begin
    perform public.add_academy_fee_statement_adjustment(cap.id,'extra_fee','Overflow',1,'overflow',0,gen_random_uuid(),admin_id);
    raise exception 'probe_failed_gross_overflow';
  exception when raise_exception then if sqlerrm <> 'invalid_fee_statement_balance' then raise; end if; end;
  begin
    perform public.add_academy_fee_statement_adjustment(paid.id,'extra_fee','Paid change',1,'paid',0,gen_random_uuid(),admin_id);
    raise exception 'probe_failed_paid_guard';
  exception when raise_exception then if sqlerrm <> 'fee_statement_ineligible' then raise; end if; end;
  begin
    perform public.add_academy_fee_statement_adjustment(b.id,'extra_fee','Wrong actor',1,'actor',0,gen_random_uuid(),gen_random_uuid());
    raise exception 'probe_failed_actor_guard';
  exception when raise_exception then if sqlerrm <> 'ineligible_fee_statement_actor' then raise; end if; end;
  execute 'reset role';
  begin
    update public.academy_fee_statements set status='void' where id=a.id;
    raise exception 'probe_failed_void_guard';
  exception when raise_exception then if sqlerrm <> 'fee_statement_has_adjustments' then raise; end if; end;
end;
$$;
select true as rollback_billing_probe_passed;
rollback;

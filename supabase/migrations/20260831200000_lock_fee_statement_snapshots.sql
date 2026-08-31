-- Enforce issued fee-statement immutability at the application database role boundary.
-- Creation remains available only through the validated SECURITY DEFINER RPC.

revoke insert, update, delete on public.academy_fee_statements from service_role;
grant select on public.academy_fee_statements to service_role;

revoke insert, update, delete on public.academy_fee_statement_audit_events from service_role;
grant select on public.academy_fee_statement_audit_events to service_role;

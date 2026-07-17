alter function public.request_hermes_approval(uuid, jsonb)
  set search_path = public, extensions, pg_temp;
alter function public.confirm_hermes_class(uuid, uuid, jsonb, boolean)
  set search_path = public, extensions, pg_temp;
alter function public.request_academy_settlement_approval(uuid)
  set search_path = public, extensions, pg_temp;
alter function public.decide_hermes_approval_by_channel(uuid, text, uuid, text, text, text)
  set search_path = public, extensions, pg_temp;
alter function public.finalize_academy_settlement(uuid)
  set search_path = public, extensions, pg_temp;

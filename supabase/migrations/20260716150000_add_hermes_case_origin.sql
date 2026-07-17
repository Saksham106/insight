alter table public.hermes_scheduling_cases
  add column if not exists origin_platform text not null default 'whatsapp_cloud',
  add column if not exists origin_actor_kind text not null default 'admin';

alter table public.hermes_scheduling_cases
  drop constraint if exists hermes_scheduling_cases_origin_platform_check,
  add constraint hermes_scheduling_cases_origin_platform_check
    check (origin_platform in ('whatsapp_cloud', 'imessage', 'admin')),
  drop constraint if exists hermes_scheduling_cases_origin_actor_kind_check,
  add constraint hermes_scheduling_cases_origin_actor_kind_check
    check (origin_actor_kind in ('admin', 'contact'));

create index if not exists hermes_cases_origin
  on public.hermes_scheduling_cases(origin_platform, updated_at desc);

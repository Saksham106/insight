-- Student availability: lets a student publish the weekly hours (and one-off
-- date exceptions) when they can meet, mirroring the teacher availability model
-- but WITHOUT booking settings. These windows intersect with the teacher's
-- open times when computing bookable slots, so a student never sees a time they
-- marked themselves unavailable. A student with no rows here is treated as
-- unrestricted (backward compatible — booking behaves exactly as before).

create table if not exists public.student_availability_rules (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  weekday integer not null check (weekday >= 0 and weekday <= 6),
  start_time time not null,
  end_time time not null,
  timezone text not null,
  is_active boolean not null default true,
  rule_type text not null default 'available' check (rule_type in ('available', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time)
);

create index if not exists idx_student_availability_rules_student
  on public.student_availability_rules (student_id, weekday) where is_active;

create table if not exists public.student_availability_overrides (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  start_time time,
  end_time time,
  timezone text not null,
  is_available boolean not null,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- times are both-null (whole day) or both-set (a window)
  check ((start_time is null) = (end_time is null)),
  check (start_time is null or end_time > start_time)
);

create index if not exists idx_student_availability_overrides_student
  on public.student_availability_overrides (student_id, date);

-- Reuse the shared updated_at trigger created by the teacher availability migration.
create trigger set_updated_at before update on public.student_availability_rules
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.student_availability_overrides
  for each row execute function public.set_updated_at();

alter table public.student_availability_rules enable row level security;
alter table public.student_availability_overrides enable row level security;

-- The owning student manages their own rows; admins can read everything.
create policy student_availability_rules_owner on public.student_availability_rules
  for all using (student_id = (select auth.uid())) with check (student_id = (select auth.uid()));
create policy student_availability_rules_admin_select on public.student_availability_rules
  for select using ((select public.is_admin()));

create policy student_availability_overrides_owner on public.student_availability_overrides
  for all using (student_id = (select auth.uid())) with check (student_id = (select auth.uid()));
create policy student_availability_overrides_admin_select on public.student_availability_overrides
  for select using ((select public.is_admin()));

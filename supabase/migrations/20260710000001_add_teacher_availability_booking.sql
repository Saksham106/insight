create table if not exists public.teacher_booking_settings (
  teacher_id uuid primary key references public.profiles(id) on delete cascade,
  default_duration_minutes integer not null default 60,
  allowed_durations integer[] not null default array[30,45,60,90,120],
  buffer_before_minutes integer not null default 0,
  buffer_after_minutes integer not null default 0,
  minimum_notice_hours integer not null default 12,
  max_days_ahead integer not null default 30,
  auto_confirm boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teacher_booking_settings_default_allowed check (default_duration_minutes = any(allowed_durations)),
  constraint teacher_booking_settings_non_negative check (
    default_duration_minutes > 0
    and cardinality(allowed_durations) > 0
    and buffer_before_minutes >= 0
    and buffer_after_minutes >= 0
    and minimum_notice_hours >= 0
  ),
  constraint teacher_booking_settings_window check (max_days_ahead between 1 and 180)
);

create table if not exists public.teacher_availability_rules (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  weekday integer not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  timezone text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teacher_availability_rules_time_order check (end_time > start_time)
);

create table if not exists public.teacher_availability_overrides (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  start_time time,
  end_time time,
  timezone text not null,
  is_available boolean not null,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teacher_availability_overrides_time_order check (
    (start_time is null and end_time is null)
    or (start_time is not null and end_time is not null and end_time > start_time)
  ),
  constraint teacher_availability_overrides_available_requires_times check (
    is_available = false or (start_time is not null and end_time is not null)
  )
);

alter table public.teacher_student_assignments
  add column if not exists is_active boolean not null default true;

alter table public.sessions
  add column if not exists booking_source text not null default 'manual'
  check (booking_source in ('manual', 'availability'));

create index if not exists idx_teacher_availability_rules_teacher_weekday
  on public.teacher_availability_rules (teacher_id, weekday)
  where is_active = true;

create index if not exists idx_teacher_availability_overrides_teacher_date
  on public.teacher_availability_overrides (teacher_id, date);

create index if not exists idx_sessions_assignment_status_time
  on public.sessions (assignment_id, status, scheduled_at);

alter table public.teacher_booking_settings enable row level security;
alter table public.teacher_availability_rules enable row level security;
alter table public.teacher_availability_overrides enable row level security;

create policy teacher_booking_settings_select_teacher on public.teacher_booking_settings
for select using (teacher_id = auth.uid());

create policy teacher_booking_settings_all_teacher on public.teacher_booking_settings
for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

create policy teacher_booking_settings_select_admin on public.teacher_booking_settings
for select using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and p.is_active = true)
);

create policy teacher_availability_rules_select_teacher on public.teacher_availability_rules
for select using (teacher_id = auth.uid());

create policy teacher_availability_rules_all_teacher on public.teacher_availability_rules
for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

create policy teacher_availability_rules_select_admin on public.teacher_availability_rules
for select using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and p.is_active = true)
);

create policy teacher_availability_overrides_select_teacher on public.teacher_availability_overrides
for select using (teacher_id = auth.uid());

create policy teacher_availability_overrides_all_teacher on public.teacher_availability_overrides
for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

create policy teacher_availability_overrides_select_admin on public.teacher_availability_overrides
for select using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and p.is_active = true)
);

create or replace function public.book_availability_session(
  p_assignment_id uuid,
  p_student_id uuid,
  p_scheduled_at timestamptz,
  p_duration_minutes integer,
  p_notes text,
  p_auto_confirm boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher_id uuid;
  v_session_id uuid;
  v_lock_key bigint;
  v_start timestamptz := p_scheduled_at;
  v_end timestamptz := p_scheduled_at + make_interval(mins => p_duration_minutes);
begin
  if auth.uid() is distinct from p_student_id then
    raise exception 'Not authorized to book on behalf of this student';
  end if;

  select teacher_id into v_teacher_id
  from public.teacher_student_assignments
  where id = p_assignment_id
    and student_id = p_student_id
    and is_active = true;

  if v_teacher_id is null then
    raise exception 'Assignment not found or inactive';
  end if;

  v_lock_key := ('x' || substr(md5(v_teacher_id::text), 1, 16))::bit(64)::bigint;
  perform pg_advisory_xact_lock(v_lock_key);

  if exists (
    select 1
    from public.sessions s
    join public.teacher_student_assignments a on a.id = s.assignment_id
    where s.status <> 'cancelled'
      and (a.teacher_id = v_teacher_id or a.student_id = p_student_id)
      and tstzrange(s.scheduled_at, s.scheduled_at + make_interval(mins => s.duration_minutes), '[)')
        && tstzrange(v_start, v_end, '[)')
  ) then
    raise exception 'Slot is no longer available';
  end if;

  insert into public.sessions (
    assignment_id,
    scheduled_at,
    duration_minutes,
    notes,
    status,
    proposed_by,
    booking_source
  )
  values (
    p_assignment_id,
    p_scheduled_at,
    p_duration_minutes,
    nullif(trim(p_notes), ''),
    case when p_auto_confirm then 'confirmed' else 'proposed' end,
    p_student_id,
    'availability'
  )
  returning id into v_session_id;

  return v_session_id;
end;
$$;

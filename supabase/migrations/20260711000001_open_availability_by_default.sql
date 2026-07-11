-- Availability becomes subtractive: a teacher is bookable by default inside an
-- open-hours envelope, and blocks time rather than publishing it.

alter table public.teacher_booking_settings
  add column if not exists availability_mode text not null default 'open'
    check (availability_mode in ('open', 'restricted')),
  add column if not exists open_day_start time not null default '08:00',
  add column if not exists open_day_end time not null default '20:00',
  add column if not exists timezone text,
  add column if not exists slot_increment_minutes integer not null default 30
    check (slot_increment_minutes in (15, 30, 60));

alter table public.teacher_booking_settings
  drop constraint if exists teacher_booking_settings_open_day_order;
alter table public.teacher_booking_settings
  add constraint teacher_booking_settings_open_day_order
  check (open_day_end > open_day_start);

alter table public.teacher_availability_rules
  add column if not exists rule_type text not null default 'available'
    check (rule_type in ('available', 'blocked'));

-- Insert a settings row for every teacher who lacks one, so mode is never
-- inferred from a missing row.
insert into public.teacher_booking_settings (teacher_id, timezone)
select p.id, p.timezone
from public.profiles p
where p.role = 'teacher'
  and not exists (
    select 1 from public.teacher_booking_settings s where s.teacher_id = p.id
  );

-- Backfill timezone from the profile where the settings row predates this column.
update public.teacher_booking_settings s
set timezone = p.timezone
from public.profiles p
where s.teacher_id = p.id
  and s.timezone is null
  and p.timezone is not null;

-- Preserve published windows: a teacher who already has an active availability
-- rule keeps the old union semantics under 'restricted'. (No-op today: 0 rules.)
update public.teacher_booking_settings s
set availability_mode = 'restricted'
where exists (
  select 1 from public.teacher_availability_rules r
  where r.teacher_id = s.teacher_id and r.is_active = true
);

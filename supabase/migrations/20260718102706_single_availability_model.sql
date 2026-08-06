insert into public.teacher_availability_rules
  (teacher_id, weekday, start_time, end_time, timezone, is_active, rule_type)
select s.teacher_id, wd.weekday, s.open_day_start, s.open_day_end,
       coalesce(s.timezone, 'UTC'), true, 'available'
from public.teacher_booking_settings s
cross join generate_series(0, 6) as wd(weekday)
where s.availability_mode = 'open'
  and not exists (
    select 1 from public.teacher_availability_rules r
    where r.teacher_id = s.teacher_id
      and r.weekday = wd.weekday
      and r.is_active = true
      and r.rule_type = 'available'
  );

update public.teacher_booking_settings
set availability_mode = 'restricted'
where availability_mode = 'open';

alter table public.teacher_booking_settings
  alter column availability_mode set default 'restricted';;

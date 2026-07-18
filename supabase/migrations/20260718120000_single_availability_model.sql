-- Collapse the two availability models into one ("set your available hours").
-- The UI now only offers the restricted model (teachers paint the hours students
-- can book). To preserve current bookability, every teacher on the old "open"
-- model has their open envelope (open_day_start..open_day_end, all 7 weekdays)
-- materialized as `available` rules. The slot engine applies `blocked` rules in
-- BOTH models, so keeping existing blocked rules alongside the new available
-- rules reproduces the old open-minus-blocks behavior exactly.

-- 1. Materialize available rules for each open-mode teacher who has none yet.
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

-- 2. Flip everyone to the single model.
update public.teacher_booking_settings
set availability_mode = 'restricted'
where availability_mode = 'open';

-- 3. New teachers default to the single model too.
alter table public.teacher_booking_settings
  alter column availability_mode set default 'restricted';

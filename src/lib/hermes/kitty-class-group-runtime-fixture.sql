insert into public.hermes_contacts(id) values
  ('00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000102'),
  ('00000000-0000-0000-0000-000000000103'),
  ('00000000-0000-0000-0000-000000000104'),
  ('00000000-0000-0000-0000-000000000105'),
  ('00000000-0000-0000-0000-000000000201'),
  ('00000000-0000-0000-0000-000000000202'),
  ('00000000-0000-0000-0000-000000000203'),
  ('00000000-0000-0000-0000-000000000204'),
  ('00000000-0000-0000-0000-000000000205');

insert into public.kitty_class_series(
  id, title, timezone, local_time, duration_minutes, weekdays,
  effective_start, origin_channel
) values (
  '00000000-0000-0000-0000-000000000301',
  'Runtime recurring group', 'UTC', '09:00', 60, array[2]::smallint[],
  '2026-08-01', 'dashboard'
);

insert into public.kitty_class_occurrences(
  id, series_id, occurrence_key, title, starts_at, ends_at,
  local_date, timezone, origin_channel
) values
  (
    '00000000-0000-0000-0000-000000000401',
    '00000000-0000-0000-0000-000000000301',
    'runtime-recurring-occurrence', 'Runtime recurring group',
    '2026-08-11 09:00+00', '2026-08-11 10:00+00',
    '2026-08-11', 'UTC', 'system'
  ),
  (
    '00000000-0000-0000-0000-000000000402', null,
    'runtime-one-off-occurrence', 'Runtime one-off group',
    '2026-08-11 13:00+00', '2026-08-11 14:00+00',
    '2026-08-11', 'UTC', 'dashboard'
  );

insert into public.kitty_class_participants(
  series_id, occurrence_id, contact_id, participant_role, decision_side,
  confirms_cancellation, confirms_reschedule, receives_notifications
) values
  (
    '00000000-0000-0000-0000-000000000301', null,
    '00000000-0000-0000-0000-000000000101', 'teacher', 'teacher',
    true, true, true
  ),
  (
    '00000000-0000-0000-0000-000000000301', null,
    '00000000-0000-0000-0000-000000000102', 'student', 'student',
    true, true, true
  ),
  (
    '00000000-0000-0000-0000-000000000301', null,
    '00000000-0000-0000-0000-000000000103', 'parent_guardian', 'student',
    true, true, true
  ),
  (
    null, '00000000-0000-0000-0000-000000000402',
    '00000000-0000-0000-0000-000000000201', 'teacher', 'teacher',
    true, true, true
  ),
  (
    null, '00000000-0000-0000-0000-000000000402',
    '00000000-0000-0000-0000-000000000202', 'student', 'student',
    true, true, true
  ),
  (
    null, '00000000-0000-0000-0000-000000000402',
    '00000000-0000-0000-0000-000000000203', 'parent_guardian', 'student',
    true, true, true
  );

insert into public.hermes_contacts(id) values
  ('00000000-0000-0000-0000-000000000901'),
  ('00000000-0000-0000-0000-000000000902'),
  ('00000000-0000-0000-0000-000000000903');

insert into public.kitty_class_series(
  id, title, timezone, local_time, duration_minutes, weekdays,
  effective_start, origin_channel
) values (
  '00000000-0000-0000-0000-000000000904',
  'Migration rejection probe', 'UTC', '10:00', 60, array[3]::smallint[],
  '2026-08-01', 'dashboard'
);

insert into public.kitty_class_occurrences(
  id, series_id, occurrence_key, title, starts_at, ends_at,
  local_date, timezone, origin_channel
) values (
  '00000000-0000-0000-0000-000000000905',
  '00000000-0000-0000-0000-000000000904',
  'migration-recurring-teacher-override', 'Migration rejection probe',
  '2026-08-12 10:00+00', '2026-08-12 11:00+00',
  '2026-08-12', 'UTC', 'system'
);

insert into public.kitty_class_participants(
  series_id, contact_id, participant_role, decision_side,
  confirms_cancellation, confirms_reschedule
) values
  (
    '00000000-0000-0000-0000-000000000904',
    '00000000-0000-0000-0000-000000000901',
    'teacher', 'teacher', true, true
  ),
  (
    '00000000-0000-0000-0000-000000000904',
    '00000000-0000-0000-0000-000000000902',
    'student', 'student', true, true
  );

-- This legacy recurring occurrence has its own active teacher and student, so
-- the old scope-count preflight accepted it. The group migration must reject
-- the active teacher instead of silently retaining or normalizing the row.
insert into public.kitty_class_participants(
  occurrence_id, contact_id, participant_role, decision_side,
  confirms_cancellation, confirms_reschedule
) values
  (
    '00000000-0000-0000-0000-000000000905',
    '00000000-0000-0000-0000-000000000903',
    'teacher', 'teacher', true, true
  ),
  (
    '00000000-0000-0000-0000-000000000905',
    '00000000-0000-0000-0000-000000000902',
    'student', 'student', true, true
  );

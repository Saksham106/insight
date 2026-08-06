create or replace function public.start_academy_lesson_cycle(
  p_period_start date,
  p_tutor_contact_ids uuid[]
)
returns public.academy_lesson_cycles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cycle public.academy_lesson_cycles;
  v_requested_count integer;
  v_added_count integer;
  v_selected_count integer;
begin
  if p_period_start <> date_trunc('month', p_period_start)::date then
    raise exception 'invalid_lesson_month';
  end if;

  v_requested_count := cardinality(p_tutor_contact_ids);
  if v_requested_count not between 1 and 100 then
    raise exception 'invalid_tutor_selection';
  end if;
  if (select count(distinct value) from unnest(p_tutor_contact_ids) value) <> v_requested_count then
    raise exception 'duplicate_tutor_selection';
  end if;
  if (
    select count(*)
    from public.hermes_contacts
    where id = any(p_tutor_contact_ids)
      and role = 'teacher'
      and is_active = true
      and deleted_at is null
  ) <> v_requested_count then
    raise exception 'selected_tutor_unavailable';
  end if;

  insert into public.academy_lesson_cycles(period_start)
  values (p_period_start)
  on conflict (period_start) do nothing;

  select *
  into v_cycle
  from public.academy_lesson_cycles
  where period_start = p_period_start
  for update;

  if v_cycle.status = 'confirmed' then
    raise exception 'lesson_cycle_confirmed';
  end if;

  insert into public.academy_teacher_collections(lesson_cycle_id, tutor_contact_id)
  select v_cycle.id, value
  from unnest(p_tutor_contact_ids) value
  on conflict (lesson_cycle_id, tutor_contact_id) do nothing;
  get diagnostics v_added_count = row_count;

  select count(*)
  into v_selected_count
  from public.academy_teacher_collections
  where lesson_cycle_id = v_cycle.id;

  update public.academy_lesson_cycles
  set status = 'collecting',
      updated_at = now()
  where id = v_cycle.id
  returning * into v_cycle;

  insert into public.hermes_audit_events(
    actor_type,
    event_type,
    entity_type,
    entity_id,
    metadata
  )
  values (
    'admin',
    'lesson_cycle_started',
    'lesson_cycle',
    v_cycle.id,
    jsonb_build_object(
      'requestedTutorCount', v_requested_count,
      'addedTutorCount', v_added_count,
      'selectedTutorCount', v_selected_count
    )
  );

  return v_cycle;
end;
$$;;

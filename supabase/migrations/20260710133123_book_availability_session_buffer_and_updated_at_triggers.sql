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
  v_buffer_before_minutes integer := 0;
  v_buffer_after_minutes integer := 0;
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

  select coalesce(buffer_before_minutes, 0), coalesce(buffer_after_minutes, 0)
  into v_buffer_before_minutes, v_buffer_after_minutes
  from public.teacher_booking_settings
  where teacher_id = v_teacher_id;

  v_buffer_before_minutes := coalesce(v_buffer_before_minutes, 0);
  v_buffer_after_minutes := coalesce(v_buffer_after_minutes, 0);

  if exists (
    select 1
    from public.sessions s
    join public.teacher_student_assignments a on a.id = s.assignment_id
    where s.status <> 'cancelled'
      and (a.teacher_id = v_teacher_id or a.student_id = p_student_id)
      and tstzrange(
        s.scheduled_at - make_interval(mins => v_buffer_before_minutes),
        s.scheduled_at + make_interval(mins => s.duration_minutes) + make_interval(mins => v_buffer_after_minutes),
        '[)'
      )
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

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_teacher_booking_settings_updated_at on public.teacher_booking_settings;
create trigger set_teacher_booking_settings_updated_at
  before update on public.teacher_booking_settings
  for each row execute function public.set_updated_at();

drop trigger if exists set_teacher_availability_rules_updated_at on public.teacher_availability_rules;
create trigger set_teacher_availability_rules_updated_at
  before update on public.teacher_availability_rules
  for each row execute function public.set_updated_at();

drop trigger if exists set_teacher_availability_overrides_updated_at on public.teacher_availability_overrides;
create trigger set_teacher_availability_overrides_updated_at
  before update on public.teacher_availability_overrides
  for each row execute function public.set_updated_at();;

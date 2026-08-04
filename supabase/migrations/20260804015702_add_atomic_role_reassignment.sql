-- A role change and the relationship cleanup it requires are one logical
-- mutation. Keeping them in one Postgres function makes every failure roll the
-- whole change back instead of exposing a half-cleaned old role.
create or replace function public.reassign_profile_role(
  p_user_id uuid,
  p_role text,
  p_preview boolean default false
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_profile public.profiles;
  v_assignments_as_teacher integer := 0;
  v_assignments_as_student integer := 0;
  v_parent_links_as_parent integer := 0;
  v_parent_links_as_student integer := 0;
begin
  if p_role not in ('teacher', 'student', 'parent') then
    raise exception 'invalid_target_role';
  end if;

  select * into v_profile
  from public.profiles
  where id = p_user_id and deleted_at is null
  for update;

  if not found then raise exception 'user_not_found'; end if;
  if v_profile.role = 'admin' then raise exception 'admin_role_not_assignable'; end if;
  if v_profile.role not in ('teacher', 'student', 'parent') then raise exception 'current_role_not_assignable'; end if;
  if v_profile.role = p_role then raise exception 'role_unchanged'; end if;

  if v_profile.role = 'teacher' then
    select count(*) into v_assignments_as_teacher
    from public.teacher_student_assignments
    where teacher_id = p_user_id and is_active = true;
  elsif v_profile.role = 'student' then
    select count(*) into v_assignments_as_student
    from public.teacher_student_assignments
    where student_id = p_user_id and is_active = true;

    select count(*) into v_parent_links_as_student
    from public.parent_student_links
    where student_id = p_user_id;
  elsif v_profile.role = 'parent' then
    select count(*) into v_parent_links_as_parent
    from public.parent_student_links
    where parent_id = p_user_id;
  end if;

  if not p_preview then
    if v_profile.role = 'teacher' then
      update public.teacher_student_assignments
      set is_active = false
      where teacher_id = p_user_id and is_active = true;
    elsif v_profile.role = 'student' then
      update public.teacher_student_assignments
      set is_active = false
      where student_id = p_user_id and is_active = true;

      delete from public.parent_student_links where student_id = p_user_id;
    elsif v_profile.role = 'parent' then
      delete from public.parent_student_links where parent_id = p_user_id;
    end if;

    -- This statement is intentionally inside the same function transaction as
    -- every cleanup above. Any exception rolls all of them back together.
    update public.profiles set role = p_role where id = p_user_id;
  end if;

  return jsonb_build_object(
    'fromRole', v_profile.role,
    'toRole', p_role,
    'fullName', v_profile.full_name,
    'counts', jsonb_build_object(
      'assignmentsAsTeacher', v_assignments_as_teacher,
      'assignmentsAsStudent', v_assignments_as_student,
      'parentLinksAsParent', v_parent_links_as_parent,
      'parentLinksAsStudent', v_parent_links_as_student
    )
  );
end;
$$;

revoke all on function public.reassign_profile_role(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.reassign_profile_role(uuid, text, boolean) to service_role;

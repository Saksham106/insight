-- Moves the relationship lookups in the profiles SELECT policies into
-- SECURITY DEFINER helpers, matching the is_* role helpers.
--
-- The subqueries these replace ran under the caller's RLS, so reading a
-- relationship row required a policy on the joined table too. Hoisting them
-- into definer functions keeps the profiles policies self-contained and makes
-- the planner's job easier on the profiles list queries the admin dashboard runs.

create or replace function public.teacher_can_access_student(target_student_id uuid)
returns boolean
language sql
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.teacher_student_assignments a
    where a.teacher_id = auth.uid()
      and a.student_id = target_student_id
  );
$$;

create or replace function public.student_can_access_teacher(target_teacher_id uuid)
returns boolean
language sql
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.teacher_student_assignments a
    where a.student_id = auth.uid()
      and a.teacher_id = target_teacher_id
  );
$$;

create or replace function public.parent_can_access_student(target_student_id uuid)
returns boolean
language sql
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.parent_student_links l
    where l.parent_id = auth.uid()
      and l.student_id = target_student_id
  );
$$;

create or replace function public.parent_can_access_teacher(target_teacher_id uuid)
returns boolean
language sql
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.parent_student_links l
    join public.teacher_student_assignments a on a.student_id = l.student_id
    where l.parent_id = auth.uid()
      and a.teacher_id = target_teacher_id
  );
$$;

drop policy if exists profiles_select_teacher_students on public.profiles;
create policy profiles_select_teacher_students on public.profiles
for select
using (
  public.is_teacher()
  and public.teacher_can_access_student(public.profiles.id)
);

drop policy if exists profiles_select_student_teacher on public.profiles;
create policy profiles_select_student_teacher on public.profiles
for select
using (
  public.is_student()
  and public.student_can_access_teacher(public.profiles.id)
);

drop policy if exists profiles_select_parent_children on public.profiles;
create policy profiles_select_parent_children on public.profiles
for select
using (
  public.is_parent()
  and public.parent_can_access_student(public.profiles.id)
);

drop policy if exists profiles_select_parent_child_teachers on public.profiles;
create policy profiles_select_parent_child_teachers on public.profiles
for select
using (
  public.is_parent()
  and public.parent_can_access_teacher(public.profiles.id)
);

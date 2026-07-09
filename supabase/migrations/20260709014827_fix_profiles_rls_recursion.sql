create or replace function public.is_parent()
returns boolean
language sql
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'parent'
      and is_active = true
  );
$$;

drop policy if exists profiles_select_parent_children on public.profiles;
create policy profiles_select_parent_children on public.profiles
for select
using (
  public.is_parent()
  and exists (
    select 1
    from public.parent_student_links l
    where l.parent_id = auth.uid()
      and l.student_id = public.profiles.id
  )
);

drop policy if exists profiles_select_parent_child_teachers on public.profiles;
create policy profiles_select_parent_child_teachers on public.profiles
for select
using (
  public.is_parent()
  and exists (
    select 1
    from public.parent_student_links l
    join public.teacher_student_assignments a on a.student_id = l.student_id
    where l.parent_id = auth.uid()
      and a.teacher_id = public.profiles.id
  )
);

drop policy if exists assignments_select_parent on public.teacher_student_assignments;
create policy assignments_select_parent on public.teacher_student_assignments
for select
using (
  public.is_parent()
  and exists (
    select 1
    from public.parent_student_links l
    where l.parent_id = auth.uid()
      and l.student_id = public.teacher_student_assignments.student_id
  )
);

drop policy if exists conversations_select_parent on public.conversations;
create policy conversations_select_parent on public.conversations
for select
using (
  public.is_parent()
  and exists (
    select 1
    from public.teacher_student_assignments a
    join public.parent_student_links l on l.student_id = a.student_id
    where l.parent_id = auth.uid()
      and a.id = public.conversations.assignment_id
  )
);

drop policy if exists messages_select_parent on public.messages;
create policy messages_select_parent on public.messages
for select
using (
  public.is_parent()
  and exists (
    select 1
    from public.teacher_student_assignments a
    join public.conversations c on c.assignment_id = a.id
    join public.parent_student_links l on l.student_id = a.student_id
    where l.parent_id = auth.uid()
      and c.id = public.messages.conversation_id
  )
);

drop policy if exists sessions_select_parent on public.sessions;
create policy sessions_select_parent on public.sessions
for select
using (
  public.is_parent()
  and exists (
    select 1
    from public.teacher_student_assignments a
    join public.parent_student_links l on l.student_id = a.student_id
    where l.parent_id = auth.uid()
      and a.id = public.sessions.assignment_id
  )
);

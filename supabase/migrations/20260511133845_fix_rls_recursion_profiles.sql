create or replace function public.is_admin()
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
      and role = 'admin'
      and is_active = true
  );
$$;

create or replace function public.is_teacher()
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
      and role = 'teacher'
      and is_active = true
  );
$$;

create or replace function public.is_student()
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
      and role = 'student'
      and is_active = true
  );
$$;

-- Profiles policies

drop policy if exists profiles_select_admin on public.profiles;
drop policy if exists profiles_select_self on public.profiles;
drop policy if exists profiles_select_teacher_students on public.profiles;
drop policy if exists profiles_select_student_teacher on public.profiles;
drop policy if exists profiles_update_admin on public.profiles;

create policy profiles_select_self on public.profiles
for select
using (
  id = auth.uid()
  and is_active = true
);

create policy profiles_select_admin on public.profiles
for select
using (
  public.is_admin()
);

create policy profiles_select_teacher_students on public.profiles
for select
using (
  public.is_teacher()
  and exists (
    select 1
    from public.teacher_student_assignments a
    where a.teacher_id = auth.uid()
      and a.student_id = public.profiles.id
  )
);

create policy profiles_select_student_teacher on public.profiles
for select
using (
  public.is_student()
  and exists (
    select 1
    from public.teacher_student_assignments a
    where a.student_id = auth.uid()
      and a.teacher_id = public.profiles.id
  )
);

create policy profiles_update_admin on public.profiles
for update
using (public.is_admin())
with check (public.is_admin());

-- Assignments policies

drop policy if exists assignments_admin_all on public.teacher_student_assignments;
drop policy if exists assignments_select_teacher on public.teacher_student_assignments;
drop policy if exists assignments_select_student on public.teacher_student_assignments;

create policy assignments_admin_all on public.teacher_student_assignments
for all
using (public.is_admin())
with check (public.is_admin());

create policy assignments_select_teacher on public.teacher_student_assignments
for select
using (
  teacher_id = auth.uid()
  and public.is_teacher()
);

create policy assignments_select_student on public.teacher_student_assignments
for select
using (
  student_id = auth.uid()
  and public.is_student()
);

-- Conversations policies

drop policy if exists conversations_select_admin on public.conversations;
drop policy if exists conversations_select_teacher on public.conversations;
drop policy if exists conversations_select_student on public.conversations;
drop policy if exists conversations_insert_admin on public.conversations;

create policy conversations_select_admin on public.conversations
for select
using (public.is_admin());

create policy conversations_select_teacher on public.conversations
for select
using (
  public.is_teacher()
  and exists (
    select 1
    from public.teacher_student_assignments a
    where a.teacher_id = auth.uid()
      and a.id = public.conversations.assignment_id
  )
);

create policy conversations_select_student on public.conversations
for select
using (
  public.is_student()
  and exists (
    select 1
    from public.teacher_student_assignments a
    where a.student_id = auth.uid()
      and a.id = public.conversations.assignment_id
  )
);

create policy conversations_insert_admin on public.conversations
for insert
with check (public.is_admin());

-- Messages policies

drop policy if exists messages_select_admin on public.messages;
drop policy if exists messages_select_teacher on public.messages;
drop policy if exists messages_select_student on public.messages;
drop policy if exists messages_insert_teacher on public.messages;
drop policy if exists messages_insert_student on public.messages;

create policy messages_select_admin on public.messages
for select
using (public.is_admin());

create policy messages_select_teacher on public.messages
for select
using (
  public.is_teacher()
  and exists (
    select 1
    from public.teacher_student_assignments a
    join public.conversations c on c.assignment_id = a.id
    where a.teacher_id = auth.uid()
      and c.id = public.messages.conversation_id
  )
);

create policy messages_select_student on public.messages
for select
using (
  public.is_student()
  and exists (
    select 1
    from public.teacher_student_assignments a
    join public.conversations c on c.assignment_id = a.id
    where a.student_id = auth.uid()
      and c.id = public.messages.conversation_id
  )
);

create policy messages_insert_teacher on public.messages
for insert
with check (
  sender_id = auth.uid()
  and public.is_teacher()
  and exists (
    select 1
    from public.teacher_student_assignments a
    join public.conversations c on c.assignment_id = a.id
    where a.teacher_id = auth.uid()
      and c.id = public.messages.conversation_id
  )
);

create policy messages_insert_student on public.messages
for insert
with check (
  sender_id = auth.uid()
  and public.is_student()
  and exists (
    select 1
    from public.teacher_student_assignments a
    join public.conversations c on c.assignment_id = a.id
    where a.student_id = auth.uid()
      and c.id = public.messages.conversation_id
  )
);
;

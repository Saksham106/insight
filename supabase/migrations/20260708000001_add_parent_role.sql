-- Parent as a first-class role.
-- Purely additive: extends the profiles.role check, adds parent_student_links,
-- and grants parents RLS access to their children's data. No table is dropped
-- or recreated; existing users/assignments/conversations/messages are untouched.

-- 1. Extend the profiles.role check constraint to include 'parent'.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('admin', 'teacher', 'student', 'parent'));

-- 2. parent_student_links: connects a parent account to one or more student accounts.
create table if not exists public.parent_student_links (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.profiles(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (parent_id, student_id)
);

create index if not exists idx_parent_student_links_parent_id on public.parent_student_links (parent_id);
create index if not exists idx_parent_student_links_student_id on public.parent_student_links (student_id);

alter table public.parent_student_links enable row level security;

-- 3. RLS on parent_student_links: admin full access, parents read their own rows.
drop policy if exists parent_student_links_admin_all on public.parent_student_links;
create policy parent_student_links_admin_all on public.parent_student_links
for all
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin' and p.is_active = true
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin' and p.is_active = true
  )
);

drop policy if exists parent_student_links_select_parent on public.parent_student_links;
create policy parent_student_links_select_parent on public.parent_student_links
for select
using (parent_id = auth.uid());

-- 4. Parent access to their children's data, mirroring the existing role policies.

-- profiles: parent can select their linked students.
drop policy if exists profiles_select_parent_children on public.profiles;
create policy profiles_select_parent_children on public.profiles
for select
using (
  exists (
    select 1
    from public.parent_student_links l
    join public.profiles me on me.id = auth.uid()
    where me.role = 'parent'
      and me.is_active = true
      and l.parent_id = auth.uid()
      and l.student_id = public.profiles.id
  )
);

-- profiles: parent can select the teachers assigned to their linked students.
drop policy if exists profiles_select_parent_child_teachers on public.profiles;
create policy profiles_select_parent_child_teachers on public.profiles
for select
using (
  exists (
    select 1
    from public.parent_student_links l
    join public.teacher_student_assignments a on a.student_id = l.student_id
    join public.profiles me on me.id = auth.uid()
    where me.role = 'parent'
      and me.is_active = true
      and l.parent_id = auth.uid()
      and a.teacher_id = public.profiles.id
  )
);

-- teacher_student_assignments: parent can select rows for their children.
drop policy if exists assignments_select_parent on public.teacher_student_assignments;
create policy assignments_select_parent on public.teacher_student_assignments
for select
using (
  exists (
    select 1
    from public.parent_student_links l
    join public.profiles me on me.id = auth.uid()
    where me.role = 'parent'
      and me.is_active = true
      and l.parent_id = auth.uid()
      and l.student_id = public.teacher_student_assignments.student_id
  )
);

-- conversations: parent can select conversations whose assignment's student is their child.
drop policy if exists conversations_select_parent on public.conversations;
create policy conversations_select_parent on public.conversations
for select
using (
  exists (
    select 1
    from public.teacher_student_assignments a
    join public.parent_student_links l on l.student_id = a.student_id
    join public.profiles me on me.id = auth.uid()
    where me.role = 'parent'
      and me.is_active = true
      and l.parent_id = auth.uid()
      and a.id = public.conversations.assignment_id
  )
);

-- messages: parent can read messages in their children's conversations.
drop policy if exists messages_select_parent on public.messages;
create policy messages_select_parent on public.messages
for select
using (
  exists (
    select 1
    from public.teacher_student_assignments a
    join public.conversations c on c.assignment_id = a.id
    join public.parent_student_links l on l.student_id = a.student_id
    join public.profiles me on me.id = auth.uid()
    where me.role = 'parent'
      and me.is_active = true
      and l.parent_id = auth.uid()
      and c.id = public.messages.conversation_id
  )
);

-- messages: parent can send messages in their children's conversations (as themselves).
drop policy if exists messages_insert_parent on public.messages;
create policy messages_insert_parent on public.messages
for insert
with check (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.teacher_student_assignments a
    join public.conversations c on c.assignment_id = a.id
    join public.parent_student_links l on l.student_id = a.student_id
    join public.profiles me on me.id = auth.uid()
    where me.role = 'parent'
      and me.is_active = true
      and l.parent_id = auth.uid()
      and c.id = public.messages.conversation_id
  )
);

-- sessions: parent can select sessions for their children's assignments.
-- Mirrors the conversations/messages join pattern; the sessions table already
-- has RLS enabled (students insert via the anon client through /api/sessions).
drop policy if exists sessions_select_parent on public.sessions;
create policy sessions_select_parent on public.sessions
for select
using (
  exists (
    select 1
    from public.teacher_student_assignments a
    join public.parent_student_links l on l.student_id = a.student_id
    join public.profiles me on me.id = auth.uid()
    where me.role = 'parent'
      and me.is_active = true
      and l.parent_id = auth.uid()
      and a.id = public.sessions.assignment_id
  )
);

-- 5. Allow 'parent' in join_interest_requests.role.
alter table public.join_interest_requests drop constraint if exists join_interest_requests_role_check;
alter table public.join_interest_requests
  add constraint join_interest_requests_role_check check (role in ('teacher', 'student', 'parent'));

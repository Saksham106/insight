create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('admin', 'teacher', 'student', 'parent')),
  is_active boolean not null default true,
  avatar_url text,
  invite_sent_at timestamptz,
  invite_accepted_at timestamptz,
  password_set_at timestamptz,
  -- Soft delete. Set together with is_active = false; the is_active gates are
  -- what block sign-in, deleted_at only hides the row from the admin lists.
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_profiles_not_deleted
  on public.profiles (role, created_at desc)
  where deleted_at is null;

create table if not exists public.teacher_student_assignments (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (teacher_id, student_id)
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null unique references public.teacher_student_assignments(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.join_interest_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text,
  role text not null check (role in ('teacher', 'student', 'parent')),
  email text,
  phone text,
  message text,
  source text not null default 'landing_page',
  status text not null default 'new' check (status in ('new', 'contacted', 'invited', 'closed')),
  created_at timestamptz not null default now(),
  constraint join_interest_requests_contact_check check (email is not null or phone is not null)
);

create index if not exists idx_assignments_teacher_id on public.teacher_student_assignments (teacher_id);
create index if not exists idx_assignments_student_id on public.teacher_student_assignments (student_id);
create index if not exists idx_messages_conversation_id on public.messages (conversation_id);
create index if not exists idx_messages_created_at on public.messages (created_at);
create index if not exists idx_join_interest_requests_created_at on public.join_interest_requests (created_at desc);
create index if not exists idx_join_interest_requests_status on public.join_interest_requests (status);

create or replace function public.create_conversation_for_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  insert into public.conversations (assignment_id)
  values (new.id);
  return new;
end;
$$;

create or replace trigger create_conversation_after_assignment
after insert on public.teacher_student_assignments
for each row execute function public.create_conversation_for_assignment();

create or replace function public.reject_contact_info()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.body ~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}' then
    raise exception 'For privacy and safety, please keep communication inside the platform and do not share contact details.';
  end if;

  if new.body ~* '(\+?\d[\d\s().-]{7,}\d)' then
    raise exception 'For privacy and safety, please keep communication inside the platform and do not share contact details.';
  end if;

  return new;
end;
$$;

create or replace trigger block_contact_info_before_message
before insert on public.messages
for each row execute function public.reject_contact_info();

alter table public.profiles enable row level security;
alter table public.teacher_student_assignments enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.join_interest_requests enable row level security;

-- Profiles
create policy profiles_select_self on public.profiles
for select
using (
  id = auth.uid()
  and is_active = true
);

-- Policies on profiles must never read profiles directly -- that re-enters this
-- table's RLS and Postgres aborts with "infinite recursion detected in policy".
-- Every role/relationship test goes through a SECURITY DEFINER helper instead.

create policy profiles_select_admin on public.profiles
for select
using (is_admin());

create policy profiles_select_teacher_students on public.profiles
for select
using (
  is_teacher()
  and teacher_can_access_student(public.profiles.id)
);

create policy profiles_select_student_teacher on public.profiles
for select
using (
  is_student()
  and student_can_access_teacher(public.profiles.id)
);

create policy profiles_update_admin on public.profiles
for update
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.is_active = true
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.is_active = true
  )
);

-- Join interest requests
create policy join_interest_requests_admin_select on public.join_interest_requests
for select
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.is_active = true
  )
);

create policy join_interest_requests_admin_update on public.join_interest_requests
for update
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.is_active = true
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.is_active = true
  )
);

-- Assignments
create policy assignments_admin_all on public.teacher_student_assignments
for all
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.is_active = true
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.is_active = true
  )
);

create policy assignments_select_teacher on public.teacher_student_assignments
for select
using (
  teacher_id = auth.uid()
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'teacher'
      and p.is_active = true
  )
);

create policy assignments_select_student on public.teacher_student_assignments
for select
using (
  student_id = auth.uid()
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'student'
      and p.is_active = true
  )
);

-- Conversations
create policy conversations_select_admin on public.conversations
for select
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.is_active = true
  )
);

create policy conversations_select_teacher on public.conversations
for select
using (
  exists (
    select 1
    from public.teacher_student_assignments a
    join public.profiles p on p.id = auth.uid()
    where p.role = 'teacher'
      and p.is_active = true
      and a.teacher_id = auth.uid()
      and a.id = public.conversations.assignment_id
  )
);

create policy conversations_select_student on public.conversations
for select
using (
  exists (
    select 1
    from public.teacher_student_assignments a
    join public.profiles p on p.id = auth.uid()
    where p.role = 'student'
      and p.is_active = true
      and a.student_id = auth.uid()
      and a.id = public.conversations.assignment_id
  )
);

create policy conversations_insert_admin on public.conversations
for insert
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.is_active = true
  )
);

-- Messages
create policy messages_select_admin on public.messages
for select
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.is_active = true
  )
);

create policy messages_select_teacher on public.messages
for select
using (
  exists (
    select 1
    from public.teacher_student_assignments a
    join public.conversations c on c.assignment_id = a.id
    join public.profiles p on p.id = auth.uid()
    where p.role = 'teacher'
      and p.is_active = true
      and a.teacher_id = auth.uid()
      and c.id = public.messages.conversation_id
  )
);

create policy messages_select_student on public.messages
for select
using (
  exists (
    select 1
    from public.teacher_student_assignments a
    join public.conversations c on c.assignment_id = a.id
    join public.profiles p on p.id = auth.uid()
    where p.role = 'student'
      and p.is_active = true
      and a.student_id = auth.uid()
      and c.id = public.messages.conversation_id
  )
);

create policy messages_insert_teacher on public.messages
for insert
with check (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.teacher_student_assignments a
    join public.conversations c on c.assignment_id = a.id
    join public.profiles p on p.id = auth.uid()
    where p.role = 'teacher'
      and p.is_active = true
      and a.teacher_id = auth.uid()
      and c.id = public.messages.conversation_id
  )
);

create policy messages_insert_student on public.messages
for insert
with check (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.teacher_student_assignments a
    join public.conversations c on c.assignment_id = a.id
    join public.profiles p on p.id = auth.uid()
    where p.role = 'student'
      and p.is_active = true
      and a.student_id = auth.uid()
      and c.id = public.messages.conversation_id
  )
);

-- ---------------------------------------------------------------------------
-- Parent role (migration 20260708000001_add_parent_role.sql)
--
-- NOTE: this file is a readable reference and is not exhaustive. The live DB
-- also has a `sessions` table (id, assignment_id, scheduled_at,
-- duration_minutes, notes, status, proposed_by, reminder_* columns) that was
-- created out-of-band. The parent sessions policy below references it.
-- ---------------------------------------------------------------------------

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

create policy parent_student_links_admin_all on public.parent_student_links
for all
using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and p.is_active = true)
)
with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and p.is_active = true)
);

create policy parent_student_links_select_parent on public.parent_student_links
for select
using (parent_id = auth.uid());

create policy profiles_select_parent_children on public.profiles
for select
using (
  is_parent()
  and parent_can_access_student(public.profiles.id)
);

create policy profiles_select_parent_child_teachers on public.profiles
for select
using (
  is_parent()
  and parent_can_access_teacher(public.profiles.id)
);

create policy assignments_select_parent on public.teacher_student_assignments
for select
using (
  is_parent()
  and exists (
    select 1
    from public.parent_student_links l
    where l.parent_id = auth.uid()
      and l.student_id = public.teacher_student_assignments.student_id
  )
);

create policy conversations_select_parent on public.conversations
for select
using (
  is_parent()
  and exists (
    select 1
    from public.teacher_student_assignments a
    join public.parent_student_links l on l.student_id = a.student_id
    where l.parent_id = auth.uid()
      and a.id = public.conversations.assignment_id
  )
);

create policy messages_select_parent on public.messages
for select
using (
  is_parent()
  and exists (
    select 1
    from public.teacher_student_assignments a
    join public.conversations c on c.assignment_id = a.id
    join public.parent_student_links l on l.student_id = a.student_id
    where l.parent_id = auth.uid()
      and c.id = public.messages.conversation_id
  )
);

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

create policy sessions_select_parent on public.sessions
for select
using (
  is_parent()
  and exists (
    select 1
    from public.teacher_student_assignments a
    join public.parent_student_links l on l.student_id = a.student_id
    where l.parent_id = auth.uid()
      and a.id = public.sessions.assignment_id
  )
);

-- ---------------------------------------------------------------------------
-- Teacher labels (migration 20260708000002_add_teacher_labels.sql)
-- ---------------------------------------------------------------------------

create table if not exists public.labels (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text,
  created_at timestamptz not null default now()
);

create table if not exists public.teacher_labels (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  label_id uuid not null references public.labels(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (teacher_id, label_id)
);

create index if not exists idx_teacher_labels_teacher_id on public.teacher_labels (teacher_id);
create index if not exists idx_teacher_labels_label_id on public.teacher_labels (label_id);

alter table public.labels enable row level security;
alter table public.teacher_labels enable row level security;

create policy labels_admin_all on public.labels
for all
using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and p.is_active = true)
)
with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and p.is_active = true)
);

create policy teacher_labels_admin_all on public.teacher_labels
for all
using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and p.is_active = true)
)
with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and p.is_active = true)
);

create policy teacher_labels_select_own on public.teacher_labels
for select
using (teacher_id = auth.uid());

create policy labels_select_teacher on public.labels
for select
using (
  exists (
    select 1 from public.teacher_labels tl
    where tl.label_id = public.labels.id and tl.teacher_id = auth.uid()
  )
);

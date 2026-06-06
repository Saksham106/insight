create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('admin', 'teacher', 'student')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

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
  role text not null check (role in ('teacher', 'student')),
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

create policy profiles_select_admin on public.profiles
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

create policy profiles_select_teacher_students on public.profiles
for select
using (
  exists (
    select 1
    from public.teacher_student_assignments a
    join public.profiles me on me.id = auth.uid()
    where me.role = 'teacher'
      and me.is_active = true
      and a.teacher_id = auth.uid()
      and a.student_id = public.profiles.id
  )
);

create policy profiles_select_student_teacher on public.profiles
for select
using (
  exists (
    select 1
    from public.teacher_student_assignments a
    join public.profiles me on me.id = auth.uid()
    where me.role = 'student'
      and me.is_active = true
      and a.student_id = auth.uid()
      and a.teacher_id = public.profiles.id
  )
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

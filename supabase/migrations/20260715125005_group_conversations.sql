alter table public.conversations alter column assignment_id drop not null;
alter table public.conversations add column if not exists title text;
alter table public.conversations add column if not exists is_group boolean not null default false;
alter table public.conversations add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.conversations add column if not exists updated_at timestamptz not null default now();

create table if not exists public.conversation_participants (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  added_at timestamptz not null default now(),
  unique (conversation_id, user_id)
);
create index if not exists idx_conversation_participants_user on public.conversation_participants (user_id);
create index if not exists idx_conversation_participants_conversation on public.conversation_participants (conversation_id);

insert into public.conversation_participants (conversation_id, user_id)
select c.id, a.teacher_id
from public.conversations c
join public.teacher_student_assignments a on a.id = c.assignment_id
on conflict (conversation_id, user_id) do nothing;

insert into public.conversation_participants (conversation_id, user_id)
select c.id, a.student_id
from public.conversations c
join public.teacher_student_assignments a on a.id = c.assignment_id
on conflict (conversation_id, user_id) do nothing;

create or replace function public.is_conversation_member(p_conversation_id uuid)
returns boolean
language sql
security definer
set search_path = public
set row_security = off
stable
as $$
  select exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = p_conversation_id
      and cp.user_id = (select auth.uid())
  );
$$;
revoke execute on function public.is_conversation_member(uuid) from public, anon;
grant execute on function public.is_conversation_member(uuid) to authenticated, service_role;

alter table public.conversation_participants enable row level security;
create policy conversation_participants_select_member on public.conversation_participants
  for select using (public.is_conversation_member(conversation_id));
create policy conversation_participants_select_admin on public.conversation_participants
  for select using ((select public.is_admin()));

create policy conversations_select_member on public.conversations
  for select using (public.is_conversation_member(id));

create policy messages_select_member on public.messages
  for select using (public.is_conversation_member(conversation_id));
create policy messages_insert_member on public.messages
  for insert with check (
    sender_id = (select auth.uid()) and public.is_conversation_member(conversation_id)
  );

create trigger set_updated_at before update on public.conversations
  for each row execute function public.set_updated_at();

create policy "chat attachments readable by members" on storage.objects
  for select using (
    bucket_id = 'chat-attachments'
    and public.is_conversation_member(((storage.foldername(name))[1])::uuid)
  );
create policy "chat attachments uploadable by members" on storage.objects
  for insert with check (
    bucket_id = 'chat-attachments'
    and public.is_conversation_member(((storage.foldername(name))[1])::uuid)
  );;

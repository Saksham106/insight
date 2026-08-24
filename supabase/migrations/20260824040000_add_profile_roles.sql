-- One login may hold multiple product roles. The profiles.role column remains
-- the primary identity for existing relationships; profile_roles adds explicit
-- capabilities and powers the validated view switcher.
create table if not exists public.profile_roles (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('admin', 'teacher', 'student', 'parent')),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  primary key (profile_id, role)
);

insert into public.profile_roles (profile_id, role)
select id, role from public.profiles
on conflict (profile_id, role) do nothing;

alter table public.profile_roles enable row level security;

create or replace function public.has_profile_role(p_role text)
returns boolean
language sql
security definer
stable
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.profiles p
    join public.profile_roles pr on pr.profile_id = p.id
    where p.id = (select auth.uid())
      and p.is_active = true
      and p.deleted_at is null
      and pr.role = p_role
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
set row_security = off
as $$ select public.has_profile_role('admin'); $$;

create or replace function public.is_teacher()
returns boolean
language sql
security definer
stable
set search_path = public
set row_security = off
as $$ select public.has_profile_role('teacher'); $$;

create or replace function public.is_student()
returns boolean
language sql
security definer
stable
set search_path = public
set row_security = off
as $$ select public.has_profile_role('student'); $$;

create or replace function public.is_parent()
returns boolean
language sql
security definer
stable
set search_path = public
set row_security = off
as $$ select public.has_profile_role('parent'); $$;

revoke all on function public.has_profile_role(text) from public, anon;
grant execute on function public.has_profile_role(text) to authenticated, service_role;

revoke all on table public.profile_roles from public, anon;
grant select on table public.profile_roles to authenticated;
grant all on table public.profile_roles to service_role;

drop policy if exists profile_roles_select_self on public.profile_roles;
create policy profile_roles_select_self on public.profile_roles
  for select to authenticated
  using (profile_id = (select auth.uid()));

drop policy if exists profile_roles_admin_all on public.profile_roles;
create policy profile_roles_admin_all on public.profile_roles
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create index if not exists idx_profile_roles_role on public.profile_roles(role, profile_id);

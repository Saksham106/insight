-- Teacher labels: admins create arbitrary labels and assign them to teachers.
-- Purely additive.

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

-- Admin full access on both tables.
drop policy if exists labels_admin_all on public.labels;
create policy labels_admin_all on public.labels
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

drop policy if exists teacher_labels_admin_all on public.teacher_labels;
create policy teacher_labels_admin_all on public.teacher_labels
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

-- Teachers can read their own label assignments and the referenced labels.
drop policy if exists teacher_labels_select_own on public.teacher_labels;
create policy teacher_labels_select_own on public.teacher_labels
for select
using (teacher_id = auth.uid());

drop policy if exists labels_select_teacher on public.labels;
create policy labels_select_teacher on public.labels
for select
using (
  exists (
    select 1 from public.teacher_labels tl
    where tl.label_id = public.labels.id
      and tl.teacher_id = auth.uid()
  )
);

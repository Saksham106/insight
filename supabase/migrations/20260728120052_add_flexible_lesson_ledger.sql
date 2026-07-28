-- Production migration version: 20260728120052.
alter table public.hermes_contact_relationships
  add column if not exists is_active boolean not null default true;
alter table public.hermes_contact_relationships
  add column if not exists effective_start date;
alter table public.hermes_contact_relationships
  add column if not exists effective_end date;
alter table public.hermes_contact_relationships
  add column if not exists source_channel text not null default 'admin'
    check (source_channel in ('whatsapp', 'imessage_admin', 'admin'));
alter table public.hermes_contact_relationships
  add column if not exists last_editor_profile_id uuid references public.profiles(id) on delete set null;
alter table public.hermes_contact_relationships
  add column if not exists updated_at timestamptz not null default now();
alter table public.hermes_contact_relationships
  add constraint hermes_relationship_dates_valid
  check (effective_end is null or effective_start is null or effective_end >= effective_start);

create trigger set_hermes_contact_relationships_updated_at
  before update on public.hermes_contact_relationships
  for each row execute function public.set_updated_at();

create table public.academy_lesson_cycles (
  id uuid primary key default gen_random_uuid(),
  period_start date not null unique,
  status text not null default 'collecting'
    check (status in ('collecting', 'needs_attention', 'ready_for_swati', 'confirmed')),
  version integer not null default 0 check (version >= 0),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_start = date_trunc('month', period_start)::date),
  check ((status = 'confirmed') = (confirmed_at is not null))
);

create table public.academy_teacher_collections (
  id uuid primary key default gen_random_uuid(),
  lesson_cycle_id uuid not null references public.academy_lesson_cycles(id) on delete cascade,
  tutor_contact_id uuid not null references public.hermes_contacts(id) on delete restrict,
  status text not null default 'not_requested'
    check (status in ('not_requested', 'requested', 'awaiting_reply', 'awaiting_teacher_confirmation', 'confirmed', 'needs_attention')),
  requested_at timestamptz,
  confirmed_report_revision_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lesson_cycle_id, tutor_contact_id)
);

create table public.academy_lesson_report_revisions (
  id uuid primary key default gen_random_uuid(),
  teacher_collection_id uuid not null references public.academy_teacher_collections(id) on delete cascade,
  revision integer not null check (revision > 0),
  supersedes_report_id uuid references public.academy_lesson_report_revisions(id) on delete restrict,
  source_channel text not null
    check (source_channel in ('whatsapp', 'google_sheets', 'imessage_admin', 'admin')),
  status text not null default 'draft'
    check (status in ('draft', 'awaiting_teacher_confirmation', 'confirmed', 'superseded')),
  submitted_at timestamptz not null default now(),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (teacher_collection_id, revision),
  check (supersedes_report_id is null or supersedes_report_id <> id),
  check ((status = 'confirmed') = (confirmed_at is not null))
);

alter table public.academy_teacher_collections
  add constraint academy_teacher_collections_confirmed_report_fk
  foreign key (confirmed_report_revision_id)
  references public.academy_lesson_report_revisions(id) on delete restrict;

create unique index academy_lesson_reports_one_active_idx
  on public.academy_lesson_report_revisions(teacher_collection_id)
  where status <> 'superseded';

create table public.academy_lessons (
  id uuid primary key default gen_random_uuid(),
  report_revision_id uuid not null references public.academy_lesson_report_revisions(id) on delete cascade,
  reported_student_name text not null check (length(btrim(reported_student_name)) between 1 and 160),
  student_contact_id uuid references public.hermes_contacts(id) on delete restrict,
  lesson_date date not null,
  duration_minutes integer not null check (duration_minutes between 1 and 1440),
  subject text check (subject is null or length(btrim(subject)) between 1 and 120),
  note text check (note is null or length(btrim(note)) between 1 and 500),
  created_at timestamptz not null default now()
);

alter table public.hermes_messages
  add column lesson_cycle_id uuid references public.academy_lesson_cycles(id) on delete set null;

create index academy_lesson_cycles_status_idx on public.academy_lesson_cycles(status, period_start desc);
create index academy_teacher_collections_cycle_status_idx on public.academy_teacher_collections(lesson_cycle_id, status);
create index academy_teacher_collections_tutor_idx on public.academy_teacher_collections(tutor_contact_id, lesson_cycle_id);
create index academy_lesson_reports_collection_idx on public.academy_lesson_report_revisions(teacher_collection_id, revision desc);
create index academy_lessons_report_idx on public.academy_lessons(report_revision_id);
create index academy_lessons_unresolved_idx on public.academy_lessons(report_revision_id) where student_contact_id is null;
create index academy_lessons_student_date_idx on public.academy_lessons(student_contact_id, lesson_date) where student_contact_id is not null;
create index hermes_messages_lesson_cycle_idx on public.hermes_messages(lesson_cycle_id) where lesson_cycle_id is not null;

alter table public.academy_lesson_cycles enable row level security;
alter table public.academy_teacher_collections enable row level security;
alter table public.academy_lesson_report_revisions enable row level security;
alter table public.academy_lessons enable row level security;

revoke all on table public.academy_lesson_cycles from anon, authenticated;
revoke all on table public.academy_teacher_collections from anon, authenticated;
revoke all on table public.academy_lesson_report_revisions from anon, authenticated;
revoke all on table public.academy_lessons from anon, authenticated;
grant all on table public.academy_lesson_cycles to service_role;
grant all on table public.academy_teacher_collections to service_role;
grant all on table public.academy_lesson_report_revisions to service_role;
grant all on table public.academy_lessons to service_role;

create trigger set_academy_lesson_cycles_updated_at before update on public.academy_lesson_cycles
  for each row execute function public.set_updated_at();
create trigger set_academy_teacher_collections_updated_at before update on public.academy_teacher_collections
  for each row execute function public.set_updated_at();

create function public.upsert_academy_contact_relationship(
  p_source_contact_id uuid,
  p_target_contact_id uuid,
  p_relationship_type text,
  p_is_active boolean,
  p_source_channel text
)
returns public.hermes_contact_relationships
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source public.hermes_contacts;
  v_target public.hermes_contacts;
  v_relationship public.hermes_contact_relationships;
begin
  if p_relationship_type not in ('teacher', 'parent_guardian') then raise exception 'invalid_relationship_type'; end if;
  if p_source_channel not in ('whatsapp', 'imessage_admin', 'admin') then raise exception 'invalid_source_channel'; end if;
  if p_source_contact_id = p_target_contact_id then raise exception 'invalid_relationship_contacts'; end if;
  select * into v_source from public.hermes_contacts where id = p_source_contact_id and is_active = true and deleted_at is null;
  select * into v_target from public.hermes_contacts where id = p_target_contact_id and is_active = true and deleted_at is null;
  if v_source.id is null or v_target.id is null then raise exception 'relationship_contact_unavailable'; end if;
  if v_target.role <> 'student' then raise exception 'relationship_student_required'; end if;
  if (p_relationship_type = 'teacher' and v_source.role <> 'teacher')
    or (p_relationship_type = 'parent_guardian' and v_source.role <> 'parent')
  then raise exception 'relationship_source_role_invalid'; end if;

  insert into public.hermes_contact_relationships(
    source_contact_id, target_contact_id, relationship_type, is_active,
    effective_start, effective_end, source_channel
  ) values (
    p_source_contact_id, p_target_contact_id, p_relationship_type, p_is_active,
    case when p_is_active then current_date else null end,
    case when p_is_active then null else current_date end,
    p_source_channel
  )
  on conflict (source_contact_id, target_contact_id, relationship_type) do update
    set is_active = excluded.is_active,
        effective_start = case when excluded.is_active then coalesce(public.hermes_contact_relationships.effective_start, current_date) else public.hermes_contact_relationships.effective_start end,
        effective_end = case when excluded.is_active then null else current_date end,
        source_channel = excluded.source_channel,
        updated_at = now()
  returning * into v_relationship;

  insert into public.hermes_audit_events(actor_type, event_type, entity_type, entity_id, metadata)
    values ('admin', 'contact_relationship_updated', 'contact_relationship', v_relationship.id,
      jsonb_build_object('relationshipType', p_relationship_type, 'active', p_is_active, 'sourceChannel', p_source_channel));
  return v_relationship;
end;
$$;

create function public.start_academy_lesson_cycle(p_period_start date, p_tutor_contact_ids uuid[])
returns public.academy_lesson_cycles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cycle public.academy_lesson_cycles;
  v_count integer;
begin
  if p_period_start <> date_trunc('month', p_period_start)::date then raise exception 'invalid_lesson_month'; end if;
  v_count := cardinality(p_tutor_contact_ids);
  if v_count not between 1 and 100 then raise exception 'invalid_tutor_selection'; end if;
  if (select count(distinct value) from unnest(p_tutor_contact_ids) value) <> v_count then raise exception 'duplicate_tutor_selection'; end if;
  if (select count(*) from public.hermes_contacts where id = any(p_tutor_contact_ids) and role = 'teacher' and is_active = true and deleted_at is null) <> v_count
  then raise exception 'selected_tutor_unavailable'; end if;

  insert into public.academy_lesson_cycles(period_start) values (p_period_start)
    on conflict (period_start) do nothing;
  select * into v_cycle from public.academy_lesson_cycles where period_start = p_period_start for update;
  if v_cycle.status = 'confirmed' then raise exception 'lesson_cycle_confirmed'; end if;
  if exists (
    select 1 from public.academy_teacher_collections c
    where c.lesson_cycle_id = v_cycle.id and not (c.tutor_contact_id = any(p_tutor_contact_ids))
      and exists (select 1 from public.academy_lesson_report_revisions r where r.teacher_collection_id = c.id)
  ) then raise exception 'selected_tutor_has_report'; end if;
  delete from public.academy_teacher_collections
    where lesson_cycle_id = v_cycle.id and not (tutor_contact_id = any(p_tutor_contact_ids));
  insert into public.academy_teacher_collections(lesson_cycle_id, tutor_contact_id)
    select v_cycle.id, value from unnest(p_tutor_contact_ids) value
    on conflict (lesson_cycle_id, tutor_contact_id) do nothing;
  update public.academy_lesson_cycles set status = 'collecting', updated_at = now() where id = v_cycle.id returning * into v_cycle;
  insert into public.hermes_audit_events(actor_type, event_type, entity_type, entity_id, metadata)
    values ('admin', 'lesson_cycle_started', 'lesson_cycle', v_cycle.id, jsonb_build_object('tutorCount', v_count));
  return v_cycle;
end;
$$;

create function public.submit_academy_lesson_report(
  p_cycle_id uuid,
  p_tutor_contact_id uuid,
  p_source_channel text,
  p_lessons jsonb
)
returns public.academy_lesson_report_revisions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cycle public.academy_lesson_cycles;
  v_collection public.academy_teacher_collections;
  v_previous public.academy_lesson_report_revisions;
  v_report public.academy_lesson_report_revisions;
  v_revision integer;
  v_item jsonb;
  v_date date;
  v_student_id uuid;
begin
  if p_source_channel not in ('whatsapp', 'google_sheets', 'imessage_admin', 'admin') then raise exception 'invalid_source_channel'; end if;
  if jsonb_typeof(p_lessons) <> 'array' or not (jsonb_array_length(p_lessons) between 0 and 500) then raise exception 'invalid_lessons'; end if;
  select * into v_cycle from public.academy_lesson_cycles where id = p_cycle_id for update;
  if v_cycle.id is null then raise exception 'lesson_cycle_not_found'; end if;
  if v_cycle.status = 'confirmed' then raise exception 'lesson_cycle_confirmed'; end if;
  select * into v_collection from public.academy_teacher_collections
    where lesson_cycle_id = p_cycle_id and tutor_contact_id = p_tutor_contact_id for update;
  if v_collection.id is null then raise exception 'tutor_not_selected'; end if;
  select * into v_previous from public.academy_lesson_report_revisions
    where teacher_collection_id = v_collection.id and status <> 'superseded' for update;
  select coalesce(max(revision), 0) + 1 into v_revision
    from public.academy_lesson_report_revisions where teacher_collection_id = v_collection.id;
  if v_previous.id is not null then
    update public.academy_lesson_report_revisions set status = 'superseded', confirmed_at = null where id = v_previous.id;
  end if;
  insert into public.academy_lesson_report_revisions(
    teacher_collection_id, revision, supersedes_report_id, source_channel, status
  ) values (
    v_collection.id, v_revision, v_previous.id, p_source_channel, 'awaiting_teacher_confirmation'
  ) returning * into v_report;

  for v_item in select value from jsonb_array_elements(p_lessons) loop
    v_date := (v_item->>'lessonDate')::date;
    if date_trunc('month', v_date)::date <> v_cycle.period_start then raise exception 'lesson_outside_cycle'; end if;
    v_student_id := nullif(v_item->>'studentContactId', '')::uuid;
    if v_student_id is not null and not exists (
      select 1 from public.hermes_contacts where id = v_student_id and role = 'student' and is_active = true and deleted_at is null
    ) then raise exception 'student_contact_unavailable'; end if;
    insert into public.academy_lessons(
      report_revision_id, reported_student_name, student_contact_id, lesson_date,
      duration_minutes, subject, note
    ) values (
      v_report.id, btrim(v_item->>'reportedStudentName'), v_student_id, v_date,
      (v_item->>'durationMinutes')::integer,
      nullif(btrim(v_item->>'subject'), ''), nullif(btrim(v_item->>'note'), '')
    );
  end loop;
  update public.academy_teacher_collections
    set status = 'awaiting_teacher_confirmation', confirmed_report_revision_id = null, updated_at = now()
    where id = v_collection.id;
  update public.academy_lesson_cycles set status = 'collecting', confirmed_at = null, updated_at = now() where id = v_cycle.id;
  insert into public.hermes_audit_events(actor_type, actor_contact_id, event_type, entity_type, entity_id, metadata)
    values ('contact', p_tutor_contact_id, 'lesson_report_submitted', 'lesson_report', v_report.id,
      jsonb_build_object('cycleId', p_cycle_id, 'revision', v_revision, 'lessonCount', jsonb_array_length(p_lessons), 'sourceChannel', p_source_channel));
  return v_report;
end;
$$;

create function public.confirm_academy_lesson_report(p_report_id uuid, p_actor_contact_id uuid)
returns public.academy_lesson_report_revisions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_report public.academy_lesson_report_revisions;
  v_collection public.academy_teacher_collections;
  v_cycle_id uuid;
  v_next_status text;
begin
  select * into v_report from public.academy_lesson_report_revisions where id = p_report_id for update;
  if v_report.id is null or v_report.status <> 'awaiting_teacher_confirmation' then raise exception 'lesson_report_not_confirmable'; end if;
  select * into v_collection from public.academy_teacher_collections where id = v_report.teacher_collection_id for update;
  if p_actor_contact_id is not null and p_actor_contact_id <> v_collection.tutor_contact_id then raise exception 'lesson_report_actor_mismatch'; end if;
  update public.academy_lesson_report_revisions set status = 'confirmed', confirmed_at = now()
    where id = v_report.id returning * into v_report;
  update public.academy_teacher_collections set status = 'confirmed', confirmed_report_revision_id = v_report.id, updated_at = now()
    where id = v_collection.id returning lesson_cycle_id into v_cycle_id;
  select case
    when exists (
      select 1 from public.academy_teacher_collections c
      join public.academy_lessons l on l.report_revision_id = c.confirmed_report_revision_id
      where c.lesson_cycle_id = v_cycle_id and l.student_contact_id is null
    ) then 'needs_attention'
    when not exists (select 1 from public.academy_teacher_collections where lesson_cycle_id = v_cycle_id and status <> 'confirmed') then 'ready_for_swati'
    else 'collecting'
  end into v_next_status;
  update public.academy_lesson_cycles set status = v_next_status, updated_at = now() where id = v_cycle_id;
  insert into public.hermes_audit_events(actor_type, actor_contact_id, event_type, entity_type, entity_id, metadata)
    values (case when p_actor_contact_id is null then 'admin' else 'contact' end, p_actor_contact_id,
      'lesson_report_confirmed', 'lesson_report', v_report.id, jsonb_build_object('revision', v_report.revision));
  return v_report;
end;
$$;

create function public.resolve_academy_lesson_student(p_lesson_id uuid, p_student_contact_id uuid)
returns public.academy_lessons
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lesson public.academy_lessons;
  v_cycle public.academy_lesson_cycles;
begin
  if not exists (select 1 from public.hermes_contacts where id = p_student_contact_id and role = 'student' and is_active = true and deleted_at is null)
  then raise exception 'student_contact_unavailable'; end if;
  select * into v_lesson from public.academy_lessons where id = p_lesson_id for update;
  if v_lesson.id is null then raise exception 'lesson_not_found'; end if;
  select cy.* into v_cycle
    from public.academy_lesson_report_revisions r
    join public.academy_teacher_collections c on c.id = r.teacher_collection_id
    join public.academy_lesson_cycles cy on cy.id = c.lesson_cycle_id
    where r.id = v_lesson.report_revision_id and r.status = 'confirmed' and c.confirmed_report_revision_id = r.id
    for update of cy;
  if v_cycle.id is null then raise exception 'active_confirmed_lesson_required'; end if;
  if v_cycle.status = 'confirmed' then raise exception 'lesson_cycle_confirmed'; end if;
  update public.academy_lessons set student_contact_id = p_student_contact_id where id = p_lesson_id returning * into v_lesson;
  if not exists (
    select 1 from public.academy_teacher_collections c
    left join public.academy_lessons l on l.report_revision_id = c.confirmed_report_revision_id and l.student_contact_id is null
    where c.lesson_cycle_id = v_cycle.id and (c.status <> 'confirmed' or l.id is not null)
  ) then update public.academy_lesson_cycles set status = 'ready_for_swati', updated_at = now() where id = v_cycle.id; end if;
  insert into public.hermes_audit_events(actor_type, event_type, entity_type, entity_id, metadata)
    values ('admin', 'lesson_student_resolved', 'lesson', v_lesson.id, '{}'::jsonb);
  return v_lesson;
end;
$$;

create function public.confirm_academy_lesson_cycle(p_cycle_id uuid)
returns public.academy_lesson_cycles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_cycle public.academy_lesson_cycles;
begin
  select * into v_cycle from public.academy_lesson_cycles where id = p_cycle_id for update;
  if v_cycle.id is null then raise exception 'lesson_cycle_not_found'; end if;
  if v_cycle.status = 'confirmed' then return v_cycle; end if;
  if v_cycle.status <> 'ready_for_swati' then raise exception 'lesson_cycle_not_ready'; end if;
  if exists (select 1 from public.academy_teacher_collections where lesson_cycle_id = p_cycle_id and status <> 'confirmed')
    or exists (
      select 1 from public.academy_teacher_collections c
      join public.academy_lessons l on l.report_revision_id = c.confirmed_report_revision_id
      where c.lesson_cycle_id = p_cycle_id and l.student_contact_id is null
    ) then raise exception 'lesson_cycle_incomplete'; end if;
  update public.academy_lesson_cycles
    set status = 'confirmed', confirmed_at = now(), version = version + 1, updated_at = now()
    where id = p_cycle_id returning * into v_cycle;
  insert into public.hermes_audit_events(actor_type, event_type, entity_type, entity_id, metadata)
    values ('admin', 'lesson_cycle_confirmed', 'lesson_cycle', p_cycle_id, jsonb_build_object('version', v_cycle.version));
  return v_cycle;
end;
$$;

create function public.reopen_academy_lesson_cycle(p_cycle_id uuid)
returns public.academy_lesson_cycles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_cycle public.academy_lesson_cycles;
begin
  update public.academy_lesson_cycles
    set status = 'collecting', confirmed_at = null, version = version + 1, updated_at = now()
    where id = p_cycle_id and status = 'confirmed' returning * into v_cycle;
  if v_cycle.id is null then raise exception 'confirmed_lesson_cycle_required'; end if;
  insert into public.hermes_audit_events(actor_type, event_type, entity_type, entity_id, metadata)
    values ('admin', 'lesson_cycle_reopened', 'lesson_cycle', p_cycle_id, jsonb_build_object('version', v_cycle.version));
  return v_cycle;
end;
$$;

revoke execute on function public.upsert_academy_contact_relationship(uuid, uuid, text, boolean, text) from public, anon, authenticated;
revoke execute on function public.start_academy_lesson_cycle(date, uuid[]) from public, anon, authenticated;
revoke execute on function public.submit_academy_lesson_report(uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.confirm_academy_lesson_report(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.resolve_academy_lesson_student(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.confirm_academy_lesson_cycle(uuid) from public, anon, authenticated;
revoke execute on function public.reopen_academy_lesson_cycle(uuid) from public, anon, authenticated;
grant execute on function public.upsert_academy_contact_relationship(uuid, uuid, text, boolean, text) to service_role;
grant execute on function public.start_academy_lesson_cycle(date, uuid[]) to service_role;
grant execute on function public.submit_academy_lesson_report(uuid, uuid, text, jsonb) to service_role;
grant execute on function public.confirm_academy_lesson_report(uuid, uuid) to service_role;
grant execute on function public.resolve_academy_lesson_student(uuid, uuid) to service_role;
grant execute on function public.confirm_academy_lesson_cycle(uuid) to service_role;
grant execute on function public.reopen_academy_lesson_cycle(uuid) to service_role;

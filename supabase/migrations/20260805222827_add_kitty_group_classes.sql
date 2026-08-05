create table public.kitty_class_enrollments (
  id uuid primary key default gen_random_uuid(),
  series_id uuid references public.kitty_class_series(id) on delete cascade,
  occurrence_id uuid references public.kitty_class_occurrences(id) on delete cascade,
  student_contact_id uuid not null references public.hermes_contacts(id) on delete restrict,
  active_from date not null,
  active_until date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(series_id, occurrence_id) = 1),
  check (active_until is null or active_until >= active_from),
  unique nulls not distinct (series_id, occurrence_id, student_contact_id)
);

create table public.kitty_class_enrollment_contacts (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.kitty_class_enrollments(id) on delete cascade,
  contact_id uuid not null references public.hermes_contacts(id) on delete restrict,
  contact_role text not null check (contact_role in ('student', 'parent_guardian')),
  receives_notifications boolean not null default true,
  confirms_cancellation boolean not null default false,
  confirms_reschedule boolean not null default false,
  is_active boolean not null default true,
  unique (enrollment_id, contact_id)
);

-- A legacy participant scope represents one class membership. Reject any scope
-- that cannot be mapped without inventing a student or choosing among students.
do $$
declare
  v_class record;
begin
  for v_class in
    select 'series'::text as class_kind, series.id as class_id,
      count(participant.id) filter (where participant.participant_role = 'student') as student_count
    from public.kitty_class_series series
    left join public.kitty_class_participants participant on participant.series_id = series.id
    group by series.id
    union all
    select 'occurrence'::text, occurrence.id,
      count(participant.id) filter (where participant.participant_role = 'student')
    from public.kitty_class_occurrences occurrence
    left join public.kitty_class_participants participant on participant.occurrence_id = occurrence.id
    where occurrence.series_id is null
      or exists (
        select 1
        from public.kitty_class_participants scoped_participant
        where scoped_participant.occurrence_id = occurrence.id
      )
    group by occurrence.id
  loop
    if v_class.student_count <> 1 then
      raise exception 'legacy Kitty class % % must have exactly one legacy student; found %',
        v_class.class_kind, v_class.class_id, v_class.student_count;
    end if;
  end loop;
end;
$$;

insert into public.kitty_class_enrollments (
  series_id, student_contact_id, active_from, is_active
)
select participant.series_id, participant.contact_id, series.effective_start, participant.is_active
from public.kitty_class_participants participant
join public.kitty_class_series series on series.id = participant.series_id
where participant.participant_role = 'student';

insert into public.kitty_class_enrollments (
  occurrence_id, student_contact_id, active_from, is_active
)
select participant.occurrence_id, participant.contact_id, occurrence.local_date, participant.is_active
from public.kitty_class_participants participant
join public.kitty_class_occurrences occurrence on occurrence.id = participant.occurrence_id
where participant.participant_role = 'student';

insert into public.kitty_class_enrollment_contacts (
  enrollment_id, contact_id, contact_role, receives_notifications,
  confirms_cancellation, confirms_reschedule, is_active
)
select enrollment.id, participant.contact_id, participant.participant_role,
  participant.receives_notifications, participant.confirms_cancellation,
  participant.confirms_reschedule, participant.is_active
from public.kitty_class_enrollments enrollment
join public.kitty_class_participants participant
  on (enrollment.series_id is not null and participant.series_id = enrollment.series_id)
  or (enrollment.occurrence_id is not null and participant.occurrence_id = enrollment.occurrence_id)
where participant.participant_role = 'student'
  or (
    participant.participant_role = 'parent_guardian'
    and participant.decision_side = 'student'
  );

create table public.kitty_class_attendance_updates (
  id uuid primary key default gen_random_uuid(),
  occurrence_id uuid not null references public.kitty_class_occurrences(id) on delete cascade,
  enrollment_id uuid not null references public.kitty_class_enrollments(id) on delete restrict,
  reported_by_contact_id uuid not null references public.hermes_contacts(id) on delete restrict,
  status text not null check (status in ('expected', 'absent', 'late', 'leaving_early')),
  estimated_at timestamptz,
  note text check (note is null or length(note) <= 240),
  version integer not null default 1 check (version >= 1),
  supersedes_attendance_id uuid references public.kitty_class_attendance_updates(id) on delete restrict,
  client_request_id text not null unique check (length(btrim(client_request_id)) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.kitty_class_operational_relays (
  id uuid primary key default gen_random_uuid(),
  occurrence_id uuid not null references public.kitty_class_occurrences(id) on delete cascade,
  enrollment_id uuid references public.kitty_class_enrollments(id) on delete restrict,
  sent_by_contact_id uuid not null references public.hermes_contacts(id) on delete restrict,
  intent text not null check (intent in (
    'student_absent',
    'student_late',
    'student_leaving_early',
    'teacher_late',
    'mode_changed',
    'location_changed',
    'class_status_requested',
    'meeting_link_requested',
    'substitute_teacher',
    'preparation_note'
  )),
  structured_payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(structured_payload) = 'object'),
  client_request_id text not null unique check (length(btrim(client_request_id)) between 1 and 200),
  created_at timestamptz not null default now(),
  check (
    intent not in ('student_absent', 'student_late', 'student_leaving_early')
    or enrollment_id is not null
  )
);

alter table public.kitty_class_change_requests
  add column scope text not null default 'whole_occurrence'
    check (scope in ('individual_attendance', 'individual_reschedule', 'whole_occurrence', 'series')),
  add column enrollment_id uuid references public.kitty_class_enrollments(id) on delete restrict,
  add column required_enrollment_ids uuid[] not null default '{}'::uuid[],
  add constraint kitty_class_change_request_scope_enrollment_check check (
    (scope in ('individual_attendance', 'individual_reschedule') and enrollment_id is not null)
    or (scope in ('whole_occurrence', 'series') and enrollment_id is null)
  );

-- Existing requests all used the legacy whole-occurrence flow. Only reschedules
-- required student-side approval; cancellations were teacher-finalized.
update public.kitty_class_change_requests request
set required_enrollment_ids = case
  when request.change_type = 'reschedule' then coalesce((
    select array_agg(enrollment.id order by enrollment.id)
    from public.kitty_class_occurrences occurrence
    join public.kitty_class_enrollments enrollment on (
      enrollment.occurrence_id = occurrence.id
      or (
        enrollment.series_id = occurrence.series_id
        and not exists (
          select 1
          from public.kitty_class_enrollments occurrence_enrollment
          where occurrence_enrollment.occurrence_id = occurrence.id
        )
      )
    )
    where occurrence.id = request.occurrence_id
      and enrollment.is_active
      and enrollment.active_from <= occurrence.local_date
      and (enrollment.active_until is null or enrollment.active_until >= occurrence.local_date)
  ), '{}'::uuid[])
  else '{}'::uuid[]
end;

alter table public.kitty_class_change_confirmations
  add column enrollment_id uuid references public.kitty_class_enrollments(id) on delete restrict;

update public.kitty_class_change_confirmations confirmation
set enrollment_id = resolved_enrollment.id
from public.kitty_class_change_requests request
join public.kitty_class_occurrences occurrence on occurrence.id = request.occurrence_id
cross join lateral (
  select enrollment.id
  from public.kitty_class_enrollments enrollment
  where enrollment.occurrence_id = occurrence.id
    or (
      enrollment.series_id = occurrence.series_id
      and not exists (
        select 1
        from public.kitty_class_enrollments occurrence_enrollment
        where occurrence_enrollment.occurrence_id = occurrence.id
      )
    )
  order by (enrollment.occurrence_id is not null) desc
  limit 1
) resolved_enrollment
where request.id = confirmation.change_request_id
  and confirmation.decision_side = 'student';

do $$
declare
  v_constraint_name text;
begin
  select constraint_name into v_constraint_name
  from information_schema.table_constraints
  where table_schema = 'public'
    and table_name = 'kitty_class_change_confirmations'
    and constraint_type = 'UNIQUE';

  if v_constraint_name is not null then
    execute format(
      'alter table public.kitty_class_change_confirmations drop constraint %I',
      v_constraint_name
    );
  end if;
end;
$$;

alter table public.kitty_class_change_confirmations
  add constraint kitty_class_confirmation_enrollment_side_check check (
    (decision_side = 'teacher' and enrollment_id is null)
    or (decision_side = 'student' and enrollment_id is not null)
  );

create unique index kitty_class_teacher_confirmation_unique
  on public.kitty_class_change_confirmations(change_request_id, request_version)
  where decision_side = 'teacher' and enrollment_id is null;

create unique index kitty_class_enrollment_confirmation_unique
  on public.kitty_class_change_confirmations(change_request_id, request_version, enrollment_id)
  where decision_side = 'student' and enrollment_id is not null;

comment on index public.kitty_class_enrollment_confirmation_unique is
  'Student decisions are unique (change_request_id, request_version, enrollment_id).';

create index kitty_class_enrollments_occurrence_idx
  on public.kitty_class_enrollments(occurrence_id) where occurrence_id is not null;
create index kitty_class_enrollments_student_idx
  on public.kitty_class_enrollments(student_contact_id, is_active);
create index kitty_class_enrollment_contacts_contact_idx
  on public.kitty_class_enrollment_contacts(contact_id, is_active);
create index kitty_class_attendance_occurrence_idx
  on public.kitty_class_attendance_updates(occurrence_id, created_at);
create index kitty_class_attendance_enrollment_idx
  on public.kitty_class_attendance_updates(enrollment_id, created_at);
create index kitty_class_attendance_reporter_idx
  on public.kitty_class_attendance_updates(reported_by_contact_id);
create index kitty_class_attendance_supersedes_idx
  on public.kitty_class_attendance_updates(supersedes_attendance_id)
  where supersedes_attendance_id is not null;
create index kitty_class_relays_occurrence_idx
  on public.kitty_class_operational_relays(occurrence_id, created_at);
create index kitty_class_relays_enrollment_idx
  on public.kitty_class_operational_relays(enrollment_id)
  where enrollment_id is not null;
create index kitty_class_relays_sender_idx
  on public.kitty_class_operational_relays(sent_by_contact_id);
create index kitty_class_requests_enrollment_idx
  on public.kitty_class_change_requests(enrollment_id)
  where enrollment_id is not null;
create index kitty_class_confirmations_enrollment_idx
  on public.kitty_class_change_confirmations(enrollment_id)
  where enrollment_id is not null;

alter table public.kitty_class_enrollments enable row level security;
alter table public.kitty_class_enrollment_contacts enable row level security;
alter table public.kitty_class_attendance_updates enable row level security;
alter table public.kitty_class_operational_relays enable row level security;

create policy kitty_class_enrollments_admin_read
  on public.kitty_class_enrollments for select to authenticated
  using ((select public.is_admin()));
create policy kitty_class_enrollment_contacts_admin_read
  on public.kitty_class_enrollment_contacts for select to authenticated
  using ((select public.is_admin()));
create policy kitty_class_attendance_admin_read
  on public.kitty_class_attendance_updates for select to authenticated
  using ((select public.is_admin()));
create policy kitty_class_relays_admin_read
  on public.kitty_class_operational_relays for select to authenticated
  using ((select public.is_admin()));

revoke all on table public.kitty_class_enrollments from anon, authenticated;
revoke all on table public.kitty_class_enrollment_contacts from anon, authenticated;
revoke all on table public.kitty_class_attendance_updates from anon, authenticated;
revoke all on table public.kitty_class_operational_relays from anon, authenticated;

grant select on table public.kitty_class_enrollments to authenticated;
grant select on table public.kitty_class_enrollment_contacts to authenticated;
grant select on table public.kitty_class_attendance_updates to authenticated;
grant select on table public.kitty_class_operational_relays to authenticated;

grant all on table public.kitty_class_enrollments to service_role;
grant all on table public.kitty_class_enrollment_contacts to service_role;
grant all on table public.kitty_class_attendance_updates to service_role;
grant all on table public.kitty_class_operational_relays to service_role;

create trigger set_kitty_class_enrollments_updated_at
  before update on public.kitty_class_enrollments
  for each row execute function public.set_updated_at();
create trigger set_kitty_class_attendance_updated_at
  before update on public.kitty_class_attendance_updates
  for each row execute function public.set_updated_at();

revoke execute on function public.create_kitty_class_series(text, text, text, time, integer, smallint[], date, date, text, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.create_kitty_one_off_class(text, text, timestamptz, timestamptz, date, text, text, uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.request_kitty_class_change(uuid, text, uuid, text, text, timestamptz, timestamptz, text, text) from public, anon, authenticated;
revoke execute on function public.propose_kitty_class_replacement(uuid, integer, text, uuid, timestamptz, timestamptz, text, text) from public, anon, authenticated;
revoke execute on function public.decide_kitty_class_change(uuid, integer, text, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.finalize_kitty_class_change(uuid, integer, text) from public, anon, authenticated;
revoke execute on function public.override_kitty_class_occurrence(uuid, text, text, uuid, timestamptz, timestamptz, text) from public, anon, authenticated;
revoke execute on function public.maintain_kitty_class_state() from public, anon, authenticated;
revoke execute on function public.find_my_pending_kitty_class_changes(uuid, text) from public, anon, authenticated;
revoke execute on function public.retry_kitty_class_notification(uuid, uuid) from public, anon, authenticated;

grant execute on function public.create_kitty_class_series(text, text, text, time, integer, smallint[], date, date, text, uuid, jsonb) to service_role;
grant execute on function public.create_kitty_one_off_class(text, text, timestamptz, timestamptz, date, text, text, uuid, text, jsonb) to service_role;
grant execute on function public.request_kitty_class_change(uuid, text, uuid, text, text, timestamptz, timestamptz, text, text) to service_role;
grant execute on function public.propose_kitty_class_replacement(uuid, integer, text, uuid, timestamptz, timestamptz, text, text) to service_role;
grant execute on function public.decide_kitty_class_change(uuid, integer, text, uuid, text, text) to service_role;
grant execute on function public.finalize_kitty_class_change(uuid, integer, text) to service_role;
grant execute on function public.override_kitty_class_occurrence(uuid, text, text, uuid, timestamptz, timestamptz, text) to service_role;
grant execute on function public.maintain_kitty_class_state() to service_role;
grant execute on function public.find_my_pending_kitty_class_changes(uuid, text) to service_role;
grant execute on function public.retry_kitty_class_notification(uuid, uuid) to service_role;

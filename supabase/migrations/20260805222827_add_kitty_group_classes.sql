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
      null::uuid as parent_series_id,
      count(participant.id) filter (
        where participant.is_active and participant.participant_role = 'student'
      ) as active_student_count,
      count(participant.id) filter (
        where participant.is_active and participant.participant_role = 'teacher'
      ) as active_teacher_count,
      count(participant.id) filter (where participant.participant_role = 'student') as student_count,
      count(participant.id) filter (where participant.participant_role = 'parent_guardian') as parent_count
    from public.kitty_class_series series
    left join public.kitty_class_participants participant on participant.series_id = series.id
    group by series.id
    union all
    select 'occurrence'::text, occurrence.id, occurrence.series_id,
      count(participant.id) filter (
        where participant.is_active and participant.participant_role = 'student'
      ),
      count(participant.id) filter (
        where participant.is_active and participant.participant_role = 'teacher'
      ),
      count(participant.id) filter (where participant.participant_role = 'student'),
      count(participant.id) filter (where participant.participant_role = 'parent_guardian')
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
    if v_class.class_kind = 'occurrence' and v_class.parent_series_id is not null then
      if v_class.active_teacher_count > 0 then
        raise exception 'legacy Kitty recurring occurrence % cannot have an active occurrence-scoped teacher',
          v_class.class_id;
      end if;
    elsif v_class.active_teacher_count <> 1 then
      raise exception 'legacy Kitty class % % must have exactly one active legacy teacher; found %',
        v_class.class_kind, v_class.class_id, v_class.active_teacher_count;
    end if;
    if v_class.student_count <> 1 then
      raise exception 'legacy Kitty class % % must have exactly one legacy student in total; found %',
        v_class.class_kind, v_class.class_id, v_class.student_count;
    end if;
    if v_class.active_student_count <> 1 then
      raise exception 'legacy Kitty class % % must have exactly one active legacy student; found %',
        v_class.class_kind, v_class.class_id, v_class.active_student_count;
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
where (participant.participant_role = 'student'
  and participant.contact_id = enrollment.student_contact_id)
  or (
    participant.participant_role = 'parent_guardian'
    and participant.decision_side = 'student'
  );

create function public.kitty_class_active_enrollment_ids(p_occurrence_id uuid)
returns uuid[]
language sql stable security invoker set search_path = public, pg_temp as $$
  select coalesce(array_agg(enrollment.id order by enrollment.id), '{}'::uuid[])
  from public.kitty_class_occurrences occurrence
  join public.kitty_class_enrollments enrollment on (
    enrollment.occurrence_id = occurrence.id
    or (
      enrollment.series_id = occurrence.series_id
      and not exists (
        select 1
        from public.kitty_class_enrollments occurrence_enrollment
        where occurrence_enrollment.occurrence_id = occurrence.id
          and occurrence_enrollment.student_contact_id = enrollment.student_contact_id
      )
    )
  )
  where occurrence.id = p_occurrence_id
    and enrollment.is_active
    and enrollment.active_from <= occurrence.local_date
    and (enrollment.active_until is null or enrollment.active_until >= occurrence.local_date)
$$;

create function public.kitty_class_enrollment_applies_to_occurrence(
  p_enrollment_id uuid,
  p_occurrence_id uuid
) returns boolean
language sql stable security invoker set search_path = public, pg_temp as $$
  select exists (
    select 1
    from public.kitty_class_enrollments enrollment
    join public.kitty_class_occurrences occurrence on occurrence.id = p_occurrence_id
    where enrollment.id = p_enrollment_id
      and (
        enrollment.occurrence_id = occurrence.id
        or (
          enrollment.series_id = occurrence.series_id
          and not exists (
            select 1
            from public.kitty_class_enrollments occurrence_enrollment
            where occurrence_enrollment.occurrence_id = occurrence.id
              and occurrence_enrollment.student_contact_id = enrollment.student_contact_id
          )
        )
      )
      and enrollment.active_from <= occurrence.local_date
      and (enrollment.active_until is null or enrollment.active_until >= occurrence.local_date)
  )
$$;

create function public.assert_kitty_class_roster(
  p_series_id uuid,
  p_occurrence_id uuid
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_active_teacher_count integer;
  v_occurrence_series_id uuid;
begin
  if p_series_id is not null
    and exists (select 1 from public.kitty_class_series where id = p_series_id)
  then
    select count(*) into v_active_teacher_count
    from public.kitty_class_participants participant
    where participant.series_id = p_series_id
      and participant.is_active
      and participant.participant_role = 'teacher';
    if v_active_teacher_count <> 1 then
      raise exception 'kitty_class_requires_exactly_one_active_teacher' using errcode = '23514';
    end if;
    if not exists (
      select 1 from public.kitty_class_enrollments enrollment
      where enrollment.series_id = p_series_id
        and enrollment.is_active
        and (enrollment.active_until is null or enrollment.active_until >= current_date)
    ) then
      raise exception 'kitty_class_requires_active_enrollment' using errcode = '23514';
    end if;
  end if;

  if p_occurrence_id is not null then
    select occurrence.series_id into v_occurrence_series_id
    from public.kitty_class_occurrences occurrence
    where occurrence.id = p_occurrence_id;
    if found and v_occurrence_series_id is not null then
      if exists (
        select 1 from public.kitty_class_participants participant
        where participant.occurrence_id = p_occurrence_id
          and participant.is_active
          and participant.participant_role = 'teacher'
      ) then
        raise exception 'kitty_class_recurring_occurrence_cannot_override_teacher'
          using errcode = '23514';
      end if;
    elsif found then
      select count(*) into v_active_teacher_count
      from public.kitty_class_participants participant
      where participant.occurrence_id = p_occurrence_id
        and participant.is_active
        and participant.participant_role = 'teacher';
      if v_active_teacher_count <> 1 then
        raise exception 'kitty_class_requires_exactly_one_active_teacher' using errcode = '23514';
      end if;
      if not exists (
        select 1 from public.kitty_class_enrollments enrollment
        where enrollment.occurrence_id = p_occurrence_id
          and enrollment.is_active
          and (enrollment.active_until is null or enrollment.active_until >= current_date)
      ) then
        raise exception 'kitty_class_requires_active_enrollment' using errcode = '23514';
      end if;
    end if;
  end if;
end;
$$;

create function public.enforce_kitty_class_roster_invariant()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_old jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  v_new jsonb := case when tg_op = 'DELETE' then '{}'::jsonb else to_jsonb(new) end;
begin
  if tg_table_name = 'kitty_class_series' then
    perform public.assert_kitty_class_roster(
      nullif(v_old->>'id', '')::uuid,
      null
    );
    perform public.assert_kitty_class_roster(
      nullif(v_new->>'id', '')::uuid,
      null
    );
  elsif tg_table_name = 'kitty_class_occurrences' then
    perform public.assert_kitty_class_roster(
      null,
      nullif(v_old->>'id', '')::uuid
    );
    perform public.assert_kitty_class_roster(
      null,
      nullif(v_new->>'id', '')::uuid
    );
  else
    perform public.assert_kitty_class_roster(
      nullif(v_old->>'series_id', '')::uuid,
      nullif(v_old->>'occurrence_id', '')::uuid
    );
    perform public.assert_kitty_class_roster(
      nullif(v_new->>'series_id', '')::uuid,
      nullif(v_new->>'occurrence_id', '')::uuid
    );
  end if;
  return null;
end;
$$;

create constraint trigger enforce_kitty_class_roster_on_series
  after insert or update or delete on public.kitty_class_series
  deferrable initially deferred
  for each row execute function public.enforce_kitty_class_roster_invariant();
create constraint trigger enforce_kitty_class_roster_on_occurrences
  after insert or update or delete on public.kitty_class_occurrences
  deferrable initially deferred
  for each row execute function public.enforce_kitty_class_roster_invariant();
create constraint trigger enforce_kitty_class_roster_on_participants
  after insert or update or delete on public.kitty_class_participants
  deferrable initially deferred
  for each row execute function public.enforce_kitty_class_roster_invariant();
create constraint trigger enforce_kitty_class_roster_on_enrollments
  after insert or update or delete on public.kitty_class_enrollments
  deferrable initially deferred
  for each row execute function public.enforce_kitty_class_roster_invariant();

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
  when request.change_type = 'reschedule'
    then public.kitty_class_active_enrollment_ids(request.occurrence_id)
  else '{}'::uuid[]
end;

alter table public.kitty_class_change_confirmations
  add column enrollment_id uuid references public.kitty_class_enrollments(id) on delete restrict;

update public.kitty_class_change_confirmations confirmation
set enrollment_id = resolved_enrollment.id
from public.kitty_class_change_requests request
join public.kitty_class_occurrences occurrence on occurrence.id = request.occurrence_id
cross join lateral (
  select enrollment_id as id
  from unnest(public.kitty_class_active_enrollment_ids(occurrence.id)) enrollment_id
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

create function public.kitty_class_validate_enrollment_scope()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_request public.kitty_class_change_requests;
  v_required_count integer;
  v_distinct_count integer;
begin
  if tg_table_name in ('kitty_class_attendance_updates', 'kitty_class_operational_relays') then
    if new.enrollment_id is not null
      and not public.kitty_class_enrollment_applies_to_occurrence(new.enrollment_id, new.occurrence_id)
    then
      raise exception 'kitty_class_enrollment_not_applicable' using errcode = '23514';
    end if;
    return new;
  end if;

  if tg_table_name = 'kitty_class_change_requests' then
    if new.enrollment_id is not null
      and not public.kitty_class_enrollment_applies_to_occurrence(new.enrollment_id, new.occurrence_id)
    then
      raise exception 'kitty_class_enrollment_not_applicable' using errcode = '23514';
    end if;

    select count(*), count(distinct enrollment_id)
      into v_required_count, v_distinct_count
    from unnest(new.required_enrollment_ids) enrollment_id;
    if v_required_count <> v_distinct_count then
      raise exception 'kitty_class_duplicate_required_enrollment' using errcode = '23514';
    end if;
    if exists (
      select 1
      from unnest(new.required_enrollment_ids) required_enrollment_id
      where not public.kitty_class_enrollment_applies_to_occurrence(
        required_enrollment_id,
        new.occurrence_id
      )
    ) then
      raise exception 'kitty_class_required_enrollment_not_applicable' using errcode = '23514';
    end if;
    if new.change_type = 'reschedule'
      and new.scope in ('whole_occurrence', 'individual_reschedule')
      and cardinality(new.required_enrollment_ids) = 0
    then
      raise exception 'kitty_class_reschedule_approvals_required' using errcode = '23514';
    end if;
    if new.change_type = 'cancel' and cardinality(new.required_enrollment_ids) <> 0 then
      raise exception 'kitty_class_cancellation_does_not_require_family_approval' using errcode = '23514';
    end if;
    if new.scope = 'individual_reschedule'
      and new.required_enrollment_ids <> array[new.enrollment_id]::uuid[]
    then
      raise exception 'kitty_class_individual_approval_scope_mismatch' using errcode = '23514';
    end if;
    return new;
  end if;

  if tg_table_name = 'kitty_class_change_confirmations' then
    select * into v_request
    from public.kitty_class_change_requests
    where id = new.change_request_id;
    if not found then
      return new;
    end if;
    if new.decision_side = 'student' then
      if not public.kitty_class_enrollment_applies_to_occurrence(
        new.enrollment_id,
        v_request.occurrence_id
      ) then
        raise exception 'kitty_class_confirmation_enrollment_not_applicable' using errcode = '23514';
      end if;
      if not new.enrollment_id = any(v_request.required_enrollment_ids) then
        raise exception 'kitty_class_confirmation_not_in_request_snapshot' using errcode = '23514';
      end if;
      if v_request.scope = 'individual_reschedule'
        and new.enrollment_id <> v_request.enrollment_id
      then
        raise exception 'kitty_class_confirmation_scope_mismatch' using errcode = '23514';
      end if;
    end if;
    return new;
  end if;

  return new;
end;
$$;

create trigger validate_kitty_class_attendance_enrollment
  before insert or update on public.kitty_class_attendance_updates
  for each row execute function public.kitty_class_validate_enrollment_scope();
create trigger validate_kitty_class_relay_enrollment
  before insert or update on public.kitty_class_operational_relays
  for each row execute function public.kitty_class_validate_enrollment_scope();
create trigger validate_kitty_class_request_enrollments
  before insert or update on public.kitty_class_change_requests
  for each row execute function public.kitty_class_validate_enrollment_scope();
create trigger validate_kitty_class_confirmation_enrollment
  before insert or update on public.kitty_class_change_confirmations
  for each row execute function public.kitty_class_validate_enrollment_scope();

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

create function public.bridge_kitty_class_legacy_roster(
  p_series_id uuid,
  p_occurrence_id uuid,
  p_active_from date,
  p_participants jsonb
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_enrollment_id uuid;
  v_student_contact_id uuid;
begin
  select (item->>'contactId')::uuid into v_student_contact_id
  from jsonb_array_elements(p_participants) item
  where item->>'role' = 'student';

  insert into public.kitty_class_enrollments(
    series_id, occurrence_id, student_contact_id, active_from
  ) values (
    p_series_id, p_occurrence_id, v_student_contact_id, p_active_from
  ) returning id into v_enrollment_id;

  insert into public.kitty_class_enrollment_contacts(
    enrollment_id, contact_id, contact_role, receives_notifications,
    confirms_cancellation, confirms_reschedule
  )
  select v_enrollment_id, (item->>'contactId')::uuid, item->>'role',
    coalesce((item->>'receivesNotifications')::boolean, true),
    coalesce((item->>'confirmsCancellation')::boolean, false),
    coalesce((item->>'confirmsReschedule')::boolean, false)
  from jsonb_array_elements(p_participants) item
  where item->>'role' = 'student'
    or (item->>'role' = 'parent_guardian' and item->>'decisionSide' = 'student');

  return v_enrollment_id;
end;
$$;

create or replace function public.create_kitty_class_series(
  p_title text, p_subject text, p_timezone text, p_local_time time,
  p_duration_minutes integer, p_weekdays smallint[], p_effective_start date,
  p_effective_end date, p_origin_channel text, p_created_by uuid, p_participants jsonb
) returns public.kitty_class_series
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_series public.kitty_class_series;
begin
  if jsonb_typeof(p_participants) <> 'array' or jsonb_array_length(p_participants) < 2 then
    raise exception 'participants_required';
  end if;
  if (select count(*) from jsonb_array_elements(p_participants) item where item->>'role' = 'teacher') <> 1
    or (select count(*) from jsonb_array_elements(p_participants) item where item->>'role' = 'student') <> 1
    or not exists (select 1 from jsonb_array_elements(p_participants) item where item->>'role' = 'teacher' and item->>'decisionSide' = 'teacher')
    or not exists (select 1 from jsonb_array_elements(p_participants) item where item->>'role' in ('student', 'parent_guardian') and item->>'decisionSide' = 'student' and coalesce((item->>'confirmsCancellation')::boolean, false))
    or not exists (select 1 from jsonb_array_elements(p_participants) item where item->>'role' in ('student', 'parent_guardian') and item->>'decisionSide' = 'student' and coalesce((item->>'confirmsReschedule')::boolean, false))
    or not exists (select 1 from jsonb_array_elements(p_participants) item where item->>'role' = 'teacher' and coalesce((item->>'receivesNotifications')::boolean, true) and coalesce((item->>'confirmsCancellation')::boolean, false) and coalesce((item->>'confirmsReschedule')::boolean, false))
  then
    raise exception 'participant_sides_required';
  end if;

  insert into public.kitty_class_series(
    title, subject, timezone, local_time, duration_minutes, weekdays,
    effective_start, effective_end, origin_channel, created_by_profile_id
  ) values (
    btrim(p_title), nullif(btrim(p_subject), ''), p_timezone, p_local_time,
    p_duration_minutes, p_weekdays, p_effective_start, p_effective_end,
    p_origin_channel, p_created_by
  ) returning * into v_series;
  insert into public.kitty_class_participants(
    series_id, contact_id, participant_role, receives_notifications,
    confirms_cancellation, confirms_reschedule, decision_side
  )
  select v_series.id, (item->>'contactId')::uuid, item->>'role',
    coalesce((item->>'receivesNotifications')::boolean, true),
    coalesce((item->>'confirmsCancellation')::boolean, false),
    coalesce((item->>'confirmsReschedule')::boolean, false),
    nullif(item->>'decisionSide', '')
  from jsonb_array_elements(p_participants) item;
  perform public.bridge_kitty_class_legacy_roster(
    v_series.id, null, p_effective_start, p_participants
  );
  insert into public.kitty_class_audit_events(
    actor_type, actor_profile_id, event_type, entity_type, entity_id
  ) values ('admin', p_created_by, 'series_created', 'series', v_series.id);
  return v_series;
end;
$$;

create or replace function public.create_kitty_one_off_class(
  p_title text, p_subject text, p_starts_at timestamptz, p_ends_at timestamptz,
  p_local_date date, p_timezone text, p_origin_channel text, p_created_by uuid,
  p_occurrence_key text, p_participants jsonb
) returns public.kitty_class_occurrences
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_occurrence public.kitty_class_occurrences;
begin
  if jsonb_typeof(p_participants) <> 'array' or jsonb_array_length(p_participants) < 2 then
    raise exception 'participants_required';
  end if;
  if (select count(*) from jsonb_array_elements(p_participants) item where item->>'role' = 'teacher') <> 1
    or (select count(*) from jsonb_array_elements(p_participants) item where item->>'role' = 'student') <> 1
    or not exists (select 1 from jsonb_array_elements(p_participants) item where item->>'role' = 'teacher' and item->>'decisionSide' = 'teacher')
    or not exists (select 1 from jsonb_array_elements(p_participants) item where item->>'role' in ('student', 'parent_guardian') and item->>'decisionSide' = 'student' and coalesce((item->>'confirmsCancellation')::boolean, false))
    or not exists (select 1 from jsonb_array_elements(p_participants) item where item->>'role' in ('student', 'parent_guardian') and item->>'decisionSide' = 'student' and coalesce((item->>'confirmsReschedule')::boolean, false))
    or not exists (select 1 from jsonb_array_elements(p_participants) item where item->>'role' = 'teacher' and coalesce((item->>'receivesNotifications')::boolean, true) and coalesce((item->>'confirmsCancellation')::boolean, false) and coalesce((item->>'confirmsReschedule')::boolean, false))
  then
    raise exception 'participant_sides_required';
  end if;

  insert into public.kitty_class_occurrences(
    occurrence_key, title, subject, starts_at, ends_at, local_date, timezone,
    origin_channel, created_by_profile_id
  ) values (
    p_occurrence_key, btrim(p_title), nullif(btrim(p_subject), ''), p_starts_at,
    p_ends_at, p_local_date, p_timezone, p_origin_channel, p_created_by
  ) returning * into v_occurrence;
  insert into public.kitty_class_participants(
    occurrence_id, contact_id, participant_role, receives_notifications,
    confirms_cancellation, confirms_reschedule, decision_side
  )
  select v_occurrence.id, (item->>'contactId')::uuid, item->>'role',
    coalesce((item->>'receivesNotifications')::boolean, true),
    coalesce((item->>'confirmsCancellation')::boolean, false),
    coalesce((item->>'confirmsReschedule')::boolean, false),
    nullif(item->>'decisionSide', '')
  from jsonb_array_elements(p_participants) item;
  perform public.bridge_kitty_class_legacy_roster(
    null, v_occurrence.id, p_local_date, p_participants
  );
  insert into public.kitty_class_audit_events(
    actor_type, actor_profile_id, event_type, entity_type, entity_id
  ) values ('admin', p_created_by, 'occurrence_created', 'occurrence', v_occurrence.id);
  return v_occurrence;
end;
$$;

create function public.kitty_class_resolve_decision_actor(
  p_occurrence_id uuid,
  p_contact_id uuid,
  p_change_type text
) returns table (decision_side text, enrollment_id uuid)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_occurrence public.kitty_class_occurrences;
  v_is_teacher boolean;
  v_enrollment_ids uuid[];
begin
  select * into v_occurrence
  from public.kitty_class_occurrences
  where id = p_occurrence_id;
  if not found then
    raise exception 'occurrence_unavailable';
  end if;

  select exists (
    select 1
    from public.kitty_class_participants participant
    where participant.contact_id = p_contact_id
      and participant.is_active
      and participant.participant_role = 'teacher'
      and participant.decision_side = 'teacher'
      and case when p_change_type = 'cancel'
        then participant.confirms_cancellation
        else participant.confirms_reschedule
      end
      and (
        participant.occurrence_id = v_occurrence.id
        or participant.series_id = v_occurrence.series_id
      )
  ) into v_is_teacher;

  select coalesce(array_agg(distinct enrollment.id), '{}'::uuid[])
    into v_enrollment_ids
  from unnest(public.kitty_class_active_enrollment_ids(p_occurrence_id)) active_enrollment_id
  join public.kitty_class_enrollments enrollment on enrollment.id = active_enrollment_id
  join public.kitty_class_enrollment_contacts enrollment_contact
    on enrollment_contact.enrollment_id = enrollment.id
  where enrollment_contact.contact_id = p_contact_id
    and enrollment_contact.is_active
    and case when p_change_type = 'cancel'
      then enrollment_contact.confirms_cancellation
      else enrollment_contact.confirms_reschedule
    end;

  if v_is_teacher and cardinality(v_enrollment_ids) > 0 then
    raise exception 'decision_actor_ambiguous';
  elsif v_is_teacher then
    return query select 'teacher'::text, null::uuid;
  elsif cardinality(v_enrollment_ids) > 0 then
    return query
      select 'student'::text, represented_enrollment_id
      from unnest(v_enrollment_ids) represented_enrollment_id;
  else
    raise exception 'participant_required';
  end if;
end;
$$;

create function public.reserve_kitty_class_group_notifications(
  p_occurrence_id uuid,
  p_change_request_id uuid,
  p_intent text,
  p_payload jsonb,
  p_idempotency_suffix text,
  p_excluded_contact_id uuid default null
) returns void
language sql volatile security definer set search_path = public, pg_temp as $$
  with occurrence as (
    select * from public.kitty_class_occurrences where id = p_occurrence_id
  ), recipients as (
    select enrollment_contact.contact_id
    from unnest(public.kitty_class_active_enrollment_ids(p_occurrence_id)) active_enrollment_id
    join public.kitty_class_enrollment_contacts enrollment_contact
      on enrollment_contact.enrollment_id = active_enrollment_id
    where enrollment_contact.is_active
      and enrollment_contact.receives_notifications
    union
    select participant.contact_id
    from occurrence
    join public.kitty_class_participants participant on (
      participant.occurrence_id = occurrence.id
      or participant.series_id = occurrence.series_id
    )
    where participant.is_active
      and participant.participant_role = 'teacher'
      and participant.receives_notifications
  )
  insert into public.kitty_class_notification_outbox(
    occurrence_id, change_request_id, contact_id, intent, payload, idempotency_key
  )
  select p_occurrence_id, p_change_request_id, recipient.contact_id, p_intent,
    coalesce(p_payload, '{}'::jsonb),
    'kitty-class:' || p_change_request_id::text || ':' || p_idempotency_suffix || ':'
      || recipient.contact_id::text || ':' || p_intent
  from recipients recipient
  where p_excluded_contact_id is null or recipient.contact_id <> p_excluded_contact_id
  on conflict (idempotency_key) do nothing
$$;

create or replace function public.request_kitty_class_change(
  p_occurrence_id uuid, p_change_type text, p_requested_by uuid,
  p_requester_side text, p_reason text, p_proposed_starts_at timestamptz,
  p_proposed_ends_at timestamptz, p_proposed_timezone text, p_payload_digest text
) returns public.kitty_class_change_requests
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_occurrence public.kitty_class_occurrences;
  v_request public.kitty_class_change_requests;
  v_side text;
  v_actor_enrollment_ids uuid[];
  v_required_enrollment_ids uuid[];
  v_intent text;
begin
  select * into v_occurrence
  from public.kitty_class_occurrences
  where id = p_occurrence_id
  for update;
  if not found or v_occurrence.status <> 'scheduled' then
    raise exception 'occurrence_unavailable';
  end if;
  if p_change_type not in ('cancel', 'reschedule') then
    raise exception 'invalid_change';
  end if;
  if p_change_type = 'reschedule'
    and (p_proposed_starts_at is null) <> (p_proposed_ends_at is null)
  then
    raise exception 'replacement_time_incomplete';
  end if;
  if p_proposed_starts_at is not null and p_proposed_ends_at <= p_proposed_starts_at then
    raise exception 'replacement_time_required';
  end if;

  select min(actor.decision_side),
    coalesce(array_agg(actor.enrollment_id order by actor.enrollment_id)
      filter (where actor.enrollment_id is not null), '{}'::uuid[])
    into v_side, v_actor_enrollment_ids
  from public.kitty_class_resolve_decision_actor(
    p_occurrence_id, p_requested_by, p_change_type
  ) actor;
  if v_side <> p_requester_side then
    raise exception 'requester_side_mismatch';
  end if;

  v_required_enrollment_ids := case when p_change_type = 'reschedule'
    then public.kitty_class_active_enrollment_ids(p_occurrence_id)
    else '{}'::uuid[]
  end;
  if p_change_type = 'reschedule' and cardinality(v_required_enrollment_ids) = 0 then
    raise exception 'kitty_class_reschedule_approvals_required';
  end if;

  insert into public.kitty_class_change_requests(
    occurrence_id, change_type, requested_by_contact_id, requester_side, reason,
    proposed_starts_at, proposed_ends_at, proposed_timezone, status, payload_digest,
    scope, enrollment_id, required_enrollment_ids
  ) values (
    p_occurrence_id, p_change_type, p_requested_by, v_side,
    nullif(left(btrim(coalesce(p_reason, '')), 500), ''),
    p_proposed_starts_at, p_proposed_ends_at, p_proposed_timezone,
    case
      when p_change_type = 'cancel' and v_side = 'teacher' then 'ready_to_finalize'
      when p_change_type = 'reschedule' and p_proposed_starts_at is null then 'collecting_alternatives'
      else 'awaiting_counterparty'
    end,
    p_payload_digest, 'whole_occurrence', null, v_required_enrollment_ids
  ) returning * into v_request;

  if v_side = 'teacher' then
    insert into public.kitty_class_change_confirmations(
      change_request_id, request_version, decision_side, enrollment_id,
      decided_by_contact_id, decision, payload_digest, source_channel, decided_at
    ) values (
      v_request.id, v_request.version, 'teacher', null,
      p_requested_by, 'approved', p_payload_digest, 'whatsapp', now()
    );
  elsif p_change_type = 'reschedule' then
    if not v_actor_enrollment_ids && v_required_enrollment_ids then
      raise exception 'kitty_class_confirmation_not_in_request_snapshot';
    end if;
    insert into public.kitty_class_change_confirmations(
      change_request_id, request_version, decision_side, enrollment_id,
      decided_by_contact_id, decision, payload_digest, source_channel, decided_at
    )
    select v_request.id, v_request.version, 'student', actor_enrollment_id,
      p_requested_by, 'approved', p_payload_digest, 'whatsapp', now()
    from unnest(v_actor_enrollment_ids) actor_enrollment_id
    where actor_enrollment_id = any(v_required_enrollment_ids);
  end if;

  update public.kitty_class_occurrences
  set status = 'change_requested', version = version + 1
  where id = p_occurrence_id;

  if p_change_type = 'cancel' and v_side = 'teacher' then
    select * into v_request from public.finalize_kitty_class_change(
      v_request.id, v_request.version, v_request.payload_digest
    );
  else
    v_intent := case
      when p_change_type = 'reschedule' and p_proposed_starts_at is not null
        then 'class_change_proposal'
      else 'class_change_request'
    end;
    perform public.reserve_kitty_class_group_notifications(
      p_occurrence_id, v_request.id, v_intent,
      jsonb_build_object('occurrenceId', p_occurrence_id),
      v_request.version::text, p_requested_by
    );
  end if;

  insert into public.kitty_class_audit_events(
    actor_type, actor_contact_id, event_type, entity_type, entity_id
  ) values ('contact', p_requested_by, 'change_requested', 'change_request', v_request.id);
  return v_request;
end;
$$;

create or replace function public.propose_kitty_class_replacement(
  p_request_id uuid, p_request_version integer, p_payload_digest text,
  p_proposed_by uuid, p_starts_at timestamptz, p_ends_at timestamptz,
  p_timezone text, p_new_payload_digest text
) returns public.kitty_class_change_requests
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_request public.kitty_class_change_requests;
  v_occurrence public.kitty_class_occurrences;
  v_side text;
  v_actor_enrollment_ids uuid[];
begin
  select * into v_request
  from public.kitty_class_change_requests
  where id = p_request_id
  for update;
  if not found or v_request.change_type <> 'reschedule'
    or v_request.status not in ('collecting_alternatives', 'awaiting_counterparty')
    or v_request.expires_at <= now()
  then
    raise exception 'request_unavailable';
  end if;
  if v_request.version <> p_request_version or v_request.payload_digest <> p_payload_digest then
    raise exception 'stale_change_request';
  end if;
  if p_starts_at is null or p_ends_at <= p_starts_at then
    raise exception 'replacement_time_required';
  end if;
  select * into v_occurrence
  from public.kitty_class_occurrences
  where id = v_request.occurrence_id
  for update;

  select min(actor.decision_side),
    coalesce(array_agg(actor.enrollment_id order by actor.enrollment_id)
      filter (where actor.enrollment_id is not null), '{}'::uuid[])
    into v_side, v_actor_enrollment_ids
  from public.kitty_class_resolve_decision_actor(
    v_request.occurrence_id, p_proposed_by, 'reschedule'
  ) actor;

  update public.kitty_class_change_requests
  set proposed_starts_at = p_starts_at,
    proposed_ends_at = p_ends_at,
    proposed_timezone = coalesce(p_timezone, v_occurrence.timezone),
    status = 'awaiting_counterparty', requester_side = v_side,
    version = version + 1, payload_digest = p_new_payload_digest,
    required_enrollment_ids = public.kitty_class_active_enrollment_ids(v_request.occurrence_id)
  where id = v_request.id
  returning * into v_request;

  if cardinality(v_request.required_enrollment_ids) = 0 then
    raise exception 'kitty_class_reschedule_approvals_required';
  end if;

  if v_side = 'teacher' then
    insert into public.kitty_class_change_confirmations(
      change_request_id, request_version, decision_side, enrollment_id,
      decided_by_contact_id, decision, payload_digest, source_channel, decided_at
    ) values (
      v_request.id, v_request.version, 'teacher', null,
      p_proposed_by, 'approved', p_new_payload_digest, 'whatsapp', now()
    );
  else
    if not v_actor_enrollment_ids && v_request.required_enrollment_ids then
      raise exception 'kitty_class_confirmation_not_in_request_snapshot';
    end if;
    insert into public.kitty_class_change_confirmations(
      change_request_id, request_version, decision_side, enrollment_id,
      decided_by_contact_id, decision, payload_digest, source_channel, decided_at
    )
    select v_request.id, v_request.version, 'student', actor_enrollment_id,
      p_proposed_by, 'approved', p_new_payload_digest, 'whatsapp', now()
    from unnest(v_actor_enrollment_ids) actor_enrollment_id
    where actor_enrollment_id = any(v_request.required_enrollment_ids);
  end if;

  perform public.reserve_kitty_class_group_notifications(
    v_request.occurrence_id, v_request.id, 'class_change_proposal',
    jsonb_build_object('occurrenceId', v_request.occurrence_id),
    v_request.version::text, p_proposed_by
  );
  insert into public.kitty_class_audit_events(
    actor_type, actor_contact_id, event_type, entity_type, entity_id
  ) values ('contact', p_proposed_by, 'replacement_proposed', 'change_request', v_request.id);
  return v_request;
end;
$$;

create or replace function public.decide_kitty_class_change(
  p_request_id uuid, p_request_version integer, p_payload_digest text,
  p_decided_by uuid, p_decision text, p_provider_message_id text
) returns public.kitty_class_change_requests
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_request public.kitty_class_change_requests;
  v_occurrence public.kitty_class_occurrences;
  v_side text;
  v_actor_enrollment_ids uuid[];
  v_teacher_approved boolean;
  v_all_enrollments_approved boolean;
begin
  select * into v_request
  from public.kitty_class_change_requests
  where id = p_request_id
  for update;
  if not found or v_request.status not in ('awaiting_counterparty', 'collecting_alternatives')
    or v_request.expires_at <= now()
  then
    raise exception 'request_unavailable';
  end if;
  if v_request.version <> p_request_version or v_request.payload_digest <> p_payload_digest then
    raise exception 'stale_change_request';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'invalid_decision';
  end if;
  select * into v_occurrence
  from public.kitty_class_occurrences
  where id = v_request.occurrence_id
  for update;
  select min(actor.decision_side),
    coalesce(array_agg(actor.enrollment_id order by actor.enrollment_id)
      filter (where actor.enrollment_id is not null), '{}'::uuid[])
    into v_side, v_actor_enrollment_ids
  from public.kitty_class_resolve_decision_actor(
    v_request.occurrence_id, p_decided_by, v_request.change_type
  ) actor;

  if v_request.change_type = 'cancel' and v_side <> 'teacher' then
    raise exception 'teacher_confirmation_required';
  end if;

  if v_side = 'teacher' then
    insert into public.kitty_class_change_confirmations(
      change_request_id, request_version, decision_side, enrollment_id,
      decided_by_contact_id, decision, payload_digest, source_channel,
      provider_message_id, decided_at
    ) values (
      v_request.id, v_request.version, 'teacher', null, p_decided_by,
      p_decision, p_payload_digest, 'whatsapp', p_provider_message_id, now()
    ) on conflict (change_request_id, request_version)
      where decision_side = 'teacher' and enrollment_id is null
    do update set decided_by_contact_id = excluded.decided_by_contact_id,
      decision = excluded.decision, payload_digest = excluded.payload_digest,
      provider_message_id = excluded.provider_message_id,
      decided_at = now(), updated_at = now();
  else
    if not v_actor_enrollment_ids && v_request.required_enrollment_ids then
      raise exception 'kitty_class_confirmation_not_in_request_snapshot';
    end if;
    insert into public.kitty_class_change_confirmations(
      change_request_id, request_version, decision_side, enrollment_id,
      decided_by_contact_id, decision, payload_digest, source_channel,
      provider_message_id, decided_at
    )
    select v_request.id, v_request.version, 'student', actor_enrollment_id,
      p_decided_by, p_decision, p_payload_digest, 'whatsapp',
      p_provider_message_id, now()
    from unnest(v_actor_enrollment_ids) actor_enrollment_id
    where actor_enrollment_id = any(v_request.required_enrollment_ids)
    on conflict (change_request_id, request_version, enrollment_id)
      where decision_side = 'student' and enrollment_id is not null
    do update set decided_by_contact_id = excluded.decided_by_contact_id,
      decision = excluded.decision, payload_digest = excluded.payload_digest,
      provider_message_id = excluded.provider_message_id,
      decided_at = now(), updated_at = now();
  end if;

  if p_decision = 'rejected' then
    update public.kitty_class_change_requests
    set status = 'rejected', finalized_at = now()
    where id = v_request.id
    returning * into v_request;
    update public.kitty_class_occurrences
    set status = 'scheduled', version = version + 1
    where id = v_request.occurrence_id;
    perform public.reserve_kitty_class_group_notifications(
      v_request.occurrence_id, v_request.id, 'class_change_rejected',
      jsonb_build_object('occurrenceId', v_request.occurrence_id),
      v_request.version::text, null
    );
  else
    select exists (
      select 1
      from public.kitty_class_change_confirmations confirmation
      where confirmation.change_request_id = v_request.id
        and confirmation.request_version = v_request.version
        and confirmation.decision_side = 'teacher'
        and confirmation.enrollment_id is null
        and confirmation.decision = 'approved'
        and confirmation.payload_digest = v_request.payload_digest
    ) into v_teacher_approved;

    select not exists (
      select 1
      from unnest(v_request.required_enrollment_ids) required_enrollment_id
      where not exists (
        select 1
        from public.kitty_class_change_confirmations confirmation
        where confirmation.change_request_id = v_request.id
          and confirmation.request_version = v_request.version
          and confirmation.decision_side = 'student'
          and confirmation.enrollment_id = required_enrollment_id
          and confirmation.decision = 'approved'
          and confirmation.payload_digest = v_request.payload_digest
      )
    ) into v_all_enrollments_approved;

    if v_request.change_type = 'cancel' and v_teacher_approved then
      update public.kitty_class_change_requests
      set status = 'ready_to_finalize'
      where id = v_request.id
      returning * into v_request;
      select * into v_request from public.finalize_kitty_class_change(
        v_request.id, v_request.version, v_request.payload_digest
      );
    elsif v_request.change_type = 'reschedule'
      and v_teacher_approved and v_all_enrollments_approved
    then
      update public.kitty_class_change_requests
      set status = 'ready_to_finalize'
      where id = v_request.id
      returning * into v_request;
      select * into v_request from public.finalize_kitty_class_change(
        v_request.id, v_request.version, v_request.payload_digest
      );
    end if;
  end if;

  insert into public.kitty_class_audit_events(
    actor_type, actor_contact_id, event_type, entity_type, entity_id
  ) values ('contact', p_decided_by, 'change_' || p_decision, 'change_request', v_request.id);
  return v_request;
end;
$$;

create or replace function public.finalize_kitty_class_change(
  p_request_id uuid, p_request_version integer, p_payload_digest text
) returns public.kitty_class_change_requests
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_request public.kitty_class_change_requests;
  v_occurrence public.kitty_class_occurrences;
  v_replacement public.kitty_class_occurrences;
  v_intent text;
  v_teacher_approved boolean;
  v_all_enrollments_approved boolean;
begin
  select * into v_request
  from public.kitty_class_change_requests
  where id = p_request_id
  for update;
  if not found or v_request.status <> 'ready_to_finalize' then
    raise exception 'request_not_finalizable';
  end if;
  if v_request.expires_at <= now() then
    raise exception 'request_expired';
  end if;
  if v_request.version <> p_request_version or v_request.payload_digest <> p_payload_digest then
    raise exception 'stale_change_request';
  end if;
  select * into v_occurrence
  from public.kitty_class_occurrences
  where id = v_request.occurrence_id
  for update;

  select exists (
    select 1 from public.kitty_class_change_confirmations confirmation
    where confirmation.change_request_id = v_request.id
      and confirmation.request_version = v_request.version
      and confirmation.decision_side = 'teacher'
      and confirmation.enrollment_id is null
      and confirmation.decision = 'approved'
      and confirmation.payload_digest = v_request.payload_digest
  ) into v_teacher_approved;
  select not exists (
    select 1
    from unnest(v_request.required_enrollment_ids) required_enrollment_id
    where not exists (
      select 1 from public.kitty_class_change_confirmations confirmation
      where confirmation.change_request_id = v_request.id
        and confirmation.request_version = v_request.version
        and confirmation.decision_side = 'student'
        and confirmation.enrollment_id = required_enrollment_id
        and confirmation.decision = 'approved'
        and confirmation.payload_digest = v_request.payload_digest
    )
  ) into v_all_enrollments_approved;

  if not v_teacher_approved then
    raise exception 'teacher_confirmation_required';
  end if;
  if v_request.change_type = 'reschedule'
    and (cardinality(v_request.required_enrollment_ids) = 0 or not v_all_enrollments_approved)
  then
    raise exception 'enrollment_approvals_required';
  end if;

  if v_request.change_type = 'cancel' then
    update public.kitty_class_occurrences
    set status = 'cancelled', cancelled_at = now(), version = version + 1
    where id = v_occurrence.id;
    v_intent := 'class_cancelled';
  else
    if v_request.proposed_starts_at is null or v_request.proposed_ends_at is null then
      raise exception 'replacement_time_required';
    end if;
    update public.kitty_class_occurrences
    set status = 'rescheduled', version = version + 1
    where id = v_occurrence.id;
    insert into public.kitty_class_occurrences(
      series_id, occurrence_key, title, subject, starts_at, ends_at, local_date,
      timezone, predecessor_occurrence_id, origin_channel
    ) values (
      v_occurrence.series_id, 'reschedule:' || v_request.id::text,
      v_occurrence.title, v_occurrence.subject,
      v_request.proposed_starts_at, v_request.proposed_ends_at,
      (v_request.proposed_starts_at at time zone coalesce(
        v_request.proposed_timezone, v_occurrence.timezone
      ))::date,
      coalesce(v_request.proposed_timezone, v_occurrence.timezone),
      v_occurrence.id, 'system'
    ) returning * into v_replacement;
    insert into public.kitty_class_participants(
      occurrence_id, contact_id, participant_role, receives_notifications,
      confirms_cancellation, confirms_reschedule, decision_side, is_active
    )
    select v_replacement.id, contact_id, participant_role, receives_notifications,
      confirms_cancellation, confirms_reschedule, decision_side, is_active
    from public.kitty_class_participants
    where occurrence_id = v_occurrence.id;
    insert into public.kitty_class_enrollments(
      occurrence_id, student_contact_id, active_from, active_until, is_active
    )
    select v_replacement.id, student_contact_id, v_replacement.local_date,
      v_replacement.local_date, is_active
    from public.kitty_class_enrollments
    where occurrence_id = v_occurrence.id;
    insert into public.kitty_class_enrollment_contacts(
      enrollment_id, contact_id, contact_role, receives_notifications,
      confirms_cancellation, confirms_reschedule, is_active
    )
    select replacement_enrollment.id, enrollment_contact.contact_id,
      enrollment_contact.contact_role, enrollment_contact.receives_notifications,
      enrollment_contact.confirms_cancellation, enrollment_contact.confirms_reschedule,
      enrollment_contact.is_active
    from public.kitty_class_enrollments original_enrollment
    join public.kitty_class_enrollments replacement_enrollment
      on replacement_enrollment.occurrence_id = v_replacement.id
      and replacement_enrollment.student_contact_id = original_enrollment.student_contact_id
    join public.kitty_class_enrollment_contacts enrollment_contact
      on enrollment_contact.enrollment_id = original_enrollment.id
    where original_enrollment.occurrence_id = v_occurrence.id;
    v_intent := 'class_rescheduled';
  end if;

  update public.kitty_class_change_requests
  set status = 'finalized', finalized_at = now()
  where id = v_request.id
  returning * into v_request;
  perform public.reserve_kitty_class_group_notifications(
    v_occurrence.id, v_request.id, v_intent,
    jsonb_build_object(
      'occurrenceId', v_occurrence.id,
      'replacementOccurrenceId', v_replacement.id
    ),
    v_request.version::text || ':final', null
  );
  insert into public.kitty_class_audit_events(
    actor_type, event_type, entity_type, entity_id
  ) values ('system', 'change_finalized', 'change_request', v_request.id);
  return v_request;
end;
$$;

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
revoke execute on function public.kitty_class_active_enrollment_ids(uuid) from public, anon, authenticated;
revoke execute on function public.kitty_class_enrollment_applies_to_occurrence(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.assert_kitty_class_roster(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.enforce_kitty_class_roster_invariant() from public, anon, authenticated;
revoke execute on function public.kitty_class_validate_enrollment_scope() from public, anon, authenticated;
revoke execute on function public.bridge_kitty_class_legacy_roster(uuid, uuid, date, jsonb) from public, anon, authenticated;
revoke execute on function public.kitty_class_resolve_decision_actor(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.reserve_kitty_class_group_notifications(uuid, uuid, text, jsonb, text, uuid) from public, anon, authenticated;

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
grant execute on function public.kitty_class_active_enrollment_ids(uuid) to service_role;
grant execute on function public.kitty_class_enrollment_applies_to_occurrence(uuid, uuid) to service_role;
grant execute on function public.kitty_class_resolve_decision_actor(uuid, uuid, text) to service_role;
grant execute on function public.reserve_kitty_class_group_notifications(uuid, uuid, text, jsonb, text, uuid) to service_role;

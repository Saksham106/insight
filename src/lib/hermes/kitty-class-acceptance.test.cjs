/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const read = (relative) => fs.readFileSync(path.join(process.cwd(), relative), "utf8");

const migrationProbeBootstrap = `
create extension if not exists pgcrypto;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create table public.profiles (id uuid primary key);
create table public.hermes_contacts (id uuid primary key);
create table public.hermes_messages (id uuid primary key);
create function public.is_admin() returns boolean language sql stable as $$ select true $$;
create function public.set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
`;

function runContainerCommand(args, options = {}) {
  return childProcess.spawnSync("docker", ["exec", ...args], {
    encoding: "utf8",
    ...options,
  });
}

function runProbeSql(container, database, sql) {
  return runContainerCommand(
    ["-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database],
    { input: sql },
  );
}

function runAsyncProbeSql(container, database, sql, readyMarker) {
  const child = childProcess.spawn(
    "docker",
    ["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  let stdout = "";
  let stderr = "";
  let readyResolved = !readyMarker;
  let resolveReady;
  let rejectReady;
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
    if (readyResolved) resolve();
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
    if (!readyResolved && stdout.includes(readyMarker)) {
      readyResolved = true;
      resolveReady();
    }
  });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.stdin.end(sql);
  const completed = new Promise((resolve, reject) => {
    child.on("error", (error) => {
      if (!readyResolved) rejectReady(error);
      reject(error);
    });
    child.on("close", (status) => {
      if (!readyResolved) rejectReady(new Error(`probe exited before ${readyMarker}:\n${stdout}\n${stderr}`));
      resolve({ status, stdout, stderr });
    });
  });
  return { ready, completed };
}

test("the complete Kitty class coordination path is wired and isolated", () => {
  const migration = read("supabase/migrations/20260805120000_add_kitty_class_calendar.sql");
  const service = read("src/lib/hermes/kitty-class-service.ts");
  const tools = read("src/lib/hermes/kitty-class-tools.ts");
  const notifications = read("src/lib/hermes/kitty-class-notifications.ts");
  const combined = `${migration}\n${service}\n${tools}\n${notifications}`;

  assert.match(migration, /p_participants jsonb/);
  assert.match(migration, /jsonb_array_elements\(p_participants\)/);
  assert.match(tools, /confirmKittyClassSelection[\s\S]*beginKittyClassChange/);
  assert.match(service, /occurrence_selection_confirmed/);
  assert.match(service, /selectionTokenDigest/);
  assert.match(migration, /participant\.decision_side <> p_requester_side/);
  assert.match(migration, /v_decision_side is null or v_decision_side = v_request\.requester_side/);
  assert.match(migration, /confirms_cancellation else participant\.confirms_reschedule/);
  assert.match(migration, /maintain_kitty_class_state/);
  assert.match(migration, /returns table \([\s\S]*payload_digest text, version integer, expires_at timestamptz/);
  assert.match(migration, /v_approved = 2/);
  assert.match(migration, /select public\.finalize_kitty_class_change\(v_request\.id, v_request\.version, v_request\.payload_digest\) into v_request/);
  assert.match(migration, /decision_side = 'teacher' and participant_role = 'teacher'/);
  assert.match(migration, /decision_side = 'student' and participant_role in \('student', 'parent_guardian'\)/);
  assert.match(migration, /class_cancelled/);
  assert.match(migration, /class_rescheduled/);
  assert.match(migration, /on conflict \(idempotency_key\) do nothing/);
  assert.match(service, /override_kitty_class_occurrence/);
  assert.match(service, /through\.setUTCDate\(through\.getUTCDate\(\) \+ 90\)/);
  for (const table of ["teacher_student_assignments", "sessions", "availability_rules", "conversations"]) {
    assert.doesNotMatch(combined, new RegExp(`(?:insert into|update|delete from|\\.from\\()[^\\n]*${table}`));
  }
});

test("the Kitty group-class foundation preserves legacy classes without guessing family relationships", () => {
  const migration = read("supabase/migrations/20260805222827_add_kitty_group_classes.sql").toLowerCase();

  assert.match(migration, /insert into public\.kitty_class_enrollments/);
  assert.match(migration, /participant_role = 'student'/);
  assert.match(migration, /raise exception[\s\S]*(?:zero|multiple|exactly one)[\s\S]*legacy student/);
  assert.match(migration, /participant_role = 'parent_guardian'/);
  assert.match(migration, /required_enrollment_ids uuid\[\] not null/);
  assert.match(migration, /unique \(change_request_id, request_version, enrollment_id\)/);
});

test("group RPCs snapshot approvals, teacher-finalize cancellation, and fan out through enrollments", () => {
  const migration = read("supabase/migrations/20260805222827_add_kitty_group_classes.sql").toLowerCase();

  assert.match(migration, /create or replace function public\.request_kitty_class_change/);
  assert.match(migration, /v_request\.change_type = 'cancel'[\s\S]*v_teacher_approved/);
  assert.match(migration, /not exists \([\s\S]*unnest\(v_request\.required_enrollment_ids\)/);
  assert.match(migration, /join public\.kitty_class_enrollment_contacts enrollment_contact/);
  assert.match(migration, /on conflict \(change_request_id, request_version, enrollment_id\)[\s\S]*where decision_side = 'student'/);
  assert.doesNotMatch(migration, /if v_approved = 2 then/);
});

test("legacy creators bridge one enrollment and shared guardians approve every represented enrollment", () => {
  const migration = read("supabase/migrations/20260805222827_add_kitty_group_classes.sql").toLowerCase();

  assert.match(migration, /create or replace function public\.create_kitty_class_series/);
  assert.match(migration, /create or replace function public\.create_kitty_one_off_class/);
  assert.match(migration, /jsonb_array_elements\(p_participants\)[\s\S]*kitty_class_enrollment_contacts/);
  assert.match(migration, /insert into public\.kitty_class_change_confirmations[\s\S]*select[\s\S]*actor\.enrollment_id/);
  assert.match(migration, /request_expired/);
});

test("group RPC runtime behavior is repeatable in disposable databases", {
  skip: !process.env.KITTY_SCHEMA_TEST_CONTAINER,
}, () => {
  const container = process.env.KITTY_SCHEMA_TEST_CONTAINER;
  const predecessor = read("supabase/migrations/20260805120000_add_kitty_class_calendar.sql");
  const fixture = read("src/lib/hermes/kitty-class-group-runtime-fixture.sql");
  const migration = read("supabase/migrations/20260805222827_add_kitty_group_classes.sql");
  const probe = read("src/lib/hermes/kitty-class-group-runtime-probe.sql");

  for (const attempt of [1, 2]) {
    const database = `kitty_group_runtime_probe_${process.pid}_${attempt}`;
    const droppedBefore = runContainerCommand([container, "dropdb", "--if-exists", "--force", "-U", "postgres", database]);
    assert.equal(droppedBefore.status, 0, `${droppedBefore.stdout}\n${droppedBefore.stderr}`);
    const created = runContainerCommand([container, "createdb", "-U", "postgres", database]);
    assert.equal(created.status, 0, `${created.stdout}\n${created.stderr}`);
    try {
      for (const [label, sql] of [
        ["bootstrap", migrationProbeBootstrap],
        ["predecessor migration", predecessor],
        ["legacy group fixture", fixture],
        ["group foundation migration", migration],
      ]) {
        const result = runProbeSql(container, database, sql);
        assert.equal(result.status, 0, `attempt ${attempt} ${label} failed:\n${result.stdout}\n${result.stderr}`);
      }
      const result = runProbeSql(container, database, probe);
      assert.equal(result.status, 0, `attempt ${attempt} probe failed:\n${result.stdout}\n${result.stderr}`);
      assert.match(result.stdout, /kitty group runtime probe passed/);
    } finally {
      const droppedAfter = runContainerCommand([container, "dropdb", "--if-exists", "--force", "-U", "postgres", database]);
      assert.equal(droppedAfter.status, 0, `${droppedAfter.stdout}\n${droppedAfter.stderr}`);
    }
  }
});

test("group migration rejects a legacy recurring occurrence with an active scoped teacher", {
  skip: !process.env.KITTY_SCHEMA_TEST_CONTAINER,
}, () => {
  const container = process.env.KITTY_SCHEMA_TEST_CONTAINER;
  const database = `kitty_group_migration_probe_${process.pid}`;
  const predecessor = read("supabase/migrations/20260805120000_add_kitty_class_calendar.sql");
  const seed = read("src/lib/hermes/kitty-class-group-migration-negative-probe.sql");
  const migration = read("supabase/migrations/20260805222827_add_kitty_group_classes.sql");

  const droppedBefore = runContainerCommand([container, "dropdb", "--if-exists", "-U", "postgres", database]);
  assert.equal(droppedBefore.status, 0, `${droppedBefore.stdout}\n${droppedBefore.stderr}`);
  const created = runContainerCommand([container, "createdb", "-U", "postgres", database]);
  assert.equal(created.status, 0, `${created.stdout}\n${created.stderr}`);

  try {
    for (const [label, sql] of [
      ["bootstrap", migrationProbeBootstrap],
      ["predecessor migration", predecessor],
      ["legacy recurring occurrence fixture", seed],
    ]) {
      const result = runProbeSql(container, database, sql);
      assert.equal(result.status, 0, `${label} failed:\n${result.stdout}\n${result.stderr}`);
    }

    const result = runProbeSql(container, database, migration);
    assert.notEqual(result.status, 0, "group migration unexpectedly accepted the legacy recurring teacher override");
    assert.match(
      `${result.stdout}\n${result.stderr}`,
      /legacy Kitty recurring occurrence .* cannot have an active occurrence-scoped teacher/,
    );
  } finally {
    const droppedAfter = runContainerCommand([container, "dropdb", "--if-exists", "-U", "postgres", database]);
    assert.equal(droppedAfter.status, 0, `${droppedAfter.stdout}\n${droppedAfter.stderr}`);
  }
});

test("group service migrations pass the runtime probe and serialize recurring enrollment endings", {
  skip: !process.env.KITTY_SCHEMA_TEST_CONTAINER,
  timeout: 30_000,
}, async () => {
  const container = process.env.KITTY_SCHEMA_TEST_CONTAINER;
  const database = `kitty_group_service_probe_${process.pid}`;
  const migrations = [
    ["predecessor migration", read("supabase/migrations/20260805120000_add_kitty_class_calendar.sql")],
    ["group foundation migration", read("supabase/migrations/20260805222827_add_kitty_group_classes.sql")],
    ["group service migration", read("supabase/migrations/20260805235110_add_kitty_group_class_services.sql")],
  ];

  const droppedBefore = runContainerCommand([container, "dropdb", "--if-exists", "--force", "-U", "postgres", database]);
  assert.equal(droppedBefore.status, 0, `${droppedBefore.stdout}\n${droppedBefore.stderr}`);
  const created = runContainerCommand([container, "createdb", "-U", "postgres", database]);
  assert.equal(created.status, 0, `${created.stdout}\n${created.stderr}`);

  try {
    for (const [label, sql] of [["bootstrap", migrationProbeBootstrap], ...migrations]) {
      const result = runProbeSql(container, database, sql);
      assert.equal(result.status, 0, `${label} failed:\n${result.stdout}\n${result.stderr}`);
    }

    const runtimeProbe = runProbeSql(
      container,
      database,
      read("src/lib/hermes/kitty-class-group-service-runtime-probe.sql"),
    );
    assert.equal(runtimeProbe.status, 0, `${runtimeProbe.stdout}\n${runtimeProbe.stderr}`);
    assert.match(runtimeProbe.stdout, /kitty group service runtime probe passed/);

    const endEnrollmentSql = (studentContactId, occurrenceOffset, marker, delaySeconds = 0) => `
begin;
set local statement_timeout = '10s';
do $$
declare
  v_series_id uuid;
  v_occurrence public.kitty_class_occurrences;
  v_enrollment_id uuid;
begin
  select audit.entity_id into strict v_series_id
  from public.kitty_class_audit_events audit
  where audit.request_id = 'runtime-group-series'
    and audit.entity_type = 'series';
  select occurrence.* into strict v_occurrence
  from public.kitty_class_occurrences occurrence
  where occurrence.series_id = v_series_id
    and occurrence.local_date = current_date + ${occurrenceOffset};
  select enrollment.id into strict v_enrollment_id
  from public.kitty_class_enrollments enrollment
  where enrollment.series_id = v_series_id
    and enrollment.student_contact_id = '${studentContactId}';
  perform public.end_kitty_class_enrollment(
    v_occurrence.id, v_enrollment_id, v_occurrence.version,
    current_date + 80, null
  );
end;
$$;
\\echo ${marker}
select pg_sleep(${delaySeconds});
commit;
`;

    const first = runAsyncProbeSql(
      container,
      database,
      endEnrollmentSql("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa902", 40, "kitty-series-lock-held", 2),
      "kitty-series-lock-held",
    );
    await first.ready;
    const second = runAsyncProbeSql(
      container,
      database,
      endEnrollmentSql("00000000-0000-0000-0000-000000000904", 41, "kitty-second-finished"),
    );
    const [firstResult, secondResult] = await Promise.all([first.completed, second.completed]);
    assert.equal(firstResult.status, 0, `${firstResult.stdout}\n${firstResult.stderr}`);
    assert.notEqual(secondResult.status, 0, "concurrent enrollment endings both committed");
    assert.match(`${secondResult.stdout}\n${secondResult.stderr}`, /enrollment_required/);

    const invariant = runProbeSql(container, database, `
do $$
declare
  v_series_id uuid;
begin
  select audit.entity_id into strict v_series_id
  from public.kitty_class_audit_events audit
  where audit.request_id = 'runtime-group-series'
    and audit.entity_type = 'series';
  if (
    select count(*)
    from public.kitty_class_enrollments enrollment
    where enrollment.series_id = v_series_id
      and enrollment.is_active
      and enrollment.active_from <= current_date + 81
      and (enrollment.active_until is null or enrollment.active_until >= current_date + 81)
  ) <> 1 then
    raise exception 'series enrollment invariant was not preserved';
  end if;
end;
$$;
`);
    assert.equal(invariant.status, 0, `${invariant.stdout}\n${invariant.stderr}`);
  } finally {
    const droppedAfter = runContainerCommand([container, "dropdb", "--if-exists", "--force", "-U", "postgres", database]);
    assert.equal(droppedAfter.status, 0, `${droppedAfter.stdout}\n${droppedAfter.stderr}`);
  }
});

test("rollout remains disabled until every template and staging probe is ready", () => {
  const env = read(".env.example");
  const readme = read("infra/hermes-profiles/academy/README.md");
  for (const name of [
    "KITTY_CLASS_CALENDAR_ENABLED=false",
    "INSIGHT_KITTY_CLASS_TOOL_URL=",
    "WHATSAPP_TEMPLATE_CLASS_CHANGE_REQUEST=",
    "WHATSAPP_TEMPLATE_CLASS_CHANGE_PROPOSAL=",
    "WHATSAPP_TEMPLATE_CLASS_CANCELLED=",
    "WHATSAPP_TEMPLATE_CLASS_RESCHEDULED=",
    "WHATSAPP_TEMPLATE_CLASS_CHANGE_REJECTED=",
  ]) assert.ok(env.includes(name), `missing ${name}`);
  for (const phrase of ["shadow pilot", "selected contacts", "rollback", "exact occurrence", "both sides"]) {
    assert.ok(readme.toLowerCase().includes(phrase), `missing rollout phrase: ${phrase}`);
  }
});

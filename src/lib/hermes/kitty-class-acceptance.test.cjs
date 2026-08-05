/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const read = (relative) => fs.readFileSync(path.join(process.cwd(), relative), "utf8");

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

test("group RPC runtime behavior rejects cross-class enrollments and waits for every approval", {
  skip: !process.env.KITTY_SCHEMA_TEST_CONTAINER,
}, () => {
  const sql = read("src/lib/hermes/kitty-class-group-runtime-probe.sql");
  const result = childProcess.spawnSync(
    "docker",
    ["exec", "-i", process.env.KITTY_SCHEMA_TEST_CONTAINER, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres"],
    { input: sql, encoding: "utf8" },
  );
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /kitty group runtime probe passed/);
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

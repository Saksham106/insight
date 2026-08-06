/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  });
  module._compile(output.outputText, filename);
};

const servicePath = path.join(__dirname, "kitty-class-service.ts");
const admin = { kind: "admin", profileId: "profile-1", channel: "dashboard" };
const enrollments = [
  {
    studentContactId: "student-a",
    contacts: [
      { contactId: "student-a", role: "student", receivesNotifications: true, confirmsCancellation: true, confirmsReschedule: true },
      { contactId: "guardian-shared", role: "parent_guardian", receivesNotifications: true, confirmsCancellation: false, confirmsReschedule: true },
    ],
  },
  {
    studentContactId: "student-b",
    contacts: [
      { contactId: "student-b", role: "student", receivesNotifications: true, confirmsCancellation: true, confirmsReschedule: true },
      { contactId: "guardian-shared", role: "parent_guardian", receivesNotifications: true, confirmsCancellation: false, confirmsReschedule: true },
    ],
  },
];

function oneOff(overrides = {}) {
  return {
    kind: "one_off",
    title: "Group piano",
    timezone: "America/New_York",
    startsAt: "2026-08-12T20:00:00.000Z",
    endsAt: "2026-08-12T21:00:00.000Z",
    localDate: "2026-08-12",
    teacherContactId: "teacher-1",
    enrollments,
    clientRequestId: "dashboard:create:42",
    ...overrides,
  };
}

test("the class service stays inside the Kitty-owned data boundary", () => {
  const source = fs.readFileSync(servicePath, "utf8");
  for (const table of [
    "kitty_class_series",
    "kitty_class_occurrences",
    "kitty_class_participants",
    "kitty_class_enrollments",
    "kitty_class_change_requests",
  ]) assert.match(source, new RegExp(table));
  for (const table of ["teacher_student_assignments", "sessions", "availability_rules", "conversations"]) {
    assert.doesNotMatch(source, new RegExp(`from\\(["']${table}["']\\)|rpc\\(["']${table}["']`));
  }
});

test("mutations retain the atomic Kitty RPC boundary", () => {
  const source = fs.readFileSync(servicePath, "utf8");
  for (const rpc of [
    "create_kitty_group_series",
    "create_kitty_group_one_off",
    "add_kitty_class_enrollment",
    "end_kitty_class_enrollment",
    "request_kitty_class_change",
    "propose_kitty_class_replacement",
    "decide_kitty_class_change",
    "finalize_kitty_class_change",
    "override_kitty_class_occurrence",
  ]) assert.match(source, new RegExp(`rpc\\(["']${rpc}["']`));
  assert.match(source, /assertAdmin\(actor\)/);
  assert.match(source, /assertContactMembership/);
  assert.match(source, /validateKittyEnrollments/);
  assert.match(source, /occurrence_selection_confirmed/);
  assert.match(source, /selectionTokenDigest/);
});

test("creation rejects the removed flat participant contract", async () => {
  const { createKittyClass } = require(servicePath);
  const client = { rpc: async () => ({ data: { id: "should-not-create" }, error: null }) };
  await assert.rejects(() => createKittyClass(client, admin, {
    ...oneOff(),
    teacherContactId: undefined,
    enrollments: undefined,
    clientRequestId: undefined,
    participants: [
      { contactId: "teacher-1", role: "teacher", receivesNotifications: true, confirmsCancellation: true, confirmsReschedule: true, decisionSide: "teacher" },
      { contactId: "student-a", role: "student", receivesNotifications: true, confirmsCancellation: true, confirmsReschedule: true, decisionSide: "student" },
    ],
  }), /invalid_class|enrollment_required/);
});

test("one teacher and two enrollments are created through one atomic RPC", async () => {
  const { createKittyClass } = require(servicePath);
  const calls = [];
  const client = {
    rpc: async (name, payload) => {
      calls.push({ name, payload });
      return { data: { id: "occurrence-1", title: "Group piano", starts_at: "2026-08-12T20:00:00.000Z", ends_at: "2026-08-12T21:00:00.000Z", local_date: "2026-08-12", timezone: "America/New_York", status: "scheduled", version: 1 }, error: null };
    },
  };

  const created = await createKittyClass(client, admin, oneOff());

  assert.equal(created.id, "occurrence-1");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "create_kitty_group_one_off");
  assert.equal(calls[0].payload.p_teacher_contact_id, "teacher-1");
  assert.deepEqual(calls[0].payload.p_enrollments, enrollments);
  assert.equal(calls[0].payload.p_client_request_id, "dashboard:create:42");
  assert.equal("p_participants" in calls[0].payload, false);
});

function rosterClient() {
  const occurrence = {
    id: "occurrence-1", series_id: "series-1", title: "Group piano", subject: null,
    starts_at: "2026-08-12T20:00:00.000Z", ends_at: "2026-08-12T21:00:00.000Z",
    local_date: "2026-08-12", timezone: "America/New_York", status: "scheduled", version: 3,
  };
  const rows = {
    kitty_class_occurrences: occurrence,
    kitty_class_participants: [{
      contact_id: "teacher-1", participant_role: "teacher", receives_notifications: true,
      confirms_cancellation: true, confirms_reschedule: true, decision_side: "teacher", is_active: true,
    }],
    kitty_class_enrollments: enrollments.map((enrollment, index) => ({
      id: `enrollment-${index + 1}`,
      series_id: "series-1",
      occurrence_id: null,
      student_contact_id: enrollment.studentContactId,
      active_from: "2026-08-01",
      active_until: null,
      is_active: true,
      contacts: enrollment.contacts.map((contact) => ({
        contact_id: contact.contactId,
        contact_role: contact.role,
        receives_notifications: contact.receivesNotifications,
        confirms_cancellation: contact.confirmsCancellation,
        confirms_reschedule: contact.confirmsReschedule,
        is_active: true,
      })),
    })),
    kitty_class_change_requests: null,
  };

  return {
    from(table) {
      const query = {
        select() { return query; }, eq() { return query; }, in() { return query; }, or() { return query; },
        lte() { return query; }, gte() { return query; }, order() { return query; }, limit() { return query; },
        maybeSingle() { return Promise.resolve({ data: rows[table], error: null }); },
        then(resolve, reject) {
          const value = rows[table];
          return Promise.resolve({ data: Array.isArray(value) ? value : value ? [value] : [], error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
}

test("contact reads reveal only represented roster shapes and a non-identifying group count", async () => {
  const { getKittyClassOccurrence } = require(servicePath);

  const item = await getKittyClassOccurrence(
    rosterClient(),
    { kind: "contact", contactId: "guardian-shared", channel: "whatsapp" },
    "occurrence-1",
  );

  assert.equal(item.enrollmentCount, 2);
  assert.deepEqual(item.enrollments, [
    { contacts: [{ role: "student" }, { role: "parent_guardian" }] },
    { contacts: [{ role: "student" }, { role: "parent_guardian" }] },
  ]);
  assert.equal("teacherContactId" in item, false);
  assert.equal("participants" in item, false);
  assert.doesNotMatch(JSON.stringify(item), /student-a|student-b|enrollment-1|enrollment-2/);
});

test("contact class lists honor enrollment start and end dates", async () => {
  const { listKittyClasses } = require(servicePath);
  const occurrences = [
    { id: "during", series_id: "series-1", title: "Group piano", subject: null, starts_at: "2026-08-10T20:00:00.000Z", ends_at: "2026-08-10T21:00:00.000Z", local_date: "2026-08-10", timezone: "America/New_York", status: "scheduled", version: 1 },
    { id: "after", series_id: "series-1", title: "Group piano", subject: null, starts_at: "2026-08-20T20:00:00.000Z", ends_at: "2026-08-20T21:00:00.000Z", local_date: "2026-08-20", timezone: "America/New_York", status: "scheduled", version: 1 },
  ];
  const data = {
    kitty_class_participants: [],
    kitty_class_enrollment_contacts: [{
      enrollment: { occurrence_id: null, series_id: "series-1", active_from: "2026-08-01", active_until: "2026-08-15" },
    }],
    kitty_class_occurrences: occurrences,
  };
  const client = { from(table) {
    const query = {
      select() { return query; }, eq() { return query; }, in() { return query; }, or() { return query; },
      order() { return query; }, limit() { return query; },
      then(resolve, reject) { return Promise.resolve({ data: data[table], error: null }).then(resolve, reject); },
    };
    return query;
  } };

  const classes = await listKittyClasses(client, { kind: "contact", contactId: "guardian-1", channel: "whatsapp" });

  assert.deepEqual(classes.map((item) => item.id), ["during"]);
});

test("enrollment membership mutations use optimistic atomic RPCs", async () => {
  const { addKittyClassEnrollment, endKittyClassEnrollment } = require(servicePath);
  const calls = [];
  const client = { rpc: async (name, payload) => {
    calls.push({ name, payload });
    return { data: { id: "occurrence-1", title: "Group piano", starts_at: "2026-08-12T20:00:00.000Z", ends_at: "2026-08-12T21:00:00.000Z", local_date: "2026-08-12", timezone: "America/New_York", status: "scheduled", version: payload.p_expected_version + 1 }, error: null };
  } };

  await addKittyClassEnrollment(client, admin, {
    occurrenceId: "occurrence-1", version: 3, effectiveDate: "2026-08-15", enrollment: enrollments[0],
  });
  await endKittyClassEnrollment(client, admin, {
    occurrenceId: "occurrence-1", enrollmentId: "enrollment-1", version: 4, effectiveDate: "2026-08-31",
  });

  assert.deepEqual(calls.map((call) => call.name), ["add_kitty_class_enrollment", "end_kitty_class_enrollment"]);
  assert.equal(calls[0].payload.p_expected_version, 3);
  assert.equal(calls[0].payload.p_effective_date, "2026-08-15");
  assert.equal(calls[1].payload.p_expected_version, 4);
  assert.equal(calls[1].payload.p_effective_date, "2026-08-31");
});

test("enrollment mutations preserve stale version conflicts", async () => {
  const { addKittyClassEnrollment } = require(servicePath);
  const client = { rpc: async () => ({ data: null, error: { message: "stale_class" } }) };
  await assert.rejects(() => addKittyClassEnrollment(client, admin, {
    occurrenceId: "occurrence-1", version: 3, effectiveDate: "2026-08-15", enrollment: enrollments[0],
  }), /stale_class/);
});

test("group class RPCs bind replay payloads and expose only the service role", () => {
  const migration = fs.readFileSync(
    path.join(process.cwd(), "supabase/migrations/20260805235110_add_kitty_group_class_services.sql"),
    "utf8",
  );
  for (const name of [
    "create_kitty_group_one_off",
    "create_kitty_group_series",
    "add_kitty_class_enrollment",
    "end_kitty_class_enrollment",
  ]) {
    assert.match(migration, new RegExp(`create function public\\.${name}\\(`));
    assert.match(migration, new RegExp(`revoke execute on function public\\.${name}\\([\\s\\S]*?from public, anon, authenticated;`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}\\([\\s\\S]*?to service_role;`));
  }
  assert.match(migration, /security definer\s+set search_path = ''/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /payloadDigest/);
  assert.match(migration, /client_request_payload_mismatch/);
  assert.match(migration, /insert into public\.kitty_class_enrollments/);
  assert.match(migration, /insert into public\.kitty_class_enrollment_contacts/);
  assert.match(migration, /insert into public\.kitty_class_audit_events/);
  assert.match(migration, /insert into public\.kitty_class_occurrences/);
});

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
    "request_kitty_group_class_change",
    "propose_kitty_group_class_change",
    "decide_kitty_group_class_change",
    "override_kitty_class_occurrence",
  ]) assert.match(source, new RegExp(`rpc\\(["']${rpc}["']`));
  assert.doesNotMatch(source, /rpc\(["'](?:request_kitty_class_change|propose_kitty_class_replacement|decide_kitty_class_change|finalize_kitty_class_change)["']/);
  assert.match(source, /assertAdmin\(actor\)/);
  assert.match(source, /contactMembership/);
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

function rosterClient(changeRequest = null, extraRows = {}) {
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
    kitty_class_change_requests: changeRequest,
    ...extraRows,
  };

  return {
    rpc(name) {
      if (name !== "get_kitty_class_admin_detail_events") {
        return Promise.resolve({ data: null, error: { message: "unexpected_rpc" } });
      }
      return Promise.resolve({ data: rows.kitty_class_audit_events ?? [], error: null });
    },
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

test("admin occurrence detail allowlists attendance, approval progress, audit, and failed delivery facts", async () => {
  const { getKittyClassOccurrence } = require(servicePath);
  const change = {
    id: "change-1", change_type: "reschedule", scope: "whole_occurrence", enrollment_id: null,
    proposed_starts_at: "2026-08-13T20:00:00.000Z", proposed_ends_at: "2026-08-13T21:00:00.000Z",
    proposed_timezone: "America/New_York", status: "awaiting_counterparty", payload_digest: "digest-1", version: 2,
    required_enrollment_ids: ["enrollment-1", "enrollment-2"], replacement_occurrence_id: null,
    confirmations: [
      { request_version: 2, decision_side: "teacher", enrollment_id: null, decision: "approved", payload_digest: "digest-1", decided_at: "2026-08-05T12:00:00.000Z" },
      { request_version: 2, decision_side: "student", enrollment_id: "enrollment-1", decision: "approved", payload_digest: "digest-1", decided_at: "2026-08-05T12:01:00.000Z" },
      { request_version: 1, decision_side: "student", enrollment_id: "enrollment-2", decision: "approved", payload_digest: "old-digest", decided_at: "2026-08-05T11:00:00.000Z" },
    ],
  };
  const item = await getKittyClassOccurrence(rosterClient(change, {
    kitty_class_attendance_updates: [
      { id: "attendance-2", enrollment_id: "enrollment-1", reported_by_contact_id: "student-a", status: "late", estimated_at: "2026-08-12T20:10:00.000Z", note: "Train delayed", version: 2, supersedes_attendance_id: "attendance-1", created_at: "2026-08-05T12:02:00.000Z", internal_secret: "omit" },
      { id: "attendance-1", enrollment_id: "enrollment-1", reported_by_contact_id: "student-a", status: "absent", estimated_at: null, note: null, version: 1, supersedes_attendance_id: null, created_at: "2026-08-05T12:00:00.000Z" },
    ],
    kitty_class_audit_events: [{ id: "audit-1", actor_type: "contact", event_type: "attendance_corrected", entity_type: "occurrence", created_at: "2026-08-05T12:02:00.000Z", metadata: { secret: true } }],
    kitty_class_notification_outbox: [{ id: "notice-1", contact_id: "guardian-shared", intent: "class_attendance_update", status: "failed", attempt_count: 2, last_error_code: "provider_timeout", hermes_message_id: "message-1", updated_at: "2026-08-05T12:03:00.000Z", payload: { secret: true } }],
  }), admin, "occurrence-1");

  assert.equal(item.attendance.length, 1);
  assert.equal(item.attendance[0].status, "late");
  assert.equal(item.currentChangeRequest.receivedEnrollmentApprovals, 1);
  assert.equal(item.currentChangeRequest.requiredEnrollmentApprovals, 2);
  assert.deepEqual(item.currentChangeRequest.enrollmentApprovals.map((approval) => approval.status), ["approved", "pending"]);
  assert.equal(item.auditEvents[0].eventType, "attendance_corrected");
  assert.equal(item.notificationFailures[0].errorCode, "provider_timeout");
  assert.doesNotMatch(JSON.stringify(item), /internal_secret|old-digest|metadata|payload|secret/);
});

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

test("individual change details stay private to the teacher and represented enrollment", async () => {
  const { getKittyClassOccurrence } = require(servicePath);
  const individualChange = {
    id: "change-1", change_type: "reschedule", scope: "individual_reschedule",
    enrollment_id: "enrollment-1", requester_side: "student",
    proposed_starts_at: "2026-08-13T20:00:00.000Z",
    proposed_ends_at: "2026-08-13T21:00:00.000Z", proposed_timezone: "America/New_York",
    status: "awaiting_counterparty", payload_digest: "private-digest", version: 1,
    created_at: "2026-08-05T12:00:00.000Z",
  };

  const unrelatedFamily = await getKittyClassOccurrence(
    rosterClient(individualChange),
    { kind: "contact", contactId: "student-b", channel: "whatsapp" },
    "occurrence-1",
  );
  const representedFamily = await getKittyClassOccurrence(
    rosterClient(individualChange),
    { kind: "contact", contactId: "student-a", channel: "whatsapp" },
    "occurrence-1",
  );
  const teacher = await getKittyClassOccurrence(
    rosterClient(individualChange),
    { kind: "contact", contactId: "teacher-1", channel: "whatsapp" },
    "occurrence-1",
  );

  assert.equal(unrelatedFamily.currentChangeRequest, null);
  assert.equal(representedFamily.currentChangeRequest.id, "change-1");
  assert.equal(teacher.currentChangeRequest.id, "change-1");
  assert.doesNotMatch(JSON.stringify(unrelatedFamily), /private-digest|2026-08-13/);
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

test("contact list applies membership dates before the requested limit", async () => {
  const { listKittyClasses } = require(servicePath);
  const occurrence = (id, localDate) => ({
    id, series_id: "series-1", title: "Group piano", subject: null,
    starts_at: `${localDate}T20:00:00.000Z`, ends_at: `${localDate}T21:00:00.000Z`,
    local_date: localDate, timezone: "America/New_York", status: "scheduled", version: 1,
  });
  const occurrences = [
    ...Array.from({ length: 100 }, (_, index) => occurrence(`ended-${index}`, "2026-08-20")),
    occurrence("visible", "2026-08-10"),
  ];
  const client = { from(table) {
    let filter = "";
    let queryLimit = 1000;
    const query = {
      select() { return query; }, eq() { return query; }, in() { return query; }, order() { return query; },
      or(value) { filter = value; return query; },
      limit(value) { queryLimit = value; return query; },
      then(resolve, reject) {
        let data;
        if (table === "kitty_class_participants") data = [];
        else if (table === "kitty_class_enrollment_contacts") data = [{
          enrollment: { occurrence_id: null, series_id: "series-1", active_from: "2026-08-01", active_until: "2026-08-15" },
        }];
        else {
          const dateFiltered = filter.includes("local_date.lte.2026-08-15")
            ? occurrences.filter((item) => item.local_date <= "2026-08-15")
            : occurrences;
          data = dateFiltered.slice(0, queryLimit);
        }
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return query;
  } };

  const classes = await listKittyClasses(
    client,
    { kind: "contact", contactId: "guardian-1", channel: "whatsapp" },
    { limit: 1 },
  );

  assert.deepEqual(classes.map((item) => item.id), ["visible"]);
});

test("enrollment membership mutations use optimistic atomic RPCs", async () => {
  const { addKittyClassEnrollment, endKittyClassEnrollment } = require(servicePath);
  const calls = [];
  const client = { rpc: async (name, payload) => {
    calls.push({ name, payload });
    return { data: { id: "occurrence-1", title: "Group piano", starts_at: "2026-08-12T20:00:00.000Z", ends_at: "2026-08-12T21:00:00.000Z", local_date: "2026-08-12", timezone: "America/New_York", status: "scheduled", version: payload.p_expected_version + 1 }, error: null };
  } };

  await addKittyClassEnrollment(client, admin, {
    occurrenceId: "occurrence-1", version: 3, scope: "occurrence", effectiveDate: "2026-08-15", enrollment: enrollments[0],
  });
  await endKittyClassEnrollment(client, admin, {
    occurrenceId: "occurrence-1", enrollmentId: "enrollment-1", version: 4, scope: "this_and_future", effectiveDate: "2026-08-31",
  });

  assert.deepEqual(calls.map((call) => call.name), ["add_kitty_class_enrollment", "end_kitty_class_enrollment"]);
  assert.equal(calls[0].payload.p_expected_version, 3);
  assert.equal(calls[0].payload.p_scope, "occurrence");
  assert.equal(calls[0].payload.p_effective_date, "2026-08-15");
  assert.equal(calls[1].payload.p_expected_version, 4);
  assert.equal(calls[1].payload.p_scope, "this_and_future");
  assert.equal(calls[1].payload.p_effective_date, "2026-08-31");
});

test("enrollment mutations reject omitted and unsupported temporal scopes before RPC", async () => {
  const { addKittyClassEnrollment, endKittyClassEnrollment } = require(servicePath);
  let rpcCalls = 0;
  const client = { rpc: async () => { rpcCalls += 1; return { data: null, error: null }; } };
  await assert.rejects(() => addKittyClassEnrollment(client, admin, {
    occurrenceId: "occurrence-1", version: 3, effectiveDate: "2026-08-15", enrollment: enrollments[0],
  }), /invalid_scope/);
  await assert.rejects(() => endKittyClassEnrollment(client, admin, {
    occurrenceId: "occurrence-1", enrollmentId: "enrollment-1", version: 4,
    scope: "series", effectiveDate: "2026-08-31",
  }), /invalid_scope/);
  assert.equal(rpcCalls, 0);
});

test("enrollment mutations preserve stale version conflicts", async () => {
  const { addKittyClassEnrollment } = require(servicePath);
  const client = { rpc: async () => ({ data: null, error: { message: "stale_class" } }) };
  await assert.rejects(() => addKittyClassEnrollment(client, admin, {
    occurrenceId: "occurrence-1", version: 3, scope: "this_and_future", effectiveDate: "2026-08-15", enrollment: enrollments[0],
  }), /stale_class/);
});

test("notification retry is server-guarded to failed rows only", async () => {
  const { retryKittyClassNotification } = require(servicePath);
  const clientFor = (status, errorCode = null) => {
    const calls = [];
    return {
      calls,
      from() {
        const query = {
          select() { return query; }, eq() { return query; },
          maybeSingle: async () => ({ data: { id: "notification-1", status, last_error_code: errorCode }, error: null }),
        };
        return query;
      },
      async rpc(name, payload) { calls.push({ name, payload }); return { data: { id: "notification-1", status: "pending" }, error: null }; },
    };
  };

  const failed = clientFor("failed", "provider_rejected");
  await retryKittyClassNotification(failed, admin, "notification-1");
  assert.equal(failed.calls.length, 1);
  for (const [status, errorCode] of [
    ["blocked", "provider_indeterminate"], ["pending", null], ["sending", null], ["sent", null],
  ]) {
    const client = clientFor(status, errorCode);
    await assert.rejects(() => retryKittyClassNotification(client, admin, "notification-1"), /notification_not_retryable/);
    assert.equal(client.calls.length, 0, `${status} reached retry RPC`);
  }
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

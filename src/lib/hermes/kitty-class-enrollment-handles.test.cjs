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

const toolsPath = path.join(__dirname, "kitty-class-tools.ts");
const tokenPattern = /^[a-f0-9]{64}$/;
const occurrence = {
  id: "occurrence-1", series_id: "series-1", title: "Group piano", subject: null,
  starts_at: "2026-08-12T20:00:00.000Z", ends_at: "2026-08-12T21:00:00.000Z",
  local_date: "2026-08-12", timezone: "America/New_York", status: "scheduled", version: 3,
};
const enrollmentRows = [
  {
    id: "enrollment-a", series_id: "series-1", occurrence_id: null,
    student_contact_id: "student-a", active_from: "2026-08-01", active_until: null, is_active: true,
    contacts: [
      { contact_id: "student-a", contact_role: "student", receives_notifications: true, confirms_cancellation: true, confirms_reschedule: true, is_active: true },
      { contact_id: "guardian-shared", contact_role: "parent_guardian", receives_notifications: true, confirms_cancellation: false, confirms_reschedule: true, is_active: true },
    ],
  },
  {
    id: "enrollment-b", series_id: "series-1", occurrence_id: null,
    student_contact_id: "student-b", active_from: "2026-08-01", active_until: null, is_active: true,
    contacts: [
      { contact_id: "student-b", contact_role: "student", receives_notifications: true, confirms_cancellation: true, confirms_reschedule: true, is_active: true },
      { contact_id: "guardian-shared", contact_role: "parent_guardian", receives_notifications: true, confirms_cancellation: false, confirms_reschedule: true, is_active: true },
    ],
  },
  {
    id: "enrollment-private", series_id: "series-1", occurrence_id: null,
    student_contact_id: "student-private", active_from: "2026-08-01", active_until: null, is_active: true,
    contacts: [
      { contact_id: "student-private", contact_role: "student", receives_notifications: true, confirms_cancellation: true, confirms_reschedule: true, is_active: true },
      { contact_id: "guardian-private", contact_role: "parent_guardian", receives_notifications: true, confirms_cancellation: false, confirms_reschedule: true, is_active: true },
    ],
  },
];
const contacts = [
  { id: "student-a", display_name: "Asha Student Grade 8", preferred_name: "Asha" },
  { id: "student-b", display_name: "Mina Student Grade 6", preferred_name: "Mina" },
  { id: "student-private", display_name: "Private Student", preferred_name: "Private" },
];
const activeIndividualRequest = {
  id: "change-1", occurrence_id: "occurrence-1", change_type: "reschedule",
  scope: "individual_reschedule", enrollment_id: "enrollment-a", requester_side: "student",
  proposed_starts_at: "2026-08-13T20:00:00.000Z",
  proposed_ends_at: "2026-08-13T21:00:00.000Z", proposed_timezone: "America/New_York",
  status: "awaiting_counterparty", payload_digest: "d".repeat(64), version: 2,
  created_at: "2026-08-05T10:00:00.000Z", internal_secret: "must-not-leak",
  required_enrollment_ids: ["enrollment-a"],
};

function assertContactSafe(value) {
  const forbiddenKeys = new Set([
    "enrollmentId", "enrollment_id", "requiredEnrollmentIds", "required_enrollment_ids",
    "requesterSide", "requester_side", "payload_digest",
    "actorContactId", "actor_contact_id", "internal_secret",
  ]);
  const visit = (item) => {
    if (!item || typeof item !== "object") return;
    if (Array.isArray(item)) return item.forEach(visit);
    for (const [key, nested] of Object.entries(item)) {
      assert.equal(forbiddenKeys.has(key), false, `contact response leaked ${key}`);
      assert.equal(key.includes("_"), false, `contact response exposed snake_case key ${key}`);
      visit(nested);
    }
  };
  visit(value);
  assert.doesNotMatch(JSON.stringify(value), /enrollment-a|enrollment-b|enrollment-private|internal_secret/);
}

function valueAt(row, key) {
  if (key.startsWith("metadata->>")) return row.metadata?.[key.slice("metadata->>".length)];
  return row[key];
}

function fixtureClient() {
  const audits = [];
  const rpcCalls = [];

  function baseRows(table) {
    if (table === "kitty_class_occurrences") return [occurrence];
    if (table === "kitty_class_participants") return [{
      contact_id: "teacher-1", participant_role: "teacher", receives_notifications: true,
      confirms_cancellation: true, confirms_reschedule: true, decision_side: "teacher", is_active: true,
      series_id: "series-1", occurrence_id: null,
    }];
    if (table === "kitty_class_enrollments") return enrollmentRows;
    if (table === "kitty_class_enrollment_contacts") {
      return enrollmentRows.flatMap((enrollment) => enrollment.contacts.map((contact) => ({
        ...contact,
        enrollment: {
          occurrence_id: enrollment.occurrence_id,
          series_id: enrollment.series_id,
          active_from: enrollment.active_from,
          active_until: enrollment.active_until,
        },
      })));
    }
    if (table === "kitty_class_change_requests") return [activeIndividualRequest];
    if (table === "kitty_class_audit_events") return audits;
    if (table === "hermes_contacts") return contacts;
    throw new Error(`unexpected table ${table}`);
  }

  class Query {
    constructor(table) {
      this.table = table;
      this.filters = [];
      this.inFilters = [];
      this.maximum = null;
    }

    select() { return this; }
    eq(key, value) { this.filters.push([key, value]); return this; }
    in(key, values) { this.inFilters.push([key, values]); return this; }
    or() { return this; }
    order() { return this; }
    limit(value) { this.maximum = value; return this; }

    rows() {
      let rows = baseRows(this.table).filter((row) => this.filters.every(([key, value]) => valueAt(row, key) === value));
      rows = rows.filter((row) => this.inFilters.every(([key, values]) => values.includes(valueAt(row, key))));
      return this.maximum === null ? rows : rows.slice(0, this.maximum);
    }

    maybeSingle() {
      const rows = this.rows();
      return Promise.resolve({ data: rows[0] ?? null, error: null });
    }

    insert(value) {
      const values = Array.isArray(value) ? value : [value];
      if (this.table !== "kitty_class_audit_events") throw new Error(`unexpected insert ${this.table}`);
      audits.push(...values.map((row, index) => ({ id: `audit-${audits.length + index + 1}`, ...row })));
      return Promise.resolve({ error: null });
    }

    then(resolve, reject) {
      return Promise.resolve({ data: this.rows(), error: null }).then(resolve, reject);
    }
  }

  return {
    audits,
    rpcCalls,
    from(table) { return new Query(table); },
    async rpc(name, payload) {
      rpcCalls.push({ name, payload });
      if (name === "request_kitty_group_class_change") {
        return { data: {
          id: "request-1", occurrenceId: payload.p_occurrence_id, changeType: "reschedule",
          scope: "individual_reschedule", status: "awaiting_counterparty", version: 1,
          payloadDigest: "b".repeat(64), requiredEnrollmentApprovals: 1, receivedEnrollmentApprovals: 1,
        }, error: null };
      }
      return { data: {
        id: `${name}-1`, occurrence_id: payload.p_occurrence_id,
        enrollment_id: payload.p_enrollment_id, reported_by_contact_id: payload.p_actor_contact_id,
        sent_by_contact_id: payload.p_actor_contact_id, status: payload.p_status ?? "pending",
        intent: payload.p_intent, estimated_at: payload.p_estimated_at, note: payload.p_note,
        structured_payload: {}, version: 1, created_at: "2026-08-05T12:00:00.000Z",
      }, error: null };
    },
  };
}

test("shared guardian selects opaque represented-enrollment handles through each individual mutation", async () => {
  const { executeKittyClassTool } = require(toolsPath);
  const client = fixtureClient();
  const actor = { kind: "contact", contactId: "guardian-shared", channel: "whatsapp" };

  const found = await executeKittyClassTool(client, actor, "find_my_classes", { referenceDate: "2026-08-12" });
  assert.deepEqual(found.classes.map((item) => item.id), ["occurrence-1"]);
  assertContactSafe(found);

  const selected = await executeKittyClassTool(client, actor, "confirm_class_selection", {
    occurrenceId: "occurrence-1", occurrenceVersion: 3,
  });
  const represented = selected.confirmation.representedEnrollments;
  assert.deepEqual(represented.map((item) => item.studentName).sort(), ["Asha", "Mina"]);
  assert.ok(represented.every((item) => tokenPattern.test(item.enrollmentHandle)));
  assert.equal(new Set(represented.map((item) => item.enrollmentHandle)).size, 2);
  assert.doesNotMatch(JSON.stringify(selected), /enrollment-a|enrollment-b|enrollment-private|student-a|student-b|student-private|Private/);
  assert.deepEqual(selected.confirmation.occurrence.currentChangeRequest, {
    id: "change-1", changeType: "reschedule", scope: "individual_reschedule",
    status: "awaiting_counterparty", version: 2,
    proposedStartsAt: "2026-08-13T20:00:00.000Z",
    proposedEndsAt: "2026-08-13T21:00:00.000Z", proposedTimezone: "America/New_York",
  });
  assertContactSafe(selected);

  const ashaHandle = represented.find((item) => item.studentName === "Asha").enrollmentHandle;
  const minaHandle = represented.find((item) => item.studentName === "Mina").enrollmentHandle;
  const selectionToken = selected.confirmation.selectionToken;

  const attendance = await executeKittyClassTool(client, actor, "record_class_attendance", {
    occurrenceId: "occurrence-1", enrollmentHandle: ashaHandle, status: "absent", selectionToken,
  }, { clientRequestId: "attendance-1" });
  const relay = await executeKittyClassTool(client, actor, "relay_class_update", {
    occurrenceId: "occurrence-1", enrollmentHandle: minaHandle,
    intent: "meeting_link_requested", selectionToken,
  }, { clientRequestId: "relay-1" });
  const replacement = await executeKittyClassTool(client, actor, "request_class_change", {
    occurrenceId: "occurrence-1", occurrenceVersion: 3, enrollmentHandle: minaHandle,
    scope: "individual_reschedule", changeType: "reschedule", selectionToken,
    proposedStartsAt: "2026-08-13T20:00:00.000Z", proposedEndsAt: "2026-08-13T21:00:00.000Z",
    proposedTimezone: "America/New_York",
  }, { clientRequestId: "replacement-1" });

  assert.deepEqual(client.rpcCalls.map((call) => call.payload.p_enrollment_id), [
    "enrollment-a", "enrollment-b", "enrollment-b",
  ]);
  assert.ok(client.rpcCalls.every((call) => call.payload.p_actor_contact_id === "guardian-shared"));
  assertContactSafe({ attendance, relay, replacement });

  const unrelated = await executeKittyClassTool(
    client,
    { kind: "contact", contactId: "guardian-private", channel: "whatsapp" },
    "confirm_class_selection",
    { occurrenceId: "occurrence-1", occurrenceVersion: 3 },
  );
  assert.equal(unrelated.confirmation.occurrence.currentChangeRequest, null);
  assertContactSafe(unrelated);

  const teacher = await executeKittyClassTool(
    client,
    { kind: "contact", contactId: "teacher-1", channel: "whatsapp" },
    "confirm_class_selection",
    { occurrenceId: "occurrence-1", occurrenceVersion: 3 },
  );
  assert.deepEqual(teacher.confirmation.occurrence.currentChangeRequest, {
    id: "change-1", changeType: "reschedule", scope: "individual_reschedule",
    status: "awaiting_counterparty", version: 2,
    proposedStartsAt: "2026-08-13T20:00:00.000Z",
    proposedEndsAt: "2026-08-13T21:00:00.000Z", proposedTimezone: "America/New_York",
  });
  assertContactSafe(teacher);
});

test("forged, wrong-actor, wrong-occurrence, and expired enrollment handles fail before mutation", async () => {
  const { executeKittyClassTool } = require(toolsPath);
  const client = fixtureClient();
  const guardian = { kind: "contact", contactId: "guardian-shared", channel: "whatsapp" };
  const selected = await executeKittyClassTool(client, guardian, "confirm_class_selection", {
    occurrenceId: "occurrence-1", occurrenceVersion: 3,
  });
  const handle = selected.confirmation.representedEnrollments[0].enrollmentHandle;
  const selectionToken = selected.confirmation.selectionToken;
  const attendance = (actor, occurrenceId, enrollmentHandle) => executeKittyClassTool(
    client, actor, "record_class_attendance",
    { occurrenceId, enrollmentHandle, status: "absent", selectionToken },
    { clientRequestId: `blocked-${client.rpcCalls.length}` },
  );

  await assert.rejects(() => attendance(guardian, "occurrence-1", undefined), /enrollment_selection_required/);
  await assert.rejects(() => attendance(guardian, "occurrence-1", "f".repeat(64)), /enrollment|selection/);
  await assert.rejects(() => attendance(
    { kind: "contact", contactId: "guardian-private", channel: "whatsapp" },
    "occurrence-1", handle,
  ), /enrollment|selection/);
  await assert.rejects(() => attendance(guardian, "occurrence-other", handle), /enrollment|selection/);
  client.audits[0].metadata.expiresAt = "2000-01-01T00:00:00.000Z";
  await assert.rejects(() => attendance(guardian, "occurrence-1", handle), /expired|selection/);
  assert.equal(client.rpcCalls.length, 0);
});

test("one represented enrollment derives automatically and raw enrollment IDs are rejected", async () => {
  const { executeKittyClassTool } = require(toolsPath);
  const client = fixtureClient();
  const actor = { kind: "contact", contactId: "student-a", channel: "whatsapp" };
  const selected = await executeKittyClassTool(client, actor, "confirm_class_selection", {
    occurrenceId: "occurrence-1", occurrenceVersion: 3,
  });

  assert.equal(selected.confirmation.representedEnrollments.length, 1);
  assert.equal(selected.confirmation.representedEnrollments[0].studentName, "Asha");
  await executeKittyClassTool(client, actor, "record_class_attendance", {
    occurrenceId: "occurrence-1", status: "late",
    selectionToken: selected.confirmation.selectionToken,
  }, { clientRequestId: "single-attendance" });
  assert.equal(client.rpcCalls[0].payload.p_enrollment_id, "enrollment-a");

  await assert.rejects(() => executeKittyClassTool(client, actor, "record_class_attendance", {
    occurrenceId: "occurrence-1", enrollmentId: "enrollment-a", status: "absent",
    selectionToken: selected.confirmation.selectionToken,
  }, { clientRequestId: "raw-id" }), /invalid_payload/);
});

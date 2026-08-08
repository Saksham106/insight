/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } });
  module._compile(output.outputText, filename);
};

const { normalizeToolPayload } = require(path.join(__dirname, "tool-contracts.ts"));

test("normalizes observed scheduling aliases to canonical camelCase", () => {
  assert.deepEqual(normalizeToolPayload("send_message", {
    case_id: "case-1",
    contact_id: "contact-1",
    idempotency_key: "message-1",
    body_parameters: ["A", "B"],
    template_data: { classDescription: "Math" },
  }), {
    caseId: "case-1",
    contactId: "contact-1",
    idempotencyKey: "message-1",
    bodyParameters: ["A", "B"],
    templateData: { classDescription: "Math" },
  });
});

test("canonical values win when an alias is also present", () => {
  assert.deepEqual(normalizeToolPayload("get_case", { caseId: "canonical", case_id: "legacy" }), { caseId: "canonical" });
});

test("normalization is shallow and does not rewrite arbitrary nested business data", () => {
  const resolution = { case_id: "external-reference", nested: { contact_id: "keep-me" } };
  assert.deepEqual(normalizeToolPayload("decide_approval", { approval_id: "approval-1", resolution }), {
    approvalId: "approval-1",
    resolution,
  });
});

test("normalizes declared participant objects without touching unknown fields", () => {
  assert.deepEqual(normalizeToolPayload("create_case", {
    tutor_kind: "swati",
    requested_by_contact_id: "contact-1",
    participants: [{ contact_id: "contact-1", participant_role: "student", note: "unchanged" }],
  }), {
    tutorKind: "swati",
    requestedByContactId: "contact-1",
    participants: [{ contactId: "contact-1", participantRole: "student", note: "unchanged" }],
  });
});

test("normalizes declared lesson-ledger fields and lesson rows", () => {
  assert.deepEqual(normalizeToolPayload("set_contact_relationship", {
    source_contact_id: "teacher-1",
    target_contact_id: "student-1",
    relationship_type: "teacher",
  }), {
    sourceContactId: "teacher-1",
    targetContactId: "student-1",
    relationshipType: "teacher",
  });
  assert.deepEqual(normalizeToolPayload("submit_lesson_report", {
    cycle_id: "cycle-1",
    tutor_contact_id: "teacher-1",
    lessons: [{
      reported_student_name: "Maya",
      student_contact_id: "student-1",
      lesson_date: "2026-07-03",
      duration_minutes: 60,
      nested: { student_contact_id: "keep" },
    }],
  }), {
    cycleId: "cycle-1",
    tutorContactId: "teacher-1",
    lessons: [{
      reportedStudentName: "Maya",
      studentContactId: "student-1",
      lessonDate: "2026-07-03",
      durationMinutes: 60,
      nested: { student_contact_id: "keep" },
    }],
  });
});

test("normalizes selected tutors and report identifiers", () => {
  assert.deepEqual(normalizeToolPayload("start_lesson_cycle", {
    tutor_contact_ids: ["teacher-1"],
    period_start: "2026-07-01",
  }), {
    tutorContactIds: ["teacher-1"],
    periodStart: "2026-07-01",
  });
  assert.deepEqual(normalizeToolPayload("confirm_lesson_report", { cycle_id: "cycle-1", report_id: "report-1" }), {
    cycleId: "cycle-1",
    reportId: "report-1",
  });
});

test("a delivered availability request advances that participant to contacted", () => {
  const route = fs.readFileSync(
    path.join(process.cwd(), "src/app/api/hermes/tools/route.ts"),
    "utf8",
  );
  const block = route.slice(route.indexOf('intent === "availability_request"'));
  assert.match(block, /response_status: "contacted"/);
  assert.match(block, /\.eq\("response_status", "pending"\)/,
    "a repeat send must not drag a responded or declined participant backwards");
  assert.ok(
    route.indexOf("response.ok && intent ===") > route.indexOf("const result = await response.json()"),
    "the transition only happens after the send succeeds",
  );
});

test("recording availability marks the participant responded and touches the case", () => {
  const route = fs.readFileSync(
    path.join(process.cwd(), "src/app/api/hermes/tools/route.ts"),
    "utf8",
  );
  const block = route.slice(
    route.indexOf('case "record_availability"'),
    route.indexOf('case "request_reschedule"'),
  );
  assert.match(block, /response_status: "responded"/);
  assert.match(block, /hermes_scheduling_cases"\)\.update\(\{ updated_at/,
    "the case's last meaningful update moves so the dashboard reflects the reply");
});

test("a reminder can be sent without opening a scheduling case", () => {
  const route = fs.readFileSync(
    path.join(process.cwd(), "src/app/api/hermes/tools/route.ts"),
    "utf8",
  );
  assert.match(route, /const transportIntent = \["class_reminder", "human_attention"\]/);
  // Coordination intents still go through the required-string path.
  assert.match(route, /: stringValue\(payload, "caseId", 80\)/);
});

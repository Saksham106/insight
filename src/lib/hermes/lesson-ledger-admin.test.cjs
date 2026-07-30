/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  module._compile(output.outputText, filename);
};

const modulePath = path.join(__dirname, "lesson-ledger-admin.ts");

test("projects active lesson reports, delivery state, and admin-safe counts", () => {
  const { projectAdminLessonCycles } = require(modulePath);
  const projected = projectAdminLessonCycles({
    cycles: [
      {
        id: "cycle-june",
        period_start: "2026-06-01",
        status: "confirmed",
        version: 2,
        confirmed_at: "2026-06-30T12:00:00Z",
        updated_at: "2026-06-30T12:00:00Z",
      },
      {
        id: "cycle-july",
        period_start: "2026-07-01",
        status: "needs_attention",
        version: 3,
        confirmed_at: null,
        updated_at: "2026-07-30T12:00:00Z",
      },
    ],
    collections: [
      {
        id: "collection-b",
        lesson_cycle_id: "cycle-july",
        tutor_contact_id: "tutor-b",
        status: "awaiting_reply",
        tutor: null,
      },
      {
        id: "collection-a",
        lesson_cycle_id: "cycle-july",
        tutor_contact_id: "tutor-a",
        status: "confirmed",
        tutor: { display_name: "Teacher A" },
      },
      {
        id: "collection-zero",
        lesson_cycle_id: "cycle-june",
        tutor_contact_id: "tutor-zero",
        status: "confirmed",
        tutor: { display_name: "Teacher Zero" },
      },
    ],
    reports: [
      {
        id: "report-old",
        teacher_collection_id: "collection-a",
        revision: 1,
        status: "superseded",
        source_channel: "whatsapp",
        submitted_at: "2026-07-20T10:00:00Z",
        confirmed_at: null,
      },
      {
        id: "report-active",
        teacher_collection_id: "collection-a",
        revision: 2,
        status: "confirmed",
        source_channel: "whatsapp",
        submitted_at: "2026-07-21T10:00:00Z",
        confirmed_at: "2026-07-21T11:00:00Z",
      },
      {
        id: "report-zero",
        teacher_collection_id: "collection-zero",
        revision: 1,
        status: "confirmed",
        source_channel: "admin",
        submitted_at: "2026-06-29T10:00:00Z",
        confirmed_at: "2026-06-29T11:00:00Z",
      },
    ],
    lessons: [
      {
        id: "lesson-2",
        report_revision_id: "report-active",
        reported_student_name: "Zara",
        student_contact_id: "student-zara",
        lesson_date: "2026-07-10",
        duration_minutes: 45,
        subject: null,
        student: { display_name: "Zara Jones" },
      },
      {
        id: "lesson-old",
        report_revision_id: "report-old",
        reported_student_name: "Old Student",
        student_contact_id: null,
        lesson_date: "2026-07-01",
        duration_minutes: 30,
        subject: null,
        student: null,
      },
      {
        id: "lesson-1",
        report_revision_id: "report-active",
        reported_student_name: "Maya",
        student_contact_id: null,
        lesson_date: "2026-07-03",
        duration_minutes: 60,
        subject: "Math",
        student: null,
      },
      {
        id: "lesson-3",
        report_revision_id: "report-active",
        reported_student_name: "Asha",
        student_contact_id: "student-asha",
        lesson_date: "2026-07-10",
        duration_minutes: 30,
        subject: "English",
        student: { display_name: "Asha Rao" },
      },
    ],
    deliveryMessages: [
      {
        id: "message-failed",
        lesson_cycle_id: "cycle-july",
        contact_id: "tutor-a",
        status: "failed",
        error_detail: "Temporary provider error",
        occurred_at: "2026-07-19T10:00:00Z",
      },
      {
        id: "message-sent",
        lesson_cycle_id: "cycle-july",
        contact_id: "tutor-a",
        status: "read",
        error_detail: null,
        occurred_at: "2026-07-19T11:00:00Z",
      },
    ],
  });

  assert.deepEqual(projected.map((cycle) => cycle.id), [
    "cycle-july",
    "cycle-june",
  ]);
  assert.equal(projected[0].selectedTutorCount, 2);
  assert.equal(projected[0].confirmedReportCount, 1);
  assert.equal(projected[0].lessonCount, 3);
  assert.equal(projected[0].unresolvedCount, 1);
  assert.equal(projected[0].collections[0].tutorName, "Teacher A");
  assert.equal(projected[0].collections[0].report.revision, 2);
  assert.deepEqual(
    projected[0].collections[0].report.lessons.map(
      (lesson) => lesson.lessonDate,
    ),
    ["2026-07-03", "2026-07-10", "2026-07-10"],
  );
  assert.equal(
    projected[0].collections[0].report.lessons[0].studentName,
    null,
  );
  assert.equal(projected[0].collections[0].requestDeliveryStatus, "read");
  assert.equal(projected[0].collections[0].requestFailure, null);
  assert.equal(projected[0].collections[1].tutorName, "Tutor unavailable");
  assert.equal(projected[1].collections[0].report.lessons.length, 0);
  assert.equal(JSON.stringify(projected).includes("Old Student"), false);
});

test("loader uses bounded, explicit, admin-safe ledger queries", () => {
  const source = fs.readFileSync(modulePath, "utf8");
  for (const table of [
    "academy_lesson_cycles",
    "academy_teacher_collections",
    "academy_lesson_report_revisions",
    "academy_lessons",
    "hermes_messages",
  ]) {
    assert.match(source, new RegExp(`\\.from\\(\"${table}\"\\)`));
  }
  assert.match(source, /\.limit\(12\)/);
  assert.match(source, /\.eq\("intent", "lesson_report_request"\)/);
  assert.doesNotMatch(
    source,
    /whatsapp_e164|transcript|prompt|token|raw_session/i,
  );
});

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

const {
  buildLessonReportRequestContent,
  projectLessonCycle,
  sanitizeLessonReport,
  sanitizeTutorContactIds,
} = require(path.join(__dirname, "lesson-ledger.ts"));

const UUIDS = {
  cycle: "10000000-0000-4000-8000-000000000001",
  collection: "20000000-0000-4000-8000-000000000001",
  report: "30000000-0000-4000-8000-000000000001",
  tutor: "40000000-0000-4000-8000-000000000001",
  student: "50000000-0000-4000-8000-000000000001",
  lesson: "60000000-0000-4000-8000-000000000001",
};

test("sanitizes normalized individual lessons and discards unknown fields", () => {
  assert.deepEqual(sanitizeLessonReport({ lessons: [{
    reportedStudentName: "  Maya   Rao ",
    studentContactId: UUIDS.student.toUpperCase(),
    lessonDate: "2026-07-03",
    durationMinutes: 60,
    subject: " Math ",
    note: " Chapter 4 ",
    privateConversation: "discard",
  }] }), { lessons: [{
    reportedStudentName: "Maya Rao",
    studentContactId: UUIDS.student,
    lessonDate: "2026-07-03",
    durationMinutes: 60,
    subject: "Math",
    note: "Chapter 4",
  }] });
});

test("allows zero lessons and sorts a bounded report deterministically", () => {
  assert.deepEqual(sanitizeLessonReport({ lessons: [] }), { lessons: [] });
  const report = sanitizeLessonReport({ lessons: [
    { reportedStudentName: "Zara", lessonDate: "2026-07-10", durationMinutes: 45 },
    { reportedStudentName: "Asha", lessonDate: "2026-07-02", durationMinutes: 60 },
  ] });
  assert.deepEqual(report.lessons.map((item) => item.reportedStudentName), ["Asha", "Zara"]);
  assert.throws(() => sanitizeLessonReport({ lessons: Array.from({ length: 501 }, (_, index) => ({ reportedStudentName: `Student ${index}`, lessonDate: "2026-07-01", durationMinutes: 60 })) }), /invalid_lessons/);
});

test("rejects invalid dates, durations, text, UUIDs, and exact duplicate rows", () => {
  const lesson = { reportedStudentName: "Maya", lessonDate: "2026-07-03", durationMinutes: 60, subject: "Math" };
  assert.throws(() => sanitizeLessonReport({ lessons: [lesson, { ...lesson, reportedStudentName: " maya " }] }), /duplicate_lesson/);
  assert.doesNotThrow(() => sanitizeLessonReport({ lessons: [lesson, { ...lesson, durationMinutes: 90 }] }));
  assert.throws(() => sanitizeLessonReport({ lessons: [{ ...lesson, lessonDate: "2026-02-30" }] }), /invalid_lesson_date/);
  assert.throws(() => sanitizeLessonReport({ lessons: [{ ...lesson, durationMinutes: 0 }] }), /invalid_duration_minutes/);
  assert.throws(() => sanitizeLessonReport({ lessons: [{ ...lesson, durationMinutes: 60.5 }] }), /invalid_duration_minutes/);
  assert.throws(() => sanitizeLessonReport({ lessons: [{ ...lesson, subject: "x".repeat(121) }] }), /invalid_subject/);
  assert.throws(() => sanitizeLessonReport({ lessons: [{ ...lesson, note: "x".repeat(501) }] }), /invalid_note/);
  assert.throws(() => sanitizeLessonReport({ lessons: [{ ...lesson, studentContactId: "not-a-uuid" }] }), /invalid_student_contact_id/);
});

test("normalizes unique selected tutor IDs", () => {
  const second = "40000000-0000-4000-8000-000000000002";
  assert.deepEqual(sanitizeTutorContactIds([second, UUIDS.tutor]), [UUIDS.tutor, second]);
  assert.throws(() => sanitizeTutorContactIds([]), /invalid_tutor_contact_ids/);
  assert.throws(() => sanitizeTutorContactIds([UUIDS.tutor, UUIDS.tutor]), /duplicate_tutor_contact/);
});

test("projects only active report revisions and their lessons", () => {
  const superseded = "30000000-0000-4000-8000-000000000002";
  const projected = projectLessonCycle({
    cycle: { id: UUIDS.cycle, period_start: "2026-07-01", status: "needs_attention", version: 1, confirmed_at: null },
    collections: [{ id: UUIDS.collection, tutor_contact_id: UUIDS.tutor, status: "confirmed", confirmed_report_revision_id: UUIDS.report }],
    reports: [
      { id: superseded, teacher_collection_id: UUIDS.collection, revision: 1, status: "superseded", source_channel: "whatsapp", submitted_at: "2026-07-31T10:00:00Z", confirmed_at: null },
      { id: UUIDS.report, teacher_collection_id: UUIDS.collection, revision: 2, status: "confirmed", source_channel: "whatsapp", submitted_at: "2026-07-31T11:00:00Z", confirmed_at: "2026-07-31T11:05:00Z" },
    ],
    lessons: [
      { id: UUIDS.lesson, report_revision_id: UUIDS.report, reported_student_name: "Maya", student_contact_id: null, lesson_date: "2026-07-03", duration_minutes: 60, subject: "Math" },
      { id: "60000000-0000-4000-8000-000000000002", report_revision_id: superseded, reported_student_name: "Old", student_contact_id: UUIDS.student, lesson_date: "2026-07-01", duration_minutes: 30, subject: null },
    ],
  });
  assert.equal(projected.unresolvedCount, 1);
  assert.equal(projected.collections[0].report.revision, 2);
  assert.equal(projected.collections[0].report.lessons.length, 1);
  assert.equal(projected.collections[0].report.lessons[0].reportedStudentName, "Maya");
  assert.equal(JSON.stringify(projected).includes("Old"), false);
});

test("reuses the approved human-attention template for lesson report requests", () => {
  assert.deepEqual(buildLessonReportRequestContent("2026-07-01", "Teacher A"), {
    body: "Hello Teacher A, Swati from MyInsightAcademy needs your input about your lesson report for July 2026. Please reply here when convenient.",
    bodyParameters: ["Teacher A", "your lesson report for July 2026"],
  });
});

test("lesson evidence helpers have no operational or financial dependencies", () => {
  const source = fs.readFileSync(path.join(__dirname, "lesson-ledger.ts"), "utf8");
  assert.doesNotMatch(source, /supabase|calendar|claimed_payout|family_charge|amount_minor|invoice|bank|transfer/i);
});

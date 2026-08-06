/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("classes panel exposes group roster creation and occurrence administration", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/components/admin/hermes-classes-panel.tsx"), "utf8");
  for (const label of ["Upcoming", "Needs attention", "Recurring", "History", "One-off class", "Weekly class"]) {
    assert.ok(source.includes(label), `missing ${label}`);
  }
  for (const label of [
    "Teacher", "Student", "Parent", "Receives updates", "Confirms cancellations", "Confirms reschedules",
    "Add student", "Add parent contact", "End enrollment", "Attendance", "approvals received",
    "approvals required", "Audit history", "Failed notifications", "Effective date", "Change scope",
  ]) {
    assert.ok(source.includes(label), `missing ${label}`);
  }
  assert.match(source, /\/api\/admin\/hermes\/classes/);
  assert.match(source, /enrollments/);
  assert.match(source, /teacherContactId/);
  assert.match(source, /Choose the student for this class/);
  assert.match(source, /required/);
  assert.match(source, /Retry notification/);
  assert.match(source, /retry_notification/);
  assert.match(source, /add_enrollment/);
  assert.match(source, /end_enrollment/);
  assert.match(source, /body\.scope = "enrollment"/);
  assert.match(source, /aria-live="polite"/);
  assert.doesNotMatch(source, /\/api\/sessions/);
});

test("group form begins with one enrollment and can add students and parent rows", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/components/admin/hermes-classes-panel.tsx"), "utf8");
  assert.match(source, /INITIAL_ENROLLMENTS/);
  assert.match(source, /useState<EnrollmentDraft\[\]>\(INITIAL_ENROLLMENTS\)/);
  assert.match(source, /setEnrollments\(\(current\)/);
  assert.match(source, /contacts:\s*\[/);
  assert.match(source, /role:\s*"student"/);
  assert.match(source, /role:\s*"parent_guardian"/);
});

/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = function compileTypeScript(module, filename) {
  const source = require("node:fs").readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  });
  module._compile(output.outputText, filename);
};

const enrollmentPath = path.join(__dirname, "kitty-class-enrollments.ts");

const enrollmentA = {
  id: "enrollment-a",
  studentContactId: "student-a",
  contacts: [
    { contactId: "student-a", role: "student", receivesNotifications: true, confirmsCancellation: true, confirmsReschedule: true },
    { contactId: "parent-shared", role: "parent_guardian", receivesNotifications: true, confirmsCancellation: false, confirmsReschedule: true },
  ],
};

const enrollmentB = {
  id: "enrollment-b",
  studentContactId: "student-b",
  contacts: [
    { contactId: "student-b", role: "student", receivesNotifications: true, confirmsCancellation: true, confirmsReschedule: true },
    { contactId: "parent-shared", role: "parent_guardian", receivesNotifications: true, confirmsCancellation: false, confirmsReschedule: true },
  ],
};

test("validates separate student enrollments while allowing a shared parent", () => {
  const { validateKittyEnrollments } = require(enrollmentPath);
  assert.deepEqual(validateKittyEnrollments([enrollmentA, enrollmentB]), [enrollmentA, enrollmentB]);
});

test("rejects missing, duplicate, and incomplete enrollment decision boundaries", () => {
  const { validateKittyEnrollments } = require(enrollmentPath);
  assert.throws(() => validateKittyEnrollments([]), /enrollment_required/);
  assert.throws(() => validateKittyEnrollments([enrollmentA, enrollmentA]), /duplicate_student/);
  assert.throws(() => validateKittyEnrollments([{ ...enrollmentA, contacts: enrollmentA.contacts.slice(1) }]), /student_contact_required/);
  assert.throws(() => validateKittyEnrollments([{ ...enrollmentA, contacts: enrollmentA.contacts.map((contact) => ({ ...contact, confirmsReschedule: false })) }]), /reschedule_decision_maker_required/);
});

test("rejects duplicate contacts and observer-like authorities within an enrollment", () => {
  const { validateKittyEnrollments } = require(enrollmentPath);
  assert.throws(() => validateKittyEnrollments([{ ...enrollmentA, contacts: [...enrollmentA.contacts, { ...enrollmentA.contacts[1] }] }]), /duplicate_enrollment_contact/);
  assert.throws(() => validateKittyEnrollments([{ ...enrollmentA, contacts: [{ contactId: "observer", role: "observer", receivesNotifications: false, confirmsCancellation: false, confirmsReschedule: true }] }]), /invalid_enrollment_contact/);
});

test("returns approval IDs in enrollment order", () => {
  const { requiredEnrollmentApprovalIds } = require(enrollmentPath);
  assert.deepEqual(requiredEnrollmentApprovalIds([enrollmentA, enrollmentB]), ["enrollment-a", "enrollment-b"]);
});

test("projects a contact roster without cross-enrollment identities or configuration", () => {
  const { projectKittyClassRoster } = require(enrollmentPath);
  assert.deepEqual(projectKittyClassRoster([enrollmentA, enrollmentB], { kind: "contact", contactId: "parent-shared" }), [
    { contacts: [{ role: "student" }, { role: "parent_guardian" }] },
    { contacts: [{ role: "student" }, { role: "parent_guardian" }] },
  ]);
});

test("projects identifiers and enrollment configuration only to administrators", () => {
  const { projectKittyClassRoster } = require(enrollmentPath);
  assert.deepEqual(projectKittyClassRoster([enrollmentA], { kind: "admin" }), [enrollmentA]);
});

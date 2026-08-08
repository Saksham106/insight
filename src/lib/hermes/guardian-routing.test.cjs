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

const {
  resolveClassRecipient,
  activeGuardiansForStudent,
  applyGuardianDefaults,
  resolveGuardianMessageContact,
} = require(path.join(__dirname, "guardian-routing.ts"));

function person(id, overrides = {}) {
  return {
    id,
    display_name: overrides.display_name ?? id,
    role: overrides.role ?? "parent",
    is_active: overrides.is_active ?? true,
    deleted_at: overrides.deleted_at ?? null,
    communication_policy: overrides.communication_policy ?? "direct",
    consent_status: overrides.consent_status ?? "attested",
  };
}

function link(parentId, studentId, overrides = {}) {
  return {
    source_contact_id: parentId,
    target_contact_id: studentId,
    relationship_type: overrides.relationship_type ?? "parent_guardian",
    is_active: overrides.is_active ?? true,
  };
}

const STUDENT = person("student-1", { role: "student" });
const MUM = person("mum", { display_name: "Priya" });
const DAD = person("dad", { display_name: "Ravi" });

// --- guardian lookup ------------------------------------------------------

test("an active parent_guardian link makes a guardian", () => {
  const guardians = activeGuardiansForStudent({
    studentId: "student-1",
    contacts: [STUDENT, MUM],
    relationships: [link("mum", "student-1")],
  });
  assert.deepEqual(guardians.map((g) => g.id), ["mum"]);
});

test("a deactivated link is not a guardian", () => {
  const guardians = activeGuardiansForStudent({
    studentId: "student-1",
    contacts: [STUDENT, MUM],
    relationships: [link("mum", "student-1", { is_active: false })],
  });
  assert.deepEqual(guardians, []);
});

test("a teacher link is not a guardian", () => {
  const guardians = activeGuardiansForStudent({
    studentId: "student-1",
    contacts: [STUDENT, person("teach", { role: "teacher" })],
    relationships: [link("teach", "student-1", { relationship_type: "teacher" })],
  });
  assert.deepEqual(guardians, []);
});

test("a removed guardian contact is not eligible", () => {
  const guardians = activeGuardiansForStudent({
    studentId: "student-1",
    contacts: [STUDENT, person("mum", { deleted_at: "2026-08-01T00:00:00.000Z" })],
    relationships: [link("mum", "student-1")],
  });
  assert.deepEqual(guardians, []);
});

test("an inactive guardian contact is not eligible", () => {
  const guardians = activeGuardiansForStudent({
    studentId: "student-1",
    contacts: [STUDENT, person("mum", { is_active: false })],
    relationships: [link("mum", "student-1")],
  });
  assert.deepEqual(guardians, []);
});

test("an opted-out guardian is not eligible to be messaged", () => {
  const guardians = activeGuardiansForStudent({
    studentId: "student-1",
    contacts: [STUDENT, person("mum", { communication_policy: "opted_out" })],
    relationships: [link("mum", "student-1")],
  });
  assert.deepEqual(guardians, []);
});

test("paused, approval-required, guardian-only, and unattested guardians are not eligible defaults", () => {
  for (const communication_policy of ["paused", "approval_required", "guardian_only"]) {
    const guardians = activeGuardiansForStudent({
      studentId: "student-1",
      contacts: [STUDENT, person("mum", { communication_policy })],
      relationships: [link("mum", "student-1")],
    });
    assert.deepEqual(guardians, [], communication_policy);
  }
  const guardians = activeGuardiansForStudent({
    studentId: "student-1",
    contacts: [STUDENT, person("mum", { consent_status: "unknown" })],
    relationships: [link("mum", "student-1")],
  });
  assert.deepEqual(guardians, []);
});

test("another family's link never leaks in", () => {
  const guardians = activeGuardiansForStudent({
    studentId: "student-1",
    contacts: [STUDENT, MUM, person("other-parent")],
    relationships: [link("mum", "student-1"), link("other-parent", "student-2")],
  });
  assert.deepEqual(guardians.map((g) => g.id), ["mum"]);
});

// --- routing --------------------------------------------------------------

const route = (overrides) =>
  resolveClassRecipient({
    student: STUDENT,
    contacts: [STUDENT, MUM, DAD],
    relationships: [],
    enrollmentContactId: null,
    requiresGuardian: false,
    ...overrides,
  });

test("a student with no guardian requirement is contacted directly", () => {
  assert.deepEqual(route({}), { kind: "contact", contactId: "student-1" });
});

test("an explicit enrollment contact wins over directory defaults", () => {
  // Class-specific enrollment settings stay authoritative; the directory only
  // provides defaults and fallback.
  const result = route({
    enrollmentContactId: "dad",
    requiresGuardian: true,
    relationships: [link("mum", "student-1"), link("dad", "student-1")],
  });
  assert.deepEqual(result, { kind: "contact", contactId: "dad" });
});

test("exactly one eligible guardian is used without asking", () => {
  const result = route({
    requiresGuardian: true,
    relationships: [link("mum", "student-1")],
  });
  assert.deepEqual(result, { kind: "contact", contactId: "mum" });
});

test("a guardian_only student routes to the guardian even without the flag", () => {
  const result = route({
    student: person("student-1", { role: "student", communication_policy: "guardian_only" }),
    relationships: [link("mum", "student-1")],
  });
  assert.deepEqual(result, { kind: "contact", contactId: "mum" });
});

test("several eligible guardians raise an exception rather than guessing", () => {
  const result = route({
    requiresGuardian: true,
    relationships: [link("mum", "student-1"), link("dad", "student-1")],
  });
  assert.equal(result.kind, "exception");
  assert.equal(result.reason, "ambiguous_guardian");
});

test("several guardians are never broadcast to", () => {
  const result = route({
    requiresGuardian: true,
    relationships: [link("mum", "student-1"), link("dad", "student-1")],
  });
  assert.equal("contactId" in result, false, "no recipient is chosen");
  assert.equal(Array.isArray(result.contactIds), false, "and none are messaged in bulk");
});

test("no linked guardian raises a clear exception", () => {
  const result = route({ requiresGuardian: true, relationships: [] });
  assert.equal(result.kind, "exception");
  assert.equal(result.reason, "missing_guardian");
});

test("a deactivated sole guardian is treated as missing, not ambiguous", () => {
  const result = route({
    requiresGuardian: true,
    relationships: [link("mum", "student-1", { is_active: false })],
  });
  assert.equal(result.reason, "missing_guardian");
});

test("two links where only one guardian is eligible resolves to that one", () => {
  const result = route({
    contacts: [STUDENT, MUM, person("dad", { communication_policy: "opted_out" })],
    requiresGuardian: true,
    relationships: [link("mum", "student-1"), link("dad", "student-1")],
  });
  assert.deepEqual(result, { kind: "contact", contactId: "mum" });
});

test("an exception names the student so Swati knows whose class it is", () => {
  const result = route({ requiresGuardian: true, relationships: [] });
  assert.equal(result.studentName, "student-1");
});

test("a sole linked guardian is persisted as the recipient default", () => {
  const result = applyGuardianDefaults({
    enrollments: [{
      studentContactId: "student-1",
      contacts: [{
        contactId: "student-1", role: "student", receivesNotifications: false,
        confirmsCancellation: false, confirmsReschedule: true,
      }],
    }],
    contacts: [STUDENT, MUM],
    relationships: [link("mum", "student-1")],
  });
  assert.deepEqual(result[0].contacts[1], {
    contactId: "mum", role: "parent_guardian", receivesNotifications: true,
    confirmsCancellation: false, confirmsReschedule: true,
  });
});

test("guardian-only policy disables the student recipient and persists the sole guardian", () => {
  const result = applyGuardianDefaults({
    enrollments: [{
      studentContactId: "student-1",
      contacts: [{
        contactId: "student-1", role: "student", receivesNotifications: true,
        confirmsCancellation: false, confirmsReschedule: true,
      }],
    }],
    contacts: [person("student-1", { role: "student", communication_policy: "guardian_only" }), MUM],
    relationships: [link("mum", "student-1")],
  });
  assert.equal(result[0].contacts[0].receivesNotifications, false);
  assert.equal(result[0].contacts[1].contactId, "mum");
});

test("a class reminder addressed to a guardian-only student resolves to the linked parent", async () => {
  const rows = {
    hermes_contacts: [
      person("student-1", { role: "student", communication_policy: "guardian_only" }),
      MUM,
    ],
    hermes_contact_relationships: [link("mum", "student-1")],
  };
  const client = { from(table) {
    let id = null;
    const query = {
      select() { return query; }, eq(column, value) { if (column === "id") id = value; return query; }, in() { return query; },
      maybeSingle() { return Promise.resolve({ data: rows[table].find((row) => row.id === id) ?? null, error: null }); },
      then(resolve, reject) { return Promise.resolve({ data: rows[table], error: null }).then(resolve, reject); },
    };
    return query;
  } };
  assert.equal(await resolveGuardianMessageContact(client, "student-1"), "mum");
});

test("an explicit notifying guardian is never replaced by a directory default", () => {
  const explicit = {
    contactId: "dad", role: "parent_guardian", receivesNotifications: true,
    confirmsCancellation: true, confirmsReschedule: true,
  };
  const result = applyGuardianDefaults({
    enrollments: [{
      studentContactId: "student-1",
      contacts: [
        { contactId: "student-1", role: "student", receivesNotifications: false, confirmsCancellation: false, confirmsReschedule: true },
        explicit,
      ],
    }],
    contacts: [STUDENT, MUM, DAD],
    relationships: [link("mum", "student-1"), link("dad", "student-1")],
  });
  assert.deepEqual(result[0].contacts, [
    { contactId: "student-1", role: "student", receivesNotifications: false, confirmsCancellation: false, confirmsReschedule: true },
    explicit,
  ]);
});

test("missing and ambiguous guardian defaults refuse to create a silent non-delivery", () => {
  const input = {
    enrollments: [{
      studentContactId: "student-1",
      contacts: [{ contactId: "student-1", role: "student", receivesNotifications: false, confirmsCancellation: false, confirmsReschedule: true }],
    }],
    contacts: [STUDENT, MUM, DAD],
  };
  assert.throws(() => applyGuardianDefaults({ ...input, relationships: [] }), /missing_guardian/);
  assert.throws(() => applyGuardianDefaults({
    ...input,
    relationships: [link("mum", "student-1"), link("dad", "student-1")],
  }), /ambiguous_guardian/);
});

const { projectGuardianIssues } = require(path.join(__dirname, "guardian-routing.ts"));

function enrollment(id, studentId, occurrenceId = "occ-1") {
  return { id, student_contact_id: studentId, occurrence_id: occurrenceId };
}
function enrollmentContact(enrollmentId, contactId, role, notifies = true) {
  return {
    enrollment_id: enrollmentId,
    contact_id: contactId,
    contact_role: role,
    receives_notifications: notifies,
    is_active: true,
  };
}

test("an enrollment that notifies the student raises no guardian exception", () => {
  const issues = projectGuardianIssues({
    enrollments: [enrollment("e-1", "student-1")],
    enrollmentContacts: [enrollmentContact("e-1", "student-1", "student")],
    contacts: [STUDENT, MUM],
    relationships: [link("mum", "student-1")],
  });
  assert.deepEqual(issues, []);
});

test("an enrollment that already names a notifying guardian raises no exception", () => {
  const issues = projectGuardianIssues({
    enrollments: [enrollment("e-1", "student-1")],
    enrollmentContacts: [enrollmentContact("e-1", "mum", "parent_guardian")],
    contacts: [STUDENT, MUM, DAD],
    relationships: [link("mum", "student-1"), link("dad", "student-1")],
  });
  assert.deepEqual(issues, [], "the class-specific choice is authoritative");
});

test("no notified contact and no linked guardian is a missing-guardian exception", () => {
  const issues = projectGuardianIssues({
    enrollments: [enrollment("e-1", "student-1")],
    enrollmentContacts: [],
    contacts: [STUDENT],
    relationships: [],
    occurrenceTitles: { "occ-1": "Physics" },
  });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].kind, "missing_guardian");
  assert.equal(issues[0].occurrenceTitle, "Physics");
});

test("no notified contact and two linked guardians is an ambiguity exception", () => {
  const issues = projectGuardianIssues({
    enrollments: [enrollment("e-1", "student-1")],
    enrollmentContacts: [],
    contacts: [STUDENT, MUM, DAD],
    relationships: [link("mum", "student-1"), link("dad", "student-1")],
  });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].kind, "ambiguous_guardian");
});

test("no notified contact and one linked guardian resolves silently", () => {
  const issues = projectGuardianIssues({
    enrollments: [enrollment("e-1", "student-1")],
    enrollmentContacts: [],
    contacts: [STUDENT, MUM],
    relationships: [link("mum", "student-1")],
  });
  assert.deepEqual(issues, []);
});

test("an inactive enrollment contact does not count as notifying", () => {
  const issues = projectGuardianIssues({
    enrollments: [enrollment("e-1", "student-1")],
    enrollmentContacts: [{ ...enrollmentContact("e-1", "student-1", "student"), is_active: false }],
    contacts: [STUDENT],
    relationships: [],
  });
  assert.equal(issues.length, 1);
});

test("overlapping enrollments for one student and class raise a single exception", () => {
  const issues = projectGuardianIssues({
    enrollments: [enrollment("e-1", "student-1"), enrollment("e-2", "student-1")],
    enrollmentContacts: [],
    contacts: [STUDENT],
    relationships: [],
  });
  assert.equal(issues.length, 1, "the badge must not double-count one problem");
});

test("a guardian issue for one family never mentions another", () => {
  const issues = projectGuardianIssues({
    enrollments: [enrollment("e-1", "student-1")],
    enrollmentContacts: [],
    contacts: [STUDENT, person("other-parent")],
    relationships: [link("other-parent", "student-2")],
  });
  assert.equal(issues[0].kind, "missing_guardian");
  assert.equal(JSON.stringify(issues).includes("other-parent"), false);
});

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

// Compile the sibling .ts on require, mirroring src/lib/chat/roster-key.test.cjs.
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

const rr = require(path.join(__dirname, "role-reassign.ts"));

const EMPTY = {
  deactivateAssignmentsAsTeacher: false,
  deactivateAssignmentsAsStudent: false,
  removeParentLinksAsParent: false,
  removeParentLinksAsStudent: false,
};

// --- planReassignment: the six real transitions ------------------------------

test("teacher -> student drops the tutor's assignments only", () => {
  assert.deepEqual(rr.planReassignment("teacher", "student"), {
    ...EMPTY,
    deactivateAssignmentsAsTeacher: true,
  });
});

test("teacher -> parent drops the tutor's assignments only", () => {
  assert.deepEqual(rr.planReassignment("teacher", "parent"), {
    ...EMPTY,
    deactivateAssignmentsAsTeacher: true,
  });
});

test("student -> teacher drops the student's assignments and their parent links", () => {
  assert.deepEqual(rr.planReassignment("student", "teacher"), {
    ...EMPTY,
    deactivateAssignmentsAsStudent: true,
    removeParentLinksAsStudent: true,
  });
});

test("student -> parent drops the student's assignments and their parent links", () => {
  assert.deepEqual(rr.planReassignment("student", "parent"), {
    ...EMPTY,
    deactivateAssignmentsAsStudent: true,
    removeParentLinksAsStudent: true,
  });
});

test("parent -> student drops the links to their children only", () => {
  assert.deepEqual(rr.planReassignment("parent", "student"), {
    ...EMPTY,
    removeParentLinksAsParent: true,
  });
});

test("parent -> teacher drops the links to their children only", () => {
  assert.deepEqual(rr.planReassignment("parent", "teacher"), {
    ...EMPTY,
    removeParentLinksAsParent: true,
  });
});

// --- planReassignment: degenerate input --------------------------------------

test("a role that is not changing clears nothing", () => {
  for (const role of ["teacher", "student", "parent"]) {
    assert.deepEqual(rr.planReassignment(role, role), EMPTY);
  }
});

test("the plan never touches assignments a person could not have held", () => {
  // A departing parent has no assignments of their own in either direction —
  // clearing them would deactivate rows belonging to someone else's pairing.
  const plan = rr.planReassignment("parent", "student");
  assert.equal(plan.deactivateAssignmentsAsTeacher, false);
  assert.equal(plan.deactivateAssignmentsAsStudent, false);
});

// --- reassignmentError: the guards -------------------------------------------

test("reassigning between the three assignable roles is allowed", () => {
  assert.equal(rr.reassignmentError({ from: "parent", to: "student", isSelf: false }), null);
  assert.equal(rr.reassignmentError({ from: "student", to: "teacher", isSelf: false }), null);
  assert.equal(rr.reassignmentError({ from: "teacher", to: "parent", isSelf: false }), null);
});

test("an admin cannot reassign their own account", () => {
  assert.match(
    rr.reassignmentError({ from: "student", to: "parent", isSelf: true }) ?? "",
    /your own/i,
  );
});

test("admin is refused as the current role", () => {
  assert.match(rr.reassignmentError({ from: "admin", to: "teacher", isSelf: false }) ?? "", /admin/i);
});

test("admin is refused as the target role", () => {
  assert.match(rr.reassignmentError({ from: "teacher", to: "admin", isSelf: false }) ?? "", /admin/i);
});

test("an unknown target role is refused", () => {
  assert.notEqual(rr.reassignmentError({ from: "teacher", to: "wizard", isSelf: false }), null);
});

test("reassigning to the role someone already has is refused", () => {
  assert.match(
    rr.reassignmentError({ from: "student", to: "student", isSelf: false }) ?? "",
    /already/i,
  );
});

// --- describeImpact ----------------------------------------------------------

test("describeImpact names each cleared relationship with its count", () => {
  const lines = rr.describeImpact(rr.planReassignment("student", "parent"), {
    assignmentsAsTeacher: 0,
    assignmentsAsStudent: 3,
    parentLinksAsParent: 0,
    parentLinksAsStudent: 2,
  });
  assert.equal(lines.length, 2);
  assert.match(lines[0], /3 tutor/i);
  assert.match(lines[1], /2 parent/i);
});

test("describeImpact omits relationships the person does not have", () => {
  const lines = rr.describeImpact(rr.planReassignment("student", "parent"), {
    assignmentsAsTeacher: 0,
    assignmentsAsStudent: 0,
    parentLinksAsParent: 0,
    parentLinksAsStudent: 0,
  });
  assert.deepEqual(lines, []);
});

test("describeImpact singularises a count of one", () => {
  const lines = rr.describeImpact(rr.planReassignment("parent", "student"), {
    assignmentsAsTeacher: 0,
    assignmentsAsStudent: 0,
    parentLinksAsParent: 1,
    parentLinksAsStudent: 0,
  });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /1 child\b/i);
});

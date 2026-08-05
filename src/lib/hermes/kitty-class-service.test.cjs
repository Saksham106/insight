/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const servicePath = path.join(__dirname, "kitty-class-service.ts");

test("the class service stays inside the Kitty-owned data boundary", () => {
  assert.equal(fs.existsSync(servicePath), true);
  const source = fs.readFileSync(servicePath, "utf8");
  for (const table of [
    "kitty_class_series",
    "kitty_class_occurrences",
    "kitty_class_participants",
    "kitty_class_change_requests",
  ]) assert.match(source, new RegExp(table));
  for (const table of ["teacher_student_assignments", "sessions", "availability_rules", "conversations"]) {
    assert.doesNotMatch(source, new RegExp(`from\\(["']${table}["']\\)|rpc\\(["']${table}["']`));
  }
});

test("mutations use the atomic Kitty RPC boundary", () => {
  const source = fs.readFileSync(servicePath, "utf8");
  for (const rpc of [
    "create_kitty_class_series",
    "create_kitty_one_off_class",
    "request_kitty_class_change",
    "propose_kitty_class_replacement",
    "decide_kitty_class_change",
    "finalize_kitty_class_change",
    "override_kitty_class_occurrence",
  ]) assert.match(source, new RegExp(`rpc\\(["']${rpc}["']`));
  assert.match(source, /assertAdmin\(actor\)/);
  assert.match(source, /assertContactMembership/);
  assert.match(source, /validateParticipants/);
  assert.match(source, /role === "parent_guardian"/);
  assert.match(source, /occurrence_selection_confirmed/);
  assert.match(source, /selectionTokenDigest/);
});

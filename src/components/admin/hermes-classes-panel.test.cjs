/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("classes panel exposes the isolated class views and configurable participants", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/components/admin/hermes-classes-panel.tsx"), "utf8");
  for (const label of ["Upcoming", "Needs attention", "Recurring", "History", "One-off class", "Weekly class"]) {
    assert.ok(source.includes(label), `missing ${label}`);
  }
  for (const label of ["Teacher", "Student", "Parent", "Receives updates", "Confirms cancellations", "Confirms reschedules"]) {
    assert.ok(source.includes(label), `missing ${label}`);
  }
  assert.match(source, /\/api\/admin\/hermes\/classes/);
  assert.match(source, /name="studentId"/);
  assert.match(source, /name="parentId"/);
  assert.match(source, /Choose a student, a parent, or both/);
  assert.doesNotMatch(source, /\/api\/sessions/);
});

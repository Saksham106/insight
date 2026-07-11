const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const src = fs.readFileSync(path.join(__dirname, "data.ts"), "utf8");

test("teacher_availability_rules select includes rule_type", () => {
  // Find the select string that follows the rules table query.
  const idx = src.indexOf('.from("teacher_availability_rules")');
  assert.ok(idx !== -1, "rules query not found");
  const after = src.slice(idx, idx + 400);
  assert.match(after, /rule_type/, "rules .select(...) must include rule_type or the engine sees undefined");
});

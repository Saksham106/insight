/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("agent routine cron is authenticated, re-evaluated, and aggregate-only", () => {
  const source = fs.readFileSync(path.join(__dirname, "route.ts"), "utf8");
  assert.match(source, /CRON_SECRET/);
  assert.match(source, /HERMES_TOOL_SHARED_SECRET/);
  assert.match(source, /runDueAgentRoutines/);
  assert.match(source, /evaluateAction/);
  assert.match(source, /executeEvaluatedAction/);
  assert.doesNotMatch(source, /recipientName|classDescription|phone|messageBody/);
});

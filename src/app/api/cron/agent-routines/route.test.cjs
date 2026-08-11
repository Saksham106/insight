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

test("agent routines use Hermes scheduling instead of a paid Vercel cron", () => {
  const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf8"));
  assert.equal(config.crons.some((cron) => cron.path === "/api/cron/agent-routines"), false);

  const profileDir = path.join(process.cwd(), "infra/hermes-profiles/academy");
  const readme = fs.readFileSync(path.join(profileDir, "README.md"), "utf8");
  const script = fs.readFileSync(path.join(profileDir, "scripts/agent-routine-maintenance.py"), "utf8");
  for (const required of [
    'cron create "every 15m"',
    "--no-agent",
    "agent-routine-maintenance.py",
    "HERMES_TOOL_SHARED_SECRET",
    "INSIGHT_AGENT_ROUTINE_URL",
  ]) assert.match(readme, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(script, /method="POST"/);
  assert.match(script, /headers=\{"Authorization": f"Bearer \{secret\}"\}/);
  assert.doesNotMatch(script, /response\.read/);
});

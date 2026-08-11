/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("the generic capability route derives actors and never accepts payload authority", () => {
  const source = fs.readFileSync(path.join(__dirname, "route.ts"), "utf8");
  assert.match(source, /verifyServiceRequest/);
  assert.match(source, /parseIMessageAdminActor/);
  assert.match(source, /parseWhatsAppToolActor/);
  assert.match(source, /parseAgentCapabilityRequest/);
  assert.match(source, /createAdminClient/);
  assert.match(source, /listAgentCapabilities/);
  assert.match(source, /evaluateAction/);
  assert.match(source, /executeEvaluatedAction/);
  assert.match(source, /ACADEMY_AGENT_EVALUATION_SECRET/);
  assert.match(source, /communicationDecision/);
  assert.doesNotMatch(source, /body\.payload\.(?:actor|role|contactId)/);
});

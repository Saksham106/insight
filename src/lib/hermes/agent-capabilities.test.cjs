/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = function compileTypeScript(module, filename) {
  let source = fs.readFileSync(filename, "utf8");
  source = source.replace(/from\s+(["'])\.\/([^"']+)\1/g, (_match, quote, target) => `from ${quote}./${target}.ts${quote}`);
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  });
  module._compile(output.outputText, filename);
};

const registryPath = path.join(__dirname, "agent-capabilities.ts");

test("publishes safe contact capability manifests without internal executors", () => {
  const { listCapabilityManifests } = require(registryPath);
  const manifests = listCapabilityManifests("contact");
  assert.deepEqual(manifests.map((item) => item.name), [
    "class.attendance.record",
    "class.one_off.create",
    "class.reminder.send",
    "class.reschedule.request",
  ]);
  for (const manifest of manifests) {
    assert.equal(manifest.version, 1);
    assert.equal("normalize" in manifest, false);
    assert.equal("evaluate" in manifest, false);
    assert.equal("execute" in manifest, false);
    assert.equal("allowedActorKinds" in manifest, false);
    assert.equal(JSON.stringify(manifest).includes("secret"), false);
    assert.equal(manifest.inputSchema.additionalProperties, false);
  }
});

test("keeps routine management and fee statement publishing discoverable only to administrators", () => {
  const { listCapabilityManifests } = require(registryPath);
  const contactNames = listCapabilityManifests("contact").map((item) => item.name);
  const adminNames = listCapabilityManifests("admin").map((item) => item.name);
  assert.equal(contactNames.includes("routine.manage"), false);
  assert.equal(contactNames.includes("fee_statement.create"), false);
  assert.equal(adminNames.includes("routine.manage"), true);
  assert.equal(adminNames.includes("fee_statement.create"), true);
});

test("normalizes a reconciled fee statement snapshot", () => {
  const { getCapability } = require(registryPath);
  const input = {
    studentName: "Example Student",
    periodStart: "2026-08-01",
    periodEnd: "2026-08-31",
    currency: "VND",
    lineItems: [{
      lessonDate: "2026-08-11", teacherName: "Teacher A", subject: "Maths",
      durationMinutes: 60, rateMinor: 500000, amountMinor: 500000,
      source: { workbook: "Workbook A", sheet: "August", row: 3 },
    }],
  };
  const normalized = getCapability("fee_statement.create", 1).normalize(input);
  assert.equal(normalized.totalMinor, 500000);
  assert.equal(normalized.lineItems[0].source.row, 3);
});

test("resolves exact versions and rejects unknown capabilities", () => {
  const { getCapability } = require(registryPath);
  assert.equal(getCapability("class.reminder.send", 1).manifest.name, "class.reminder.send");
  assert.throws(() => getCapability("class.reminder.send", 2), /capability_not_found/);
  assert.throws(() => getCapability("payment.record", 1), /capability_not_found/);
});

test("reminder normalization accepts identifiers but never rendered prose", () => {
  const { getCapability } = require(registryPath);
  const capability = getCapability("class.reminder.send", 1);
  assert.deepEqual(capability.normalize({ occurrenceId: "occ-1", recipientId: "student-1" }), {
    occurrenceId: "occ-1",
    recipientId: "student-1",
  });
  assert.throws(() => capability.normalize({ occurrenceId: "occ-1", recipientId: "student-1", classDescription: "Chemistry with Anjali" }), /invalid_capability_input/);
});

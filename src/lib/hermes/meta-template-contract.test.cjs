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

const contractPath = path.join(__dirname, "meta-template-contract.ts");

function template(text, overrides = {}) {
  return {
    name: "academy_class_reminder",
    status: "APPROVED",
    language: "en_US",
    components: [{ type: "BODY", text }],
    ...overrides,
  };
}

test("rejects the observed malformed live class reminder body", () => {
  const { CLASS_REMINDER_TEMPLATE_CONTRACT, compareMetaTemplateContract } = require(contractPath);
  const live = template("Hi there! Just a reminder that your {{2}}. If anything changes, please tell me and I’ll message the relevant person is {{3}}.");
  assert.deepEqual(compareMetaTemplateContract(live, {
    ...CLASS_REMINDER_TEMPLATE_CONTRACT,
    name: "academy_class_reminder",
  }), { ok: false, reason: "component_text_mismatch" });
});

test("accepts only the approved name, locale, status, component, and placeholder order", () => {
  const { CLASS_REMINDER_TEMPLATE_CONTRACT, compareMetaTemplateContract } = require(contractPath);
  const expected = { ...CLASS_REMINDER_TEMPLATE_CONTRACT, name: "academy_class_reminder" };
  const correct = template("Hello {{1}}, reminder from MyInsightAcademy: {{2}} is scheduled for {{3}}. We look forward to seeing you.");
  assert.deepEqual(compareMetaTemplateContract(correct, expected), { ok: true });
  assert.equal(compareMetaTemplateContract(template(correct.components[0].text, { status: "PENDING" }), expected).reason, "status_mismatch");
  assert.equal(compareMetaTemplateContract(template(correct.components[0].text, { language: "en_GB" }), expected).reason, "language_mismatch");
  assert.equal(compareMetaTemplateContract(template(correct.components[0].text, { components: [{ type: "HEADER", text: "Reminder" }, ...correct.components] }), expected).reason, "components_mismatch");
  assert.equal(compareMetaTemplateContract(template(correct.components[0].text.replace("{{1}}", "there")), expected).reason, "component_text_mismatch");
  assert.equal(compareMetaTemplateContract(template(correct.components[0].text.replace("{{3}}", "{{2}}")), expected).reason, "component_text_mismatch");
});

test("fetches bounded live template health without returning provider data", async () => {
  const { CLASS_REMINDER_TEMPLATE_CONTRACT, fetchMetaTemplateHealth } = require(contractPath);
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url: String(url), authorization: init.headers.Authorization });
    return {
      ok: true,
      async json() {
        return { data: [template(CLASS_REMINDER_TEMPLATE_CONTRACT.body, { extra_private_data: "omit" })] };
      },
    };
  };
  const health = await fetchMetaTemplateHealth(fetchImpl, {
    WHATSAPP_BUSINESS_ACCOUNT_ID: "waba-1",
    WHATSAPP_CLOUD_ACCESS_TOKEN: "private-token",
    WHATSAPP_TEMPLATE_CLASS_REMINDER: "academy_class_reminder",
    WHATSAPP_TEMPLATE_LOCALE: "en_US",
    WHATSAPP_CLOUD_API_VERSION: "v23.0",
  }, 1_786_447_200_000);
  assert.deepEqual(health, { ok: true, checkedAt: "2026-08-11T11:20:00.000Z" });
  assert.match(requests[0].url, /\/v23\.0\/waba-1\/message_templates/);
  assert.equal(JSON.stringify(health).includes("private"), false);
});

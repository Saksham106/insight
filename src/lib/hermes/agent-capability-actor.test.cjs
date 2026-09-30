/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = function compileTypeScript(module, filename) {
  let source = fs.readFileSync(filename, "utf8");
  source = source.replace(/from\s+(["'])\.\/([^"']+)\1/g, (_match, quote, target) => `from ${quote}./${target}.ts${quote}`);
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } });
  module._compile(output.outputText, filename);
};
const { authenticateCapabilityActor } = require(path.join(__dirname, "agent-capability-actor.ts"));
const { signServiceRequest } = require(path.join(__dirname, "auth.ts"));
const config = { adminSecret: "admin-secret-at-least-32-characters-long", contactSecret: "contact-secret-at-least-32-characters" };
const time = 1784217600000;
function signed(actor, secret = config.adminSecret) {
  const body = JSON.stringify({ actor, operation: "list_capabilities", payload: {} });
  const stamp = String(time);
  const id = "request_12345678";
  const request = new Request("https://academy.example/api/hermes/capabilities", {
    method: "POST", headers: {
      "x-hermes-timestamp": stamp, "x-hermes-request-id": id,
      "x-hermes-signature": signServiceRequest(body, stamp, id, secret),
    }, body,
  });
  return { request, body };
}

test("signed desktop profile is an admin without a phone identifier", () => {
  const { request, body } = signed({ platform: "hermes_local", source: "desktop" });
  assert.deepEqual(authenticateCapabilityActor(request, body, { platform: "hermes_local", source: "desktop" }, config, time), {
    kind: "profile", source: "desktop", requestId: "request_12345678",
  });
});

test("contact secret or forged platform cannot grant profile-admin capability", () => {
  const profile = { platform: "hermes_local", source: "desktop" };
  const wrongSecret = signed(profile, config.contactSecret);
  assert.equal(authenticateCapabilityActor(wrongSecret.request, wrongSecret.body, profile, config, time), null);
  const forged = { ...profile, userId: "fake-owner" };
  const request = signed(forged);
  assert.equal(authenticateCapabilityActor(request.request, request.body, forged, config, time), null);
  const external = { platform: "whatsapp_cloud", chatId: "84917583553", userId: "84917583553" };
  const externalRequest = signed(external);
  assert.equal(authenticateCapabilityActor(externalRequest.request, externalRequest.body, external, config, time), null);
});

test("existing direct messaging identities retain their separate signing keys", () => {
  const phone = "+84917583553";
  const digest = require("node:crypto").createHash("sha256").update(phone).digest("hex");
  const admin = { platform: "photon", chatId: `any;-;${phone}`, userId: phone };
  const direct = signed(admin);
  assert.deepEqual(authenticateCapabilityActor(direct.request, direct.body, admin, { ...config, adminIMessageDigest: digest }, time), {
    kind: "imessage", stableId: phone, requestId: "request_12345678",
  });
  const contact = { platform: "whatsapp_cloud", chatId: "84917583553", userId: "84917583553" };
  const contactRequest = signed(contact, config.contactSecret);
  assert.deepEqual(authenticateCapabilityActor(contactRequest.request, contactRequest.body, contact, config, time), {
    kind: "whatsapp", e164: phone, requestId: "request_12345678",
  });
});

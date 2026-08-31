/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");
require.extensions[".ts"] = function (module, filename) {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  module._compile(output.outputText, filename);
};

test("service worker never intercepts or caches private fee statements", () => {
  const worker = fs.readFileSync(path.join(__dirname, "../../../public/sw.js"), "utf8");
  assert.match(worker, /url\.pathname\.startsWith\("\/statement\/"\)/);
  const privateGuard = worker.indexOf('url.pathname.startsWith("/statement/")');
  const navigationCache = worker.indexOf('if (request.mode === "navigate")');
  assert.ok(privateGuard > -1 && privateGuard < navigationCache);
});

test("redacts private statement tokens and query strings from analytics", () => {
  const { redactPrivateAnalyticsUrl } = require(path.join(__dirname, "analytics-privacy.ts"));
  assert.equal(redactPrivateAnalyticsUrl("https://example.com/statement/secret-token-123?utm=x"), "https://example.com/statement/private");
  assert.equal(redactPrivateAnalyticsUrl("https://example.com/admin/hermes?tab=statements"), "https://example.com/admin/hermes?tab=statements");
});

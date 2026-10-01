/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const test = require("node:test");
const ts = require("typescript");
for (const extension of [".ts", ".tsx"]) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
const load = Module._load;
Module._load = function(request, parent, isMain) { if (request.startsWith("@/")) return load.call(this, require("node:path").join(__dirname, "../../", request.slice(2)), parent, isMain); return load.call(this, request, parent, isMain); };
const { amountToMinor } = require("./fee-statement-adjustment-amount.ts");
test("amount input converts currency major units to integer minor units", () => {
  assert.equal(amountToMinor("125.50", "USD"), 12550);
  assert.equal(amountToMinor("125", "VND"), 125);
});
test("amount input rejects precision beyond the currency minor unit", () => {
  assert.equal(amountToMinor("1.001", "USD"), null);
  assert.equal(amountToMinor("1.5", "VND"), null);
  assert.equal(amountToMinor("0", "USD"), null);
});

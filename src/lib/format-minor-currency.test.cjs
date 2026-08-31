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

const { formatMinorCurrency } = require(path.join(__dirname, "format-minor-currency.ts"));

test("formats zero-decimal currencies without scaling", () => {
  assert.match(formatMinorCurrency(4_125_000, "VND"), /4,125,000/);
});

test("converts minor units for two-decimal currencies", () => {
  assert.match(formatMinorCurrency(10_000, "USD"), /100\.00/);
});

test("converts minor units for three-decimal currencies", () => {
  assert.match(formatMinorCurrency(12_345, "KWD"), /12\.345/);
});

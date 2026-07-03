const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

require.extensions[".ts"] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  module._compile(output.outputText, filename);
};

const {
  generateTempPassword,
} = require(path.join(__dirname, "generate-temp-password.ts"));

const ALLOWED = /^[A-HJ-NP-Za-hj-km-z2-9]+$/;

test("generates a 10 character password", () => {
  const password = generateTempPassword();
  assert.equal(password.length, 10);
});

test("only uses allowed, non-ambiguous characters", () => {
  const password = generateTempPassword();
  assert.match(password, ALLOWED);
  assert.doesNotMatch(password, /[0O1lI]/);
});

test("always contains at least one uppercase, one lowercase, and one digit", () => {
  for (let i = 0; i < 50; i++) {
    const password = generateTempPassword();
    assert.match(password, /[A-HJ-NP-Z]/, `no uppercase in ${password}`);
    assert.match(password, /[a-hj-km-z]/, `no lowercase in ${password}`);
    assert.match(password, /[2-9]/, `no digit in ${password}`);
  }
});

test("is randomized across calls", () => {
  const passwords = new Set();
  for (let i = 0; i < 20; i++) {
    passwords.add(generateTempPassword());
  }
  assert.ok(passwords.size > 1, "expected more than one unique password across 20 calls");
});

/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
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
  feeStatementPublicUrl,
  feeStatementTokenHash,
} = require(path.join(__dirname, "fee-statement-link.ts"));

const SECRET = "test-only-fee-statement-token-secret-that-is-long-enough";

test("an authorized server can deterministically recover an existing private statement URL", () => {
  const first = feeStatementPublicUrl("fee-statement-2026-08-roddur-v1", {
    secret: SECRET,
    appUrl: "https://academy.example",
  });
  const retry = feeStatementPublicUrl("fee-statement-2026-08-roddur-v1", {
    secret: SECRET,
    appUrl: "https://academy.example/",
  });

  assert.equal(retry.url, first.url);
  assert.equal(retry.tokenHash, first.tokenHash);
  assert.match(first.url, /^https:\/\/academy\.example\/statement\/[A-Za-z0-9_-]{32}$/);
  assert.match(first.tokenHash, /^[a-f0-9]{64}$/);
  assert.equal(feeStatementTokenHash(first.token), first.tokenHash);
});

test("private statement recovery fails closed without a safe HTTPS origin and strong secret", () => {
  for (const appUrl of [undefined, "http://academy.example", "https://academy.example/path", "https://user:pass@academy.example"]) {
    assert.throws(
      () => feeStatementPublicUrl("request-1", { secret: SECRET, appUrl }),
      /capability_execution_unavailable/,
    );
  }
  assert.throws(
    () => feeStatementPublicUrl("request-1", { secret: "too-short", appUrl: "https://academy.example" }),
    /capability_execution_unavailable/,
  );
});

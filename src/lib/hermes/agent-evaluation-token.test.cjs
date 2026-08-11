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

const tokenPath = path.join(__dirname, "agent-evaluation-token.ts");
const secret = "test-secret-that-is-at-least-32-characters";
const claims = {
  requestId: "request-1",
  actorKey: "contact:teacher-1",
  capabilityName: "class.reminder.send",
  capabilityVersion: 1,
  inputDigest: "a".repeat(64),
  relevantVersions: { actor: "4", occurrence: "9" },
  policyVersion: "1",
  issuedAt: 1_786_447_200_000,
  expiresAt: 1_786_447_500_000,
};

test("evaluation tokens bind actor, action, digest, versions, and expiry", () => {
  const { issueEvaluationToken, verifyEvaluationToken } = require(tokenPath);
  const token = issueEvaluationToken(claims, secret);
  assert.deepEqual(verifyEvaluationToken(token, secret, claims.expiresAt - 1), claims);
  assert.throws(() => verifyEvaluationToken(`${token}x`, secret, claims.issuedAt), /invalid_evaluation_token/);
  assert.throws(() => verifyEvaluationToken(token, secret, claims.expiresAt + 1), /expired_evaluation_token/);
});

test("evaluation tokens enforce secret strength and a five-minute maximum lifetime", () => {
  const { issueEvaluationToken } = require(tokenPath);
  assert.throws(() => issueEvaluationToken(claims, "short"), /invalid_evaluation_secret/);
  assert.throws(() => issueEvaluationToken({ ...claims, expiresAt: claims.issuedAt + 300_001 }, secret), /invalid_evaluation_lifetime/);
});

test("persists only a one-way token hash", () => {
  const { hashEvaluationToken, issueEvaluationToken } = require(tokenPath);
  const token = issueEvaluationToken(claims, secret);
  assert.match(hashEvaluationToken(token), /^[a-f0-9]{64}$/);
  assert.notEqual(hashEvaluationToken(token), token);
});

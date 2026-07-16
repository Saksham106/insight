/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } });
  module._compile(output.outputText, filename);
};

const workerPath = path.join(__dirname, "workspace-worker.ts");

test("worker request parser has exact bounded claim schema", () => {
  const { parseWorkerRequest } = require(workerPath);
  assert.deepEqual(parseWorkerRequest({ action: "claim", payload: { workerId: "worker_123", limit: 5 } }), {
    action: "claim", payload: { workerId: "worker_123", limit: 5 },
  });
  assert.deepEqual(parseWorkerRequest({ action: "claim", payload: { workerId: "worker_123" } }), {
    action: "claim", payload: { workerId: "worker_123", limit: 5 },
  });
  assert.throws(() => parseWorkerRequest({ action: "claim", payload: { workerId: "short" } }), /invalid_worker_id/);
  assert.throws(() => parseWorkerRequest({ action: "claim", payload: { workerId: "worker_123", limit: 11 } }), /invalid_claim_limit/);
  assert.throws(() => parseWorkerRequest({ action: "claim", payload: { workerId: "worker_123", extra: true } }), /unexpected_field/);
  assert.throws(() => parseWorkerRequest({ action: "claim", payload: { workerId: "worker_123" }, extra: true }), /unexpected_field/);
});

test("completion requires minimized success result or redacted failure code", () => {
  const { parseWorkerRequest } = require(workerPath);
  const jobId = "16fd2706-8baf-433b-82eb-8c7fada847da";
  assert.deepEqual(parseWorkerRequest({ action: "complete", payload: {
    workerId: "worker_123", jobId, status: "succeeded",
    result: { busy: [{ start: "2026-07-20T09:00:00Z", end: "2026-07-20T10:00:00Z", title: "drop" }], checkedAt: "2026-07-16T12:00:00Z", raw: "drop" },
  } }), { action: "complete", payload: {
    workerId: "worker_123", jobId, status: "succeeded",
    result: { busy: [{ start: "2026-07-20T09:00:00.000Z", end: "2026-07-20T10:00:00.000Z" }], checkedAt: "2026-07-16T12:00:00.000Z" },
  } });
  assert.throws(() => parseWorkerRequest({ action: "complete", payload: { workerId: "worker_123", jobId, status: "succeeded" } }), /invalid_freebusy_result/);
  assert.deepEqual(parseWorkerRequest({ action: "complete", payload: { workerId: "worker_123", jobId, status: "retryable_failed", errorCode: "google_429" } }), {
    action: "complete", payload: { workerId: "worker_123", jobId, status: "retryable_failed", errorCode: "google_429" },
  });
  assert.throws(() => parseWorkerRequest({ action: "complete", payload: { workerId: "worker_123", jobId, status: "cancelled", errorCode: "bad" } }), /invalid_completion_status/);
  assert.throws(() => parseWorkerRequest({ action: "complete", payload: { workerId: "worker_123", jobId, status: "permanent_failed", errorCode: "raw error with spaces" } }), /invalid_error_code/);
  assert.throws(() => parseWorkerRequest({ action: "complete", payload: { workerId: "worker_123", jobId, status: "permanent_failed", errorCode: "safe", result: {} } }), /unexpected_field/);
});

test("claimed jobs are revalidated and projected without database-only fields", () => {
  const { projectClaimedJob } = require(workerPath);
  const projected = projectClaimedJob({
    id: "16fd2706-8baf-433b-82eb-8c7fada847da", case_id: "case-private", job_type: "calendar_freebusy",
    payload: { windows: [{ start: "2026-07-20T09:00:00Z", end: "2026-07-20T10:00:00Z" }], calendarId: "private@example.com" },
    attempt_count: 2, lease_expires_at: "2026-07-16T12:05:00Z", idempotency_key: "private", result: { private: true },
  });
  assert.deepEqual(projected, {
    id: "16fd2706-8baf-433b-82eb-8c7fada847da", caseId: "case-private", jobType: "calendar_freebusy",
    payload: { windows: [{ start: "2026-07-20T09:00:00.000Z", end: "2026-07-20T10:00:00.000Z" }] },
    attemptCount: 2, leaseExpiresAt: "2026-07-16T12:05:00.000Z",
  });
});

test("worker route is separately signed, replay protected, feature gated, and RPC-only", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/app/api/hermes/workspace-jobs/route.ts"), "utf8");
  assert.match(source, /HERMES_WORKSPACE_JOBS_ENABLED/);
  assert.match(source, /HERMES_WORKSPACE_WORKER_SECRET/);
  assert.match(source, /verifyServiceRequest/);
  assert.match(source, /hermes_audit_events/);
  assert.match(source, /request_id/);
  assert.match(source, /claim_hermes_workspace_jobs/);
  assert.match(source, /complete_hermes_workspace_job/);
  assert.doesNotMatch(source, /select\(["']\*["']\)/);
});

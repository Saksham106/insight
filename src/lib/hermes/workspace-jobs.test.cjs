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

const { parseFreeBusyPayload, parseFreeBusyResult, workspaceJobIdempotencyKey } = require(path.join(__dirname, "workspace-jobs.ts"));

test("normalizes bounded freebusy windows and discards extra fields", () => {
  assert.deepEqual(parseFreeBusyPayload({
    windows: [
      { start: "2026-07-20T09:00:00+07:00", end: "2026-07-20T10:00:00+07:00", title: "private" },
      { start: "2026-07-21T09:00:00Z", end: "2026-07-21T10:00:00Z" },
    ],
    timezone: "Asia/Ho_Chi_Minh",
    calendarId: "someone@example.com",
  }), {
    windows: [
      { start: "2026-07-20T02:00:00.000Z", end: "2026-07-20T03:00:00.000Z" },
      { start: "2026-07-21T09:00:00.000Z", end: "2026-07-21T10:00:00.000Z" },
    ],
    timezone: "Asia/Ho_Chi_Minh",
  });
});

test("rejects malformed, empty, excessive, reversed, or overlong freebusy windows", () => {
  assert.throws(() => parseFreeBusyPayload({ windows: [] }), /invalid_freebusy_windows/);
  assert.throws(() => parseFreeBusyPayload({ windows: Array.from({ length: 51 }, () => ({ start: "2026-07-20T09:00:00Z", end: "2026-07-20T10:00:00Z" })) }), /invalid_freebusy_windows/);
  assert.throws(() => parseFreeBusyPayload({ windows: [{ start: "bad", end: "2026-07-20T10:00:00Z" }] }), /invalid_freebusy_window/);
  assert.throws(() => parseFreeBusyPayload({ windows: [{ start: "2026-07-20T10:00:00Z", end: "2026-07-20T09:00:00Z" }] }), /invalid_freebusy_window/);
  assert.throws(() => parseFreeBusyPayload({ windows: [{ start: "2026-07-01T00:00:00Z", end: "2026-08-02T00:00:00Z" }] }), /freebusy_range_too_large/);
  assert.throws(() => parseFreeBusyPayload({ windows: [{ start: "2026-07-20T09:00:00Z", end: "2026-07-20T10:00:00Z" }], timezone: "not a timezone" }), /invalid_timezone/);
});

test("minimizes freebusy results to checked time and valid busy intervals", () => {
  assert.deepEqual(parseFreeBusyResult({
    busy: [{ start: "2026-07-20T09:00:00Z", end: "2026-07-20T10:00:00Z", summary: "Secret meeting" }],
    checkedAt: "2026-07-16T12:00:00Z",
    calendars: { primary: { errors: [], private: "drop" } },
  }), {
    busy: [{ start: "2026-07-20T09:00:00.000Z", end: "2026-07-20T10:00:00.000Z" }],
    checkedAt: "2026-07-16T12:00:00.000Z",
  });
  assert.throws(() => parseFreeBusyResult({ busy: [{ start: "bad", end: "bad" }], checkedAt: "2026-07-16T12:00:00Z" }), /invalid_freebusy_result/);
});

test("builds stable idempotency keys from sorted normalized windows", () => {
  const a = parseFreeBusyPayload({ windows: [
    { start: "2026-07-21T09:00:00Z", end: "2026-07-21T10:00:00Z" },
    { start: "2026-07-20T09:00:00Z", end: "2026-07-20T10:00:00Z" },
  ] });
  const b = parseFreeBusyPayload({ windows: [...a.windows].reverse() });
  assert.equal(workspaceJobIdempotencyKey("case-1", a), workspaceJobIdempotencyKey("case-1", b));
  assert.notEqual(workspaceJobIdempotencyKey("case-1", a), workspaceJobIdempotencyKey("case-2", a));
  assert.match(workspaceJobIdempotencyKey("case-1", a), /^freebusy:[a-f0-9]{64}$/);
});

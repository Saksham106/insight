/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = function compileTypeScript(module, filename) {
  const source = require("node:fs").readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } });
  module._compile(output.outputText, filename);
};

const {
  expandKittySeries,
  kittyClassIdempotencyKey,
  kittyLocalDateTimeToUtc,
  matchKittyOccurrences,
  parseKittyRecurrence,
  requiredDecisionSides,
} = require(path.join(__dirname, "kitty-classes.ts"));

test("normalizes a bounded weekly recurrence without guessing", () => {
  assert.deepEqual(parseKittyRecurrence({ frequency: "weekly", weekdays: [2, 2, 4], localTime: "16:00", intervalWeeks: 1 }), {
    frequency: "weekly",
    weekdays: [2, 4],
    localTime: "16:00",
    intervalWeeks: 1,
  });
  for (const invalid of [
    { frequency: "daily", weekdays: [2], localTime: "16:00", intervalWeeks: 1 },
    { frequency: "weekly", weekdays: [], localTime: "16:00", intervalWeeks: 1 },
    { frequency: "weekly", weekdays: [7], localTime: "16:00", intervalWeeks: 1 },
    { frequency: "weekly", weekdays: [2], localTime: "4pm", intervalWeeks: 1 },
    { frequency: "weekly", weekdays: [2], localTime: "16:00", intervalWeeks: 2 },
  ]) assert.throws(() => parseKittyRecurrence(invalid), /invalid_recurrence/);
});

test("expands Tuesday classes at the same local time across daylight saving", () => {
  const rows = expandKittySeries({
    seriesId: "series-1",
    title: "Maths",
    subject: "Mathematics",
    timezone: "America/New_York",
    recurrence: { frequency: "weekly", weekdays: [2], localTime: "16:00", intervalWeeks: 1 },
    durationMinutes: 60,
    effectiveStart: "2026-03-01",
    effectiveEnd: null,
    fromDate: "2026-03-01",
    throughDate: "2026-03-15",
  });
  assert.deepEqual(rows.map((row) => ({ localDate: row.localDate, startsAt: row.startsAt, endsAt: row.endsAt })), [
    { localDate: "2026-03-03", startsAt: "2026-03-03T21:00:00.000Z", endsAt: "2026-03-03T22:00:00.000Z" },
    { localDate: "2026-03-10", startsAt: "2026-03-10T20:00:00.000Z", endsAt: "2026-03-10T21:00:00.000Z" },
  ]);
  assert.equal(rows[0].occurrenceKey, "series:series-1:2026-03-03");
});

test("matches only the sender's actionable occurrences and prefers exact context", () => {
  const candidates = [
    { id: "science", title: "Science", subject: "Science", startsAt: "2026-08-05T16:00:00.000Z", endsAt: "2026-08-05T17:00:00.000Z", timezone: "UTC", status: "scheduled" },
    { id: "math", title: "Maths", subject: "Mathematics", startsAt: "2026-08-05T14:00:00.000Z", endsAt: "2026-08-05T15:00:00.000Z", timezone: "UTC", status: "scheduled" },
    { id: "old", title: "Maths", subject: "Mathematics", startsAt: "2026-07-01T14:00:00.000Z", endsAt: "2026-07-01T15:00:00.000Z", timezone: "UTC", status: "completed" },
  ];
  assert.deepEqual(matchKittyOccurrences({
    candidates, referenceDate: "2026-08-05", referenceAt: "2026-08-05T12:00:00.000Z",
    query: "my maths class today",
  }).map((row) => row.id), ["math", "science"]);
});

test("candidate matching rejects stale scheduled occurrences", () => {
  const candidates = [
    { id: "stale", title: "Maths", subject: "Mathematics", startsAt: "2026-08-05T10:00:00.000Z", endsAt: "2026-08-05T11:00:00.000Z", timezone: "UTC", status: "scheduled" },
    { id: "live", title: "Maths", subject: "Mathematics", startsAt: "2026-08-05T13:00:00.000Z", endsAt: "2026-08-05T14:00:00.000Z", timezone: "UTC", status: "scheduled" },
  ];
  assert.deepEqual(matchKittyOccurrences({
    candidates, referenceDate: "2026-08-05", referenceAt: "2026-08-05T12:00:00.000Z",
    query: "maths class",
  }).map((row) => row.id), ["live"]);
});

test("requires one teacher side and one configured student side", () => {
  const participants = [
    { decisionSide: "teacher", confirmsCancellation: true, confirmsReschedule: true, isActive: true },
    { decisionSide: "student", confirmsCancellation: false, confirmsReschedule: false, isActive: true },
    { decisionSide: "student", confirmsCancellation: true, confirmsReschedule: true, isActive: true },
  ];
  assert.deepEqual(requiredDecisionSides(participants, "cancel"), ["teacher", "student"]);
  assert.deepEqual(requiredDecisionSides(participants.slice(0, 2), "reschedule"), ["teacher"]);
});

test("builds stable idempotency keys without exposing raw values", () => {
  const first = kittyClassIdempotencyKey(["occurrence-1", "contact-2", "class_cancelled"]);
  assert.equal(first, kittyClassIdempotencyKey(["occurrence-1", "contact-2", "class_cancelled"]));
  assert.match(first, /^kitty-class:[a-f0-9]{64}$/);
  assert.equal(first.includes("contact-2"), false);
});

test("converts a dashboard one-off wall clock in its selected timezone", () => {
  assert.equal(kittyLocalDateTimeToUtc("2026-08-11T16:00", "Asia/Ho_Chi_Minh"), "2026-08-11T09:00:00.000Z");
});

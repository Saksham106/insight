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

const adminPath = path.join(__dirname, "kitty-class-admin.ts");

test("Needs Attention derives every approved detectable reason", () => {
  const { kittyClassAttentionReasons } = require(adminPath);
  const occurrence = { id: "occurrence-1", series_id: "series-1", status: "change_requested" };
  const reasons = kittyClassAttentionReasons(occurrence, [
    { occurrence_id: "occurrence-1", status: "failed" },
    { occurrence_id: "occurrence-1", status: "blocked" },
  ], [
    { id: "expired", occurrenceId: "occurrence-1", seriesId: null, kind: "expired_request" },
    { id: "rejected", occurrenceId: "occurrence-1", seriesId: null, kind: "rejected_proposal" },
    { id: "ambiguous", occurrenceId: "occurrence-1", seriesId: null, kind: "ambiguous_scope" },
    { id: "decision", occurrenceId: null, seriesId: "series-1", kind: "missing_decision_maker" },
  ]);

  assert.deepEqual(reasons, [
    "Pending class change", "Failed delivery", "Delivery reconciliation required",
    "Expired request", "Rejected proposal", "Ambiguous scope", "Missing reschedule decision-maker",
  ]);
});

test("Needs Attention excludes ordinary scheduled classes without issues", () => {
  const { filterKittyAttentionClasses } = require(adminPath);
  const classes = [
    { id: "clear", series_id: null, status: "scheduled" },
    { id: "blocked", series_id: null, status: "scheduled" },
  ];
  assert.deepEqual(
    filterKittyAttentionClasses(classes, [{ occurrence_id: "blocked", status: "blocked" }], []).map((item) => item.id),
    ["blocked"],
  );
});

test("past scheduled attention rows never re-enter Upcoming", () => {
  const { filterKittyClassesForView } = require(adminPath);
  const rows = [
    { id: "past-attention", series_id: null, status: "scheduled", ends_at: "2026-08-01T11:00:00.000Z" },
    { id: "future", series_id: null, status: "scheduled", ends_at: "2026-08-10T11:00:00.000Z" },
  ];
  assert.deepEqual(
    filterKittyClassesForView(rows, "upcoming", "2026-08-05T12:00:00.000Z").map((row) => row.id),
    ["future"],
  );
  assert.deepEqual(
    filterKittyClassesForView(rows, "attention", "2026-08-05T12:00:00.000Z").map((row) => row.id),
    ["past-attention", "future"],
  );
});

test("admin attention loader consumes only bounded structured issue rows", async () => {
  const { loadKittyAdminAttentionIssues } = require(adminPath);
  const calls = [];
  const client = { rpc: async (name, payload) => {
    calls.push({ name, payload });
    return { data: [{
      source_id: "source-1", occurrence_id: "occurrence-1", series_id: null,
      kind: "ambiguous_scope", metadata: { raw: "must not project" },
    }], error: null };
  } };
  const issues = await loadKittyAdminAttentionIssues(client, 25);
  assert.equal(calls[0].name, "get_kitty_class_admin_attention_issues");
  assert.equal(calls[0].payload.p_limit, 25);
  assert.deepEqual(issues, [{ id: "source-1", occurrenceId: "occurrence-1", seriesId: null, kind: "ambiguous_scope" }]);
  assert.doesNotMatch(JSON.stringify(issues), /raw|metadata/);
});

test("multi-roster draft reducer adds and removes students and parents immutably", () => {
  const { reduceKittyEnrollmentDrafts } = require(adminPath);
  const initial = [{ id: 0, parentIds: [] }];
  const withStudent = reduceKittyEnrollmentDrafts(initial, { type: "add_enrollment", id: 1 });
  const withParent = reduceKittyEnrollmentDrafts(withStudent, { type: "add_parent", enrollmentId: 1, parentId: 2 });
  assert.deepEqual(initial, [{ id: 0, parentIds: [] }]);
  assert.deepEqual(withParent, [{ id: 0, parentIds: [] }, { id: 1, parentIds: [2] }]);
  assert.deepEqual(reduceKittyEnrollmentDrafts(withParent, { type: "remove_parent", enrollmentId: 1, parentId: 2 }), [{ id: 0, parentIds: [] }, { id: 1, parentIds: [] }]);
  assert.deepEqual(reduceKittyEnrollmentDrafts(withParent, { type: "remove_enrollment", id: 1 }), [{ id: 0, parentIds: [] }]);
});

test("enrollment timing pins occurrence-only add date and enforces recurring end scope", () => {
  const { normalizeKittyEnrollmentMutationTiming } = require(adminPath);
  assert.deepEqual(normalizeKittyEnrollmentMutationTiming({
    action: "add_enrollment", seriesId: "series-1", localDate: "2026-08-12",
    scope: "occurrence", effectiveDate: "2026-08-20",
  }), { scope: "occurrence", effectiveDate: "2026-08-12" });
  assert.deepEqual(normalizeKittyEnrollmentMutationTiming({
    action: "add_enrollment", seriesId: "series-1", localDate: "2026-08-12",
    scope: "this_and_future", effectiveDate: "2026-08-20",
  }), { scope: "this_and_future", effectiveDate: "2026-08-20" });
  assert.throws(() => normalizeKittyEnrollmentMutationTiming({
    action: "end_enrollment", seriesId: "series-1", localDate: "2026-08-12",
    scope: "occurrence", effectiveDate: "2026-08-12",
  }), /invalid_scope/);
});

test("retry visibility and detail expansion states are executable", () => {
  const { canRetryKittyNotification, shouldLoadKittyOccurrenceDetail } = require(adminPath);
  assert.equal(canRetryKittyNotification("failed"), true);
  for (const status of ["blocked", "pending", "sending", "sent"]) assert.equal(canRetryKittyNotification(status), false);
  assert.equal(shouldLoadKittyOccurrenceDetail({ open: true, hasDetail: false, isLoading: false }), true);
  assert.equal(shouldLoadKittyOccurrenceDetail({ open: false, hasDetail: false, isLoading: false }), false);
  assert.equal(shouldLoadKittyOccurrenceDetail({ open: true, hasDetail: true, isLoading: false }), false);
  assert.equal(shouldLoadKittyOccurrenceDetail({ open: true, hasDetail: true, isLoading: false, force: true }), true);
});

test("admin page filters current and history rows before their independent limits", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/app/(dashboard)/admin/hermes/page.tsx"), "utf8");
  const upcoming = source.indexOf('.in("status", ["scheduled", "change_requested"])');
  const upcomingDate = source.indexOf('.gte("ends_at"', upcoming);
  // Upcoming is bounded to the next five at the query, not sliced in the browser.
  const upcomingLimit = source.indexOf('.limit(KITTY_UPCOMING_CLASS_LIMIT)', upcoming);
  const history = source.indexOf('.in("status", ["completed", "cancelled", "rescheduled"])', upcomingLimit);
  const historyLimit = source.indexOf('.limit(50)', history);
  assert.ok(upcoming >= 0 && upcomingDate > upcoming && upcomingLimit > upcomingDate);
  assert.ok(history > upcomingLimit && historyLimit > history);
  assert.match(source, /attentionOccurrenceIds[\s\S]*\.in\("id", attentionOccurrenceIds\)/);
  assert.doesNotMatch(
    source.slice(upcoming, history),
    /\.limit\(200\)/,
    "the upcoming query must not load 200 rows to show five",
  );
});

function upcomingRow(id, startsAt, overrides = {}) {
  return {
    id,
    series_id: overrides.series_id ?? "series-1",
    status: overrides.status ?? "scheduled",
    starts_at: startsAt,
    ends_at: overrides.ends_at ?? startsAt,
  };
}

test("Upcoming shows only the next five classes when more are eligible", () => {
  const { filterKittyClassesForView, KITTY_UPCOMING_CLASS_LIMIT } = require(adminPath);
  assert.equal(KITTY_UPCOMING_CLASS_LIMIT, 5);
  // Production generates 39 future occurrences from two series; the tab is
  // meant to answer "what is next", not list the whole generated calendar.
  const rows = Array.from({ length: 12 }, (_, index) =>
    upcomingRow(`class-${index}`, `2026-08-1${index % 10}T09:00:00.000Z`),
  );
  const visible = filterKittyClassesForView(rows, "upcoming", "2026-08-05T12:00:00.000Z");
  assert.equal(visible.length, 5);
});

test("Upcoming returns the earliest five in chronological order", () => {
  const { filterKittyClassesForView } = require(adminPath);
  const rows = [
    upcomingRow("sixth", "2026-08-16T09:00:00.000Z"),
    upcomingRow("second", "2026-08-11T09:00:00.000Z"),
    upcomingRow("fifth", "2026-08-15T09:00:00.000Z"),
    upcomingRow("first", "2026-08-10T09:00:00.000Z"),
    upcomingRow("fourth", "2026-08-14T09:00:00.000Z"),
    upcomingRow("third", "2026-08-12T09:00:00.000Z"),
  ];
  assert.deepEqual(
    filterKittyClassesForView(rows, "upcoming", "2026-08-05T12:00:00.000Z").map((row) => row.id),
    ["first", "second", "third", "fourth", "fifth"],
  );
});

test("stale occurrences are excluded before the five-item limit is applied", () => {
  const { filterKittyClassesForView } = require(adminPath);
  // If the limit were applied first, the five past rows would consume the
  // whole list and Upcoming would render nothing.
  const rows = [
    ...Array.from({ length: 5 }, (_, index) => upcomingRow(`past-${index}`, `2026-08-0${index + 1}T09:00:00.000Z`)),
    upcomingRow("future-1", "2026-08-10T09:00:00.000Z"),
    upcomingRow("future-2", "2026-08-11T09:00:00.000Z"),
  ];
  assert.deepEqual(
    filterKittyClassesForView(rows, "upcoming", "2026-08-09T12:00:00.000Z").map((row) => row.id),
    ["future-1", "future-2"],
  );
});

test("a cancelled future occurrence does not take one of the five slots", () => {
  const { filterKittyClassesForView } = require(adminPath);
  const rows = [
    upcomingRow("cancelled", "2026-08-10T09:00:00.000Z", { status: "cancelled" }),
    upcomingRow("kept", "2026-08-11T09:00:00.000Z"),
  ];
  assert.deepEqual(
    filterKittyClassesForView(rows, "upcoming", "2026-08-05T12:00:00.000Z").map((row) => row.id),
    ["kept"],
  );
});

test("Upcoming does not deduplicate occurrences that share a series", () => {
  const { filterKittyClassesForView } = require(adminPath);
  // Upcoming is an occurrence view: two sittings of the same weekly class are
  // two rows. The five-item limit is the simplification, not deduplication.
  const rows = [
    upcomingRow("week-1", "2026-08-10T09:00:00.000Z", { series_id: "series-a" }),
    upcomingRow("week-2", "2026-08-17T09:00:00.000Z", { series_id: "series-a" }),
  ];
  assert.deepEqual(
    filterKittyClassesForView(rows, "upcoming", "2026-08-05T12:00:00.000Z").map((row) => row.id),
    ["week-1", "week-2"],
  );
});

test("the attention view is not capped at five and still reaches past rows", () => {
  const { filterKittyClassesForView } = require(adminPath);
  // Needs Attention must be able to show an affected occurrence even when it
  // is not one of the five upcoming rows.
  const rows = Array.from({ length: 9 }, (_, index) =>
    upcomingRow(`class-${index}`, `2026-08-0${index + 1}T09:00:00.000Z`),
  );
  const attention = filterKittyClassesForView(rows, "attention", "2026-08-05T12:00:00.000Z");
  assert.equal(attention.length, 9);
});

test("History stays newest-first and is not capped at five", () => {
  const { filterKittyClassesForView } = require(adminPath);
  const rows = [
    upcomingRow("older", "2026-07-01T09:00:00.000Z", { status: "completed" }),
    upcomingRow("newest", "2026-07-20T09:00:00.000Z", { status: "completed" }),
    ...Array.from({ length: 6 }, (_, index) =>
      upcomingRow(`mid-${index}`, `2026-07-1${index}T09:00:00.000Z`, { status: "cancelled" }),
    ),
  ];
  const history = filterKittyClassesForView(rows, "history", "2026-08-05T12:00:00.000Z");
  assert.equal(history.length, 8);
  assert.equal(history[0].id, "newest");
  assert.equal(history[history.length - 1].id, "older");
});

test("filtering for a view never mutates the caller's array", () => {
  const { filterKittyClassesForView } = require(adminPath);
  const rows = [
    upcomingRow("b", "2026-08-11T09:00:00.000Z"),
    upcomingRow("a", "2026-08-10T09:00:00.000Z"),
  ];
  filterKittyClassesForView(rows, "upcoming", "2026-08-05T12:00:00.000Z");
  assert.deepEqual(rows.map((row) => row.id), ["b", "a"], "sorting must not reorder the input");
});

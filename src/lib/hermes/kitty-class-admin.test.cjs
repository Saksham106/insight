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
  const upcomingLimit = source.indexOf('.limit(200)', upcoming);
  const history = source.indexOf('.in("status", ["completed", "cancelled", "rescheduled"])', upcomingLimit);
  const historyLimit = source.indexOf('.limit(50)', history);
  assert.ok(upcoming >= 0 && upcomingDate > upcoming && upcomingLimit > upcomingDate);
  assert.ok(history > upcomingLimit && historyLimit > history);
  assert.match(source, /attentionOccurrenceIds[\s\S]*\.in\("id", attentionOccurrenceIds\)/);
});

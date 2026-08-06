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

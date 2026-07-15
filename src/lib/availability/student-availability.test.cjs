const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

require.extensions[".ts"] = function compileTypeScript(module, filename) {
  let source = fs.readFileSync(filename, "utf8");
  const fileDir = path.dirname(filename);
  const resolveAlias = (importPath) => {
    if (importPath.startsWith("@/")) {
      let current = fileDir;
      while (current !== "/" && !fs.existsSync(path.join(current, "src"))) {
        current = path.dirname(current);
      }
      const srcDir = path.join(current, "src");
      const absolutePath = path.join(srcDir, importPath.slice(2));
      const relativePath = path.relative(fileDir, absolutePath);
      return relativePath.startsWith(".") ? relativePath : "./" + relativePath;
    }
    return importPath;
  };
  source = source.replace(/from\s+["'](@\/[^"']+)["']/g, (match, importPath) => {
    const resolved = resolveAlias(importPath);
    return match.replace(importPath, resolved);
  });
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
  studentHasAvailability,
  studentAvailableIntervals,
  filterSlotsByStudentAvailability,
} = require(path.join(__dirname, "student-availability.ts"));

const TZ = "UTC";

function rule(weekday, start, end, extra = {}) {
  return { id: `r-${weekday}-${start}`, weekday, start_time: start, end_time: end, timezone: TZ, is_active: true, rule_type: "available", ...extra };
}
function slot(startIso, endIso) {
  return { starts_at: startIso, ends_at: endIso, duration_minutes: 60 };
}

// 2026-07-15 is a Wednesday (weekday 3) in UTC.
const from = new Date("2026-07-15T00:00:00Z");
const to = new Date("2026-07-16T00:00:00Z");

test("studentHasAvailability is false with no rules/overrides", () => {
  assert.equal(studentHasAvailability([], []), false);
});

test("studentHasAvailability is true with an active available rule", () => {
  assert.equal(studentHasAvailability([rule(3, "09:00", "12:00")], []), true);
});

test("studentHasAvailability is true when only an override exists", () => {
  const ov = { id: "o1", date: "2026-07-15", start_time: null, end_time: null, timezone: TZ, is_available: false, reason: null };
  assert.equal(studentHasAvailability([], [ov]), true);
});

test("available rule produces an interval on the matching weekday", () => {
  const intervals = studentAvailableIntervals([rule(3, "09:00", "12:00")], [], TZ, from, to);
  assert.equal(intervals.length, 1);
  assert.equal(intervals[0].start.toISOString(), "2026-07-15T09:00:00.000Z");
  assert.equal(intervals[0].end.toISOString(), "2026-07-15T12:00:00.000Z");
});

test("a whole-day-off override removes availability for that date", () => {
  const ov = { id: "o1", date: "2026-07-15", start_time: null, end_time: null, timezone: TZ, is_available: false, reason: null };
  const intervals = studentAvailableIntervals([rule(3, "09:00", "12:00")], [ov], TZ, from, to);
  assert.equal(intervals.length, 0);
});

test("filter keeps only slots fully inside an available interval", () => {
  const intervals = studentAvailableIntervals([rule(3, "09:00", "12:00")], [], TZ, from, to);
  const slots = [
    slot("2026-07-15T09:00:00.000Z", "2026-07-15T10:00:00.000Z"), // inside
    slot("2026-07-15T11:30:00.000Z", "2026-07-15T12:30:00.000Z"), // runs past window end
    slot("2026-07-15T13:00:00.000Z", "2026-07-15T14:00:00.000Z"), // after window
  ];
  const kept = filterSlotsByStudentAvailability(slots, intervals);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].starts_at, "2026-07-15T09:00:00.000Z");
});

test("filter with no intervals keeps nothing", () => {
  const slots = [slot("2026-07-15T09:00:00.000Z", "2026-07-15T10:00:00.000Z")];
  assert.equal(filterSlotsByStudentAvailability(slots, []).length, 0);
});

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

require.extensions[".ts"] = function compileTypeScript(module, filename) {
  let source = fs.readFileSync(filename, "utf8");

  // Resolve @/ path aliases to relative paths for runtime
  const fileDir = path.dirname(filename);
  const resolveAlias = (importPath) => {
    if (importPath.startsWith("@/")) {
      // Find the src directory by walking up from the current file
      let current = fileDir;
      while (current !== "/" && !fs.existsSync(path.join(current, "src"))) {
        current = path.dirname(current);
      }
      const srcDir = path.join(current, "src");

      // Construct the absolute path to the imported module
      const absolutePath = path.join(srcDir, importPath.slice(2));

      // Compute relative path from file's directory to the imported module
      const relativePath = path.relative(fileDir, absolutePath);
      return relativePath.startsWith(".") ? relativePath : "./" + relativePath;
    }
    return importPath;
  };

  // Replace all @/ imports with resolved paths
  source = source.replace(
    /from\s+["'](@\/[^"']+)["']/g,
    (match, importPath) => {
      const resolved = resolveAlias(importPath);
      return match.replace(importPath, resolved);
    }
  );

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
  zoneOffsetMinutes,
  zonedTimeToUtc,
  utcToZonedParts,
  dateKeyInZone,
  dateKeysInZone,
  weekdayInZone,
} = require(path.join(__dirname, "timezone.ts"));

test("zoneOffsetMinutes: Toronto is UTC-4 in July (DST)", () => {
  assert.equal(zoneOffsetMinutes(new Date("2026-07-14T16:00:00Z"), "America/Toronto"), -240);
});

test("zoneOffsetMinutes: Toronto is UTC-5 in January (standard)", () => {
  assert.equal(zoneOffsetMinutes(new Date("2026-01-14T16:00:00Z"), "America/Toronto"), -300);
});

test("zoneOffsetMinutes: Kolkata is UTC+5:30", () => {
  assert.equal(zoneOffsetMinutes(new Date("2026-07-14T06:00:00Z"), "Asia/Kolkata"), 330);
});

test("zonedTimeToUtc: 9am Toronto in July resolves to 13:00 UTC", () => {
  assert.equal(zonedTimeToUtc("2026-07-14", "09:00", "America/Toronto").toISOString(), "2026-07-14T13:00:00.000Z");
});

test("zonedTimeToUtc: 9am Kolkata resolves to 03:30 UTC", () => {
  assert.equal(zonedTimeToUtc("2026-07-14", "09:00", "Asia/Kolkata").toISOString(), "2026-07-14T03:30:00.000Z");
});

test("zonedTimeToUtc: accepts HH:MM:SS from a Postgres time column", () => {
  assert.equal(zonedTimeToUtc("2026-07-14", "09:00:00", "America/Toronto").toISOString(), "2026-07-14T13:00:00.000Z");
});

test("zonedTimeToUtc: UTC is identity", () => {
  assert.equal(zonedTimeToUtc("2026-07-14", "09:00", "UTC").toISOString(), "2026-07-14T09:00:00.000Z");
});

test("zonedTimeToUtc: spring-forward gap (2:30am does not exist) resolves forward", () => {
  // US DST 2026 starts Sun Mar 8; clocks jump 2:00 -> 3:00 local.
  const iso = zonedTimeToUtc("2026-03-08", "02:30", "America/Toronto").toISOString();
  // 2:30 EST would be 07:30Z; because the wall time is skipped it lands at 3:30 EDT = 07:30Z as well.
  assert.equal(iso, "2026-03-08T07:30:00.000Z");
});

test("zonedTimeToUtc: fall-back ambiguous time resolves to the earlier instant", () => {
  // US DST 2026 ends Sun Nov 1; 1:30am occurs twice. Earlier is EDT (UTC-4) = 05:30Z.
  const iso = zonedTimeToUtc("2026-11-01", "01:30", "America/Toronto").toISOString();
  assert.equal(iso, "2026-11-01T05:30:00.000Z");
});

test("utcToZonedParts: reads local wall clock and weekday", () => {
  const p = utcToZonedParts(new Date("2026-07-14T13:00:00Z"), "America/Toronto");
  assert.deepEqual(p, { year: 2026, month: 7, day: 14, hour: 9, minute: 0, weekday: 2 }); // Tue
});

test("dateKeyInZone: instant near midnight belongs to the zone's date", () => {
  // 03:30Z on Jul 14 is still Jul 13, 23:30 in Toronto.
  assert.equal(dateKeyInZone(new Date("2026-07-14T03:30:00Z"), "America/Toronto"), "2026-07-13");
});

test("dateKeysInZone: inclusive span across two zone-local days", () => {
  const keys = dateKeysInZone(new Date("2026-07-14T00:00:00Z"), new Date("2026-07-16T00:00:00Z"), "America/Toronto");
  assert.deepEqual(keys, ["2026-07-13", "2026-07-14", "2026-07-15"]);
});

test("weekdayInZone: 2026-07-14 is Tuesday", () => {
  assert.equal(weekdayInZone("2026-07-14", "America/Toronto"), 2);
});

test("zonedTimeToUtc: fall-back in a non-negative-offset zone resolves to the earlier instant", () => {
  // Europe/London DST ends 2026-10-25; 01:30 occurs twice. Earlier is BST (UTC+1) = 00:30Z.
  assert.equal(zonedTimeToUtc("2026-10-25", "01:30", "Europe/London").toISOString(), "2026-10-25T00:30:00.000Z");
});

test("zonedTimeToUtc: spring-forward gap in Europe/London resolves forward", () => {
  // Europe/London DST starts 2026-03-29; clocks jump 01:00->02:00 local, so 01:30 is skipped.
  // Both raw candidates land at 01:30Z; forward resolution keeps 01:30Z (now BST).
  assert.equal(zonedTimeToUtc("2026-03-29", "01:30", "Europe/London").toISOString(), "2026-03-29T01:30:00.000Z");
});

test("zoneOffsetMinutes: correct for an instant with seconds >= 30", () => {
  // Sub-minute seconds must not shift the offset; Toronto stays UTC-4 in July.
  assert.equal(zoneOffsetMinutes(new Date("2026-07-14T16:00:45Z"), "America/Toronto"), -240);
});

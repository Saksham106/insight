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

const { generateAvailabilitySlots } = require(path.join(__dirname, "slot-engine.ts"));

function localTimes(slots) {
  return slots.map((slot) => {
    const date = new Date(slot.starts_at);
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  });
}

const settings = {
  teacher_id: "teacher-1",
  default_duration_minutes: 60,
  allowed_durations: [30, 60],
  buffer_before_minutes: 0,
  buffer_after_minutes: 0,
  minimum_notice_hours: 0,
  max_days_ahead: 30,
  auto_confirm: true,
};

const mondayRule = {
  id: "rule-1",
  teacher_id: "teacher-1",
  weekday: 1,
  start_time: "09:00",
  end_time: "11:00",
  timezone: "America/New_York",
  is_active: true,
};

test("expands a weekly rule into 15-minute stepped slots", () => {
  const slots = generateAvailabilitySlots({
    settings,
    rules: [mondayRule],
    overrides: [],
    busySessions: [],
    durationMinutes: 60,
    from: new Date("2026-07-13T00:00:00"),
    to: new Date("2026-07-13T23:59:59"),
    now: new Date("2026-07-12T00:00:00"),
  });

  assert.deepEqual(localTimes(slots), ["09:00", "09:15", "09:30", "09:45", "10:00"]);
});

test("removes slots overlapping busy sessions", () => {
  const mondayRuleWide = {
    ...mondayRule,
    end_time: "12:00",
  };
  const busyStart = new Date(2026, 6, 13, 9, 30).toISOString();
  const slots = generateAvailabilitySlots({
    settings,
    rules: [mondayRuleWide],
    overrides: [],
    busySessions: [{ id: "session-1", scheduled_at: busyStart, duration_minutes: 60 }],
    durationMinutes: 60,
    from: new Date("2026-07-13T00:00:00"),
    to: new Date("2026-07-13T23:59:59"),
    now: new Date("2026-07-12T00:00:00"),
  });

  assert.deepEqual(localTimes(slots), ["10:30", "10:45", "11:00"]);
});

test("full-day unavailable override removes the day", () => {
  const slots = generateAvailabilitySlots({
    settings,
    rules: [mondayRule],
    overrides: [{
      id: "override-1",
      teacher_id: "teacher-1",
      date: "2026-07-13",
      start_time: null,
      end_time: null,
      timezone: "America/New_York",
      is_available: false,
      reason: null,
    }],
    busySessions: [],
    durationMinutes: 60,
    from: new Date("2026-07-13T00:00:00"),
    to: new Date("2026-07-13T23:59:59"),
    now: new Date("2026-07-12T00:00:00"),
  });

  assert.equal(slots.length, 0);
});

test("available override adds slots on a day without a recurring rule", () => {
  const slots = generateAvailabilitySlots({
    settings,
    rules: [],
    overrides: [{
      id: "override-1",
      teacher_id: "teacher-1",
      date: "2026-07-14",
      start_time: "14:00",
      end_time: "15:00",
      timezone: "America/New_York",
      is_available: true,
      reason: null,
    }],
    busySessions: [],
    durationMinutes: 30,
    from: new Date("2026-07-14T00:00:00"),
    to: new Date("2026-07-14T23:59:59"),
    now: new Date("2026-07-12T00:00:00"),
  });

  assert.deepEqual(localTimes(slots), ["14:00", "14:15", "14:30"]);
});

test("partial unavailable override splits the window around the block", () => {
  const mondayRuleWide = {
    ...mondayRule,
    start_time: "09:00",
    end_time: "17:00",
  };
  const slots = generateAvailabilitySlots({
    settings,
    rules: [mondayRuleWide],
    overrides: [{
      id: "override-1",
      teacher_id: "teacher-1",
      date: "2026-07-13",
      start_time: "12:00",
      end_time: "13:00",
      timezone: "America/New_York",
      is_available: false,
      reason: null,
    }],
    busySessions: [],
    durationMinutes: 30,
    from: new Date("2026-07-13T00:00:00"),
    to: new Date("2026-07-13T23:59:59"),
    now: new Date("2026-07-12T00:00:00"),
  });

  const times = localTimes(slots);

  // Slots before the block remain, including one ending exactly at the block start.
  assert.ok(times.includes("11:30"));
  // Slots after the block remain, including one starting exactly at the block end.
  assert.ok(times.includes("13:00"));
  // No slot overlaps the 12:00-13:00 blocked segment.
  for (const time of times) {
    const [hour, minute] = time.split(":").map(Number);
    const minutesFromMidnight = hour * 60 + minute;
    const overlapsBlock = minutesFromMidnight < 13 * 60 && minutesFromMidnight + 30 > 12 * 60;
    assert.equal(overlapsBlock, false, `slot at ${time} overlaps the blocked segment`);
  }
});

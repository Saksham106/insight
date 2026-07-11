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

const baseSettings = {
  teacher_id: "teacher-1",
  default_duration_minutes: 60,
  allowed_durations: [30, 60],
  buffer_before_minutes: 0,
  buffer_after_minutes: 0,
  minimum_notice_hours: 0,
  max_days_ahead: 30,
  auto_confirm: true,
  availability_mode: "open",
  open_day_start: "08:00",
  open_day_end: "20:00",
  timezone: "UTC",
  slot_increment_minutes: 30,
};

// A single UTC day. Slot starts are asserted as HH:MM in UTC.
function utcTimes(slots) {
  return slots.map((s) => s.starts_at.slice(11, 16));
}

const JUL14 = { from: new Date("2026-07-14T00:00:00Z"), to: new Date("2026-07-15T00:00:00Z"), now: new Date("2026-07-01T00:00:00Z") };

test("open mode with no rules is bookable across the envelope", () => {
  const slots = generateAvailabilitySlots({
    settings: baseSettings, rules: [], overrides: [], busySessions: [],
    durationMinutes: 60, teacherTimeZone: "UTC", ...JUL14,
  });
  const times = utcTimes(slots);
  assert.equal(times[0], "08:00");            // envelope start
  assert.equal(times.includes("19:00"), true); // last 60-min slot fits (ends 20:00)
  assert.equal(times.includes("19:30"), false); // would end 20:30, past envelope
  assert.equal(times.includes("07:30"), false); // before envelope
});

test("open mode: slot_increment_minutes controls slot starts", () => {
  const slots = generateAvailabilitySlots({
    settings: { ...baseSettings, slot_increment_minutes: 60 },
    rules: [], overrides: [], busySessions: [],
    durationMinutes: 60, teacherTimeZone: "UTC", ...JUL14,
  });
  assert.deepEqual(utcTimes(slots).slice(0, 3), ["08:00", "09:00", "10:00"]);
});

test("open mode: a blocked weekly rule carves a hole", () => {
  // 2026-07-14 is a Tuesday (weekday 2).
  const slots = generateAvailabilitySlots({
    settings: baseSettings,
    rules: [{ id: "r1", teacher_id: "teacher-1", weekday: 2, start_time: "12:00", end_time: "13:00", timezone: "UTC", is_active: true, rule_type: "blocked" }],
    overrides: [], busySessions: [],
    durationMinutes: 30, teacherTimeZone: "UTC", ...JUL14,
  });
  const times = utcTimes(slots);
  assert.equal(times.includes("11:30"), true);  // ends 12:00, ok
  assert.equal(times.includes("12:00"), false); // inside block
  assert.equal(times.includes("12:30"), false); // inside block
  assert.equal(times.includes("13:00"), true);  // block end, ok
});

test("open mode: untimed unavailable override clears the whole day", () => {
  const slots = generateAvailabilitySlots({
    settings: baseSettings, rules: [],
    overrides: [{ id: "o1", teacher_id: "teacher-1", date: "2026-07-14", start_time: null, end_time: null, timezone: "UTC", is_available: false, reason: null }],
    busySessions: [], durationMinutes: 60, teacherTimeZone: "UTC", ...JUL14,
  });
  assert.equal(slots.length, 0);
});

test("open mode: available override adds a window outside the envelope", () => {
  const slots = generateAvailabilitySlots({
    settings: baseSettings, rules: [],
    overrides: [{ id: "o1", teacher_id: "teacher-1", date: "2026-07-14", start_time: "06:00", end_time: "07:00", timezone: "UTC", is_available: true, reason: null }],
    busySessions: [], durationMinutes: 30, teacherTimeZone: "UTC", ...JUL14,
  });
  const times = utcTimes(slots);
  assert.equal(times.includes("06:00"), true);
  assert.equal(times.includes("06:30"), true);
});

test("blocked rule beats an available override on the same range", () => {
  const slots = generateAvailabilitySlots({
    settings: baseSettings,
    rules: [{ id: "r1", teacher_id: "teacher-1", weekday: 2, start_time: "10:00", end_time: "11:00", timezone: "UTC", is_active: true, rule_type: "blocked" }],
    overrides: [{ id: "o1", teacher_id: "teacher-1", date: "2026-07-14", start_time: "10:00", end_time: "11:00", timezone: "UTC", is_available: true, reason: null }],
    busySessions: [], durationMinutes: 30, teacherTimeZone: "UTC", ...JUL14,
  });
  const times = utcTimes(slots);
  assert.equal(times.includes("10:00"), false);
  assert.equal(times.includes("10:30"), false);
});

test("restricted mode with no rules yields nothing", () => {
  const slots = generateAvailabilitySlots({
    settings: { ...baseSettings, availability_mode: "restricted" },
    rules: [], overrides: [], busySessions: [],
    durationMinutes: 60, teacherTimeZone: "UTC", ...JUL14,
  });
  assert.equal(slots.length, 0);
});

test("restricted mode honors an available rule", () => {
  const slots = generateAvailabilitySlots({
    settings: { ...baseSettings, availability_mode: "restricted" },
    rules: [{ id: "r1", teacher_id: "teacher-1", weekday: 2, start_time: "09:00", end_time: "11:00", timezone: "UTC", is_active: true, rule_type: "available" }],
    overrides: [], busySessions: [],
    durationMinutes: 60, teacherTimeZone: "UTC", ...JUL14,
  });
  assert.deepEqual(utcTimes(slots), ["09:00", "09:30", "10:00"]);
});

test("busy sessions block overlapping slots with buffers", () => {
  const slots = generateAvailabilitySlots({
    settings: { ...baseSettings, buffer_after_minutes: 15 },
    rules: [], overrides: [],
    busySessions: [{ id: "s1", scheduled_at: "2026-07-14T10:00:00Z", duration_minutes: 60 }],
    durationMinutes: 30, teacherTimeZone: "UTC", ...JUL14,
  });
  const times = utcTimes(slots);
  assert.equal(times.includes("09:30"), true); // ends exactly at 10:00 (buffer_before=0) — adjacent, not overlapping
  assert.equal(times.includes("10:00"), false);
  assert.equal(times.includes("11:00"), false); // inside 15-min after-buffer (ends 11:15)
  assert.equal(times.includes("11:30"), true);  // clear of buffer
});

test("minimum notice removes near-term slots", () => {
  const slots = generateAvailabilitySlots({
    settings: { ...baseSettings, minimum_notice_hours: 12 },
    rules: [], overrides: [], busySessions: [],
    durationMinutes: 60, teacherTimeZone: "UTC",
    from: new Date("2026-07-14T00:00:00Z"), to: new Date("2026-07-15T00:00:00Z"),
    now: new Date("2026-07-14T09:00:00Z"), // +12h = 21:00, past the envelope
  });
  assert.equal(slots.length, 0);
});

test("max days ahead clamps the range", () => {
  const slots = generateAvailabilitySlots({
    settings: { ...baseSettings, max_days_ahead: 1 },
    rules: [], overrides: [], busySessions: [],
    durationMinutes: 60, teacherTimeZone: "UTC",
    from: new Date("2026-07-14T00:00:00Z"), to: new Date("2026-07-20T00:00:00Z"),
    now: new Date("2026-07-14T00:00:00Z"),
  });
  // Only Jul 14 (now+1 day) is in range.
  const days = new Set(slots.map((s) => s.starts_at.slice(0, 10)));
  assert.deepEqual([...days], ["2026-07-14"]);
});

test("honors the teacher timezone: Toronto 08:00 envelope starts at 12:00 UTC in July", () => {
  const slots = generateAvailabilitySlots({
    settings: { ...baseSettings, timezone: "America/Toronto" },
    rules: [], overrides: [], busySessions: [],
    durationMinutes: 60, teacherTimeZone: "America/Toronto",
    from: new Date("2026-07-14T00:00:00Z"), to: new Date("2026-07-16T00:00:00Z"),
    now: new Date("2026-07-01T00:00:00Z"),
  });
  // First Toronto slot of Jul 14 is 08:00 EDT = 12:00Z.
  const first = slots.find((s) => s.starts_at.startsWith("2026-07-14"));
  assert.equal(first.starts_at, "2026-07-14T12:00:00.000Z");
});

test("slot starts are aligned to the window regardless of now's seconds", () => {
  const base = {
    settings: baseSettings, rules: [], overrides: [], busySessions: [],
    durationMinutes: 60, teacherTimeZone: "UTC",
    from: new Date("2026-07-14T00:00:00Z"), to: new Date("2026-07-15T00:00:00Z"),
  };
  const a = generateAvailabilitySlots({ ...base, now: new Date("2026-07-14T00:00:00.000Z") });
  const b = generateAvailabilitySlots({ ...base, now: new Date("2026-07-14T00:00:37.512Z") });
  // Every slot starts on a clean 30-min boundary (no stray seconds/millis).
  for (const s of a) assert.ok(s.starts_at.endsWith(":00.000Z"), `unaligned: ${s.starts_at}`);
  // And the sub-minute jitter in `now` doesn't change the slot set.
  assert.deepEqual(a.map(s => s.starts_at), b.map(s => s.starts_at));
});

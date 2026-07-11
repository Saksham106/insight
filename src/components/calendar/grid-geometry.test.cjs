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

const g = require(path.join(__dirname, "grid-geometry.ts"));

test("minutesToY / yToMinutes round-trip", () => {
  // day starts at 07:00 (420), 1px per minute
  assert.equal(g.minutesToY(480, 420, 1), 60);   // 08:00 -> 60px
  assert.equal(g.yToMinutes(60, 420, 1), 480);
});

test("snap rounds to nearest increment", () => {
  assert.equal(g.snap(487, 15), 480);
  assert.equal(g.snap(493, 15), 495);
});

test("clampMinutes keeps values inside the day bounds", () => {
  assert.equal(g.clampMinutes(300, 420, 1260), 420);
  assert.equal(g.clampMinutes(1300, 420, 1260), 1260);
  assert.equal(g.clampMinutes(600, 420, 1260), 600);
});

test("minutesOfDay reads local wall clock", () => {
  assert.equal(g.minutesOfDay(new Date(2026, 6, 14, 9, 30)), 570);
});

test("dayIndex is the column offset from weekStart", () => {
  const weekStart = new Date(2026, 6, 12); // Sun Jul 12
  assert.equal(g.dayIndex(new Date(2026, 6, 12, 10, 0), weekStart), 0);
  assert.equal(g.dayIndex(new Date(2026, 6, 14, 10, 0), weekStart), 2);
});

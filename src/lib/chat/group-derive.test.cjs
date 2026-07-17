const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

// Compile the sibling .ts on require, mirroring calendar/grid-geometry.test.cjs.
require.extensions[".ts"] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  module._compile(output.outputText, filename);
};

const g = require(path.join(__dirname, "group-derive.ts"));

test("derivePairs makes every teacher x student pair, ignoring parents", () => {
  const pairs = g.derivePairs([
    { id: "t1", role: "teacher" },
    { id: "t2", role: "teacher" },
    { id: "s1", role: "student" },
    { id: "p1", role: "parent" },
  ]);
  assert.deepStrictEqual(
    new Set(pairs.map((p) => `${p.teacherId}:${p.studentId}`)),
    new Set(["t1:s1", "t2:s1"]),
  );
});

test("derivePairs returns [] when no teacher or no student", () => {
  assert.deepStrictEqual(g.derivePairs([{ id: "s1", role: "student" }]), []);
  assert.deepStrictEqual(g.derivePairs([{ id: "t1", role: "teacher" }]), []);
});

test("suggestGroupTitle joins first names and truncates past three", () => {
  assert.equal(g.suggestGroupTitle(["Ms. Lee", "Aryan Patel"]), "Ms., Aryan");
  assert.equal(
    g.suggestGroupTitle(["Ann B", "Cal D", "Eve F", "Gus H"]),
    "Ann, Cal, Eve +1",
  );
  assert.equal(g.suggestGroupTitle([]), "Group");
});

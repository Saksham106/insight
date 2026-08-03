const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

// Compile the sibling .ts on require, mirroring conversation-shape.test.cjs.
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

const r = require(path.join(__dirname, "roster-key.ts"));

test("rosterKey ignores the order ids arrive in", () => {
  assert.equal(r.rosterKey(["b", "a", "c"]), r.rosterKey(["c", "a", "b"]));
});

test("rosterKey collapses repeated ids", () => {
  assert.equal(r.rosterKey(["a", "b", "a"]), r.rosterKey(["a", "b"]));
});

test("rosterKey separates ids so neighbours cannot be confused", () => {
  // Without a separator "ab" + "c" and "a" + "bc" would collide and two
  // unrelated pairs would be treated as the same conversation.
  assert.notEqual(r.rosterKey(["ab", "c"]), r.rosterKey(["a", "bc"]));
});

test("rosterKey distinguishes rosters that differ by one person", () => {
  assert.notEqual(r.rosterKey(["a", "b"]), r.rosterKey(["a", "b", "c"]));
  assert.notEqual(r.rosterKey(["a", "b"]), r.rosterKey(["a", "c"]));
});

test("rosterKey of an empty roster is empty", () => {
  assert.equal(r.rosterKey([]), "");
});

test("sameRoster is true for the same people in any order or arity", () => {
  assert.equal(r.sameRoster(["a", "b", "c"], ["c", "b", "a"]), true);
  assert.equal(r.sameRoster(["a", "a", "b"], ["b", "a"]), true);
});

test("sameRoster is false once the people differ", () => {
  assert.equal(r.sameRoster(["a", "b"], ["a", "b", "c"]), false);
  assert.equal(r.sameRoster(["a", "b"], ["a", "c"]), false);
  assert.equal(r.sameRoster(["a", "b"], []), false);
});

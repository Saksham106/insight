const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

// Compile the sibling .ts on require, mirroring group-derive.test.cjs.
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

const s = require(path.join(__dirname, "conversation-shape.ts"));

test("isGroupConversation is true only above two members", () => {
  assert.equal(s.isGroupConversation(0), false);
  assert.equal(s.isGroupConversation(1), false);
  assert.equal(s.isGroupConversation(2), false);
  assert.equal(s.isGroupConversation(3), true);
  assert.equal(s.isGroupConversation(9), true);
});

test("isDirectConversationKey matches exactly two members with no title", () => {
  assert.equal(s.isDirectConversationKey(2, null), true);
  assert.equal(s.isDirectConversationKey(2, ""), true);
  assert.equal(s.isDirectConversationKey(2, "   "), true);
});

test("isDirectConversationKey rejects a deliberately named pair", () => {
  assert.equal(s.isDirectConversationKey(2, "Algebra tutoring"), false);
});

test("isDirectConversationKey rejects rosters that are not exactly two", () => {
  assert.equal(s.isDirectConversationKey(1, null), false);
  assert.equal(s.isDirectConversationKey(3, null), false);
});

test("hasMinimumRoster requires two people", () => {
  assert.equal(s.hasMinimumRoster(0), false);
  assert.equal(s.hasMinimumRoster(1), false);
  assert.equal(s.hasMinimumRoster(2), true);
  assert.equal(s.hasMinimumRoster(5), true);
});

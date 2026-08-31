/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = function compileTypeScript(module, filename) {
  let source = fs.readFileSync(filename, "utf8");
  // The tab id type is a compile-time-only import from a .tsx component; drop
  // it so this module can be executed on its own.
  source = source.replace(/^import type .*$/gm, "");
  source = source.replace(/from\s+["']\.\/([^"']+)["']/g, (match, target) =>
    match.replace(`./${target}`, `./${target}.ts`),
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

const { buildHermesTabs } = require(path.join(__dirname, "admin-tabs.ts"));

const COUNTS = { ledgerItems: 4, openSchedulingCases: 3, attentionItems: 2 };
const byId = (id) => buildHermesTabs(COUNTS).find((tab) => tab.id === id);

test("Conversations carries no badge", () => {
  // The 103 beside Conversations was a contact total presented where an unread
  // count belongs. There is no read cursor, so nothing replaces it.
  assert.equal("count" in byId("conversations"), false);
});

test("Conversations carries no badge even when there are many contacts", () => {
  const tabs = buildHermesTabs({ ledgerItems: 0, openSchedulingCases: 0, attentionItems: 0 });
  const conversations = tabs.find((tab) => tab.id === "conversations");
  assert.equal(conversations.count, undefined);
});

test("Classes carries no badge, because the tab only shows the next five", () => {
  assert.equal("count" in byId("classes"), false);
});

test("Contacts carries no badge", () => {
  assert.equal("count" in byId("contacts"), false);
});

test("Needs attention badges the actionable projection it is given", () => {
  assert.equal(byId("attention").count, 2);
});

test("Scheduling badges the open coordination cases it is given", () => {
  assert.equal(byId("scheduling").count, 3);
});

test("Ledger badges the ledger and settlement work it is given", () => {
  assert.equal(byId("ledger").count, 4);
});

test("no tab reports a raw contact total", () => {
  const tabs = buildHermesTabs({ ledgerItems: 0, openSchedulingCases: 0, attentionItems: 0 });
  assert.equal(tabs.every((tab) => tab.count === undefined || tab.count === 0), true);
});

test("every tab keeps its place in the established order", () => {
  assert.deepEqual(buildHermesTabs(COUNTS).map((tab) => tab.id), [
    "conversations",
    "ledger",
    "statements",
    "contacts",
    "classes",
    "scheduling",
    "attention",
  ]);
});

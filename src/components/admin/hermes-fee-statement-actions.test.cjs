/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const test = require("node:test");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
for (const ext of [".ts", ".tsx"]) require.extensions[ext] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, f);
const old = Module._load;
Module._load = function(req, parent, main) { return old.call(this, req.startsWith("@/") ? path.join(__dirname, "../../", req.slice(2)) : req, parent, main); };
const { HermesFeeStatementsPanel } = require("./hermes-fee-statements-panel.tsx");
const fixture = { id: "375f7b98-9c2b-4ee8-b609-e408bff4a4b0", statement_reference: "MIA-QA", student_name: "Example", billed_to_name: null, period_start: "2026-09-01", period_end: "2026-09-30", currency: "VND", total_minor: 1000000, status: "published", issued_at: "2026-10-01T00:00:00Z", paid_at: null, voided_at: null };
test("all four invoice actions share one compact wrapping action row", () => {
  const html = renderToStaticMarkup(React.createElement(HermesFeeStatementsPanel, { statements: [fixture] }));
  const actionRow = html.match(/<div style="display:flex;flex-wrap:wrap;gap:8px">([\s\S]*?)<\/div>/)?.[1];
  assert.ok(actionRow, "shared compact action row missing");
  for (const label of ["Copy link", "Open statement", "Copy WhatsApp message", "Add fee / advance"]) assert.ok(actionRow.includes(label), `${label} is not in the shared row`);
  assert.equal((actionRow.match(/<button/g) || []).length, 4);
  assert.doesNotMatch(actionRow, /width:100%|w-full/);
});
test("paid invoices do not show a fee or advance mutation button", () => {
  const html = renderToStaticMarkup(React.createElement(HermesFeeStatementsPanel, { statements: [{ ...fixture, status: "paid" }] }));
  assert.doesNotMatch(html, /Add fee \/ advance/);
});

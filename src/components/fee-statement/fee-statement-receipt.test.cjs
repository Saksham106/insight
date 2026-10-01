/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const test = require("node:test");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
for (const extension of [".ts", ".tsx"]) {
  require.extensions[extension] = (module, filename) => {
    const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    } });
    module._compile(output.outputText, filename);
  };
}
const load = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === "./bank-qr-payment") return { BankQrPayment: () => null };
  if (request.endsWith(".module.css")) return new Proxy({}, { get: (_, key) => key === "__esModule" ? false : String(key) });
  if (request.startsWith("@/")) return load.call(this, path.join(__dirname, "../../", request.slice(2)), parent, isMain);
  return load.call(this, request, parent, isMain);
};
const { FeeStatementReceipt } = require("./fee-statement-receipt.tsx");
const statement = {
  id: "fixture", statementReference: "MIA-202609-TEST", status: "published",
  studentName: "Example", billedToName: null, periodStart: "2026-09-01", periodEnd: "2026-09-30",
  dueDate: null, currency: "VND", totalMinor: 6375000, issuedAt: "2026-10-01T00:00:00Z", paidAt: null,
  lineItems: [{ lessonDate: null, teacherName: "Swati", subject: "Maths", durationMinutes: 510,
    rateMinor: 750000, amountMinor: 6375000, note: "Sep 7, 8, 14, 15, 22, 28, 29, 30; cancelled dates excluded." }],
};
test("the monthly total row itself expands into dated teacher details", () => {
  const html = renderToStaticMarkup(React.createElement(FeeStatementReceipt, { statement }));
  const summary = html.match(/<details[^>]*>\s*<summary[^>]*>([\s\S]*?)<\/summary>/)?.[1];
  assert.ok(summary, "aggregate row must be a native details summary");
  assert.match(summary, /Swati/);
  assert.match(summary, /6,375,000/);
  assert.match(summary, /8\.5 hrs/);
  assert.equal((html.match(/<time dateTime="2026-09-/g) || []).length, 8);
  assert.match(html, /Maths/);
  assert.match(html, /cancelled dates excluded/);
  assert.doesNotMatch(html, /1\.06 hrs/);
});

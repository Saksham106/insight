/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

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

const modulePath = path.join(__dirname, "fee-statement-presentation.ts");

function presentation() {
  if (!fs.existsSync(modulePath)) assert.fail("fee statement presentation helper is missing");
  return require(modulePath);
}

function item(teacherName, lessonDate, durationMinutes = 60, amountMinor = 750000, note) {
  return {
    lessonDate,
    teacherName,
    subject: "English",
    durationMinutes,
    rateMinor: (amountMinor * 60) / durationMinutes,
    amountMinor,
    ...(note ? { note } : {}),
  };
}

test("short statements keep every class visible", () => {
  const { buildFeeStatementRows } = presentation();
  const items = [
    item("Ms Lan", "2026-08-01"),
    item("Ms Lan", "2026-08-08"),
    item("Ms Lan", "2026-08-15"),
    item("Mr Minh", "2026-08-20"),
  ];
  assert.deepEqual(buildFeeStatementRows(items).map((row) => row.kind), ["item", "item", "item", "item"]);
});

test("long statements collapse repeated dated classes with the same tutor", () => {
  const { buildFeeStatementRows } = presentation();
  const items = [
    item("Ms Lan", "2026-08-01", 60, 750000),
    item("Mr Minh", "2026-08-02", 90, 1125000),
    item("Ms Lan", "2026-08-08", 60, 750000),
    item("Ms Lan", "2026-08-15", 90, 1125000),
    item("Ms Lan", "2026-08-22", 60, 750000),
    item("Ms Hoa", "2026-08-05", 60, 750000),
    item("Ms Hoa", "2026-08-12", 60, 750000),
    item("Mr Minh", "2026-08-23", 60, 750000),
  ];
  const rows = buildFeeStatementRows(items);
  const groups = rows.filter((row) => row.kind === "group");
  const group = groups.find((row) => row.teacherName === "Ms Lan");
  assert.equal(rows.length, 3);
  assert.equal(groups.length, 3);
  assert.equal(group.teacherName, "Ms Lan");
  assert.equal(group.items.length, 4);
  assert.equal(group.durationMinutes, 270);
  assert.equal(group.amountMinor, 3375000);
  assert.equal(group.rateMinor, 750000);
  assert.equal(groups.find((row) => row.teacherName === "Mr Minh").items.length, 2);
  assert.equal(groups.find((row) => row.teacherName === "Ms Hoa").items.length, 2);
});

test("grouped rows expose an hourly rate only when every class uses the same rate", () => {
  const { buildFeeStatementRows } = presentation();
  const items = [
    item("Swati", "2026-08-01", 60, 1500000),
    item("Swati", "2026-08-08", 90, 2250000),
    item("Anjali", "2026-08-02", 60, 900000),
    item("Anjali", "2026-08-09", 60, 1000000),
    item("A", "2026-08-03"), item("B", "2026-08-04"),
    item("C", "2026-08-05"), item("D", "2026-08-06"),
  ];
  items[0].rateMinor = 1500000;
  items[1].rateMinor = 1500000;
  items[2].rateMinor = 900000;
  items[3].rateMinor = 1000000;

  const groups = buildFeeStatementRows(items).filter((row) => row.kind === "group");
  assert.equal(groups.find((row) => row.teacherName === "Swati").rateMinor, 1500000);
  assert.equal(groups.find((row) => row.teacherName === "Anjali").rateMinor, null);
});

test("aggregate rows are never folded into dated tutor groups", () => {
  const { buildFeeStatementRows } = presentation();
  const items = [
    item("Ms Lan", "2026-08-01"), item("Ms Lan", "2026-08-08"), item("Ms Lan", "2026-08-15"),
    item("Ms Lan", null, 240, 3000000, "August aggregate; exact lesson dates are unavailable in the source."),
    item("A", "2026-08-04"), item("B", "2026-08-05"), item("C", "2026-08-06"), item("D", "2026-08-07"),
  ];
  const rows = buildFeeStatementRows(items);
  const aggregate = rows.find((row) => row.kind === "item" && row.item.lessonDate === null);
  assert.ok(aggregate);
});

test("source-unavailable aggregate copy is hidden while useful parent notes remain", () => {
  const { parentVisibleNote } = presentation();
  assert.equal(parentVisibleNote("August aggregate; exact lesson dates are unavailable in the source."), null);
  assert.equal(parentVisibleNote("Exact lesson dates are unavailable in the source"), null);
  assert.equal(parentVisibleNote("Includes a 10% sibling discount."), "Includes a 10% sibling discount.");
  assert.equal(parentVisibleNote(undefined), null);
});

test("bank QR is offered only for unpaid VND statements", () => {
  const { canOfferBankQr } = presentation();
  assert.equal(canOfferBankQr("published", "VND"), true);
  assert.equal(canOfferBankQr("paid", "VND"), false);
  assert.equal(canOfferBankQr("published", "USD"), false);
});

test("receipt contains two payment entry points and the approved QR asset", () => {
  const receipt = fs.readFileSync(path.join(__dirname, "fee-statement-receipt.tsx"), "utf8");
  const payment = path.join(__dirname, "bank-qr-payment.tsx");
  assert.ok(fs.existsSync(payment), "bank QR payment component is missing");
  const paymentSource = fs.readFileSync(payment, "utf8");
  assert.match(receipt, /BankQrPayment/);
  assert.match(receipt, /formatMinorCurrency\(item\.rateMinor, currency\)/);
  assert.match(receipt, /per hour =/);
  assert.match(receipt, /row\.rateMinor/);
  assert.match(receipt, /placement="top"/);
  assert.match(receipt, /placement="bottom"/);
  assert.match(paymentSource, /bank-qr-code\.png/);
  assert.match(paymentSource, /import bankQrCode from/);
  assert.doesNotMatch(paymentSource, /src="\/bank-qr-code\.png"/);
  assert.match(paymentSource, /Scan to pay/);
  assert.match(paymentSource, /Pay by QR/);
  assert.match(paymentSource, /Bank details & QR/);
  assert.match(paymentSource, /QrCode/);
  assert.match(paymentSource, /paymentButtonBottom/);
  assert.match(paymentSource, /GOEL SWATI/);
  assert.match(paymentSource, /106882732486/);
  assert.match(paymentSource, /document\.documentElement\.style\.overflow/);
  assert.match(paymentSource, /dialog/i);
  const css = fs.readFileSync(path.join(__dirname, "fee-statement-receipt.module.css"), "utf8");
  assert.match(css, /\.paymentAction\s*\{[^}]*display:\s*flex;[^}]*justify-content:\s*flex-end/);
  assert.match(css, /\.paymentButton\s*\{[^}]*width:\s*auto;/);
  assert.match(css, /\.paymentButtonBottom\s*\{[^}]*background:\s*transparent;/);
  assert.doesNotMatch(css, /\.paymentButton\s*\{[^}]*width:\s*100%;/);
  assert.match(css, /\.paymentDialog\s*\{[\s\S]*?margin:\s*auto;/);
  assert.match(css, /\.qrImage\s*\{[^}]*width:\s*min\(100%,\s*19rem\)/);
  assert.match(css, /\.dialogClose\s*\{[^}]*width:\s*2\.75rem;\s*height:\s*2\.75rem/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
});

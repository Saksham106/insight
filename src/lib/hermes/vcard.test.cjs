/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = function compileTypeScript(module, filename) {
  let source = fs.readFileSync(filename, "utf8");
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

const { normalizePhone } = require(path.join(__dirname, "phone.ts"));
const { parseVCardContacts } = require(path.join(__dirname, "vcard.ts"));

test("normalizes explicit international numbers to E.164", () => {
  assert.deepEqual(normalizePhone("+84 (917) 583-553"), { ok: true, e164: "+84917583553" });
});

test("normalizes a local number only with an explicit default calling code", () => {
  assert.deepEqual(normalizePhone("0917 583 553", "84"), { ok: true, e164: "+84917583553" });
  assert.deepEqual(normalizePhone("0917 583 553"), { ok: false, reason: "country_code_required" });
});

test("rejects impossible or oversized phone numbers", () => {
  assert.deepEqual(normalizePhone("123"), { ok: false, reason: "invalid_phone" });
  assert.deepEqual(normalizePhone("+1234567890123456"), { ok: false, reason: "invalid_phone" });
});

test("parses iPhone vCards with folded lines, escaped names, unicode, and multiple phones", () => {
  const result = parseVCardContacts([
    "BEGIN:VCARD",
    "VERSION:3.0",
    "N:Shah;Rahul;;;",
    "FN:Rahul\\, Shah",
    "TEL;TYPE=CELL:+84 917 583 553",
    "TEL;TYPE=HOME:+84 912 000 000",
    "NOTE:This must not be retained",
    "EMAIL:rahul@example.com",
    "ADR:;;private address;;;;",
    "BDAY:2009-01-01",
    "PHOTO;ENCODING=b:abc",
    " def",
    "END:VCARD",
    "BEGIN:VCARD",
    "VERSION:4.0",
    "FN:Nguyễn Minh Anh",
    "TEL;VALUE=uri:tel:+84901112233",
    "END:VCARD",
  ].join("\r\n"));

  assert.deepEqual(result, [
    { sourceIndex: 0, displayName: "Rahul, Shah", phones: ["+84 917 583 553", "+84 912 000 000"] },
    { sourceIndex: 1, displayName: "Nguyễn Minh Anh", phones: ["+84901112233"] },
  ]);
  assert.equal(JSON.stringify(result).includes("example.com"), false);
  assert.equal(JSON.stringify(result).includes("private address"), false);
  assert.equal(JSON.stringify(result).includes("2009-01-01"), false);
  assert.equal(JSON.stringify(result).includes("abcdef"), false);
});

test("uses structured N as a fallback and reports missing required data", () => {
  const result = parseVCardContacts([
    "BEGIN:VCARD",
    "VERSION:3.0",
    "N:Mehta;Priya;;;",
    "TEL:+919876543210",
    "END:VCARD",
    "BEGIN:VCARD",
    "VERSION:3.0",
    "FN:No Phone",
    "END:VCARD",
    "BEGIN:VCARD",
    "VERSION:3.0",
    "TEL:+15555550123",
    "END:VCARD",
  ].join("\n"));

  assert.deepEqual(result[0], { sourceIndex: 0, displayName: "Priya Mehta", phones: ["+919876543210"] });
  assert.deepEqual(result[1], { sourceIndex: 1, displayName: "No Phone", phones: [], error: "phone_required" });
  assert.deepEqual(result[2], { sourceIndex: 2, displayName: "", phones: ["+15555550123"], error: "name_required" });
});

test("deduplicates repeated phone values within one card", () => {
  const result = parseVCardContacts([
    "BEGIN:VCARD",
    "FN:Priya",
    "TEL:+919876543210",
    "TEL;TYPE=CELL:+919876543210",
    "END:VCARD",
  ].join("\n"));
  assert.deepEqual(result[0].phones, ["+919876543210"]);
});

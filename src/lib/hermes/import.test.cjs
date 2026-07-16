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
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  });
  module._compile(output.outputText, filename);
};

const { suggestProfileMatches } = require(path.join(__dirname, "matching.ts"));
const { buildImportPreview, signImportPreview, verifyImportPreview } = require(path.join(__dirname, "import.ts"));

const profiles = [
  { id: "p1", full_name: "Priya Mehta", role: "teacher", timezone: "Asia/Kolkata" },
  { id: "p2", full_name: "Rahul Shah", role: "student", timezone: "Asia/Ho_Chi_Minh" },
  { id: "p3", full_name: "Rahul Patel", role: "student", timezone: null },
];

test("suggests a unique exact full-name profile but never first-name-only matches", () => {
  assert.deepEqual(suggestProfileMatches("Priya Mehta", profiles), [
    { profileId: "p1", fullName: "Priya Mehta", role: "teacher", timezone: "Asia/Kolkata", confidence: "exact" },
  ]);
  assert.deepEqual(suggestProfileMatches("Rahul", profiles), []);
});

test("returns all ambiguous exact candidates without linking one", () => {
  const duplicates = [
    { id: "p1", full_name: "Priya", role: "teacher", timezone: null },
    { id: "p2", full_name: "Priya", role: "student", timezone: null },
  ];
  assert.equal(suggestProfileMatches("Priya", duplicates).length, 2);
});

test("builds a minimized preview with normalized numbers and duplicate errors", () => {
  const preview = buildImportPreview({
    parsed: [
      { sourceIndex: 0, displayName: "Priya Mehta", phones: ["+91 98765 43210"] },
      { sourceIndex: 1, displayName: "Priya Duplicate", phones: ["+919876543210"] },
      { sourceIndex: 2, displayName: "Local Student", phones: ["0917 583 553"] },
    ],
    profiles,
    existingContacts: [{ id: "c1", display_name: "Existing", whatsapp_e164: "+84917583553" }],
    defaultCallingCode: "84",
  });

  assert.equal(preview.rows[0].normalizedPhone, "+919876543210");
  assert.equal(preview.rows[0].suggestions[0].profileId, "p1");
  assert.equal(preview.rows[1].error, "duplicate_in_upload");
  assert.equal(preview.rows[2].existingContactId, "c1");
  assert.deepEqual(preview.summary, { total: 3, ready: 2, errors: 1, existing: 1, suggestedMatches: 1 });
});

test("reports country-code and parser errors instead of guessing", () => {
  const preview = buildImportPreview({
    parsed: [
      { sourceIndex: 0, displayName: "Local", phones: ["0917 583 553"] },
      { sourceIndex: 1, displayName: "No Phone", phones: [], error: "phone_required" },
    ],
    profiles: [],
    existingContacts: [],
  });
  assert.equal(preview.rows[0].error, "country_code_required");
  assert.equal(preview.rows[1].error, "phone_required");
});

test("signs preview content and rejects expiry or tampering", () => {
  const payload = { digest: "abc", expiresAt: 2_000_000_000_000 };
  const token = signImportPreview(payload, "secret");
  assert.deepEqual(verifyImportPreview(token, "secret", 1_900_000_000_000), payload);
  assert.equal(verifyImportPreview(`${token}x`, "secret", 1_900_000_000_000), null);
  assert.equal(verifyImportPreview(token, "secret", 2_100_000_000_000), null);
});

test("admin import routes authenticate before privileged database access", () => {
  for (const relative of [
    "../../app/api/admin/hermes/import/preview/route.ts",
    "../../app/api/admin/hermes/import/commit/route.ts",
  ]) {
    const source = fs.readFileSync(path.join(__dirname, relative), "utf8");
    assert.match(source, /getUserProfile\(\)/);
    assert.match(source, /profile\.role !== "admin"/);
  }
});

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
const { buildImportPreview, signImportPreview, validateImportChanges, validateImportSelection, verifyImportPreview } = require(path.join(__dirname, "import.ts"));

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

test("buckets rows as new, existing, removed, or error", () => {
  const preview = buildImportPreview({
    parsed: [
      { sourceIndex: 0, displayName: "Priya Mehta", phones: ["+91 98765 43210"] },
      { sourceIndex: 1, displayName: "Priya Duplicate", phones: ["+919876543210"] },
      { sourceIndex: 2, displayName: "Local Student", phones: ["0917 583 553"] },
      { sourceIndex: 3, displayName: "Gone Away", phones: ["+15551234567"] },
    ],
    profiles,
    existingContacts: [
      { id: "c1", display_name: "Existing", whatsapp_e164: "+84917583553", role: "student", deleted_at: null },
      { id: "c2", display_name: "Removed Earlier", whatsapp_e164: "+15551234567", role: "parent", deleted_at: "2026-07-01T00:00:00Z" },
    ],
    defaultCallingCode: "84",
  });

  assert.equal(preview.rows[0].status, "new");
  assert.equal(preview.rows[0].normalizedPhone, "+919876543210");
  assert.equal(preview.rows[0].suggestions[0].profileId, "p1");
  assert.equal(preview.rows[0].existing, null);

  assert.equal(preview.rows[1].status, "error");
  assert.equal(preview.rows[1].error, "duplicate_in_upload");

  assert.equal(preview.rows[2].status, "existing");
  assert.deepEqual(preview.rows[2].existing, { id: "c1", displayName: "Existing", role: "student", deleted: false });

  assert.equal(preview.rows[3].status, "removed");
  assert.deepEqual(preview.rows[3].existing, { id: "c2", displayName: "Removed Earlier", role: "parent", deleted: true });

  assert.deepEqual(preview.summary, { total: 4, new: 1, existing: 1, removed: 1, errors: 1 });
});

test("suggests Insight profiles only for contacts being created", () => {
  const preview = buildImportPreview({
    parsed: [{ sourceIndex: 0, displayName: "Priya Mehta", phones: ["+919876543210"] }],
    profiles,
    existingContacts: [
      { id: "c1", display_name: "Priya Mehta", whatsapp_e164: "+919876543210", role: "teacher", deleted_at: null },
    ],
  });

  assert.equal(preview.rows[0].status, "existing");
  assert.deepEqual(preview.rows[0].suggestions, []);
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

test("binds committed contacts to signed preview rows and suggested profile ids", () => {
  const rows = [{
    sourceIndex: 0,
    displayName: "Priya Mehta",
    rawPhone: "+91 98765 43210",
    normalizedPhone: "+919876543210",
    status: "new",
    existing: null,
    suggestions: [{ profileId: "p1", fullName: "Priya Mehta", role: "teacher", timezone: "Asia/Kolkata", confidence: "exact" }],
    error: null,
  }];

  assert.equal(validateImportSelection(rows, [{ displayName: "Priya Mehta", normalizedPhone: "+919876543210", role: "teacher", profileId: "p1" }]), true);
  assert.equal(validateImportSelection(rows, [{ displayName: "Mallory", normalizedPhone: "+919876543210", role: "teacher", profileId: "p1" }]), false);
  assert.equal(validateImportSelection(rows, [{ displayName: "Priya Mehta", normalizedPhone: "+15551234567", role: "teacher", profileId: null }]), false);
  assert.equal(validateImportSelection(rows, [{ displayName: "Priya Mehta", normalizedPhone: "+919876543210", role: "teacher", profileId: "p2" }]), false);

  // A contact already in the directory must never travel the create path.
  const knownRows = [{ ...rows[0], status: "existing", existing: { id: "c1", displayName: "Priya Mehta", role: "student", deleted: false } }];
  assert.equal(validateImportSelection(knownRows, [{ displayName: "Priya Mehta", normalizedPhone: "+919876543210", role: "teacher", profileId: null }]), false);
});

test("binds updates and restores to signed rows of the matching bucket", () => {
  const rows = [
    {
      sourceIndex: 0,
      displayName: "Known Person",
      rawPhone: "+84917583553",
      normalizedPhone: "+84917583553",
      status: "existing",
      existing: { id: "c1", displayName: "Known Person", role: "student", deleted: false },
      suggestions: [],
      error: null,
    },
    {
      sourceIndex: 1,
      displayName: "Gone Away",
      rawPhone: "+15551234567",
      normalizedPhone: "+15551234567",
      status: "removed",
      existing: { id: "c2", displayName: "Gone Away", role: "parent", deleted: true },
      suggestions: [],
      error: null,
    },
  ];

  assert.equal(validateImportChanges(rows, [{ contactId: "c1", role: "teacher" }], "existing"), true);
  assert.equal(validateImportChanges(rows, [{ contactId: "c2", role: null }], "removed"), true);

  // A removed contact cannot be routed through the update list, or vice versa.
  assert.equal(validateImportChanges(rows, [{ contactId: "c2", role: "teacher" }], "existing"), false);
  assert.equal(validateImportChanges(rows, [{ contactId: "c1", role: null }], "removed"), false);

  // A contact id that appears in no signed row cannot be edited through import.
  assert.equal(validateImportChanges(rows, [{ contactId: "c9", role: "teacher" }], "existing"), false);

  // The same contact cannot be changed twice in one request.
  assert.equal(
    validateImportChanges(rows, [{ contactId: "c1", role: "teacher" }, { contactId: "c1", role: "parent" }], "existing"),
    false,
  );

  assert.equal(validateImportChanges(rows, [], "existing"), true);
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

test("the import commit reports every failed row and the UI names each one", () => {
  const route = fs.readFileSync(
    path.join(__dirname, "../../app/api/admin/hermes/import/commit/route.ts"),
    "utf8",
  );
  const panel = fs.readFileSync(
    path.join(__dirname, "../../components/admin/hermes-contact-import.tsx"),
    "utf8",
  );

  assert.match(route, /const rowErrors: ImportRowError\[\] = \[\]/);
  assert.match(route, /if \(error \|\| !data\)/, "a missing update result is a failure, not a silent skip");
  assert.match(route, /\{ error: "One or more contact changes failed\.", result, restoredMuted, rowErrors \}/);
  assert.doesNotMatch(route, /firstFailure/);
  assert.match(panel, /data\.rowErrors/);
  assert.match(panel, /rowError\.displayName/);
  assert.match(panel, /rowError\.message/);
});

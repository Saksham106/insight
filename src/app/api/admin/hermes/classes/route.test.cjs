/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const read = (relative) => fs.readFileSync(path.join(process.cwd(), relative), "utf8");

test("Kitty class routes are admin-only, flagged, and service-backed", () => {
  const collection = read("src/app/api/admin/hermes/classes/route.ts");
  const item = read("src/app/api/admin/hermes/classes/[id]/route.ts");
  for (const source of [collection, item]) {
    assert.match(source, /getUserProfile\(\)/);
    assert.match(source, /profile\.role !== "admin"/);
    assert.match(source, /KITTY_CLASS_CALENDAR_ENABLED/);
  }
  assert.match(collection, /createKittyClass/);
  assert.match(collection, /listKittyClasses/);
  assert.match(item, /editKittyClass/);
  assert.match(item, /overrideKittyClass/);
  assert.match(item, /overrideReason/);
  assert.match(collection, /teacherContactId/);
  assert.match(collection, /enrollments/);
  assert.match(collection, /clientRequestId/);
  assert.match(item, /addKittyClassEnrollment/);
  assert.match(item, /endKittyClassEnrollment/);
});

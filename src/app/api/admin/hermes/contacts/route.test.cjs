/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

function read(relative) {
  return fs.readFileSync(path.join(process.cwd(), relative), "utf8");
}

function readMigration(suffix) {
  const migrationsDirectory = path.join(process.cwd(), "supabase", "migrations");
  const fileName = fs
    .readdirSync(migrationsDirectory)
    .find((candidate) => candidate.endsWith(suffix));
  assert.ok(fileName, `${suffix} migration should exist`);
  return fs.readFileSync(path.join(migrationsDirectory, fileName), "utf8");
}

test("the contact PATCH route accepts a messaging name and a reset", () => {
  const route = read("src/app/api/admin/hermes/contacts/[id]/route.ts");
  assert.match(route, /body\.preferredName !== undefined/);
  assert.match(route, /update\.preferred_name = null/, "null clears the override");
  assert.match(route, /update\.preferred_name = preferred/, "a string sets it");
  assert.match(route, /select\("id, display_name, preferred_name/, "the response carries it back");
});

test("the contact PATCH route atomically guards communication policy changes", () => {
  const route = read("src/app/api/admin/hermes/contacts/[id]/route.ts");
  assert.match(route, /body\.expectedCommunicationPolicy !== undefined/);
  assert.match(route, /query = query\.eq\("communication_policy", expectedCommunicationPolicy\)/);
  assert.match(route, /status: 409/);
});

test("the migration adds a nullable, length-checked preferred_name", () => {
  const migration = readMigration("_add_hermes_contact_preferred_name.sql");
  assert.match(migration, /add column if not exists preferred_name text/);
  assert.match(migration, /between 1 and 100/);
  assert.match(migration, /not valid/);
  assert.match(migration, /validate constraint hermes_contacts_preferred_name_length/);
  assert.doesNotMatch(migration, /update public\.hermes_contacts/, "must not backfill");
});

test("the admin page and shared type carry preferred_name", () => {
  assert.match(
    read("src/app/(dashboard)/admin/hermes/page.tsx"),
    /id, display_name, preferred_name, whatsapp_e164/,
  );
  assert.match(
    read("src/components/admin/hermes-dashboard-shared.tsx"),
    /preferred_name: string \| null;/,
  );
});

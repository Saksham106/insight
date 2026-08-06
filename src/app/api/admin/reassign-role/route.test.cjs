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

test("role reassignment is one atomic database operation", () => {
  const route = read("src/app/api/admin/reassign-role/route.ts");
  const migration = readMigration("_add_atomic_role_reassignment.sql").toLowerCase();

  assert.match(route, /\.rpc\("reassign_profile_role"/);
  assert.doesNotMatch(route, /\.from\("teacher_student_assignments"\)\.(?:update|delete)/s);
  assert.doesNotMatch(route, /\.from\("parent_student_links"\)\.delete/s);
  assert.doesNotMatch(route, /\.from\("profiles"\)\.update/s);

  assert.match(migration, /create or replace function public\.reassign_profile_role/);
  assert.match(migration, /for update/);
  assert.match(migration, /update public\.teacher_student_assignments/);
  assert.match(migration, /delete from public\.parent_student_links/);
  assert.match(migration, /update public\.profiles/);
  assert.match(migration, /grant execute on function public\.reassign_profile_role\(uuid, text, boolean\) to service_role/);
  assert.doesNotMatch(migration, /grant execute[^;]+to authenticated/);
});

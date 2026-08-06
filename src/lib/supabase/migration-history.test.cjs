/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const migrationsDirectory = path.join(process.cwd(), "supabase", "migrations");
const migrationFiles = fs
  .readdirSync(migrationsDirectory)
  .filter((fileName) => fileName.endsWith(".sql"))
  .sort();

test("active Supabase migrations have unique versions", () => {
  const versions = migrationFiles.map((fileName) => fileName.slice(0, 14));
  const duplicateVersions = versions.filter(
    (version, index) => versions.indexOf(version) !== index,
  );

  assert.deepEqual([...new Set(duplicateVersions)], []);
});

test("active Supabase migrations contain executable SQL", () => {
  const emptyMigrations = migrationFiles.filter((fileName) => {
    const sql = fs.readFileSync(path.join(migrationsDirectory, fileName), "utf8");
    return sql.trim().length === 0;
  });

  assert.deepEqual(emptyMigrations, []);
});

test("active Supabase migrations do not repeat SQL under different versions", () => {
  const filesByNormalizedSql = new Map();

  for (const fileName of migrationFiles) {
    const sql = fs.readFileSync(path.join(migrationsDirectory, fileName), "utf8");
    const normalizedSql = sql
      .replace(/\s+/g, " ")
      .trim()
      .replace(/;(?:\s*;)+$/, ";");
    const matchingFiles = filesByNormalizedSql.get(normalizedSql) ?? [];
    matchingFiles.push(fileName);
    filesByNormalizedSql.set(normalizedSql, matchingFiles);
  }

  const duplicateMigrations = [...filesByNormalizedSql.values()].filter(
    (fileNames) => fileNames.length > 1,
  );

  assert.deepEqual(duplicateMigrations, []);
});

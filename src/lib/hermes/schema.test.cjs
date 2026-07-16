/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const migrationsDir = path.join(process.cwd(), "supabase", "migrations");

function readHermesMigration() {
  const file = fs
    .readdirSync(migrationsDir)
    .find((name) => name.endsWith("_add_hermes_assistant.sql"));
  assert.ok(file, "Hermes assistant migration should exist");
  return fs.readFileSync(path.join(migrationsDir, file), "utf8").toLowerCase();
}

test("Hermes migration creates the complete assistant data model", () => {
  const sql = readHermesMigration();
  for (const table of [
    "hermes_contacts",
    "hermes_contact_relationships",
    "hermes_import_batches",
    "hermes_scheduling_cases",
    "hermes_case_participants",
    "hermes_messages",
    "hermes_approvals",
    "hermes_audit_events",
  ]) {
    assert.match(sql, new RegExp(`create table(?: if not exists)? public\\.${table}`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
});

test("Hermes contacts enforce phone, role, policy, and optional portal linking", () => {
  const sql = readHermesMigration();
  assert.match(sql, /whatsapp_e164 text not null unique/);
  assert.ok(sql.includes("check (whatsapp_e164 ~ '^\\+[1-9]\\d{7,14}$')"));
  assert.match(sql, /role in \('teacher', 'student', 'parent', 'employee', 'other', 'unclassified'\)/);
  assert.match(sql, /communication_policy in \('direct', 'guardian_only', 'approval_required', 'paused', 'opted_out'\)/);
  assert.match(sql, /profile_id uuid.*references public\.profiles\(id\) on delete set null/);
  assert.match(sql, /create unique index.*hermes_contacts_profile_unique/);
});

test("Hermes tables use admin-only browser policies and no anon grants", () => {
  const sql = readHermesMigration();
  assert.doesNotMatch(sql, /grant [^;]+ to anon/);
  assert.match(sql, /public\.is_admin\(\)/);
  assert.match(sql, /grant select, insert, update, delete on table public\.hermes_contacts to authenticated/);
  assert.match(sql, /revoke all on table public\.hermes_messages from anon, authenticated/);
  assert.match(sql, /revoke all on table public\.hermes_audit_events from anon, authenticated/);
});

test("Hermes migration indexes case, message, and attention access paths", () => {
  const sql = readHermesMigration();
  assert.match(sql, /create index.*hermes_contacts_attention/);
  assert.match(sql, /create index.*hermes_cases_status/);
  assert.match(sql, /create index.*hermes_messages_contact_created/);
  assert.match(sql, /create unique index.*hermes_messages_meta_id_unique/);
});

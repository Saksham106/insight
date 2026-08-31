/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const migrationDir = path.join(__dirname, "../../../supabase/migrations");
const sql = [
  "20260831160000_add_academy_fee_statements.sql",
  "20260831193000_harden_academy_fee_statements.sql",
  "20260831200000_lock_fee_statement_snapshots.sql",
].map((file) => fs.readFileSync(path.join(migrationDir, file), "utf8")).join("\n");

test("fee statements are private, service-only, token-hashed snapshots", () => {
  assert.match(sql, /public_token_hash text not null unique/);
  assert.doesNotMatch(sql, /public_token text/);
  assert.match(sql, /alter table public\.academy_fee_statements enable row level security/);
  assert.match(sql, /revoke all on public\.academy_fee_statements from anon, authenticated/);
  assert.match(sql, /revoke insert, update, delete on public\.academy_fee_statements from service_role/);
  assert.match(sql, /grant select on public\.academy_fee_statements to service_role/);
  assert.match(sql, /revoke insert, update, delete on public\.academy_fee_statement_audit_events from service_role/);
  assert.match(sql, /grant select on public\.academy_fee_statement_audit_events to service_role/);
  assert.match(sql, /grant execute on function public\.create_academy_fee_statement[\s\S]*to service_role/);
  assert.doesNotMatch(sql, /grant execute[\s\S]*to anon/);
  assert.match(sql, /actor_identifier_hash text/);
});

test("statement creation binds idempotency and audit in one transaction", () => {
  assert.match(sql, /client_request_id text not null unique/);
  assert.match(sql, /request_payload_digest/);
  assert.match(sql, /client_request_payload_mismatch/);
  assert.match(sql, /fee_statement_total_mismatch/);
  assert.match(sql, /invalid_fee_statement_line_item/);
  assert.match(sql, /duplicate_fee_statement_source/);
  assert.match(sql, /amountMinor[\s\S]*durationMinutes[\s\S]*rateMinor/);
  assert.match(sql, /insert into public\.academy_fee_statement_audit_events/);
});

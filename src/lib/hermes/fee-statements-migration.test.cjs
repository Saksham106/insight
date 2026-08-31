/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const sql = fs.readFileSync(path.join(__dirname, "../../../supabase/migrations/20260831160000_add_academy_fee_statements.sql"), "utf8");

test("fee statements are private, service-only, token-hashed snapshots", () => {
  assert.match(sql, /public_token_hash text not null unique/);
  assert.doesNotMatch(sql, /public_token text/);
  assert.match(sql, /alter table public\.academy_fee_statements enable row level security/);
  assert.match(sql, /revoke all on public\.academy_fee_statements from anon, authenticated/);
  assert.match(sql, /grant select, insert, update, delete on public\.academy_fee_statements to service_role/);
  assert.match(sql, /grant select, insert, update, delete on public\.academy_fee_statement_audit_events to service_role/);
  assert.match(sql, /grant execute on function public\.create_academy_fee_statement[\s\S]*to service_role/);
  assert.doesNotMatch(sql, /grant execute[\s\S]*to anon/);
});

test("statement creation binds idempotency and audit in one transaction", () => {
  assert.match(sql, /client_request_id text not null unique/);
  assert.match(sql, /request_payload_digest/);
  assert.match(sql, /client_request_payload_mismatch/);
  assert.match(sql, /fee_statement_total_mismatch/);
  assert.match(sql, /insert into public\.academy_fee_statement_audit_events/);
});

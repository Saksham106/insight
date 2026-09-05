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
  "20260905120000_replace_academy_fee_statements.sql",
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

test("statement correction atomically voids the original and links a validated replacement", () => {
  assert.match(sql, /create or replace function public\.replace_academy_fee_statement/);
  assert.match(sql, /fee_statement_selector_ambiguous/);
  assert.match(sql, /status = 'published'[\s\S]*student_name = pg_catalog\.btrim\(p_student_name\)/);
  assert.match(sql, /v_original\.status <> 'published'/);
  assert.match(sql, /fee_statement_identity_mismatch/);
  assert.match(sql, /from public\.create_academy_fee_statement/);
  assert.match(sql, /status = 'void'/);
  assert.match(sql, /replaced_by_statement_id = v_replacement\.id/);
  assert.match(sql, /replaces_statement_id = p_statement_id/);
  assert.match(sql, /replacement_request_digest/);
  assert.match(sql, /fee_statement_replacement_payload_mismatch/);
  assert.match(sql, /'voided'/);
  assert.match(sql, /p_client_request_id \|\| ':void'/);
  assert.match(sql, /grant execute on function public\.replace_academy_fee_statement[\s\S]*to service_role/);
  assert.doesNotMatch(sql, /grant execute on function public\.replace_academy_fee_statement[\s\S]*to anon/);
});

test("fee statement action results cannot retain private bearer links", () => {
  const file = path.join(migrationDir, "20260905130000_scrub_fee_statement_action_links.sql");
  assert.equal(fs.existsSync(file), true);
  const privacySql = fs.readFileSync(file, "utf8");
  assert.match(privacySql, /update public\.academy_agent_action_requests/);
  assert.match(privacySql, /result\s*-\s*'publicUrl'\s*-\s*'whatsappMessage'/);
  assert.match(privacySql, /capability_name like 'fee_statement\.%'/);
  assert.match(privacySql, /add constraint academy_agent_action_fee_statement_result_no_bearer/);
  assert.match(privacySql, /not \(result \? 'publicUrl'\)/);
  assert.match(privacySql, /not \(result \? 'whatsappMessage'\)/);
});

test("fee statement action result hardening matches the exact capability prefix and nested bearer keys", () => {
  const file = path.join(migrationDir, "20260905140000_harden_fee_statement_action_link_scrub.sql");
  assert.equal(fs.existsSync(file), true);
  const privacySql = fs.readFileSync(file, "utf8");
  assert.match(privacySql, /(?:pg_catalog\.)?starts_with\(capability_name, 'fee_statement\.'\)/);
  assert.doesNotMatch(privacySql, /like\s+'fee_statement\.%'/i);
  assert.match(privacySql, /(?:pg_catalog\.)?jsonb_path_exists\(result, '\$\.\*\*\."publicUrl"'\)/);
  assert.match(privacySql, /(?:pg_catalog\.)?jsonb_path_exists\(result, '\$\.\*\*\."whatsappMessage"'\)/);
  assert.match(privacySql, /jsonb_strip_fee_statement_bearer_fields/);
  assert.match(privacySql, /jsonb_array_elements[\s\S]*with ordinality/);
  assert.match(privacySql, /jsonb_agg[\s\S]*order by item\.position/);
  assert.match(privacySql, /jsonb_each/);
});

/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const migration = fs.readFileSync(path.join(__dirname, "../../../supabase/migrations/20260930130000_allow_signed_admin_profile_actions.sql"), "utf8");

test("signed profile channel is admitted only for audited agent actions and fee statements", () => {
  assert.match(migration, /academy_agent_action_requests_channel_check/);
  assert.match(migration, /academy_fee_statements_source_channel_check/);
  assert.match(migration, /'agent_profile'/);
  assert.doesNotMatch(migration, /grant .* to anon|grant .* to authenticated/i);
});

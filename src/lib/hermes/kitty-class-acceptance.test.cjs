/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const read = (relative) => fs.readFileSync(path.join(process.cwd(), relative), "utf8");

test("the complete Kitty class coordination path is wired and isolated", () => {
  const migration = read("supabase/migrations/20260805120000_add_kitty_class_calendar.sql");
  const service = read("src/lib/hermes/kitty-class-service.ts");
  const tools = read("src/lib/hermes/kitty-class-tools.ts");
  const notifications = read("src/lib/hermes/kitty-class-notifications.ts");
  const combined = `${migration}\n${service}\n${tools}\n${notifications}`;

  assert.match(migration, /p_participants jsonb/);
  assert.match(migration, /jsonb_array_elements\(p_participants\)/);
  assert.match(tools, /confirmKittyClassSelection[\s\S]*beginKittyClassChange/);
  assert.match(service, /occurrence_selection_confirmed/);
  assert.match(service, /selectionTokenDigest/);
  assert.match(migration, /participant\.decision_side <> p_requester_side/);
  assert.match(migration, /v_approved = 2/);
  assert.match(migration, /class_cancelled/);
  assert.match(migration, /class_rescheduled/);
  assert.match(migration, /on conflict \(idempotency_key\) do nothing/);
  assert.match(service, /override_kitty_class_occurrence/);
  assert.match(service, /through\.setUTCDate\(through\.getUTCDate\(\) \+ 90\)/);
  for (const table of ["teacher_student_assignments", "sessions", "availability_rules", "conversations"]) {
    assert.doesNotMatch(combined, new RegExp(`(?:insert into|update|delete from|\\.from\\()[^\\n]*${table}`));
  }
});

test("rollout remains disabled until every template and staging probe is ready", () => {
  const env = read(".env.example");
  const readme = read("infra/hermes-profiles/academy/README.md");
  for (const name of [
    "KITTY_CLASS_CALENDAR_ENABLED=false",
    "INSIGHT_KITTY_CLASS_TOOL_URL=",
    "WHATSAPP_TEMPLATE_CLASS_CHANGE_REQUEST=",
    "WHATSAPP_TEMPLATE_CLASS_CHANGE_PROPOSAL=",
    "WHATSAPP_TEMPLATE_CLASS_CANCELLED=",
    "WHATSAPP_TEMPLATE_CLASS_RESCHEDULED=",
    "WHATSAPP_TEMPLATE_CLASS_CHANGE_REJECTED=",
  ]) assert.ok(env.includes(name), `missing ${name}`);
  for (const phrase of ["shadow pilot", "selected contacts", "rollback", "exact occurrence", "both sides"]) {
    assert.ok(readme.toLowerCase().includes(phrase), `missing rollout phrase: ${phrase}`);
  }
});

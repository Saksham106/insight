/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

function read(relative) {
  return fs.readFileSync(path.join(process.cwd(), relative), "utf8");
}

test("no WhatsApp template greets a contact with their raw display name", () => {
  const route = read("src/app/api/whatsapp/send/route.ts");
  assert.doesNotMatch(route, /recipientName: contact\.display_name/);
  assert.doesNotMatch(route, /buildLessonReportRequestContent\([^)]*contact\.display_name/);
  assert.doesNotMatch(route, /validateSchedulingBodyParameters\([^,]+, contact\.display_name/);
  assert.match(route, /const recipientName = messagingName\(contact\)/);
  assert.match(route, /select\("id, display_name, preferred_name/);
});

test("the agent is handed a messagingName and told to use it", () => {
  const cases = read("src/lib/hermes/cases.ts");
  assert.match(cases, /messagingName: messagingName\(contact\)/);
  assert.match(read("src/app/api/hermes/tools/route.ts"), /display_name, preferred_name/);
  assert.match(
    read("infra/hermes-profiles/default-insight/AGENTS.md"),
    /messagingName/,
  );
});

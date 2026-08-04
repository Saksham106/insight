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

test("case participant projections preserve the explicit messaging name", () => {
  const toolsRoute = read("src/app/api/hermes/tools/route.ts");
  assert.doesNotMatch(
    toolsRoute,
    /contact:hermes_contacts\(id, display_name, role/,
    "case participant projections must not drop an explicit preferred name",
  );
});

test("the Swati alert does not put a raw phone label in a Meta parameter", () => {
  const toolsRoute = read("src/app/api/hermes/tools/route.ts");
  assert.doesNotMatch(
    toolsRoute,
    /requesterName = actorContact\?\.display_name/,
    "an internal Meta template parameter must not receive the raw phone label either",
  );
});

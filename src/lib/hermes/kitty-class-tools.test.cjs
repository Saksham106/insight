/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const read = (relative) => fs.readFileSync(path.join(process.cwd(), relative), "utf8");

test("class tool actions are split between admin and contact authority", () => {
  const tools = read("src/lib/hermes/kitty-class-tools.ts");
  const route = read("src/app/api/hermes/class-tools/route.ts");
  for (const action of ["preview_class", "create_class", "list_classes", "get_class", "edit_class", "override_class"]) assert.ok(tools.includes(`"${action}"`));
  for (const action of ["find_my_classes", "confirm_class_selection", "request_class_change", "decide_class_change", "propose_replacement_time"]) assert.ok(tools.includes(`"${action}"`));
  assert.match(route, /verifyServiceRequest/);
  assert.match(route, /parseIMessageAdminActor/);
  assert.match(route, /parseWhatsAppToolActor/);
  assert.match(route, /KITTY_CLASS_CALENDAR_ENABLED/);
  assert.match(route, /communicationDecision/);
});

test("contact tools cannot create or edit series", () => {
  const tools = read("src/lib/hermes/kitty-class-tools.ts");
  assert.match(tools, /ADMIN_CLASS_ACTIONS/);
  assert.match(tools, /CONTACT_CLASS_ACTIONS/);
  assert.match(tools, /action_not_allowed/);
  assert.match(tools, /confirmKittyClassSelection/);
});


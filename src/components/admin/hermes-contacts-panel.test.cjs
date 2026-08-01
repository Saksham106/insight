/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

function read(relative) {
  return fs.readFileSync(path.join(process.cwd(), relative), "utf8");
}

test("the contact directory is searchable and editable", () => {
  const panel = read("src/components/admin/hermes-contacts-panel.tsx");
  assert.match(panel, /^"use client";/, "search needs client state");
  assert.match(panel, /Search contacts/, "there is a search box");
  assert.match(panel, /display_name\.toLowerCase\(\)\.includes\(needle\)/);
  assert.match(panel, /whatsapp_e164\.toLowerCase\(\)\.includes\(needle\)/);
  assert.match(panel, /messagingName\(contact\)/, "search and display resolve the messaging name");
  assert.match(panel, /method: "PATCH"/);
  assert.match(panel, /preferredName: trimmed === "" \? null : trimmed/, "clearing resets to the neutral greeting");
  assert.doesNotMatch(panel, /Read-only/, "the directory is no longer read-only");
});

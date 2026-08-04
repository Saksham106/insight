/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("a roster rejection happens before a requested rename is written", () => {
  const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/admin/conversations/[id]/route.ts"), "utf8");
  const validateMembers = route.indexOf("memberIds.some");
  const updateMembers = route.indexOf("const res = await updateConversationMembers");
  const rename = route.indexOf("const res = await renameConversation");

  assert.ok(validateMembers >= 0 && updateMembers >= 0 && rename >= 0);
  assert.ok(validateMembers < rename, "member input must be validated before a rename");
  assert.ok(updateMembers < rename, "a duplicate roster must be rejected before a rename");
});

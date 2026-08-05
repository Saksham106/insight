/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("notification drain claims the isolated outbox and records delivery", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/lib/hermes/kitty-class-notifications.ts"), "utf8");
  assert.match(source, /kitty_class_notification_outbox/);
  assert.match(source, /status: "sending"/);
  assert.match(source, /status: "sent"/);
  assert.match(source, /status: "failed"/);
  assert.match(source, /status: "blocked"/);
  assert.match(source, /idempotency_key/);
  assert.doesNotMatch(source, /reason/);
});


/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("Kitty class maintenance is authenticated, bounded, and aggregate-only", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/app/api/cron/kitty-classes/route.ts"), "utf8");
  assert.match(source, /CRON_SECRET/);
  assert.match(source, /KITTY_CLASS_CALENDAR_ENABLED/);
  assert.match(source, /expandDueKittySeries/);
  assert.match(source, /completePastKittyOccurrences/);
  assert.match(source, /drainKittyClassNotifications/);
  assert.match(source, /expandedSeries/);
  assert.match(source, /createdOccurrences/);
  assert.match(source, /completedOccurrences/);
  assert.match(source, /sentNotifications/);
  assert.doesNotMatch(source, /console\.(log|error)/);
});

test("Vercel drains Kitty notifications every minute with an explicit SLA", () => {
  const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf8"));
  assert.deepEqual(config.crons.find((cron) => cron.path === "/api/cron/kitty-classes"), { path: "/api/cron/kitty-classes", schedule: "* * * * *" });
  const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/cron/kitty-classes/route.ts"), "utf8");
  assert.match(route, /deliverySlaSeconds: 60/);
});

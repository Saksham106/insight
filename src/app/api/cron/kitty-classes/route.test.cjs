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
  assert.match(source, /deliverPendingKittyClassNotifications/);
  assert.match(source, /HERMES_TOOL_SHARED_SECRET/);
  assert.match(source, /expandedSeries/);
  assert.match(source, /createdOccurrences/);
  assert.match(source, /completedOccurrences/);
  assert.match(source, /sentNotifications/);
  assert.match(source, /getClassReminderTemplateHealth/);
  assert.match(source, /templateContract: templateHealth\.ok \? "healthy" : "blocked"/);
  assert.ok(source.indexOf("getClassReminderTemplateHealth") < source.indexOf("const delivery = await deliverPendingKittyClassNotifications"));
  assert.doesNotMatch(source, /console\.(log|error)/);
});

test("Kitty delivers after tool mutations and retains a plan-compatible daily recovery drain", () => {
  const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf8"));
  assert.deepEqual(config.crons.find((cron) => cron.path === "/api/cron/kitty-classes"), { path: "/api/cron/kitty-classes", schedule: "15 0 * * *" });
  const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/cron/kitty-classes/route.ts"), "utf8");
  const toolRoute = fs.readFileSync(path.join(process.cwd(), "src/app/api/hermes/class-tools/route.ts"), "utf8");
  assert.match(route, /deliverPendingKittyClassNotifications/);
  assert.match(route, /immediate_with_daily_recovery/);
  assert.match(toolRoute, /await deliverPendingKittyClassNotifications\(supabase, request\.url\)/);
});

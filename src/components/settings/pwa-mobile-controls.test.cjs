/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

function read(relative) {
  return fs.readFileSync(path.join(process.cwd(), relative), "utf8");
}

test("mobile threads lock both document roots and own the visual viewport", () => {
  const hook = read("src/lib/use-mobile-thread-viewport.ts");
  assert.match(hook, /position: "fixed"/);
  assert.match(hook, /root\.style\.overflow = "hidden"/);
  assert.match(hook, /overscrollBehavior: "none"/);
  assert.match(hook, /visualViewport\?\.addEventListener\("resize"/);
  assert.match(hook, /visualViewport\?\.addEventListener\("scroll"/);
  assert.match(hook, /window\.scrollTo\(0, scrollY\)/);

  for (const file of [
    "src/components/chat/chats-panel.tsx",
    "src/components/admin/admin-chats-viewer.tsx",
  ]) {
    const source = read(file);
    assert.match(source, /useMobileThreadViewport\(isMobile && Boolean\(activeId\)/);
    assert.match(source, /overscrollBehavior: "none"/);
    assert.match(source, /touchAction: "pan-y"/);
  }
});

test("closing a mobile thread restores the query-free inbox through real history", () => {
  for (const file of [
    "src/components/chat/chats-panel.tsx",
    "src/components/admin/admin-chats-viewer.tsx",
  ]) {
    const source = read(file);
    assert.match(source, /window\.history\.state\?\.insightThread/);
    assert.match(source, /window\.history\.back\(\)/);
    assert.match(source, /router\.replace\(pathname/);
  }
});

test("help lives in the profile menu instead of floating over the app", () => {
  const modal = read("src/components/layout/contact-modal.tsx");
  const header = read("src/components/layout/dashboard-header.tsx");
  assert.doesNotMatch(modal, /position: "fixed",\s*bottom: "24px"/s);
  assert.match(modal, /insight:open-help/);
  assert.match(header, /dispatchEvent\(new Event\("insight:open-help"\)\)/);
  assert.match(header, />\s*Help\s*</);
});

test("notification test sends only to the authenticated user", () => {
  const route = read("src/app/api/push/test/route.ts");
  const control = read("src/components/layout/push-notification-control.tsx");
  assert.match(route, /const profile = await getUserProfile\(\)/);
  assert.match(route, /if \(!profile\).*401/);
  assert.match(route, /sendPushToUsers\(\s*\[profile\.id\]/s);
  assert.match(control, /fetch\("\/api\/push\/test", \{ method: "POST" \}\)/);
  assert.match(control, /testing \? "Sending…" : "Test"/);
});

test("settings exposes install guidance and a controlled update flow", () => {
  const settings = read("src/components/settings/settings-page.tsx");
  const app = read("src/components/settings/pwa-app-settings.tsx");
  const boundary = read("src/components/service-worker-boundary.tsx");
  const worker = read("public/sw.js");

  assert.match(settings, /id: "app", label: "Mobile app"/);
  assert.match(app, /Install on iPhone/);
  assert.match(app, /Install on Android/);
  assert.match(app, /window\.__insightInstallPrompt/);
  assert.match(app, /registration\.update\(\)/);
  assert.match(app, /postMessage\(\{ type: "SKIP_WAITING" \}\)/);
  assert.match(boundary, /beforeinstallprompt/);
  assert.match(boundary, /visibilitychange/);
  assert.match(worker, /event\.data\?\.type === "SKIP_WAITING"/);
  assert.equal((worker.match(/self\.skipWaiting\(\)/g) || []).length, 1, "worker must not activate updates outside the explicit message handler");
});

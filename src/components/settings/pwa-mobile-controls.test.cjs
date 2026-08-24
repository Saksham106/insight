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

test("keyboard focus removes stale safe-area padding without forcing a message jump", () => {
  const chat = read("src/components/chat/chat-window.tsx");
  assert.match(chat, /const \[composerFocused, setComposerFocused\] = useState\(false\)/);
  assert.match(chat, /if \(!shouldAutoScrollRef\.current\) return/);
  assert.match(chat, /paddingBottom: composerFocused\s*\? "8px"\s*: "max\(8px, env\(safe-area-inset-bottom, 0px\)\)"/s);
  assert.doesNotMatch(chat, /if \(event\.target instanceof HTMLTextAreaElement\) \{\s*shouldAutoScrollRef\.current = true/s);
});

test("mobile onboarding uses visual, platform-correct install and notification steps", () => {
  const app = read("src/components/settings/pwa-app-settings.tsx");
  const guide = read("src/components/settings/mobile-install-guide.tsx");
  assert.match(app, /<MobileInstallGuide platform=\{guide\}/);
  assert.match(guide, /Copy website link/);
  assert.match(guide, /three dots beside myinsightacademy\.com/);
  assert.match(guide, /Tap Share/);
  assert.match(guide, /Add to Home Screen/);
  assert.match(guide, /Install and create shortcut/);
  assert.match(guide, /aria-label="Previous step"/);
  assert.match(guide, /aria-label="Next step"/);
  assert.match(guide, /Turn on notifications/);
});

test("Settings exposes push controls under Notifications", () => {
  const settings = read("src/components/settings/settings-page.tsx");
  assert.match(settings, /id: "notifications", label: "Notifications"/);
  assert.match(settings, /data-notification-control/);
  assert.match(settings, /<PushNotificationControl variant="settings" \/>/);
  assert.match(settings, /24 hours before/);
});

test("the phone notification panel is raised and centered instead of bottom-docked", () => {
  const bell = read("src/components/layout/notification-bell.tsx");
  assert.match(bell, /top: "max\(calc\(env\(safe-area-inset-top, 0px\) \+ 72px\), 10vh\)"/);
  assert.match(bell, /left: "12px"/);
  assert.match(bell, /right: "12px"/);
  assert.doesNotMatch(bell, /isPhone[\s\S]*?bottom: 0,[\s\S]*?maxHeight: "72vh"/);
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
  const guide = read("src/components/settings/mobile-install-guide.tsx");
  const boundary = read("src/components/service-worker-boundary.tsx");
  const worker = read("public/sw.js");

  assert.match(settings, /id: "app", label: "Mobile app"/);
  assert.match(guide, /Install on iPhone/);
  assert.match(guide, /Install on Android/);
  assert.match(app, /catch \{[\s\S]*setGuide\("android"\)/);
  assert.match(app, /window\.__insightInstallPrompt/);
  assert.match(app, /registration\.update\(\)/);
  assert.match(app, /postMessage\(\{ type: "SKIP_WAITING" \}\)/);
  assert.match(boundary, /beforeinstallprompt/);
  assert.match(boundary, /visibilitychange/);
  assert.match(worker, /event\.data\?\.type === "SKIP_WAITING"/);
  assert.equal((worker.match(/self\.skipWaiting\(\)/g) || []).length, 1, "worker must not activate updates outside the explicit message handler");
});

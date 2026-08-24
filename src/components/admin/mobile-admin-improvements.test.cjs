const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = (path) => fs.readFileSync(path, "utf8");

test("mobile Settings detail cards keep inset padding when their desktop header is hidden", () => {
  const settings = read("src/components/settings/settings-page.tsx");
  const css = read("src/app/globals.css");
  assert.match(settings, /CardContent className="settings-section-content"/);
  assert.match(css, /\.settings-section-content[\s\S]*padding-top:/);
});

test("the app viewport prevents destructive page zoom", () => {
  const layout = read("src/app/layout.tsx");
  assert.match(layout, /maximumScale:\s*1/);
  assert.match(layout, /userScalable:\s*false/);
});

test("admin home is active only on the exact admin root", () => {
  const nav = read("src/components/layout/bottom-navigation.tsx");
  assert.match(nav, /function isNavItemActive/);
  assert.ok(nav.includes("item.href === `/${role}`"));
  assert.ok(nav.includes("? pathname === item.href"));
  assert.match(nav, /const active = isNavItemActive\(item, pathname, role\)/);
});

test("admin users render one searchable role-aware directory", () => {
  const dashboard = read("src/components/admin/admin-dashboard.tsx");
  const directory = read("src/components/admin/users-directory.tsx");
  assert.match(dashboard, /<UsersDirectory/);
  assert.doesNotMatch(dashboard, /<TeachersTable|<StudentsTable|<ParentsTable/);
  assert.match(directory, /placeholder="Search people/);
  for (const role of ["All", "Teachers", "Students", "Parents"]) assert.match(directory, new RegExp(`label: "${role}"`));
  assert.match(directory, /roleConfig/);
});

test("one authenticated profile can safely switch among assigned roles", () => {
  const profile = read("src/lib/auth/get-user-profile.ts");
  const route = read("src/app/api/auth/switch-role/route.ts");
  const header = read("src/components/layout/dashboard-header.tsx");
  const migration = read("supabase/migrations/20260824040000_add_profile_roles.sql");
  const syncMigration = read("supabase/migrations/20260824060000_sync_primary_profile_roles.sql");
  assert.match(profile, /profile_roles/);
  assert.match(profile, /insight-active-role/);
  assert.match(route, /profile_roles/);
  assert.match(route, /cookies\(\)/);
  assert.match(route, /httpOnly:\s*true/);
  assert.match(header, /`Switch to \$\{roleLabels\[availableRole\]\}`/);
  assert.match(migration, /create table if not exists public\.profile_roles/);
  assert.match(migration, /create or replace function public\.is_admin/);
  assert.match(syncMigration, /create trigger sync_primary_profile_role/);
  assert.match(syncMigration, /delete from public\.profile_roles[\s\S]*old\.role/);
});

test("chat read state is server-backed so a read message cannot leave a stale badge", () => {
  const unread = read("src/lib/unread-context.tsx");
  const migration = read("supabase/migrations/20260824050000_add_notification_preferences_and_read_state.sql");
  assert.doesNotMatch(unread, /localStorage/);
  assert.match(unread, /mark_conversation_read/);
  assert.match(migration, /last_read_at timestamptz/);
  assert.match(migration, /create or replace function public\.get_unread_counts/);
});

test("marking a conversation read reconciles realtime inserts against the server timestamp", () => {
  const unread = read("src/lib/unread-context.tsx");
  assert.match(unread, /confirmedReadAtRef/);
  assert.match(unread, /eventRevisionRef/);
  assert.match(unread, /payload\.new\.created_at/);
  assert.match(unread, /data[\s\S]*confirmedReadAtRef\.current\.set/);
  assert.match(unread, /await refresh\(\)/);
});

test("out-of-order mark-read responses cannot move the confirmed cutoff backward", () => {
  const unread = read("src/lib/unread-context.tsx");
  assert.match(unread, /Math\.max\([\s\S]*confirmedReadAtRef\.current\.get\(convId\)[\s\S]*Date\.parse\(data as string\)/);
});

test("notification settings control chat alerts, session changes, and reminders", () => {
  const settings = read("src/components/settings/settings-page.tsx");
  const route = read("src/app/api/user/reminders/route.ts");
  const chat = read("src/app/api/chat/messages/route.ts");
  const notifications = read("src/lib/use-notifications.ts");
  for (const field of ["notify_chat_messages", "notify_session_changes", "reminder_24h"]) {
    assert.match(settings, new RegExp(field));
    assert.match(route, new RegExp(field));
  }
  assert.match(chat, /notify_chat_messages/);
  assert.match(notifications, /notify_session_changes/);
  assert.match(settings, /insight-notification-preferences-changed/);
  assert.match(notifications, /insight-notification-preferences-changed/);
});

test("every session-change email producer honors the recipient preference", () => {
  for (const path of [
    "src/lib/email/session-notify.ts",
    "src/app/api/sessions/route.ts",
    "src/app/api/sessions/[id]/route.ts",
    "src/app/api/booking/book/route.ts",
  ]) {
    const producer = read(path);
    assert.match(producer, /notify_session_changes/, `${path} must load the preference`);
    assert.match(producer, /notify_session_changes\s*===\s*false/, `${path} must suppress opted-out email`);
  }
});

test("notification reloads cannot overwrite newer state and filter before the result limit", () => {
  const notifications = read("src/lib/use-notifications.ts");
  assert.match(notifications, /loadRequestRef/);
  assert.match(notifications, /requestId\s*!==\s*loadRequestRef\.current/);
  assert.match(notifications, /\.is\("session_id", null\)[\s\S]*\.limit\(20\)/);
  assert.match(notifications, /return \(\) => \{[\s\S]*loadRequestRef\.current \+= 1/);
});

test("notification setup steps stack cleanly on narrow screens", () => {
  const guide = read("src/components/settings/mobile-install-guide.tsx");
  const css = read("src/app/globals.css");
  assert.match(guide, /notification-quick-guide/);
  assert.match(css, /\.notification-quick-guide\s*\{[\s\S]*grid-template-columns:\s*1fr/);
});

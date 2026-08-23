# PWA / App UX Improvements — Plan

## Guiding principle

Insight is a messaging + scheduling app. On phones it should behave like one: thumb-zone navigation, persistent shell, offline-tolerant views, badges that mean something, and notifications that arrive when the app is closed. Keep the existing warm design language. Do not turn it into a generic app template.

## 1. What I studied

### Navigation patterns
- Bottom tab bars are the dominant mobile pattern for apps with 3–5 top-level destinations. Thumb-friendly, predictable, and they act as the app's "table of contents."
- Chat-centric apps (Messenger, Discord, WhatsApp) often fade the tab bar while you're deep in a conversation and reveal it again when you back out to the top level. That avoids stealing attention from the thread.
- Don't exceed ~5 tabs. If a surface doesn't deserve a tab, it should be a secondary view, a sheet, or an admin-only page, not a tab.

### PWA on iOS / Android
- iOS 16.4+ supports web push for PWAs added to the Home Screen, but only in standalone mode and only after the user grants permission. Android has had Push API + service workers for years.
- Standalone mode hides the browser chrome, so the app needs its own navigation, safe-area handling (`viewport-fit=cover`, `env(safe-area-inset-*)`) for the notch and home indicator, and its own back/organization — there is no browser back button in standalone iOS.
- iOS discards a standalone PWA when you switch away; visibility and lifecycle matter. A service worker is required for push and for offline caching.
- The "app feel" comes from a combination of: manifest + standalone mode, safe areas, a stable shell that doesn't re-layout on every navigation, keyboard-aware sizing (the codebase already uses `dvh` in several places — good), and motion that feels app-like rather than page-like.

### Notifications
- In-app notifications (the existing `notifications` table + realtime) are the baseline and already work.
- Native push for chats/reminders requires: service worker registration, permission prompt tied to a real user action, subscription storage + VAPID handshake on the backend, and a push sender that decides what gets pushed. iOS only delivers when the PWA is installed to Home Screen.

## 2. What the current codebase looks like

### Shell today
- `src/app/layout.tsx`: root metadata + viewport. Currently **no `manifest` metadata**, no `manifest.xml`, no service worker registration, viewport is `width=device-width, initialScale=1` with no `viewport-fit=cover`.
- `src/app/globals.css`: Hallmark-branded custom token system. Already has `prefers-reduced-motion` handling. No safe-area tokens yet.
- `src/components/layout/app-shell.tsx` → `PageMain`: the dashboard body is centered at `maxWidth: 72rem` with a desktop/mobile breakpoint at 768px. Mobile padding shrinks from 24px to 16px. Good starting point, but the whole shell is still "responsive website," not "mobile app shell."
- `src/components/layout/dashboard-header.tsx`: sticky header, role-based tab nav rendered **only on desktop** (>768px). On mobile it becomes a hamburger menu that drops down from the top. That is the biggest reason it feels like a website on phones — you open it and the primary navigation is hidden behind a menu, exactly the opposite of what top mobile apps do.
- `src/components/layout/navigation-progress.tsx`: animated progress bar on navigation. Nice touch, keep it.
- `src/components/layout/timezone-sync.tsx`, `src/components/layout/contact-modal.tsx`, `src/lib/unread-context.tsx`: shell companions.

### Navigation model today
- Role routes:
  - **Admin:** `/admin`, `/admin/users`, `/admin/sessions`, `/admin/chats`, `/admin/hermes`
  - **Teacher:** `/teacher`, `/teacher/schedule`, `/teacher/requests`, `/teacher/students`, `/teacher/chats`
  - **Student:** `/student`, `/student/schedule`, `/student/requests`, `/student/teachers`, `/student/chats`
  - **Parent:** `/parent`, `/parent/schedule`, `/parent/chats`
- Chat surfaces:
  - `src/components/chat/chats-panel.tsx`: two-pane (list + thread) on desktop, single-pane that swaps on mobile. Height uses `calc(100dvh - 13rem)` — already thinking in app terms.
  - `src/components/chat/chat-drawer.tsx`: slide-in drawer for embedded chat (teacher/student overview cards etc.), keyboard-aware via `visualViewport`.
  - `src/components/chat/chat-window.tsx`: the actual message thread, also uses `100dvh - 8rem` when standalone.
- Admin chat viewer (`admin-chats-viewer.tsx`): same two-pane-to-one pattern.

### Notifications today
- `src/lib/use-notifications.ts`: reads from a `notifications` table, subscribes to inserts via realtime, has `markAllRead`. There is a bell in the header and a mobile modal list.
- There is **no service worker, no push subscription flow, no VAPID / send-push endpoint**. So right now notifications are realtime-in-app only.

### Strengths to preserve
- Design language is deliberate and coherent (warm cream paper, amber accent, Bricolage Grotesque display, Geist body). This is a real product look, not a template.
- The chat components already treat mobile as first-class (dvh, keyboard-aware panels, swipe-out drawer, picker-on-mobile pattern).
- Unread infrastructure exists and is realtime — that gives us something to put badges on and eventually push.

## 3. What "feels like an app" means here

1. **Primary navigation is always visible on phones**, in the thumb zone, not hidden behind a hamburger.
2. **The shell is stable**: header stays, tab bar stays, only the page region transitions. No full-page repaint feel when switching tabs.
3. **Safe areas respected** on notched iPhones and the home indicator doesn't get covered.
4. **Standalone/PWA mode** works: manifest, theme color, icon, `viewport-fit=cover`, correct display mode.
5. **Chat is the heart**: when you're in a chat, the UI should feel like a chat app (thread fills, nav optionally yields, badges on the tab).
6. **Badges mean something**: unread counts on the Chat tab, and eventually push-driven badge updates.
7. **Push notifications** for chat mentions and session reminders, with a permission flow that makes sense (ask when there's something to notify about, not on first paint).

## 4. Concrete proposal

### Phase A — PWA foundation + app shell
1. **Add a web app manifest.**
   - `public/manifest.json` (or generated metadata) with `display: standalone`, `scope: /`, `start_url: /`, proper `name`/`short_name`, theme color from the existing token (the navy/accent), and at least a 192/512 icon set. If we don't have nice icons yet, generate simple ones from the logo/wordmark.
   - Wire it via `<link rel="manifest">` in `layout.tsx` plus apple mobile web app capable / apple-touch-icon.
2. **Make the viewport app-aware.**
   - `viewport-fit=cover`, `width=device-width`, `initial-scale=1`, `maximum-scale` and `user-scalable` only if we decide to lock zoom (I'd keep zoom allowed for accessibility, but set the viewport to cover safe areas).
   - Add a `theme-color` meta matching the surface.
3. **Register a service worker.**
   - Start simple: a service worker that caches the app shell + static assets for offline viewing of the landing and previously-loaded dashboards, and that becomes the push anchor later. Use Workbox-style routing or a minimal handwritten SW; the key is that it's registered and stable.
   - This also unlocks future offline caching of chat history and push.
4. **Restructure the mobile header.**
   - Today: hamburger menu on mobile.
   - New: keep the brand + a compact top area, but move the primary role navigation to a **bottom tab bar** for phone sizes. The hamburger becomes either gone or only for overflow admin actions.

### Phase B — Bottom navigation that matches the app

1. **Bottom tab bar for phone roles**, matching each role's top destinations:
   - **Teacher:** Home (overview) · Schedule · Requests · Students · Chats  (5 tabs)
   - **Student:** Home · Schedule · Proposals · Teachers · Chats
   - **Parent:** Home · Schedule · Chats  (3 tabs — add a 4th only if there's a real destination; otherwise keep 3)
   - **Admin:** I'd treat admin differently — admin is a management console, not a daily-use app screen for teachers/students. On phone, admin gets a compact top nav or a focused bottom nav with Overview · Users · Sessions · Chats · Kitty. 5 tabs is acceptable here because admin is the app for that role.
2. **Keep the brand area compact** at the top (wordmark + maybe a thin profile chip), not a giant header eating space.
3. **Chat-first behavior:** when a user is deep in a chat thread, the bottom tab bar can either:
   - stay visible with the Chat tab highlighted (simple, predictable), or
   - fade out while in the thread and reappear on back — more "messaging app" feel.
   I'd start with **stay visible + Chat tab highlighted and badgeable**, because it's simpler and more reliable for a PWA than simulating a native hide/show that can feel jumpy. We can refine to fade later.
4. **Tap feedback and transitions**: tab switches should feel instant; page-level content can fade/slide subtly. Avoid full-height skeleton blinks.

### Phase C — Chat as a first-class app surface

1. **Chat tab opens straight to the conversations list**, and the list → thread transition should feel like an app navigation (thread takes over, with a clear back affordance on mobile).
2. **Unread badge on the Chat tab** from the existing `UnreadProvider` total. That already exists in `use-chat-unread-total.ts` / `unread-context.tsx` — surface it on the tab.
3. **Keep the mobile picker → thread pattern** that `chat-drawer` and `chats-panel` already do, but make it consistent across teacher/student/parent/admin chat entry points.

### Phase D — Notifications: in-app polish first, then push

1. **In-app notification UX.**
   - The existing bell + modal is fine on desktop; on mobile it should feel like a notification center, not a modal squeezed into a small screen.
   - Show unread dividers, timestamps, and tap-to-deep-link where possible (e.g., a session-reminder notification deep-links to the schedule; a chat notification deep-links to that conversation).
2. **Push notifications (near-native where supported).**
   - Add a `notifications` permission flow that only triggers when there's a reason (e.g., user has a session upcoming, or has unread chat). Don't ask on first load.
   - Register a service worker, subscribe to push (VAPID), store the subscription on the server.
   - Backend: an endpoint that accepts push payloads and sends via Web Push (and, where supported, APNs-backed web push on iOS). For MVP, push chat notifications and session reminders.
   - **Reality check:** iOS web push only works for PWAs added to the Home Screen on iOS 16.4+. So we must promote "Add to Home Screen" and detect standalone mode, and make sure the app is good enough in standalone that people actually add it.
3. **Badge integration.**
   - Where the platform supports it (Android, and iOS standalone with push), mirror unread state into the app badge via the service worker / Notifications API. Start with the chat unread count.

### Phase E — Polish that makes it feel native

1. **Safe area padding** on the bottom tab bar and any fixed UI: `padding-bottom: env(safe-area-inset-bottom)` and similarly for top where content sits under the status bar.
2. **Home-screen icon + splash** so adding to Home Screen feels intentional.
3. **Offline / degraded states**: if the service worker can't reach the server, show a calm "you're offline" state rather than a crash/blank. At minimum, cache the shell and let users see their last-loaded chat list with a clear stale indicator.
4. **Gesture/back consistency** on mobile: since standalone iOS has no browser back, make sure in-app back (for chat threads, drawn modals) is discoverable and consistent.
5. **Keyboard / viewport handling**: the codebase already uses `dvh` in several places; keep that and make sure the bottom tab bar doesn't get hidden behind the keyboard when composing a message.

## 5. What I would not do

- Don't add a bottom bar with more than 5 tabs, and don't force one role's structure onto another.
- Don't hide primary navigation on mobile behind a hamburger menu — that's the current "website feel" we're fixing.
- Don't promise native iOS push for everyone. It's strictly "PWA added to Home Screen, iOS 16.4+." We support it where it works and degrade gracefully.
- Don't gut the design language to chase a generic "app" look. The value here is a calm, warm, focused tutoring app — not a clone of Discord or Messenger.

## 6. Suggested ordering

1. **PWA manifest + viewport + icons + service worker registration** — enables standalone mode and push later.
2. **Restructure mobile navigation** from hamburger to bottom tab bar (biggest "app feel" win).
3. **Chat tab + unread badge** on the tab.
4. **Notification center polish + deep links**.
5. **Push: permission flow → subscription storage → send endpoint → chat + reminder push**, plus badge mirroring where supported.
6. **Safe areas + home-screen/splash polish + offline states**.

If you want, I can now start executing Phase A and the mobile navigation restructure, and stop to show you the result before going further.

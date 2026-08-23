# PWA / Mobile App Shell — Implementation Status

> Status: implemented on `feat/pwa-mobile` (Aug 23, 2026). Supersedes the
> original spec's Phase 1–2 scope. Native push (Phase 3) remains future work.

## What shipped

### PWA foundation
- `public/manifest.json` — standalone display, theme `#1b3560`, real PNG icons:
  192/512 "any" + dedicated 512 maskable (safe-zone padded).
- `public/icons/*.png` generated from the brand mark by
  `scripts/generate-icons.js` (sharp). Re-run it if the brand mark changes.
- `public/sw.js` — hand-rolled service worker:
  - navigations: network-first with cache fallback (`/`, `/login`)
  - static assets (images/CSS/JS/fonts): stale-while-revalidate
  - never intercepts `/api/*` or anything Supabase — auth and data stay live.
- `src/components/service-worker-boundary.tsx` — client-only registration in
  the root layout; applies worker updates on next load.
- Root layout: `viewport-fit=cover`, `themeColor`, manifest + apple-web-app +
  PNG icon metadata. iOS home-screen installs now get a real icon and
  standalone window.

### Mobile navigation
- `src/components/layout/bottom-navigation.tsx` — fixed bottom tab bar at
  ≤768px, per-role tabs, live Chats unread badge from `UnreadProvider`,
  safe-area-inset padding, active-state dot. Viewport detection via
  `useSyncExternalStore` (no hydration flash, no effect-setState).
- `dashboard-header.tsx`: mobile hamburger + slide-down menu removed — the tab
  bar replaces them. Notification bell is now visible on mobile too (it was
  desktop-only). Desktop header nav unchanged.

### Polish
- `offline-indicator.tsx` — self-contained client component listening to
  real online/offline events (the previous server-side `navigator.onLine`
  prop could never report offline).
- `page-main.tsx` — bottom padding clears the tab bar + safe area on phones.
- `app-shell.tsx` wires the indicator into the shell.

## Deliberately rejected
- `next.config.pwa.js` / `next-pwa` — would have required a new dependency and
  its generated worker would clobber the hand-written one. Dropped.
- Duplicate `mobile-navigation.tsx` (unused, used `require()` for icons) and
  `public/generate-icons.js` (a fake SW that drew icons into a cache instead of
  serving files). Deleted.
- Branch rewrites of the notification center that broke against the actual
  `Notification` type shape. Main's working bell/list implementation kept.

## Out of scope (parked)
- Google/Apple OAuth via Supabase was explored mid-session and abandoned — no
  committed artifacts; `supabase/config.toml` untouched.
- Native web push (VAPID + subscription storage) is the next phase; the SW is
  push-ready but no prompt/backend exists yet.

## Verification
- `next build` passes; eslint clean on all touched files; tsc shows only the
  two pre-existing `admin/hermes/cases/[id]` errors present on main.
- Served checks (dev): manifest link, viewport-fit, theme-color, apple-touch
  PNG, both any-icons, `/manifest.json`, `/sw.js`, and all four PNGs → PASS.

## Test plan for a phone
1. Open the site in Safari (iOS) / Chrome (Android).
2. iOS: Share → Add to Home Screen. Android: menu → Install app.
3. Confirm the icon renders (not a screenshot tile) and the app opens
   standalone, status bar styled, no browser chrome.
4. Confirm the bottom tab bar matches your role and the Chats badge counts
   unread messages live.
5. Airplane mode → reopen the installed app: shell loads from cache and the
   offline banner appears.

# Region migration + remaining manual steps

Context (from the 2026-07-13 performance audit): users are served from Asian edges
(Singapore/Hong Kong), but Vercel functions run in `iad1` (Washington DC, the
default) and the Supabase project is in a US region. Every browser↔Supabase round
trip costs ~250–400ms. Colocating both near users is the single biggest speedup
available. The code changes shipped alongside this doc reduce round-trip *counts*;
this runbook removes the per-round-trip *cost*.

## 0. Before anything

- Confirm where the actual users are (admin + students/parents). If they are in
  South/Southeast Asia, target `ap-southeast-1` (Singapore) for Supabase and
  `sin1` for Vercel. If users are mostly elsewhere, pick the matching pair —
  the rule is: **Vercel function region and Supabase region must be the same
  place, and that place should be near users.**
- Find the Vercel account that owns the production project. It is NOT under the
  `shivansh-goels-projects` team — deployment settings and env vars live in that
  other account. Also confirm the latest `main` commits are actually deployed.

## 1. Create the new Supabase project (Singapore)

Supabase cannot move a project between regions in place; you create a new project
and restore into it.

1. Dashboard → New project → region `ap-southeast-1`. The database is tiny
   (~1 MB), so any instance size works; match the current tier.
2. Note the new project ref, URL, anon key, and service-role key.

## 2. Restore schema + data

1. From the old project: Database → Backups, or locally:
   `supabase db dump --db-url <old-conn-string> -f dump.sql`
   (get the pooler connection string from Dashboard → Connect).
2. Apply to the new project: `psql <new-conn-string> -f dump.sql`
   (or run the repo's `supabase/migrations` in order, then dump/restore data only).
3. Verify: tables, RLS policies (`pg_policies`), functions (incl.
   `get_unread_counts`), triggers, and row counts match.

## 3. Migrate Auth users

`supabase db dump` does not include `auth` schema data by default. Easiest path at
this user count (~46): dump the `auth.users` + `auth.identities` tables explicitly
(`pg_dump --schema=auth --data-only`) and restore them, so password hashes and
user IDs survive. All `public.profiles` FKs reference `auth.users.id`, so IDs must
be preserved exactly.

## 4. Migrate Storage

1. Recreate buckets `chat-attachments` (public for now, 10 MB limit) and
   `profile-photos` (public, 2 MB, image mime allow-list).
2. Copy the ~18 MB of objects with a small script (list + download from old,
   upload to new, preserving paths), or the Supabase CLI.
3. `messages.file_url` values embed the OLD project domain. Rewrite them:
   `update public.messages set file_url = replace(file_url, '<old-ref>.supabase.co', '<new-ref>.supabase.co') where file_url is not null;`
   (same for `profiles.avatar_url` if present).

## 5. Auth settings on the new project

- Site URL: `https://myinsightacademy.com`; add redirect URLs used by the app
  (`/auth/callback`).
- SMTP/Resend settings if configured in the dashboard.
- **Enable leaked password protection** (advisor warning, one toggle).
- **Set email OTP expiry below 1 hour** (advisor warning).

## 6. Cut over

1. In the Vercel project (the owning account): update
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY` to the new project.
2. Add the function region pin — `vercel.json`:
   ```json
   { "regions": ["sin1"], "crons": [ { "path": "/api/cron/reminders", "schedule": "0 0 * * *" } ] }
   ```
   Do NOT ship the `regions` change before the database moves — Singapore
   functions talking to a US database would be slower than today.
3. Update `.env.local` locally. Redeploy. Old project keeps working until env
   vars flip, so downtime is roughly one redeploy.
4. Sanity pass: login, dashboard badges, chat send/receive, file upload/download,
   booking, notifications.

## 7. Post-deploy hardening (after the new code is live)

- Flip `chat-attachments` to **private** (Dashboard → Storage → bucket settings).
  The message list now resolves signed URLs (with the stored public URL as
  fallback), so this is safe once the current code is deployed. Old messages keep
  working — paths are extracted from the stored URLs.
- Optional cleanup: 4 orphaned files in `chat-attachments/d382e07a-…` belong to a
  deleted conversation; no message references them.

## 8. Decommission

Pause/delete the old Supabase project after a comfortable soak (a week), keeping a
final backup download.

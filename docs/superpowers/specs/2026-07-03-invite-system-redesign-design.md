# Invite System Redesign

## Problem

The current invite flow relies on Supabase's magic-link / PKCE invite mechanism
(`inviteUserByEmail`, `generateLink({type:"invite"})`) and a shared `/set-password`
page that reconciles hash-fragment tokens, `code` query params, and expired-OTP
errors. In practice this breaks often: the "Accept invite" link frequently fails
to open the set-password page, and users report being stuck. Three separate bug
fixes in recent history (`Fix active user detection...` x3, `Fix invite resend...`)
were all attempts to patch symptoms of the same root cause: the flow depends on a
link that has to survive email clients, redirect-URL allowlists, and token expiry,
and it never fully worked reliably.

## Goals

- Inviting a user creates a **fully working account immediately** — no link to
  click, no token that can expire or fail to open.
- The email just needs to deliver a login/password; if it doesn't arrive, the
  admin can read the password off the screen and relay it manually.
- Existing active users must never be affected — no risk of locking someone out
  who already uses the app.
- Existing invites stuck in the old broken state should be recoverable through
  the same admin action used for new invites, not a separate migration.

## Non-goals / explicitly unchanged

- `/forgot-password`, `/auth/callback`, `/set-password` — this is a working,
  separate flow (Supabase `resetPasswordForEmail` → recovery code exchange) and
  shares no code path with invites after this change. Not touched.
- No change to how admins toggle `is_active` (enable/disable).
- No change to the generic admin "compose email" feature.

## Architecture / flow

### New invite (no existing auth user for this email)

1. Admin submits invite form (`CreateTeacherForm` / `CreateStudentForm`) →
   `POST /api/admin/invite-user`.
2. Route generates a 10-character password (see "Password generation" below).
3. `supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true })`
   creates a confirmed, immediately-usable auth user in one call. Replaces
   `inviteUserByEmail` entirely.
4. Upsert `profiles` (`full_name`, `role`, `is_active: true`, `invite_sent_at`) —
   unchanged from today.
5. Send one Resend email containing the email + generated password, a link to
   `/login`, and a note recommending the user change their password via
   Settings → Password after logging in.
6. API responds `{ ok: true, password: <generated> }`. The admin UI shows the
   password once in a dismissible success banner, so it can be manually relayed
   if the email doesn't arrive.

### Duplicate email (an auth user already exists for this email)

This is the load-bearing safety check. Branch on whether the account has ever
actually been used:

- **Never used** — no login ever (`auth.users.last_sign_in_at IS NULL`) and no
  manual password change (`profiles.password_set_at IS NULL`). Safe to treat as
  "resend credentials": generate a new password, `updateUserById(uid, { password })`,
  re-send the same email template. This is the common case (lost email, invite
  sent before this change and never completed) and requires no special-casing —
  the same code path handles brand-new invites and stragglers from the old system.
- **Already active** — `last_sign_in_at` is set, or `password_set_at` is set.
  Block with a 409, same orange "user is already active" warning the admin UI
  shows today. No password is touched. If an admin genuinely needs to reset an
  active user's password, that's the existing Forgot Password flow — out of
  scope here.

Replaces the `user_has_password` RPC + `listUsers` fallback with a single new
RPC, e.g. `get_invite_user_state(p_email text)` (`SECURITY DEFINER`), returning
`auth_user_id`, `last_sign_in_at`, and joins `profiles.password_set_at` for that
email in one round trip.

### Password-changed tracking

`profiles.password_set_at` currently is only stamped by the old magic-link
`/set-password` completion. Since invited users now get a working password
immediately, this column's meaning shifts to **"user has manually changed their
initial password."** Stamped by adding one `fetch("/api/user/onboarding", {event:
"password_set"})` call to `handlePasswordSave` in
`src/components/settings/settings-page.tsx`, right after a successful
`supabase.auth.updateUser({ password })`. No changes needed to the
`/api/user/onboarding` route itself — it already handles this event generically
for any authenticated user.

`profiles.invite_accepted_at` stops being written or read anywhere (no code
path reaches it once `inviteUserByEmail`/`/auth/callback`-for-invites is gone).
Left in the schema unused rather than migrated away — not worth a schema change
for a column no longer referenced.

### Admin UI changes

- `onboarding-status.ts`: simplified to three states derived from
  `last_sign_in_at` / `password_set_at`:
  - **Invite sent** — never logged in.
  - **Logged in (temp password)** — logged in at least once, never changed password.
  - **Password changed** — `password_set_at` is set.
- `TeachersTable` / `StudentsTable`: add a persistent "Resend credentials" row
  action for any user in the "Invite sent" or "Logged in (temp password)"
  state (i.e. never manually changed their password) — today resend is only
  reachable transiently right after a 409 on the invite form. This closes a
  known gap (an admin currently can't resend to a stale invite without
  re-submitting the form) at negligible extra cost since the same code path is
  being touched anyway.
- `CreateTeacherForm` / `CreateStudentForm`: on success, show the generated
  password in a dismissible banner. On 409 "never used," keep today's
  "Resend invite" button (relabeled "Resend credentials"). On 409 "already
  active," keep today's orange warning, no action.

### Password generation

New helper, e.g. `src/lib/auth/generate-temp-password.ts`:

- 10 characters, drawn from uppercase + lowercase + digits, excluding visually
  ambiguous characters (`0/O`, `1/l/I`).
- Guarantees at least one uppercase, one lowercase, and one digit (fill
  remaining characters randomly from the full alphabet, then shuffle) so it
  always satisfies typical complexity expectations even though Supabase's own
  minimum is only 6 characters.
- Uses `node:crypto` (`crypto.randomInt`), not `Math.random`.
- No symbols — keeps it easy to type by hand or read off an admin's screen,
  per the original ask ("10 letter password").

### Email content

Replaces `buildInviteEmail()` in `src/app/api/admin/invite-user/route.ts` (used
today only in the resend branch) as the single template for both new-invite and
resend-credentials sends. Content: "You've been invited to Insight Academy as a
{role}. Email: {email} / Password: {password}. Log in at {loginUrl}. We
recommend changing your password after logging in via Settings → Password."
Uses the shared `getEmailFrom()` helper (today the invite route hardcodes
`EMAIL_FROM` directly, inconsistent with `send-email/route.ts` — fixed as part
of this rewrite since the code is being touched anyway).

## Error handling

- `createUser` / `updateUserById` failures return a 500 with the Supabase error
  message; profile upsert is skipped if account creation failed (avoid
  orphaned `profiles` rows pointing at nonexistent auth users).
- Email send failure (Resend API error) does **not** fail the request — the
  account and profile are already created/updated by that point, and the
  generated password is still returned in the API response for manual relay.
  Surface a non-blocking warning in the admin UI ("account created, but the
  email failed to send — share this password manually") rather than rolling
  back.
- Duplicate-email RPC failure: fail closed (return a generic error, do not
  fall through to creating a duplicate account).

## Testing

- Unit test the password generator: length, character set, guaranteed
  class coverage, no ambiguous characters.
- Manual/integration check of both branches of the invite route: brand-new
  email (account created, login works with returned password) and duplicate
  email in both the never-used and already-active states (resend vs. block).
- Manual check that Settings → Password change now stamps `password_set_at`
  and that the admin table badge updates accordingly.
- Confirm `/forgot-password` → `/auth/callback` → `/set-password` still works
  unmodified.

## Open implementation notes

- `supabaseAdmin.auth.admin.createUser` and `updateUserById` both confirmed
  present in the installed `@supabase/supabase-js@^2.105.4` (`AdminUserAttributes`
  accepts `email`, `password`, `email_confirm`).
- New RPC migration needed for `get_invite_user_state`; existing
  `user_has_password` RPC can be left in place (unused) or dropped in the same
  migration — decide at plan time.

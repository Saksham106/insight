# Kitty group class rollout record

Date: 2026-08-06

Branch: `codex/kitty-class-calendar`

Activation status: **blocked; feature remains disabled**

## Verified locally

- `KITTY_CLASS_CALENDAR_ENABLED` remains false by default and is explicitly configured as `false` for Vercel Preview only. Production was not changed.
- The complete Node suite passed with the disposable PostgreSQL probes enabled: 370 passed, 0 failed, 0 skipped.
- The Academy profile and scheduling plugin suite passed: 26 passed, 0 failed.
- `npx tsc --noEmit --incremental false` passed.
- `npm run build` completed with Next.js 16.2.6 and generated all 71 static pages.
- Seven PostgreSQL acceptance paths passed, including repeated migration application, rejection of an inconsistent legacy roster, group creation and enrollment changes, relay privacy and idempotency, group approval concurrency, admin retry rules, and attention lifecycle handling. The retained final-chain path applies `20260806114049_index_kitty_foreign_keys.sql` and queries `pg_constraint` plus `pg_index` to reject any uncovered Kitty foreign key.

## Database security and performance review

The known zero-byte legacy migration `20260511133119_remote_schema.sql` prevents a complete `supabase db reset`. The reviewed Kitty migration chain was therefore applied to a disposable PostgreSQL 16 database and exercised by the repository's runtime probes.

The disposable database confirmed:

- all 11 Kitty tables have RLS enabled;
- `PUBLIC` and `anon` have no Kitty table privileges;
- `authenticated` has no Kitty table mutation privileges;
- `anon` and `authenticated` cannot execute Kitty `SECURITY DEFINER` functions;
- every Kitty definer has a fixed `search_path`;
- all Kitty foreign keys have a covering index after `20260806114049_index_kitty_foreign_keys.sql`; and
- Supabase warn-level advisors reported no Kitty warning.

`supabase db lint` could not run against the vanilla PostgreSQL image because it does not include `plpgsql_check`. The runtime SQL probes compiled and executed every reviewed Kitty migration and mutation path instead. Supabase table statistics completed successfully. Info-level unused-index notices are expected on the empty disposable database and are not evidence that the indexes are unnecessary in production.

## External target inventory

- GitHub: `Saksham106/insight`, default branch `main`; GitHub CLI authentication is valid.
- Supabase: the existing main-checkout link points to the active healthy `insight` project, ref `gowmtxtlfvfawuapprcf`.
- Vercel: the existing main-checkout link points to project `insight`, project ID `prj_BF6Lada825E2GEGTWZSq1im0MJok`.

No project was relinked.

## Blocking gates

### Supabase migration drift

The linked migration list has substantial pre-existing two-way drift: many local-only versions and many remote-only versions from May through August 2026. Applying the Kitty migrations in that state could misrepresent or collide with the live schema history. No linked dry run or database push was attempted. Reconcile the migration history in a separate reviewed operation, then rerun `supabase migration list --linked` and a dry-run push before applying any Kitty migration.

### Vercel authentication and environment

The reviewed PR head `d6f57ed39e207a7f3af5c0c6818e7d65ffc601d1` built successfully through the GitHub integration as deployment `EVmWWYZUsxhmyuXZM9iENJnoZwBZ` at `https://insight-git-codex-kitty-8d71eb-saksham-goels-projects-0ecf36cd.vercel.app`. The earlier `551b1eb8854a5cf8ccc9da0aba29eafd35c64ca9` preview was deployment `H3be5zBDxMA4ojJW3Tk4xN8XfB13`.

The preview is protected by Vercel SSO. Unauthenticated GET `/`, POST `/api/hermes/class-tools`, and POST `/api/cron/kitty-classes` each returned HTTP 302 to the Vercel SSO endpoint, so application-level disabled responses could not be observed externally.

Vercel CLI 54.21.1 initially reported `No existing credentials found` and started its device-login flow. While that read-only state check was being stopped, the already-authenticated device flow completed without a manually entered code and the CLI reported the account as `saksham106`.

Using that session, only `KITTY_CLASS_CALENDAR_ENABLED=false` was added to Preview. Production and all other variables were left unchanged. Redeploying reviewed head `b398e7357f7f73b98518947e26896269358f347d` created Preview deployment `dpl_3y1dixc8ocmjqobPeKxutDrTZVyi` at `https://insight-mct3av007-saksham-goels-projects-0ecf36cd.vercel.app`; Vercel reported target `preview` and status `Ready`, with the branch alias attached. The GitHub checks for the same head's source deployment remained successful.

Authenticated protected-preview probes returned HTTP 200 for GET `/` and HTTP 404 with the safe `Not found` response for POST `/api/hermes/class-tools`, proving the feature flag is disabled in the application. An unsigned maintenance request returned HTTP 401 as designed because cron authentication precedes the feature gate. Preview has no `CRON_SECRET`, so the authenticated maintenance 404 cannot be tested without inventing a credential; none was added. The temporary environment file used to check name presence was deleted, and no value was printed. Vercel CLI generated its normal deployment-protection bypass token automatically for the project; the token value was not displayed or stored in the repository.

The existing local production-environment snapshot contains empty Supabase values and does not contain the dedicated Kitty tool URL or required Kitty template variables. Those unknown values were not added.

The required Kitty configuration names are:

- `KITTY_CLASS_CALENDAR_ENABLED`
- `INSIGHT_KITTY_CLASS_TOOL_URL`
- `WHATSAPP_TEMPLATE_CLASS_CHANGE_REQUEST`
- `WHATSAPP_TEMPLATE_CLASS_CHANGE_PROPOSAL`
- `WHATSAPP_TEMPLATE_CLASS_CANCELLED`
- `WHATSAPP_TEMPLATE_CLASS_RESCHEDULED`
- `WHATSAPP_TEMPLATE_CLASS_CHANGE_REJECTED`
- `WHATSAPP_TEMPLATE_CLASS_ATTENDANCE_UPDATE`
- `WHATSAPP_TEMPLATE_CLASS_TEACHER_DELAY`
- `WHATSAPP_TEMPLATE_CLASS_OPERATIONAL_UPDATE`
- `WHATSAPP_TEMPLATE_HUMAN_ATTENTION`

The existing Meta sender secret names are present in the snapshot, but values were never printed or changed. No approved Kitty Utility template values were discoverable, so none were fabricated.

### External delivery pilot

There is no configured provider sandbox or explicitly selected safe contact in the repository or linked environment snapshot. The synthetic database/application pilot passed, but no WhatsApp message was sent. Activation requires approved Utility templates and a selected-contact delivery pilot covering individual and group classes, student and parent absence, teacher cancellation, every-enrollment reschedule approval, ambiguity, failed delivery and safe retry, cross-family privacy, audit/outbox state, and proof that Academy tables do not change.

## Safe continuation order

1. Reconcile Supabase migration history without discarding remote-only changes.
2. Configure an existing approved Preview `CRON_SECRET` only when an exact value is available, then verify the authenticated maintenance route returns the disabled 404.
3. Verify the protected admin UI with an approved Preview admin session; the public page and disabled class-tool API are already healthy.
4. Dry-run and apply only the reviewed Kitty migrations while disabled.
5. Configure approved Utility template names and the exact tool URL while keeping the flag false.
6. Run the explicitly selected-contact pilot and verify provider delivery records.
7. Activate only if every gate passes, immediately prove the false rollback switch, and restore true only after smoke checks pass.

Rollback never deletes Kitty history and never changes Academy sessions, assignments, availability, lesson-ledger evidence, settlements, Calendar events, or ordinary chats.

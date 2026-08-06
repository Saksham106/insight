# Kitty group class rollout record

Date: 2026-08-06

Branch: `codex/kitty-class-calendar`

Activation status: **blocked; feature remains disabled**

## Verified locally

- `KITTY_CLASS_CALENDAR_ENABLED` remains false by default. No production or preview environment was changed.
- The complete Node suite passed with the disposable PostgreSQL probes enabled: 371 passed, 0 failed, 0 skipped.
- The Academy profile and scheduling plugin suite passed: 26 passed, 0 failed.
- `npx tsc --noEmit --incremental false` passed.
- `npm run build` completed with Next.js 16.2.6 and generated all 71 static pages.
- Seven PostgreSQL acceptance paths passed, including repeated migration application, rejection of an inconsistent legacy roster, group creation and enrollment changes, relay privacy and idempotency, group approval concurrency, admin retry rules, and attention lifecycle handling.

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

Vercel CLI 54.21.1 reports that the saved token is invalid. The existing local production-environment snapshot contains empty Supabase values and does not contain the Kitty flag, dedicated tool URL, or required Kitty template variables. It cannot support a realistic disabled HTTP smoke test or preview deployment.

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
2. Restore Vercel CLI authentication and inspect environment names without exposing values.
3. Create a preview with `KITTY_CLASS_CALENDAR_ENABLED=false` and verify the disabled API and admin UI.
4. Dry-run and apply only the reviewed Kitty migrations while disabled.
5. Configure approved Utility template names and the exact tool URL while keeping the flag false.
6. Run the explicitly selected-contact pilot and verify provider delivery records.
7. Activate only if every gate passes, immediately prove the false rollback switch, and restore true only after smoke checks pass.

Rollback never deletes Kitty history and never changes Academy sessions, assignments, availability, lesson-ledger evidence, settlements, Calendar events, or ordinary chats.

# Supabase migration history

## Canonical history

The files in `supabase/migrations` through `20260804015855` are the exact migration history fetched from the linked production project on 2026-08-06. They replace a reconstructed local history that contained a zero-byte placeholder, a duplicate timestamp, renamed migrations, and SQL that did not match production.

Do not use `supabase migration repair` to reconcile file drift. Repair changes the remote ledger without applying schema changes and is not appropriate when production history is already internally consistent.

## Adding migrations

1. Rebase on the reconciled default branch.
2. Generate a new timestamped migration after the latest committed migration.
3. Keep one SQL file per 14-digit version and never add an empty placeholder.
4. Run `node --test src/lib/supabase/migration-history.test.cjs`.
5. Run `supabase migration list --linked` and confirm there are no remote-only versions.
6. Run `supabase db push --linked --dry-run` and review every listed migration before any real push.

## Pending feature migrations

The contact-import migration `20260804120000_preserve_known_hermes_contacts_on_import.sql` exists on its own feature branch and is not part of this production-history reconciliation. Review and ship it independently as a normal pending migration.

The Kitty class-calendar branch must be rebased after this reconciliation lands. Its linked dry run must list only these eight Kitty migrations:

- `20260805120000`
- `20260805222827`
- `20260805235110`
- `20260806005742`
- `20260806020109`
- `20260806040937`
- `20260806042747`
- `20260806114049`

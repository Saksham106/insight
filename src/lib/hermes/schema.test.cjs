/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const migrationsDir = path.join(process.cwd(), "supabase", "migrations");

function readHermesMigration() {
  const file = fs
    .readdirSync(migrationsDir)
    .find((name) => name.endsWith("_add_hermes_assistant.sql"));
  assert.ok(file, "Hermes assistant migration should exist");
  return fs.readFileSync(path.join(migrationsDir, file), "utf8").toLowerCase();
}

function readMigration(suffix) {
  const file = fs.readdirSync(migrationsDir).find((name) => name.endsWith(suffix));
  assert.ok(file, `${suffix} migration should exist`);
  return fs.readFileSync(path.join(migrationsDir, file), "utf8").toLowerCase();
}

test("Hermes migration creates the complete assistant data model", () => {
  const sql = readHermesMigration();
  for (const table of [
    "hermes_contacts",
    "hermes_contact_relationships",
    "hermes_import_batches",
    "hermes_scheduling_cases",
    "hermes_case_participants",
    "hermes_messages",
    "hermes_approvals",
    "hermes_audit_events",
  ]) {
    assert.match(sql, new RegExp(`create table(?: if not exists)? public\\.${table}`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
});

test("Hermes contacts enforce phone, role, policy, and optional portal linking", () => {
  const sql = readHermesMigration();
  assert.match(sql, /whatsapp_e164 text not null unique/);
  assert.ok(sql.includes("check (whatsapp_e164 ~ '^\\+[1-9]\\d{7,14}$')"));
  assert.match(sql, /role in \('teacher', 'student', 'parent', 'employee', 'other', 'unclassified'\)/);
  assert.match(sql, /communication_policy in \('direct', 'guardian_only', 'approval_required', 'paused', 'opted_out'\)/);
  assert.match(sql, /profile_id uuid.*references public\.profiles\(id\) on delete set null/);
  assert.match(sql, /create unique index.*hermes_contacts_profile_unique/);
});

test("Hermes tables use admin-only browser policies and no anon grants", () => {
  const sql = [
    readHermesMigration(),
    readMigration("_harden_hermes_anon_grants.sql"),
  ].join("\n");
  assert.doesNotMatch(sql, /grant [^;]+ to anon/);
  for (const table of ["hermes_import_batches", "hermes_contacts", "hermes_contact_relationships", "hermes_scheduling_cases", "hermes_case_participants", "hermes_approvals"]) {
    assert.match(sql, new RegExp(`revoke all on table public\\.${table} from anon`));
  }
  assert.match(sql, /public\.is_admin\(\)/);
  assert.match(sql, /grant select, insert, update, delete on table public\.hermes_contacts to authenticated/);
  assert.match(sql, /revoke all on table public\.hermes_messages from anon, authenticated/);
  assert.match(sql, /revoke all on table public\.hermes_audit_events from anon, authenticated/);
});

test("Hermes migration indexes case, message, and attention access paths", () => {
  const sql = [
    readHermesMigration(),
    readMigration("_add_hermes_fk_indexes.sql"),
  ].join("\n");
  assert.match(sql, /create index.*hermes_contacts_attention/);
  assert.match(sql, /create index.*hermes_cases_status/);
  assert.match(sql, /create index.*hermes_messages_contact_created/);
  assert.match(sql, /create unique index.*hermes_messages_meta_id_unique/);
  for (const index of ["hermes_approvals_case_id_idx", "hermes_audit_actor_contact_idx", "hermes_contacts_import_batch_idx", "hermes_messages_case_id_idx", "hermes_cases_requested_by_idx"]) {
    assert.match(sql, new RegExp(`create index.*${index}`));
  }
});

test("Hermes scheduling cases record their intake channel and actor kind", () => {
  const originMigration = fs.readFileSync(
    path.join(migrationsDir, "20260716150000_add_hermes_case_origin.sql"),
    "utf8",
  );
  assert.match(originMigration, /add column if not exists origin_platform text not null default 'whatsapp_cloud'/i);
  assert.match(originMigration, /origin_platform in \('whatsapp_cloud', 'imessage', 'admin'\)/i);
  assert.match(originMigration, /add column if not exists origin_actor_kind text not null default 'admin'/i);
  assert.match(originMigration, /origin_actor_kind in \('admin', 'contact'\)/i);
});

test("Workspace jobs are server-only, leased transactionally, and service-role controlled", () => {
  const sql = fs.readFileSync(
    path.join(migrationsDir, "20260716151000_add_hermes_workspace_jobs.sql"),
    "utf8",
  ).toLowerCase();
  assert.match(sql, /create table if not exists public\.hermes_workspace_jobs/);
  assert.match(sql, /job_type in \('calendar_freebusy'\)/);
  assert.match(sql, /status in \('queued', 'leased', 'succeeded', 'retryable_failed', 'permanent_failed', 'cancelled'\)/);
  assert.match(sql, /idempotency_key text not null unique/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on table public\.hermes_workspace_jobs from anon, authenticated/);
  assert.match(sql, /grant all on table public\.hermes_workspace_jobs to service_role/);
  assert.match(sql, /for update skip locked/);
  assert.match(sql, /lease_owner = p_worker_id/);
  assert.match(sql, /p_status = 'retryable_failed' and attempt_count >= max_attempts/);
  assert.match(sql, /revoke execute on function public\.claim_hermes_workspace_jobs/);
  assert.match(sql, /grant execute on function public\.claim_hermes_workspace_jobs[^;]+to service_role/);
  assert.match(sql, /grant execute on function public\.complete_hermes_workspace_job[^;]+to service_role/);
  assert.match(sql, /add column if not exists workspace_state text not null default 'not_required'/);
});

test("Calendar event jobs bind explicit tutor ownership, job type, and server-only links", () => {
  const sql = fs.readFileSync(
    path.join(migrationsDir, "20260716152000_add_hermes_calendar_event_jobs.sql"),
    "utf8",
  ).toLowerCase();
  assert.match(sql, /add column if not exists tutor_kind text not null default 'academy_tutor'/);
  assert.match(sql, /tutor_kind in \('swati', 'academy_tutor'\)/);
  assert.match(sql, /job_type in \('calendar_freebusy', 'calendar_create_event'\)/);
  assert.match(sql, /create table public\.hermes_calendar_links/);
  assert.match(sql, /case_id uuid not null unique/);
  assert.match(sql, /calendar_event_id text not null unique/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on table public\.hermes_calendar_links from anon, authenticated/);
  assert.match(sql, /job_type = p_job_type/);
  assert.match(sql, /error_code = 'calendar_conflict'/);
  assert.match(sql, /workspace_state = 'stale'/);
  assert.match(sql, /status = 'needs_attention'/);
  assert.match(sql, /insert into public\.hermes_calendar_links/);
  assert.match(sql, /grant execute on function public\.complete_hermes_workspace_job\(uuid, text, text, text, jsonb, text\) to service_role/);
});

test("exact approval confirmation atomically enqueues only Swati Calendar writes", () => {
  const sql = fs.readFileSync(
    path.join(migrationsDir, "20260716152100_enqueue_approved_calendar_event.sql"),
    "utf8",
  ).toLowerCase();
  assert.match(sql, /drop function if exists public\.confirm_hermes_class\(uuid, uuid, jsonb\)/);
  assert.match(sql, /v_approval\.proposal_version <> v_case\.proposal_version/);
  assert.match(sql, /v_approval\.payload <> p_resolution/);
  assert.match(sql, /v_case\.tutor_kind = 'swati'/);
  assert.match(sql, /calendar_writes_disabled/);
  assert.match(sql, /insert into public\.hermes_workspace_jobs/);
  assert.match(sql, /'calendar_create_event'/);
  assert.match(sql, /workspace_state = case when tutor_kind = 'swati' then 'pending'/);
  assert.match(sql, /on conflict \(idempotency_key\) do nothing/);
  assert.match(sql, /grant execute on function public\.confirm_hermes_class\(uuid, uuid, jsonb, boolean\) to service_role/);
});

test("WhatsApp approval codes are server-only, expiring, and atomically consume pending approvals", () => {
  const sql = fs.readFileSync(
    path.join(migrationsDir, "20260716153000_add_whatsapp_approval_replies.sql"),
    "utf8",
  ).toLowerCase();
  assert.match(sql, /create table public\.hermes_whatsapp_approval_bindings/);
  assert.match(sql, /approval_id uuid not null unique/);
  assert.match(sql, /code text not null unique/);
  assert.match(sql, /expires_at timestamptz not null/);
  assert.match(sql, /decision_message_id text unique/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on table public\.hermes_whatsapp_approval_bindings from anon, authenticated/);
  assert.match(sql, /for update/);
  assert.match(sql, /v_binding\.expires_at <= now\(\)/);
  assert.match(sql, /v_approval\.status <> 'pending'/);
  assert.match(sql, /consumed_at = now\(\)/);
  assert.match(sql, /grant execute on function public\.decide_hermes_approval_by_whatsapp/);
});

test("Academy settlements are immutable, admin-scoped, and use tutor reports as their only evidence", () => {
  const sql = readMigration("_add_academy_settlements.sql");
  for (const table of [
    "academy_settlement_cycles",
    "academy_tutor_reports",
    "academy_tutor_report_lines",
    "academy_family_invoices",
    "academy_tutor_payouts",
  ]) {
    assert.match(sql, new RegExp(`create table public\\.${table}`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(sql, new RegExp(`revoke all on table public\\.${table} from anon`));
    assert.match(sql, new RegExp(`grant all on table public\\.${table} to service_role`));
  }
  assert.match(sql, /period_start = date_trunc\('month', period_start\)::date/);
  assert.match(sql, /currency ~ '\^\[a-z\]\{3\}\$'/);
  assert.match(sql, /claimed_payout_minor >= 0/);
  assert.match(sql, /family_charge_minor is null or family_charge_minor >= 0/);
  assert.match(sql, /total_minor >= 0/);
  assert.match(sql, /source_channel in \('whatsapp', 'imessage_admin', 'admin'\)/);
  assert.match(sql, /create unique index academy_tutor_reports_one_active/);
  for (const index of [
    "academy_tutor_reports_tutor_idx",
    "academy_tutor_reports_supersedes_idx",
    "academy_report_lines_student_idx",
    "academy_report_lines_billed_idx",
    "academy_family_invoices_approval_idx",
    "academy_family_invoices_billed_idx",
    "academy_family_invoices_student_idx",
    "academy_tutor_payouts_approval_idx",
    "academy_tutor_payouts_tutor_idx",
  ]) assert.match(sql, new RegExp(`create index ${index}`));
  assert.doesNotMatch(sql, /\bfrom public\.sessions\b/);
  assert.doesNotMatch(sql, /calendar/);
  assert.match(sql, /alter table public\.hermes_messages[\s\S]+add column settlement_cycle_id uuid references public\.academy_settlement_cycles/);
  assert.match(sql, /alter table public\.hermes_messages[\s\S]+add column family_invoice_id uuid references public\.academy_family_invoices/);
});

test("settlement approvals bind exactly one subject and decide atomically across channels", () => {
  const sql = readMigration("_add_academy_settlements.sql");
  assert.match(sql, /alter column case_id drop not null/);
  assert.match(sql, /add column settlement_cycle_id uuid references public\.academy_settlement_cycles/);
  assert.match(sql, /num_nonnulls\(case_id, settlement_cycle_id\) = 1/);
  assert.match(sql, /add column decision_channel text/);
  assert.match(sql, /decision_channel in \('whatsapp', 'imessage', 'dashboard'\)/);
  for (const fn of [
    "submit_academy_tutor_report",
    "set_academy_family_charges",
    "request_academy_settlement_approval",
    "decide_hermes_approval_by_channel",
    "finalize_academy_settlement",
    "record_academy_family_payment",
    "record_academy_tutor_payout",
  ]) {
    assert.match(sql, new RegExp(`create (?:or replace )?function public\\.${fn}`));
    assert.match(sql, new RegExp(`revoke execute on function public\\.${fn}`));
    assert.match(sql, new RegExp(`grant execute on function public\\.${fn}[^;]+to service_role`));
  }
  assert.match(sql, /for update/);
  assert.match(sql, /v_binding\.expires_at <= now\(\)/);
  assert.match(sql, /v_approval\.payload_digest/);
  assert.match(sql, /v_approval\.proposal_version <> v_cycle\.version/);
  assert.match(sql, /status not in \('ready', 'superseded'\)[\s\S]+settlement_reports_incomplete/);
  assert.match(sql, /v_approval\.consumed_at is not null/);
  assert.match(sql, /p_decision = 'rejected'[\s\S]+status = 'ready_for_approval'/);
  assert.match(sql, /v_approval\.consumed_at is not null[\s\S]+return v_cycle/);
  assert.match(sql, /insert into public\.academy_family_invoices/);
  assert.match(sql, /insert into public\.academy_tutor_payouts/);
  assert.match(sql, /status = 'eligible'/);
});

test("security-definer approval functions can resolve the Supabase crypto extension", () => {
  const sql = readMigration("_qualify_hermes_digest.sql").replace(/\s+/g, " ");
  for (const signature of [
    "request_hermes_approval(uuid, jsonb)",
    "confirm_hermes_class(uuid, uuid, jsonb, boolean)",
    "request_academy_settlement_approval(uuid)",
    "decide_hermes_approval_by_channel(uuid, text, uuid, text, text, text)",
    "finalize_academy_settlement(uuid)",
  ]) assert.ok(sql.includes(`alter function public.${signature} set search_path = public, extensions, pg_temp`));
});

test("flexible lesson ledger is server-scoped, revisioned, and contains no money fields", () => {
  const sql = readMigration("_add_flexible_lesson_ledger.sql");
  for (const table of [
    "academy_lesson_cycles",
    "academy_teacher_collections",
    "academy_lesson_report_revisions",
    "academy_lessons",
  ]) {
    assert.match(sql, new RegExp(`create table public\\.${table}`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(sql, new RegExp(`revoke all on table public\\.${table} from anon, authenticated`));
    assert.match(sql, new RegExp(`grant all on table public\\.${table} to service_role`));
  }
  for (const column of ["is_active", "effective_start", "effective_end", "source_channel", "last_editor_profile_id", "updated_at"]) {
    assert.match(sql, new RegExp(`alter table public\\.hermes_contact_relationships[\\s\\S]+add column if not exists ${column}`));
  }
  assert.match(sql, /duration_minutes integer not null/);
  assert.match(sql, /lesson_date date not null/);
  assert.match(sql, /add column lesson_cycle_id uuid/);
  assert.match(sql, /academy_lessons_unresolved_idx/);
  assert.match(sql, /academy_lessons_student_date_idx/);
  assert.doesNotMatch(sql, /family_charge|claimed_payout|amount_minor|currency text/);
});

test("lesson ledger mutations are transactional, audited, and service-role only", () => {
  const sql = readMigration("_add_flexible_lesson_ledger.sql");
  for (const fn of [
    "upsert_academy_contact_relationship",
    "start_academy_lesson_cycle",
    "submit_academy_lesson_report",
    "confirm_academy_lesson_report",
    "resolve_academy_lesson_student",
    "confirm_academy_lesson_cycle",
    "reopen_academy_lesson_cycle",
  ]) {
    assert.match(sql, new RegExp(`create function public\\.${fn}`));
    assert.match(sql, new RegExp(`revoke execute on function public\\.${fn}`));
    assert.match(sql, new RegExp(`grant execute on function public\\.${fn}[^;]+to service_role`));
  }
  assert.match(sql, /p_relationship_type not in \('teacher', 'parent_guardian'\)/);
  assert.match(sql, /jsonb_array_length\(p_lessons\) between 0 and 500/);
  assert.match(sql, /status = 'superseded'/);
  assert.match(sql, /confirmed_report_revision_id/);
  assert.match(sql, /status <> 'confirmed'/);
  const resolveSql = sql.slice(
    sql.indexOf("create function public.resolve_academy_lesson_student"),
    sql.indexOf("create function public.confirm_academy_lesson_cycle"),
  );
  assert.match(resolveSql, /c\.confirmed_report_revision_id = r\.id/);
  assert.match(resolveSql, /v_cycle\.status = 'confirmed'[\s\S]+lesson_cycle_confirmed/);
  assert.match(sql, /hermes_audit_events/);
  assert.doesNotMatch(sql, /metadata[^;]+reported_student_name/);
});

test("restarting an open lesson cycle adds tutors without removing earlier selections", () => {
  const sql = readMigration("_make_lesson_cycle_tutors_additive.sql");
  assert.match(sql, /create or replace function public\.start_academy_lesson_cycle/);
  assert.match(sql, /on conflict \(lesson_cycle_id, tutor_contact_id\) do nothing/);
  assert.doesNotMatch(sql, /delete from public\.academy_teacher_collections/);
  assert.doesNotMatch(sql, /selected_tutor_has_report/);
});

test("import RPC preserves contacts that already exist", () => {
  const sql = readMigration("_preserve_known_hermes_contacts_on_import.sql");
  // The conflict branch must be a no-op self-assignment, never an overwrite.
  assert.match(sql, /on conflict \(whatsapp_e164\) do update set\s+display_name = public\.hermes_contacts\.display_name/);
  for (const clobbered of ["role = excluded.role", "profile_id = excluded.profile_id", "deleted_at = null"]) {
    assert.doesNotMatch(sql, new RegExp(clobbered.replace(/[.()]/g, "\\$&")));
  }
  assert.match(sql, /'skipped', v_skipped/);
});

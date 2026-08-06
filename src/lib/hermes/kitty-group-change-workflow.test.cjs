/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  });
  module._compile(output.outputText, filename);
};

const servicePath = path.join(__dirname, "kitty-class-service.ts");
const toolsPath = path.join(__dirname, "kitty-class-tools.ts");
const contact = { kind: "contact", contactId: "family-a", channel: "whatsapp" };
const token = "a".repeat(64);
const digest = "b".repeat(64);

function rpcClient(result = { id: "request-1", status: "awaiting_counterparty", version: 1 }) {
  const calls = [];
  return {
    calls,
    client: {
      async rpc(name, payload) {
        calls.push({ name, payload });
        return { data: result, error: null };
      },
    },
  };
}

test("whole-group reschedule is one locked scope-aware RPC", async () => {
  const { beginKittyClassChange } = require(servicePath);
  const { client, calls } = rpcClient({
    id: "request-1", status: "awaiting_counterparty", version: 1,
    required_enrollment_ids: ["enrollment-a", "enrollment-b", "enrollment-c"],
  });

  const result = await beginKittyClassChange(client, contact, {
    occurrenceId: "occurrence-1",
    occurrenceVersion: 4,
    scope: "whole_occurrence",
    changeType: "reschedule",
    proposedStartsAt: "2026-08-12T21:00:00.000Z",
    proposedEndsAt: "2026-08-12T22:00:00.000Z",
    proposedTimezone: "America/New_York",
    selectionToken: token,
    clientRequestId: "change-request:1",
  });

  assert.equal(result.status, "awaiting_counterparties");
  assert.equal(result.requiredEnrollmentApprovals, 3);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "request_kitty_group_class_change");
  assert.deepEqual(calls[0].payload, {
    p_occurrence_id: "occurrence-1",
    p_expected_occurrence_version: 4,
    p_scope: "whole_occurrence",
    p_enrollment_id: null,
    p_actor_contact_id: "family-a",
    p_change_type: "reschedule",
    p_proposed_starts_at: "2026-08-12T21:00:00.000Z",
    p_proposed_ends_at: "2026-08-12T22:00:00.000Z",
    p_proposed_timezone: "America/New_York",
    p_selection_token: token,
    p_client_request_id: "change-request:1",
  });
});

test("individual replacement is explicitly bound to one enrollment", async () => {
  const { beginKittyClassChange } = require(servicePath);
  const { client, calls } = rpcClient();

  await beginKittyClassChange(client, contact, {
    occurrenceId: "occurrence-1",
    occurrenceVersion: 4,
    scope: "individual_reschedule",
    enrollmentId: "enrollment-a",
    changeType: "reschedule",
    proposedStartsAt: "2026-08-13T21:00:00.000Z",
    proposedEndsAt: "2026-08-13T22:00:00.000Z",
    proposedTimezone: "America/New_York",
    selectionToken: token,
    clientRequestId: "individual-request:1",
  });

  assert.equal(calls[0].payload.p_scope, "individual_reschedule");
  assert.equal(calls[0].payload.p_enrollment_id, "enrollment-a");
  assert.equal(calls[0].payload.p_change_type, "reschedule");
});

test("individual cancellation cannot enter the change workflow", async () => {
  const { beginKittyClassChange } = require(servicePath);
  const { client } = rpcClient();

  await assert.rejects(() => beginKittyClassChange(client, contact, {
    occurrenceId: "occurrence-1",
    occurrenceVersion: 4,
    scope: "individual_reschedule",
    enrollmentId: "enrollment-a",
    changeType: "cancel",
    selectionToken: token,
    clientRequestId: "invalid-individual-cancel",
  }), /invalid_change_scope/);
});

test("proposal changes and decisions carry optimistic binding and idempotency", async () => {
  const { decideKittyClassChange, proposeKittyClassReplacement } = require(servicePath);
  const proposed = rpcClient({ id: "request-1", status: "awaiting_counterparties", version: 3 });
  const decided = rpcClient({ id: "request-1", status: "finalized", version: 3 });

  await proposeKittyClassReplacement(proposed.client, contact, {
    requestId: "request-1", requestVersion: 2, payloadDigest: digest,
    proposedStartsAt: "2026-08-14T21:00:00.000Z",
    proposedEndsAt: "2026-08-14T22:00:00.000Z",
    proposedTimezone: "America/New_York",
    clientRequestId: "proposal:2",
  });
  await decideKittyClassChange(decided.client, contact, {
    requestId: "request-1", requestVersion: 3, payloadDigest: digest,
    decision: "approved", providerMessageId: "wamid.1",
    clientRequestId: "decision:3",
  });

  assert.equal(proposed.calls[0].name, "propose_kitty_group_class_change");
  assert.equal(proposed.calls[0].payload.p_actor_contact_id, "family-a");
  assert.equal(proposed.calls[0].payload.p_client_request_id, "proposal:2");
  assert.equal(decided.calls[0].name, "decide_kitty_group_class_change");
  assert.equal(decided.calls[0].payload.p_actor_contact_id, "family-a");
  assert.equal(decided.calls[0].payload.p_client_request_id, "decision:3");
});

test("pending group changes use the multi-counterparty status projection", async () => {
  const { findMyPendingKittyChanges } = require(servicePath);
  const client = { async rpc() {
    return { data: [{
      id: "11111111-1111-1111-1111-111111111111",
      status: "awaiting_counterparty",
      version: 2,
    }], error: null };
  } };

  const [pending] = await findMyPendingKittyChanges(client, contact);

  assert.equal(pending.status, "awaiting_counterparties");
  assert.equal(pending.referenceCode, "111111");
});

test("contact tool requires explicit scope and passes one stable request identity", async () => {
  const { executeKittyClassTool } = require(toolsPath);
  const calls = [];
  const client = { async rpc(name, payload) {
    calls.push({ name, payload });
    return { data: { id: "request-1", status: "awaiting_counterparty", version: 1, required_enrollment_ids: ["enrollment-a"] }, error: null };
  } };

  const result = await executeKittyClassTool(client, contact, "request_class_change", {
    occurrenceId: "occurrence-1", occurrenceVersion: 4,
    scope: "individual_reschedule", enrollmentId: "enrollment-a",
    changeType: "reschedule", selectionToken: token,
    proposedStartsAt: "2026-08-13T21:00:00.000Z",
    proposedEndsAt: "2026-08-13T22:00:00.000Z",
  }, { clientRequestId: "transport-request:1" });

  assert.equal(result.changeRequest.requiredEnrollmentApprovals, 1);
  assert.equal(calls[0].payload.p_scope, "individual_reschedule");
  assert.equal(calls[0].payload.p_client_request_id, "transport-request:1");

  await assert.rejects(() => executeKittyClassTool(client, contact, "request_class_change", {
    occurrenceId: "occurrence-1", occurrenceVersion: 4,
    changeType: "reschedule", selectionToken: token,
  }, { clientRequestId: "transport-request:2" }), /invalid_payload/);
});

test("teacher cancellation reports final notification reservation truthfully", async () => {
  const { executeKittyClassTool } = require(toolsPath);
  const client = { async rpc() {
    return { data: {
      id: "cancel-1", status: "finalized", version: 1,
      required_enrollment_ids: [],
    }, error: null };
  } };

  const result = await executeKittyClassTool(client, {
    kind: "contact", contactId: "teacher-1", channel: "whatsapp",
  }, "request_class_change", {
    occurrenceId: "occurrence-1", occurrenceVersion: 4,
    scope: "whole_occurrence", changeType: "cancel", selectionToken: token,
  }, { clientRequestId: "cancel-transport:1" });

  assert.equal(result.counterpartyNotificationReserved, false);
  assert.equal(result.finalNotificationsReserved, true);
});

test("Task 5 mutations are service-role-only definers with an empty search path", () => {
  const migrations = fs.readdirSync(path.join(process.cwd(), "supabase/migrations"))
    .filter((name) => name.endsWith("_coordinate_kitty_group_class_changes.sql"));
  assert.equal(migrations.length, 1);
  const migration = fs.readFileSync(path.join(process.cwd(), "supabase/migrations", migrations[0]), "utf8").toLowerCase();

  for (const name of [
    "request_kitty_group_class_change",
    "propose_kitty_group_class_change",
    "decide_kitty_group_class_change",
  ]) {
    assert.match(migration, new RegExp(`create function public\\.${name}\\(`));
    assert.match(migration, new RegExp(`revoke execute on function public\\.${name}\\([\\s\\S]*?from public, anon, authenticated;`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}\\([\\s\\S]*?to service_role;`));
  }
  assert.match(migration, /security definer\s+set search_path = ''/);
  assert.match(migration, /for update/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /client_request_payload_mismatch/);
});

function runContainerCommand(args, options = {}) {
  return childProcess.spawnSync("docker", ["exec", ...args], { encoding: "utf8", ...options });
}

function runProbeSql(container, database, sql) {
  return runContainerCommand(
    ["-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database],
    { input: sql },
  );
}

function runAsyncProbeSql(container, database, sql) {
  const child = childProcess.spawn(
    "docker",
    ["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.stdin.end(sql);
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

test("group change RPCs enforce workflow, privacy, grants, and concurrent approval", {
  skip: !process.env.KITTY_SCHEMA_TEST_CONTAINER,
  timeout: 30_000,
}, async () => {
  const container = process.env.KITTY_SCHEMA_TEST_CONTAINER;
  const database = `kitty_group_change_probe_${process.pid}`;
  const read = (relative) => fs.readFileSync(path.join(process.cwd(), relative), "utf8");
  const migrations = [
    "supabase/migrations/20260805120000_add_kitty_class_calendar.sql",
    "supabase/migrations/20260805222827_add_kitty_group_classes.sql",
    "supabase/migrations/20260805235110_add_kitty_group_class_services.sql",
    "supabase/migrations/20260806005742_add_kitty_class_relays.sql",
    "supabase/migrations/20260806020109_coordinate_kitty_group_class_changes.sql",
  ];
  const bootstrap = `
create extension if not exists pgcrypto;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create table public.profiles (id uuid primary key);
create table public.hermes_contacts (id uuid primary key);
create table public.hermes_messages (id uuid primary key);
create function public.is_admin() returns boolean language sql stable as $$ select true $$;
create function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
`;

  runContainerCommand([container, "dropdb", "--if-exists", "--force", "-U", "postgres", database]);
  const created = runContainerCommand([container, "createdb", "-U", "postgres", database]);
  assert.equal(created.status, 0, `${created.stdout}\n${created.stderr}`);
  try {
    for (const [label, sql] of [
      ["bootstrap", bootstrap],
      ...migrations.map((migration) => [migration, read(migration)]),
    ]) {
      const applied = runProbeSql(container, database, sql);
      assert.equal(applied.status, 0, `${label}:\n${applied.stdout}\n${applied.stderr}`);
    }
    const probe = runProbeSql(container, database, read("src/lib/hermes/kitty-group-change-workflow-runtime-probe.sql"));
    assert.equal(probe.status, 0, `${probe.stdout}\n${probe.stderr}`);
    assert.match(probe.stdout, /kitty group change workflow probe passed/);

    const decision = (contactId, requestId) => `
begin;
set local statement_timeout = '10s';
do $$
declare v_request public.kitty_class_change_requests;
begin
  select request.* into strict v_request
  from public.kitty_class_change_requests request
  join public.kitty_class_audit_events audit on audit.entity_id = request.id
  where audit.request_id = 'concurrent-group-request';
  perform public.decide_kitty_group_class_change(
    v_request.id, v_request.version, v_request.payload_digest,
    '${contactId}', 'approved', null, '${requestId}'
  );
end;
$$;
commit;
`;
    const [shared, third] = await Promise.all([
      runAsyncProbeSql(container, database, decision("00000000-0000-0000-0000-000000000301", "concurrent-shared-decision")),
      runAsyncProbeSql(container, database, decision("00000000-0000-0000-0000-000000000203", "concurrent-third-decision")),
    ]);
    assert.equal(shared.status, 0, `${shared.stdout}\n${shared.stderr}`);
    assert.equal(third.status, 0, `${third.stdout}\n${third.stderr}`);

    const invariant = runProbeSql(container, database, `
do $$
declare v_request public.kitty_class_change_requests;
begin
  select request.* into strict v_request
  from public.kitty_class_change_requests request
  join public.kitty_class_audit_events audit on audit.entity_id = request.id
  where audit.request_id = 'concurrent-group-request';
  if v_request.status <> 'finalized' or v_request.replacement_occurrence_id is null then
    raise exception 'concurrent approvals did not finalize exactly once';
  end if;
  if (select count(*) from public.kitty_class_change_confirmations confirmation
      where confirmation.change_request_id = v_request.id
        and confirmation.request_version = v_request.version
        and confirmation.decision = 'approved') <> 4 then
    raise exception 'concurrent approval set is incomplete';
  end if;
  if (select count(*) from public.kitty_class_occurrences occurrence
      where occurrence.predecessor_occurrence_id = v_request.occurrence_id) <> 1 then
    raise exception 'concurrent finalization created duplicate replacements';
  end if;
end;
$$;
`);
    assert.equal(invariant.status, 0, `${invariant.stdout}\n${invariant.stderr}`);
  } finally {
    const dropped = runContainerCommand([container, "dropdb", "--if-exists", "--force", "-U", "postgres", database]);
    assert.equal(dropped.status, 0, `${dropped.stdout}\n${dropped.stderr}`);
  }
});

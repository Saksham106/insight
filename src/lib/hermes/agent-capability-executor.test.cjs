/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = function compileTypeScript(module, filename) {
  let source = fs.readFileSync(filename, "utf8");
  source = source.replace(/from\s+(["'])\.\/([^"']+)\1/g, (_match, quote, target) => `from ${quote}./${target}.ts${quote}`);
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } });
  module._compile(output.outputText, filename);
};

const { executeAgentCapability } = require(path.join(__dirname, "agent-capability-executor.ts"));

test("publishes a fee statement with only a token hash stored in the database", async () => {
  const originalSecret = process.env.ACADEMY_AGENT_EVALUATION_SECRET;
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  process.env.ACADEMY_AGENT_EVALUATION_SECRET = "test-only-fee-statement-token-secret-that-is-long-enough";
  process.env.NEXT_PUBLIC_APP_URL = "https://academy.example";
  try {
    const calls = [];
    const client = { async rpc(name, payload) {
      calls.push({ name, payload });
      return { data: { id: "statement-1", statement_reference: "MIA-202608-A1B2C3", status: "published" }, error: null };
    } };
    const action = {
      capabilityName: "fee_statement.create", capabilityVersion: 1, clientRequestId: "statement-request-1",
      normalizedInput: {
        studentName: "Example Student", billedToName: null, periodStart: "2026-08-01", periodEnd: "2026-08-31", dueDate: null,
        currency: "VND", totalMinor: 500000,
        lineItems: [{ lessonDate: "2026-08-11", teacherName: "Teacher A", subject: "Maths", durationMinutes: 60, rateMinor: 500000, amountMinor: 500000, source: { workbook: "Workbook", sheet: "August", row: 3 } }],
      },
    };
    const actor = { kind: "admin", profileId: "admin-1", externalIdHash: "a".repeat(64), channel: "imessage" };
    const result = await executeAgentCapability(client, actor, action);
    const retry = await executeAgentCapability(client, actor, action);
    assert.equal(calls[0].name, "create_academy_fee_statement");
    assert.match(calls[0].payload.p_public_token_hash, /^[a-f0-9]{64}$/);
    assert.equal("p_public_token" in calls[0].payload, false);
    assert.equal(calls[0].payload.p_actor_identifier_hash, "a".repeat(64));
    const token = new URL(result.publicUrl).pathname.split("/").pop();
    assert.match(token, /^[A-Za-z0-9_-]{32,}$/);
    assert.notEqual(token, calls[0].payload.p_public_token_hash);
    assert.equal(retry.publicUrl, result.publicUrl);
    assert.equal(calls[1].payload.p_public_token_hash, calls[0].payload.p_public_token_hash);
  } finally {
    if (originalSecret === undefined) delete process.env.ACADEMY_AGENT_EVALUATION_SECRET;
    else process.env.ACADEMY_AGENT_EVALUATION_SECRET = originalSecret;
    if (originalAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
  }
});

test("fails before creating a statement when the public app URL is not a safe HTTPS origin", async () => {
  const originalSecret = process.env.ACADEMY_AGENT_EVALUATION_SECRET;
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  process.env.ACADEMY_AGENT_EVALUATION_SECRET = "test-only-fee-statement-token-secret-that-is-long-enough";
  const calls = [];
  const client = { async rpc(name, payload) {
    calls.push({ name, payload });
    return { data: null, error: null };
  } };
  const action = {
    capabilityName: "fee_statement.create", capabilityVersion: 1, clientRequestId: "statement-request-invalid-origin",
    normalizedInput: {
      studentName: "Example Student", billedToName: null, periodStart: "2026-08-01", periodEnd: "2026-08-31", dueDate: null,
      currency: "VND", totalMinor: 500000,
      lineItems: [{ lessonDate: "2026-08-11", teacherName: "Teacher A", subject: "Maths", durationMinutes: 60, rateMinor: 500000, amountMinor: 500000, source: { workbook: "Workbook", sheet: "August", row: 3 } }],
    },
  };
  const actor = { kind: "admin", profileId: "admin-1", externalIdHash: "a".repeat(64), channel: "imessage" };
  try {
    for (const invalid of [undefined, "http://localhost:3000", "https://academy.example/path", "https://user:pass@academy.example"]) {
      if (invalid === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
      else process.env.NEXT_PUBLIC_APP_URL = invalid;
      await assert.rejects(() => executeAgentCapability(client, actor, action), /capability_execution_unavailable/);
    }
    assert.equal(calls.length, 0);
  } finally {
    if (originalSecret === undefined) delete process.env.ACADEMY_AGENT_EVALUATION_SECRET;
    else process.env.ACADEMY_AGENT_EVALUATION_SECRET = originalSecret;
    if (originalAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
  }
});

test("recovers an already-committed statement after an ambiguous RPC response", async () => {
  const originalSecret = process.env.ACADEMY_AGENT_EVALUATION_SECRET;
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  process.env.ACADEMY_AGENT_EVALUATION_SECRET = "test-only-fee-statement-token-secret-that-is-long-enough";
  process.env.NEXT_PUBLIC_APP_URL = "https://academy.example";
  const calls = [];
  const existing = { id: "statement-1", statement_reference: "MIA-202608-A1B2C3", status: "published" };
  const client = {
    async rpc(name, payload) {
      calls.push(["rpc", name, payload]);
      return { data: null, error: { message: "network response unavailable" } };
    },
    from(table) {
      calls.push(["from", table]);
      return { select() { return { eq(field, value) { calls.push(["eq", field, value]); return { eq(secondField, secondValue) { calls.push(["eq", secondField, secondValue]); return { maybeSingle: async () => ({ data: existing, error: null }) }; } }; } }; } };
    },
  };
  const action = {
    capabilityName: "fee_statement.create", capabilityVersion: 1, clientRequestId: "statement-request-ambiguous",
    normalizedInput: {
      studentName: "Example Student", billedToName: null, periodStart: "2026-08-01", periodEnd: "2026-08-31", dueDate: null,
      currency: "VND", totalMinor: 500000,
      lineItems: [{ lessonDate: "2026-08-11", teacherName: "Teacher A", subject: "Maths", durationMinutes: 60, rateMinor: 500000, amountMinor: 500000, source: { workbook: "Workbook", sheet: "August", row: 3 } }],
    },
  };
  const actor = { kind: "admin", profileId: "admin-1", externalIdHash: "a".repeat(64), channel: "imessage" };
  try {
    const result = await executeAgentCapability(client, actor, action);
    assert.equal(result.statementId, "statement-1");
    assert.match(result.publicUrl, /^https:\/\/academy\.example\/statement\/[A-Za-z0-9_-]{32,}$/);
    assert.equal(calls.filter(([kind]) => kind === "rpc").length, 1);
    assert.deepEqual(calls.filter(([kind]) => kind === "eq").map((call) => call[1]), ["client_request_id", "public_token_hash"]);
  } finally {
    if (originalSecret === undefined) delete process.env.ACADEMY_AGENT_EVALUATION_SECRET;
    else process.env.ACADEMY_AGENT_EVALUATION_SECRET = originalSecret;
    if (originalAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
  }
});

test("marks an ambiguous fee replacement retryable when recovery lookup is unavailable", async () => {
  const originalSecret = process.env.ACADEMY_AGENT_EVALUATION_SECRET;
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  process.env.ACADEMY_AGENT_EVALUATION_SECRET = "test-only-fee-statement-token-secret-that-is-long-enough";
  process.env.NEXT_PUBLIC_APP_URL = "https://academy.example";
  const client = {
    async rpc() { return { data: null, error: { message: "network response unavailable" } }; },
    from() {
      return { select() { return { eq() { return { eq() { return { maybeSingle: async () => ({ data: null, error: { message: "recovery unavailable" } }) }; } }; } }; } };
    },
  };
  const action = {
    capabilityName: "fee_statement.replace", capabilityVersion: 1, clientRequestId: "devon-replacement-ambiguous",
    normalizedInput: {
      statementId: "11111111-1111-4111-8111-111111111111", correctionReason: "Corrected stale hourly rates",
      studentName: "Devon", billedToName: null, periodStart: "2026-08-01", periodEnd: "2026-08-31", dueDate: null,
      currency: "VND", totalMinor: 2250000,
      lineItems: [{ lessonDate: "2026-08-04", teacherName: "Swati", subject: "Maths", durationMinutes: 90, rateMinor: 1500000, amountMinor: 2250000, source: { workbook: "Swati Tuition", sheet: "August", row: 5 } }],
    },
  };
  const actor = { kind: "admin", profileId: "admin-1", externalIdHash: "a".repeat(64), channel: "imessage" };
  try {
    await assert.rejects(() => executeAgentCapability(client, actor, action), /capability_execution_uncertain/);
  } finally {
    if (originalSecret === undefined) delete process.env.ACADEMY_AGENT_EVALUATION_SECRET;
    else process.env.ACADEMY_AGENT_EVALUATION_SECRET = originalSecret;
    if (originalAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
  }
});

test("atomically replaces an incorrect fee statement and returns the new private URL", async () => {
  const originalSecret = process.env.ACADEMY_AGENT_EVALUATION_SECRET;
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  process.env.ACADEMY_AGENT_EVALUATION_SECRET = "test-only-fee-statement-token-secret-that-is-long-enough";
  process.env.NEXT_PUBLIC_APP_URL = "https://academy.example";
  const calls = [];
  const client = { async rpc(name, payload) {
    calls.push({ name, payload });
    return { data: { id: "statement-new", statement_reference: "MIA-202608-NEW123", status: "published", replaces_statement_id: "11111111-1111-4111-8111-111111111111" }, error: null };
  } };
  const action = {
    capabilityName: "fee_statement.replace", capabilityVersion: 1, clientRequestId: "devon-august-correction-1",
    normalizedInput: {
      correctionReason: "Corrected stale hourly rates",
      studentName: "Devon", billedToName: null, periodStart: "2026-08-01", periodEnd: "2026-08-31", dueDate: null,
      currency: "VND", totalMinor: 24000000,
      lineItems: [{ lessonDate: "2026-08-04", teacherName: "Swati", subject: "Maths", durationMinutes: 90, rateMinor: 1500000, amountMinor: 2250000, source: { workbook: "Swati Tuition", sheet: "Swati Aug classes", row: 5 } }],
    },
  };
  const actor = { kind: "admin", profileId: "admin-1", externalIdHash: "a".repeat(64), channel: "imessage" };
  try {
    const result = await executeAgentCapability(client, actor, action);
    assert.equal(calls[0].name, "replace_academy_fee_statement");
    assert.equal(calls[0].payload.p_statement_id, null);
    assert.equal(calls[0].payload.p_correction_reason, "Corrected stale hourly rates");
    assert.match(calls[0].payload.p_public_token_hash, /^[a-f0-9]{64}$/);
    assert.deepEqual(result, {
      statementId: "statement-new",
      statementReference: "MIA-202608-NEW123",
      status: "published",
      publicUrl: result.publicUrl,
      replacedStatementId: "11111111-1111-4111-8111-111111111111",
    });
    assert.match(result.publicUrl, /^https:\/\/academy\.example\/statement\/[A-Za-z0-9_-]{32,}$/);
  } finally {
    if (originalSecret === undefined) delete process.env.ACADEMY_AGENT_EVALUATION_SECRET;
    else process.env.ACADEMY_AGENT_EVALUATION_SECRET = originalSecret;
    if (originalAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
  }
});

test("a reminder execution reserves only identifiers, never rendered prose", async () => {
  const inserted = [];
  const client = { from(table) {
    assert.equal(table, "kitty_class_notification_outbox");
    return { insert(value) { inserted.push(value); return { select() { return { maybeSingle: async () => ({ data: { id: "outbox-1", status: "pending" }, error: null }) }; } }; } };
  } };
  const result = await executeAgentCapability(client, { kind: "contact", contactId: "teacher-1", role: "teacher", channel: "whatsapp" }, {
    capabilityName: "class.reminder.send", capabilityVersion: 1,
    normalizedInput: { occurrenceId: "occ-1", recipientId: "student-1" }, clientRequestId: "message-1",
  });
  assert.deepEqual(result, { reservationId: "outbox-1", status: "pending" });
  assert.deepEqual(inserted[0], {
    occurrence_id: "occ-1", contact_id: "student-1", intent: "class_reminder",
    payload: {}, idempotency_key: "agent:message-1",
  });
  assert.doesNotMatch(JSON.stringify(inserted), /Anjali|Devon|classDescription|scheduledDateTime/);
});

test("a linked teacher one-off executes through the existing atomic group RPC", async () => {
  const calls = [];
  const client = { async rpc(name, payload) { calls.push({ name, payload }); return { data: { id: "occ-new", title: "Chemistry", starts_at: payload.p_starts_at, ends_at: payload.p_ends_at, local_date: payload.p_local_date, timezone: payload.p_timezone, status: "scheduled", version: 1 }, error: null }; } };
  const result = await executeAgentCapability(client, { kind: "contact", contactId: "teacher-1", role: "teacher", channel: "whatsapp" }, {
    capabilityName: "class.one_off.create", capabilityVersion: 1, clientRequestId: "message-2",
    normalizedInput: { title: "Chemistry", subject: "IB Chemistry", timezone: "Asia/Ho_Chi_Minh", startsAt: "2026-08-13T12:30:00Z", endsAt: "2026-08-13T13:30:00Z", localDate: "2026-08-13", teacherContactId: "teacher-1", studentContactIds: ["student-1"] },
  });
  assert.equal(result.class.id, "occ-new");
  assert.equal(calls[0].name, "create_kitty_group_one_off");
  assert.equal(calls[0].payload.p_teacher_contact_id, "teacher-1");
  assert.equal(calls[0].payload.p_origin_channel, "imessage");
  assert.deepEqual(calls[0].payload.p_enrollments, [{ studentContactId: "student-1", contacts: [{ contactId: "student-1", role: "student", receivesNotifications: true, confirmsCancellation: true, confirmsReschedule: true }] }]);
});

test("rejects unregistered capability execution", async () => {
  await assert.rejects(() => executeAgentCapability({}, { kind: "admin", profileId: null, channel: "imessage" }, {
    capabilityName: "payment.record", capabilityVersion: 1, normalizedInput: {}, clientRequestId: "message-3",
  }), /capability_not_executable/);
});

test("an admin can create a disabled structured routine through the capability executor", async () => {
  const inserts = [];
  const client = { from(table) {
    assert.equal(table, "academy_agent_routines");
    return { insert(value) { inserts.push(value); return { select() { return { single: async () => ({ data: { id: "routine-1", status: "disabled" }, error: null }) }; } }; } };
  } };
  const result = await executeAgentCapability(client, { kind: "admin", profileId: null, channel: "imessage" }, {
    capabilityName: "routine.manage", capabilityVersion: 1, clientRequestId: "routine-create-1",
    normalizedInput: { operation: "create", routine: { routineKey: "chemistry-24h", capabilityName: "class.reminder.send", capabilityVersion: 1, seriesId: "series-1", offsetMinutes: -1440, timezone: "Asia/Ho_Chi_Minh" } },
  });
  assert.deepEqual(result, { routineId: "routine-1", status: "disabled" });
  assert.equal(inserts[0].status, "disabled");
  assert.deepEqual(inserts[0].entity_references, { seriesId: "series-1" });
  assert.doesNotMatch(JSON.stringify(inserts), /Anjali|Devon|messageBody|classDescription/);
});

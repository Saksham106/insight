/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
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

class Query {
  constructor(database, table) {
    this.database = database;
    this.table = table;
    this.filters = [];
    this.operation = "select";
    this.payload = null;
    this.head = false;
  }

  select(_columns, options) { this.head = Boolean(options?.head); return this; }
  insert(payload) { this.operation = "insert"; this.payload = payload; return this; }
  update(payload) { this.operation = "update"; this.payload = payload; return this; }
  eq(column, value) { this.filters.push(["eq", column, value]); return this; }
  is(column, value) { this.filters.push(["eq", column, value]); return this; }
  gte() { return this; }
  in(column, values) { this.filters.push(["in", column, values]); return this; }
  maybeSingle() { return Promise.resolve(this.execute(true)); }
  then(resolve, reject) { return Promise.resolve(this.execute(false)).then(resolve, reject); }

  matches(row) {
    return this.filters.every(([operator, column, value]) => operator === "in"
      ? value.includes(row[column])
      : row[column] === value);
  }

  execute(single) {
    if (this.table === "hermes_audit_events" && this.operation === "insert") {
      if (this.database.auditRequestIds.has(this.payload.request_id)) return { data: null, error: { code: "23505" } };
      this.database.auditRequestIds.add(this.payload.request_id);
      return { data: null, error: null };
    }
    if (this.table === "hermes_messages" && this.operation === "insert") {
      const row = {
        id: `message-${this.database.messages.length + 1}`,
        updated_at: new Date().toISOString(),
        meta_message_id: null,
        error_code: null,
        ...this.payload,
      };
      this.database.messages.push(row);
      return { data: single ? row : [row], error: null };
    }
    if (this.table === "hermes_messages" && this.operation === "update") {
      const row = this.database.messages.find((candidate) => this.matches(candidate));
      if (!row) return { data: null, error: null };
      Object.assign(row, this.payload, { updated_at: new Date(Date.now() + 1).toISOString() });
      return { data: single ? row : [row], error: null };
    }
    if (this.table === "hermes_messages" && this.head) return { data: null, count: 0, error: null };
    if (this.table === "hermes_messages") {
      const row = this.database.messages.find((candidate) => this.matches(candidate)) ?? null;
      return { data: single ? row : row ? [row] : [], error: null };
    }
    if (this.table === "hermes_contacts") {
      const row = this.matches(this.database.contact) ? this.database.contact : null;
      return { data: single ? row : row ? [row] : [], error: null };
    }
    if (this.table === "kitty_class_notification_outbox") {
      this.database.outboxLookups.push([...this.filters]);
      const row = this.database.outbox.find((candidate) => this.matches(candidate)) ?? null;
      return { data: single ? row : row ? [row] : [], error: null };
    }
    throw new Error(`unexpected table access: ${this.table}`);
  }
}

function createDatabase() {
  return {
    auditRequestIds: new Set(),
    messages: [],
    outbox: [],
    outboxLookups: [],
    contact: {
      id: "contact-1", display_name: "Filed name", preferred_name: "Priya", role: "student",
      whatsapp_e164: "+15555550100", communication_policy: "direct", consent_status: "attested",
      service_window_expires_at: null, is_active: true, deleted_at: null,
    },
    from(table) { return new Query(this, table); },
  };
}

function makeRequest(intent, idempotencyKey, requestId, overrides = {}) {
  return new Request("https://insight.test/api/whatsapp/send", {
    method: "POST",
    headers: { "content-type": "application/json", "x-test-request-id": requestId },
    body: JSON.stringify({
      contactId: "contact-1",
      occurrenceId: "occurrence-1",
      classOutboxId: `outbox-${idempotencyKey}`,
      intent,
      idempotencyKey,
      templateData: { classDescription: "group mathematics", relaySummary: "A bounded class update." },
      ...overrides,
    }),
  });
}

test("every Kitty relay delivery uses a sending outbox reservation and quarantines indeterminate sends", async () => {
  const routePath = path.join(process.cwd(), "src/app/api/whatsapp/send/route.ts");
  const metaPath = path.join(process.cwd(), "src/lib/hermes/meta.ts");
  const deliveryStatePath = path.join(process.cwd(), "src/lib/hermes/whatsapp-delivery-state.ts");
  const database = createDatabase();
  const originalLoad = Module._load;
  const originalFetch = global.fetch;
  const previousEnv = { ...process.env };
  const providerResults = [];
  const providerPayloads = [];
  let fetchCount = 0;

  Module._load = function load(request, parent, isMain) {
    if (request === "next/server") return { NextResponse: { json(value, init) { return new Response(JSON.stringify(value), { status: init?.status ?? 200, headers: { "content-type": "application/json" } }); } } };
    if (request === "@/lib/hermes/auth") return { verifyServiceRequest: (request) => ({ requestId: request.headers.get("x-test-request-id") }) };
    if (request === "@/lib/hermes/contact-name") return { messagingName: () => "Priya" };
    if (request === "@/lib/hermes/meta") return originalLoad(metaPath, parent, isMain);
    if (request === "@/lib/hermes/meta-template-contract") return { getClassReminderTemplateHealth: async () => ({ ok: true, checkedAt: new Date().toISOString() }) };
    if (request === "@/lib/hermes/settlements") return { buildSettlementMessageContent: () => { throw new Error("financial path should not run"); } };
    if (request === "@/lib/supabase/admin") return { createAdminClient: () => database };
    if (request === "@/lib/hermes/whatsapp-delivery-state") return originalLoad(deliveryStatePath, parent, isMain);
    return originalLoad(request, parent, isMain);
  };
  global.fetch = async (_url, init) => {
    fetchCount += 1;
    providerPayloads.push(JSON.parse(init.body));
    const result = providerResults.shift();
    return { ok: true, status: 200, json: async () => result };
  };
  Object.assign(process.env, {
    WHATSAPP_SENDER_SHARED_SECRET: "test-secret",
    WHATSAPP_CLOUD_PHONE_NUMBER_ID: "phone-1",
    WHATSAPP_CLOUD_ACCESS_TOKEN: "token-1",
    KITTY_CLASS_CALENDAR_ENABLED: "true",
    WHATSAPP_TEMPLATE_CLASS_REMINDER: "class_reminder",
    WHATSAPP_TEMPLATE_HUMAN_ATTENTION: "class_human_attention",
  });
  delete require.cache[routePath];

  try {
    const { POST } = require(routePath);
    for (const [index, intent] of [
      "class_attendance_update", "class_teacher_delay", "class_operational_update",
    ].entries()) {
      const key = `relay-send-${index}`;
      database.outbox.push({
        id: `outbox-${key}`, occurrence_id: "occurrence-1", contact_id: "contact-1",
        intent, idempotency_key: key, status: "sending",
      });
      providerResults.push({ messages: [{ id: `wamid-${index}` }] });
      const response = await POST(makeRequest(intent, key, `request-${index}`));
      assert.equal(response.status, 200, JSON.stringify(await response.json()));
    }
    assert.equal(fetchCount, 3);
    for (const payload of providerPayloads) {
      assert.equal(payload.template.name, "class_human_attention");
      assert.equal(payload.template.components[0].parameters.length, 2);
    }
    for (const intent of ["class_attendance_update", "class_teacher_delay", "class_operational_update"]) {
      assert.ok(database.outboxLookups.some((filters) => filters.some((filter) => filter[1] === "intent" && filter[2] === intent)
        && filters.some((filter) => filter[1] === "status" && filter[2] === "sending")));
    }

    const bypass = await POST(makeRequest(
      "class_operational_update", "relay-bypass", "request-bypass", { caseId: "case-1" },
    ));
    assert.equal(bypass.status, 400);
    assert.match((await bypass.json()).error, /reserved outbox/);
    assert.equal(fetchCount, 3);

    const unreservedKey = "relay-not-sending";
    database.outbox.push({
      id: `outbox-${unreservedKey}`, occurrence_id: "occurrence-1", contact_id: "contact-1",
      intent: "class_attendance_update", idempotency_key: unreservedKey, status: "pending",
    });
    const unreserved = await POST(makeRequest(
      "class_attendance_update", unreservedKey, "request-not-sending",
    ));
    assert.equal(unreserved.status, 409);
    assert.match((await unreserved.json()).error, /reservation unavailable/);
    assert.equal(fetchCount, 3);

    const indeterminateKey = "relay-indeterminate";
    database.outbox.push({
      id: `outbox-${indeterminateKey}`, occurrence_id: "occurrence-1", contact_id: "contact-1",
      intent: "class_teacher_delay", idempotency_key: indeterminateKey, status: "sending",
    });
    providerResults.push({ messages: [] });
    const first = await POST(makeRequest("class_teacher_delay", indeterminateKey, "request-indeterminate-1"));
    assert.equal(first.status, 503);
    assert.deepEqual(await first.json(), {
      error: "Provider acceptance could not be identified", blocked: true, indeterminate: true,
    });
    const second = await POST(makeRequest("class_teacher_delay", indeterminateKey, "request-indeterminate-2"));
    assert.equal(second.status, 409);
    assert.deepEqual(await second.json(), {
      error: "Message delivery is indeterminate and requires reconciliation", blocked: true, indeterminate: true,
    });
    assert.equal(fetchCount, 4, "provider-indeterminate messages must never be automatically resent");

    for (const [index, [intent, templateData]] of [
      ["class_reminder", { classDescription: "group mathematics", scheduledDateTime: "Monday at 3 PM" }],
      ["human_attention", { matter: "your mathematics schedule" }],
    ].entries()) {
      const key = `transport-${index}`;
      providerResults.push({ messages: [{ id: `wamid-transport-${index}` }] });
      const response = await POST(makeRequest(intent, key, `request-transport-${index}`, {
        occurrenceId: undefined,
        classOutboxId: undefined,
        templateData,
      }));
      assert.equal(response.status, 200, `${intent}: ${JSON.stringify(await response.json())}`);
      assert.equal(database.messages.at(-1).case_id, null, `${intent} must not require a phantom case`);
    }
    assert.equal(fetchCount, 6);
  } finally {
    Module._load = originalLoad;
    global.fetch = originalFetch;
    process.env = previousEnv;
    delete require.cache[routePath];
  }
});

test("Kitty adapts notifications to the existing approved human-attention template", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/app/api/whatsapp/send/route.ts"), "utf8");
  assert.match(source, /delivery\.parameterStyle === "human_attention"/);
  assert.match(source, /buildHumanAttentionFallbackContent\(recipientName, body\.text/);
});

/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function loadModule() {
  const filename = path.join(process.cwd(), "src/lib/hermes/transcripts.ts");
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  const mod = { exports: {} };
  new Function("require", "module", "exports", output.outputText)(
    require,
    mod,
    mod.exports,
  );
  return mod.exports;
}

const validRequest = {
  sessionId: "whatsapp_cloud:919876543210",
  whatsappUserId: "+91 98765 43210",
  messages: [
    {
      messageId: 41,
      speaker: "contact",
      text: " Thank you, I will pay tomorrow. ",
      occurredAt: "2026-07-27T14:30:00.000Z",
    },
    {
      messageId: 42,
      speaker: "kitty",
      text: "Thanks for confirming.",
      occurredAt: "2026-07-27T14:31:00.000Z",
    },
  ],
};

const validDeliveryRequest = {
  source: "whatsapp_delivery",
  whatsappUserId: "919876543210",
  messages: [
    {
      messageId: "wamid.HBgMOTE5ODc2NTQzMjEwFQIAERgSQTEx",
      text: "Session maintenance happened quietly.",
      occurredAt: "2026-07-27T14:32:00.000Z",
    },
  ],
};

test("parses and minimizes a valid transcript sync request", () => {
  const { parseTranscriptSyncRequest } = loadModule();
  assert.deepEqual(parseTranscriptSyncRequest(validRequest), {
    ok: true,
    value: {
      sessionId: "whatsapp_cloud:919876543210",
      whatsappUserId: "919876543210",
      messages: [
        {
          messageId: 41,
          speaker: "contact",
          text: "Thank you, I will pay tomorrow.",
          occurredAt: "2026-07-27T14:30:00.000Z",
        },
        {
          messageId: 42,
          speaker: "kitty",
          text: "Thanks for confirming.",
          occurredAt: "2026-07-27T14:31:00.000Z",
        },
      ],
    },
  });
});

test("rejects unknown fields at every request level", () => {
  const { parseTranscriptSyncRequest } = loadModule();
  assert.equal(
    parseTranscriptSyncRequest({ ...validRequest, internalPrompt: "secret" }).ok,
    false,
  );
  assert.equal(
    parseTranscriptSyncRequest({
      ...validRequest,
      messages: [{ ...validRequest.messages[0], toolCalls: [] }],
    }).ok,
    false,
  );
});

test("rejects malformed session and WhatsApp identifiers", () => {
  const { parseTranscriptSyncRequest } = loadModule();
  for (const sessionId of ["", "x".repeat(129), "session\nid"]) {
    assert.equal(
      parseTranscriptSyncRequest({ ...validRequest, sessionId }).ok,
      false,
    );
  }
  for (const whatsappUserId of ["1234567", "1234567890123456", "not-a-phone"]) {
    assert.equal(
      parseTranscriptSyncRequest({ ...validRequest, whatsappUserId }).ok,
      false,
    );
  }
});

test("rejects invalid batch size, ordering, and message IDs", () => {
  const { parseTranscriptSyncRequest } = loadModule();
  assert.equal(
    parseTranscriptSyncRequest({ ...validRequest, messages: [] }).ok,
    false,
  );
  assert.equal(
    parseTranscriptSyncRequest({
      ...validRequest,
      messages: Array.from({ length: 101 }, (_, index) => ({
        ...validRequest.messages[0],
        messageId: index + 1,
      })),
    }).ok,
    false,
  );
  for (const messages of [
    [
      { ...validRequest.messages[0], messageId: 2 },
      { ...validRequest.messages[1], messageId: 2 },
    ],
    [
      { ...validRequest.messages[0], messageId: 2 },
      { ...validRequest.messages[1], messageId: 1 },
    ],
    [{ ...validRequest.messages[0], messageId: 0 }],
    [{ ...validRequest.messages[0], messageId: Number.MAX_SAFE_INTEGER + 1 }],
  ]) {
    assert.equal(
      parseTranscriptSyncRequest({ ...validRequest, messages }).ok,
      false,
    );
  }
});

test("rejects invalid speakers, bodies, and timestamps", () => {
  const { parseTranscriptSyncRequest } = loadModule();
  for (const message of [
    { ...validRequest.messages[0], speaker: "system" },
    { ...validRequest.messages[0], text: "   " },
    { ...validRequest.messages[0], text: "x".repeat(65_537) },
    { ...validRequest.messages[0], occurredAt: "tomorrow" },
  ]) {
    assert.equal(
      parseTranscriptSyncRequest({ ...validRequest, messages: [message] }).ok,
      false,
    );
  }
});

test("transcript migration is service-role-only and idempotent", () => {
  const migrationsDir = path.join(process.cwd(), "supabase/migrations");
  const filename = fs
    .readdirSync(migrationsDir)
    .find((entry) => entry.endsWith("_add_hermes_transcript_messages.sql"));
  assert.ok(filename, "transcript migration must exist");
  const sql = fs
    .readFileSync(path.join(migrationsDir, filename), "utf8")
    .toLowerCase();

  assert.match(sql, /create table public\.hermes_transcript_messages/);
  assert.match(
    sql,
    /unique\s*\(\s*hermes_session_id\s*,\s*hermes_message_id\s*\)/,
  );
  assert.match(sql, /speaker in \('contact', 'kitty'\)/);
  assert.match(
    sql,
    /alter table public\.hermes_transcript_messages enable row level security/,
  );
  assert.match(
    sql,
    /alter table public\.hermes_transcript_messages force row level security/,
  );
  assert.match(
    sql,
    /revoke all on public\.hermes_transcript_messages from public, anon, authenticated/,
  );
  assert.match(
    sql,
    /grant select, insert, update on public\.hermes_transcript_messages to service_role/,
  );
  assert.doesNotMatch(sql, /create policy/);
  assert.match(
    sql,
    /create view public\.hermes_admin_conversation_messages[\s\S]*security_invoker\s*=\s*true/,
  );
  assert.match(
    sql,
    /create view public\.hermes_admin_conversation_summaries[\s\S]*security_invoker\s*=\s*true/,
  );
  assert.match(
    sql,
    /grant select on public\.hermes_admin_conversation_messages to service_role/,
  );
  assert.match(
    sql,
    /grant select on public\.hermes_admin_conversation_summaries to service_role/,
  );
  assert.match(sql, /direction = 'outbound'/);
  assert.match(sql, /status in \('accepted', 'sent', 'delivered', 'read'\)/);
});

test("projects only approved transcript database columns", () => {
  const { buildTranscriptRows, parseTranscriptSyncRequest } = loadModule();
  const parsed = parseTranscriptSyncRequest(validRequest);
  assert.equal(parsed.ok, true);
  const rows = buildTranscriptRows(parsed.value, "contact-123");
  assert.deepEqual(rows[0], {
    contact_id: "contact-123",
    hermes_session_id: "whatsapp_cloud:919876543210",
    hermes_message_id: 41,
    speaker: "contact",
    body: "Thank you, I will pay tomorrow.",
    occurred_at: "2026-07-27T14:30:00.000Z",
  });
  assert.deepEqual(Object.keys(rows[0]).sort(), [
    "body",
    "contact_id",
    "hermes_message_id",
    "hermes_session_id",
    "occurred_at",
    "speaker",
  ]);
});

test("parses exact WhatsApp outbound deliveries and projects ledger columns", () => {
  const {
    buildWhatsAppDeliveryRows,
    parseTranscriptSyncRequest,
  } = loadModule();
  const parsed = parseTranscriptSyncRequest(validDeliveryRequest);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.value, validDeliveryRequest);
  assert.deepEqual(
    buildWhatsAppDeliveryRows(parsed.value, "contact-123"),
    [{
      contact_id: "contact-123",
      direction: "outbound",
      message_kind: "text",
      intent: "gateway_transcript",
      body: "Session maintenance happened quietly.",
      meta_message_id: "wamid.HBgMOTE5ODc2NTQzMjEwFQIAERgSQTEx",
      idempotency_key:
        "hermes-rich-sent:wamid.HBgMOTE5ODc2NTQzMjEwFQIAERgSQTEx",
      status: "sent",
      occurred_at: "2026-07-27T14:32:00.000Z",
    }],
  );
});

test("rejects malformed WhatsApp delivery payloads", () => {
  const { parseTranscriptSyncRequest } = loadModule();
  for (const input of [
    { ...validDeliveryRequest, sessionId: "not-allowed" },
    { ...validDeliveryRequest, messages: [] },
    {
      ...validDeliveryRequest,
      messages: [{
        ...validDeliveryRequest.messages[0],
        messageId: "not-a-wamid",
      }],
    },
    {
      ...validDeliveryRequest,
      messages: [{
        ...validDeliveryRequest.messages[0],
        speaker: "kitty",
      }],
    },
  ]) {
    assert.equal(parseTranscriptSyncRequest(input).ok, false);
  }
});

test("exact-message migration uses the webhook ledger and outbound-only session fallback", () => {
  const migrationsDir = path.join(process.cwd(), "supabase/migrations");
  const filename = fs
    .readdirSync(migrationsDir)
    .find((entry) => entry.endsWith("_use_exact_whatsapp_transcript_messages.sql"));
  assert.ok(filename, "exact WhatsApp transcript migration must exist");
  const sql = fs
    .readFileSync(path.join(migrationsDir, filename), "utf8")
    .toLowerCase();

  assert.match(sql, /from public\.hermes_messages delivery/);
  assert.match(sql, /delivery\.direction in \('inbound', 'outbound'\)/);
  assert.match(sql, /transcript\.speaker = 'kitty'/);
  assert.match(sql, /not exists/);
  assert.doesNotMatch(
    sql,
    /from public\.hermes_transcript_messages transcript\s+where transcript\.speaker = 'contact'/,
  );
  assert.match(sql, /security_invoker\s*=\s*true/);
});

test("template transcript migration recovers legacy bodies and shows only successful templates", () => {
  const migrationsDir = path.join(process.cwd(), "supabase/migrations");
  const filename = fs
    .readdirSync(migrationsDir)
    .find((entry) => entry.endsWith("_include_successful_whatsapp_templates.sql"));
  assert.ok(filename, "successful WhatsApp template migration must exist");
  const sql = fs
    .readFileSync(path.join(migrationsDir, filename), "utf8")
    .toLowerCase();

  assert.match(sql, /update public\.hermes_messages target/);
  assert.match(sql, /target\.contact_id = source\.contact_id/);
  assert.match(sql, /target\.case_id is not distinct from source\.case_id/);
  assert.match(sql, /target\.intent = source\.intent/);
  assert.match(sql, /target\.template_name = source\.template_name/);
  assert.match(sql, /target\.template_locale = source\.template_locale/);
  assert.match(sql, /source\.status = 'failed'/);
  assert.match(sql, /source\.occurred_at <= target\.occurred_at/);
  assert.match(
    sql,
    /delivery\.message_kind in \('text', 'template'\)/,
  );
  assert.match(
    sql,
    /delivery\.status in \('accepted', 'sent', 'delivered', 'read'\)/,
  );
  assert.doesNotMatch(
    sql,
    /delivery\.status in \([^)]*'failed'/,
  );
  assert.match(sql, /security_invoker\s*=\s*true/);
});

test("transcript sync configuration is disabled by default and documented", () => {
  const env = fs.readFileSync(path.join(process.cwd(), ".env.example"), "utf8");
  const rootReadme = fs.readFileSync(
    path.join(process.cwd(), "README.md"),
    "utf8",
  );
  const academyReadme = fs.readFileSync(
    path.join(
      process.cwd(),
      "infra/hermes-profiles/academy/README.md",
    ),
    "utf8",
  );
  const academyAgents = fs.readFileSync(
    path.join(
      process.cwd(),
      "infra/hermes-profiles/academy/AGENTS.md",
    ),
    "utf8",
  );

  assert.match(env, /INSIGHT_HERMES_TRANSCRIPT_SYNC_ENABLED=false/);
  assert.match(env, /INSIGHT_HERMES_TRANSCRIPT_URL=/);
  assert.match(rootReadme, /INSIGHT_HERMES_TRANSCRIPT_SYNC_ENABLED/);
  assert.match(academyReadme, /hooks\/insight-transcript-sync/);
  assert.match(academyReadme, /startup catch-up/i);
  assert.match(academyReadme, /rollback/i);
  assert.match(academyAgents, /Never log transcript bodies/i);
  assert.match(academyAgents, /system prompts, reasoning, or tool/i);
});

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
});

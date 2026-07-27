/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function loadModule() {
  const filename = path.join(
    process.cwd(),
    "src/lib/hermes/transcript-queries.ts",
  );
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

test("accepts only a single UUID contact query parameter", () => {
  const { parseSelectedContactId } = loadModule();
  const valid = "550e8400-e29b-41d4-a716-446655440000";
  assert.equal(parseSelectedContactId(valid), valid);
  for (const value of [undefined, "", "contact-1", [valid], `${valid}\n`]) {
    assert.equal(parseSelectedContactId(value), null);
  }
});

test("sorts contacts by latest conversation and then by name", () => {
  const { attachAndSortConversationSummaries } = loadModule();
  const contacts = [
    { id: "a", display_name: "Asha" },
    { id: "b", display_name: "Bina" },
    { id: "c", display_name: "Chitra" },
  ];
  const summaries = [
    {
      contact_id: "a",
      latest_body: "Older",
      latest_speaker: "contact",
      latest_at: "2026-07-26T10:00:00.000Z",
      message_count: 1,
    },
    {
      contact_id: "c",
      latest_body: "Newest",
      latest_speaker: "kitty",
      latest_at: "2026-07-27T10:00:00.000Z",
      message_count: 3,
    },
  ];
  const result = attachAndSortConversationSummaries(contacts, summaries);
  assert.deepEqual(result.map((contact) => contact.id), ["c", "a", "b"]);
  assert.equal(result[0].conversation.latestBody, "Newest");
  assert.equal(result[2].conversation, null);
});

test("normalizes selected transcript rows oldest to newest", () => {
  const { normalizeTranscriptRows } = loadModule();
  const rows = [
    {
      source: "session",
      source_id: "2",
      contact_id: "contact-a",
      speaker: "kitty",
      body: "Second",
      occurred_at: "2026-07-27T10:01:00.000Z",
    },
    {
      source: "delivery",
      source_id: "1",
      contact_id: "contact-a",
      speaker: "contact",
      body: "First",
      occurred_at: "2026-07-27T10:00:00.000Z",
    },
  ];
  assert.deepEqual(normalizeTranscriptRows(rows), [
    {
      id: "delivery:1",
      speaker: "contact",
      body: "First",
      occurredAt: "2026-07-27T10:00:00.000Z",
    },
    {
      id: "session:2",
      speaker: "kitty",
      body: "Second",
      occurredAt: "2026-07-27T10:01:00.000Z",
    },
  ]);
});

test("admin page authorizes before server-only transcript access", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src/app/(dashboard)/admin/hermes/page.tsx"),
    "utf8",
  );
  assert.ok(source.indexOf('requireRole(["admin"])') < source.indexOf("createAdminClient()"));
  assert.match(source, /searchParams:\s*Promise/);
  assert.match(source, /await searchParams/);
  assert.match(source, /loadConversationSummaries/);
  assert.match(source, /loadSelectedConversation/);
  assert.doesNotMatch(source, /createBrowserClient/);
});

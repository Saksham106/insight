const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("transcript route is signed, replay-protected, minimized, and idempotent", () => {
  const filename = path.join(
    process.cwd(),
    "src/app/api/hermes/transcripts/route.ts",
  );
  const source = fs.readFileSync(filename, "utf8");

  assert.match(source, /verifyServiceRequest\(request, rawBody, secret\)/);
  assert.match(source, /process\.env\.HERMES_TOOL_SHARED_SECRET/);
  assert.match(source, /parseTranscriptSyncRequest/);
  assert.ok(
    source.indexOf("parseTranscriptSyncRequest") <
      source.indexOf('.from("hermes_audit_events")'),
    "the complete request must be parsed before replay/audit writes",
  );
  assert.match(source, /event_type:\s*"transcript_sync_request"/);
  assert.match(source, /messageCount:\s*payload\.messages\.length/);
  assert.doesNotMatch(source, /metadata:\s*\{[^}]*body/s);
  assert.doesNotMatch(source, /metadata:\s*\{[^}]*text/s);
  assert.match(source, /\.eq\("whatsapp_e164", `\+\$\{payload\.whatsappUserId\}`\)/);
  assert.match(source, /\.eq\("is_active", true\)/);
  assert.match(source, /\.is\("deleted_at", null\)/);
  assert.match(source, /\.from\("hermes_transcript_messages"\)\.upsert/);
  assert.match(
    source,
    /onConflict:\s*"hermes_session_id,hermes_message_id"/,
  );
  assert.match(source, /ignoreDuplicates:\s*true/);
  assert.match(source, /highestMessageId/);
  assert.doesNotMatch(source, /console\.(?:log|error)\([^)]*(?:rawBody|payload)/);
});

test("transcript route returns bounded safe status responses", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src/app/api/hermes/transcripts/route.ts"),
    "utf8",
  );

  for (const status of [400, 401, 404, 409, 500]) {
    assert.match(source, new RegExp(`failure\\([^\\n]+,\\s*${status}\\)`));
  }
  assert.doesNotMatch(source, /error\.(?:message|details|hint)/);
});

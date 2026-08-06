/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = function compileTypeScript(module, filename) {
  let source = fs.readFileSync(filename, "utf8");
  source = source.replace(/from\s+["']\.\/([^"']+)["']/g, (match, target) => match.replace(`./${target}`, `./${target}.ts`));
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  });
  module._compile(output.outputText, filename);
};

const relayPath = path.join(__dirname, "kitty-class-relays.ts");
const servicePath = path.join(__dirname, "kitty-class-service.ts");
const notificationPath = path.join(__dirname, "kitty-class-notifications.ts");

const roster = {
  teacher: { contactId: "teacher-1", receivesNotifications: true, isActive: true },
  enrollments: [
    {
      id: "enrollment-a", isActive: true,
      contacts: [
        { contactId: "student-a", receivesNotifications: true, isActive: true },
        { contactId: "parent-a", receivesNotifications: true, isActive: true },
        { contactId: "observer-a", receivesNotifications: false, isActive: true },
      ],
    },
    {
      id: "enrollment-b", isActive: true,
      contacts: [
        { contactId: "student-b", receivesNotifications: true, isActive: true },
        { contactId: "parent-b", receivesNotifications: true, isActive: true },
      ],
    },
    {
      id: "enrollment-ended", isActive: false,
      contacts: [{ contactId: "student-ended", receivesNotifications: true, isActive: true }],
    },
  ],
};

test("an enrollment-private absence never selects another family's contacts", () => {
  const { selectKittyRelayRecipients } = require(relayPath);
  const recipients = selectKittyRelayRecipients(roster, {
    intent: "student_absent", enrollmentId: "enrollment-a",
  });

  assert.deepEqual(recipients, [
    { contactId: "teacher-1", audience: "teacher" },
    { contactId: "student-a", audience: "family" },
    { contactId: "parent-a", audience: "family" },
  ]);
  assert.doesNotMatch(JSON.stringify(recipients), /student-b|parent-b|student-ended|observer-a/);
});

test("a teacher delay selects every active configured enrollment recipient once", () => {
  const { selectKittyRelayRecipients } = require(relayPath);
  const recipients = selectKittyRelayRecipients(roster, { intent: "teacher_late" });

  assert.deepEqual(recipients, [
    { contactId: "student-a", audience: "family" },
    { contactId: "parent-a", audience: "family" },
    { contactId: "student-b", audience: "family" },
    { contactId: "parent-b", audience: "family" },
  ]);
});

test("attendance and relay fields reject unbounded, sensitive, and open-ended content", () => {
  const { normalizeKittyAttendance, normalizeKittyOperationalRelay } = require(relayPath);
  assert.throws(() => normalizeKittyAttendance({ status: "absent", note: "x".repeat(241) }), /attendance_note_too_long/);
  assert.throws(() => normalizeKittyAttendance({ status: "absent", note: "Medical diagnosis attached" }), /sensitive_relay_content/);
  assert.throws(() => normalizeKittyOperationalRelay({ intent: "free_form", preparationNote: "Anything" }), /unsupported_relay_intent/);
  assert.throws(() => normalizeKittyOperationalRelay({ intent: "preparation_note", preparationNote: "x".repeat(241) }), /preparation_note_too_long/);
  assert.throws(() => normalizeKittyOperationalRelay({ intent: "preparation_note", preparationNote: "Bring the disciplinary report" }), /sensitive_relay_content/);
  assert.throws(() => normalizeKittyOperationalRelay({ intent: "mode_changed", mode: "somewhere_else" }), /invalid_relay_mode/);
});

test("safe relay templates expose bounded summaries without identities or raw attendance notes", () => {
  const { buildKittyRelayTemplateData } = require(relayPath);
  assert.deepEqual(buildKittyRelayTemplateData({ intent: "student_absent" }, "teacher"), {
    relaySummary: "A student will be absent.",
  });
  assert.deepEqual(buildKittyRelayTemplateData({ intent: "student_absent" }, "family"), {
    relaySummary: "Your student will be absent.",
  });
  assert.deepEqual(buildKittyRelayTemplateData({
    intent: "teacher_late", estimatedAt: "2026-08-12T20:15:00.000Z",
  }, "family"), { relaySummary: "The teacher expects to start at 8:15 PM UTC." });
});

test("notification template projection ignores raw and attendance note fields", () => {
  const { buildKittyClassNotificationTemplateData } = require(notificationPath);
  const data = buildKittyClassNotificationTemplateData({
    occurrence: {
      title: "Group piano", subject: null, starts_at: "2026-08-12T20:00:00.000Z", timezone: "UTC",
    },
    outboxId: "11111111-1111-1111-1111-111111111111",
    changeRequestId: null,
    payload: {
      relaySummary: "The teacher is running a few minutes late.",
      note: "private medical reason", rawMessage: "forward this verbatim", studentName: "Student A",
    },
  });

  assert.equal(data.relaySummary, "The teacher is running a few minutes late.");
  assert.equal(data.classDescription, "Group piano");
  assert.equal("note" in data, false);
  assert.equal("rawMessage" in data, false);
  assert.equal("studentName" in data, false);
  assert.doesNotMatch(JSON.stringify(data), /medical|verbatim|Student A/);
});

test("attendance, correction, and relay services use one actor-bound transactional RPC", async () => {
  const { recordKittyAttendance, correctKittyAttendance, createKittyOperationalRelay } = require(servicePath);
  const calls = [];
  const client = { rpc: async (name, payload) => {
    calls.push({ name, payload });
    return { data: { id: `${name}-1`, status: payload.p_status ?? "pending", version: 1 }, error: null };
  } };
  const actor = { kind: "contact", contactId: "student-a", channel: "whatsapp" };
  const common = {
    occurrenceId: "occurrence-1", enrollmentId: "enrollment-a",
    selectionToken: "a".repeat(64), clientRequestId: "wa-request-1",
  };

  await recordKittyAttendance(client, actor, { ...common, status: "absent", note: "Family conflict" });
  await correctKittyAttendance(client, actor, {
    ...common, attendanceId: "attendance-1", status: "late",
    estimatedAt: "2026-08-12T20:15:00.000Z", clientRequestId: "wa-request-2",
  });
  await createKittyOperationalRelay(client, actor, {
    ...common, intent: "meeting_link_requested", clientRequestId: "wa-request-3",
  });

  assert.deepEqual(calls.map((call) => call.name), [
    "record_kitty_class_attendance",
    "correct_kitty_class_attendance",
    "create_kitty_class_operational_relay",
  ]);
  assert.ok(calls.every((call) => call.payload.p_actor_contact_id === "student-a"));
  assert.ok(calls.every((call) => !("actorContactId" in call.payload) && !("role" in call.payload)));
  assert.equal(calls[0].payload.p_note, "Family conflict");
  assert.equal(calls[1].payload.p_supersedes_attendance_id, "attendance-1");
});

test("relay RPCs lock and derive membership, bind replay payloads, append corrections, and are service-role-only", () => {
  const migrationFiles = fs.readdirSync(path.join(process.cwd(), "supabase/migrations"))
    .filter((name) => name.endsWith("_add_kitty_class_relays.sql"));
  assert.equal(migrationFiles.length, 1);
  const migration = fs.readFileSync(path.join(process.cwd(), "supabase/migrations", migrationFiles[0]), "utf8");

  for (const name of [
    "record_kitty_class_attendance",
    "correct_kitty_class_attendance",
    "create_kitty_class_operational_relay",
  ]) {
    assert.match(migration, new RegExp(`create function public\\.${name}\\(`));
    assert.match(migration, new RegExp(`revoke execute on function public\\.${name}\\([\\s\\S]*?from public, anon, authenticated;`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}\\([\\s\\S]*?to service_role;`));
  }
  assert.match(migration, /security definer\s+set search_path = ''/);
  assert.match(migration, /for update/);
  assert.match(migration, /occurrence_selection_confirmed/);
  assert.match(migration, /selectionTokenDigest/);
  assert.match(migration, /client_request_payload_mismatch/);
  assert.match(migration, /supersedes_attendance_id/);
  assert.match(migration, /attendance_corrected/);
  assert.match(migration, /prevent_kitty_class_attendance_mutation/);
  assert.match(migration, /insert into public\.kitty_class_notification_outbox/);
  const outboxStatements = [...migration.matchAll(/insert into public\.kitty_class_notification_outbox\([\s\S]*?;\n/g)]
    .map((match) => match[0]);
  assert.equal(outboxStatements.length, 3);
  for (const statement of outboxStatements) {
    assert.match(statement, /'relaySummary'/);
    assert.doesNotMatch(statement, /'rawMessage'|'note'\s*,\s*p_note/);
  }
});

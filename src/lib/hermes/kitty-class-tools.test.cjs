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

const toolsPath = path.join(__dirname, "kitty-class-tools.ts");
const enrollment = {
  studentContactId: "student-a",
  contacts: [{ contactId: "student-a", role: "student", receivesNotifications: true, confirmsCancellation: true, confirmsReschedule: true }],
};

test("class tool actions retain their admin and contact authority split", () => {
  const tools = fs.readFileSync(toolsPath, "utf8");
  const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/hermes/class-tools/route.ts"), "utf8");
  for (const action of ["preview_class", "create_class", "list_classes", "get_class", "edit_class", "override_class", "add_enrollment", "end_enrollment"]) {
    assert.ok(tools.includes(`"${action}"`));
  }
  for (const action of ["find_my_classes", "find_my_pending_changes", "confirm_class_selection", "request_class_change", "decide_class_change", "propose_replacement_time"]) {
    assert.ok(tools.includes(`"${action}"`));
  }
  assert.match(route, /verifyServiceRequest/);
  assert.match(route, /parseIMessageAdminActor/);
  assert.match(route, /parseWhatsAppToolActor/);
  assert.match(route, /KITTY_CLASS_CALENDAR_ENABLED/);
  assert.match(route, /communicationDecision/);
});

test("enrollment management actions are admin-only", async () => {
  const { ADMIN_CLASS_ACTIONS, CONTACT_CLASS_ACTIONS, executeKittyClassTool } = require(toolsPath);
  assert.equal(ADMIN_CLASS_ACTIONS.includes("add_enrollment"), true);
  assert.equal(ADMIN_CLASS_ACTIONS.includes("end_enrollment"), true);
  assert.equal(CONTACT_CLASS_ACTIONS.includes("add_enrollment"), false);
  assert.equal(CONTACT_CLASS_ACTIONS.includes("end_enrollment"), false);
  await assert.rejects(() => executeKittyClassTool(
    {},
    { kind: "contact", contactId: "guardian-1", channel: "whatsapp" },
    "add_enrollment",
    { occurrenceId: "occurrence-1", version: 1, effectiveDate: "2026-08-15", enrollment },
  ), /action_not_allowed/);
});

test("class preview consumes teacher, enrollments, and client request id without participants", async () => {
  const { executeKittyClassTool } = require(toolsPath);
  const result = await executeKittyClassTool(
    {},
    { kind: "admin", profileId: "profile-1", channel: "imessage" },
    "preview_class",
    {
      kind: "one_off", title: "Group piano", timezone: "America/New_York",
      startsAt: "2026-08-12T20:00:00.000Z", endsAt: "2026-08-12T21:00:00.000Z", localDate: "2026-08-12",
      teacherContactId: "teacher-1", enrollments: [enrollment], clientRequestId: "imessage:create:7",
    },
  );

  assert.equal(result.preview.teacherContactId, "teacher-1");
  assert.deepEqual(result.preview.enrollments, [enrollment]);
  assert.equal(result.preview.clientRequestId, "imessage:create:7");
  assert.equal("participants" in result.preview, false);
});

test("legacy one-student participant payload adapts to the native group contract", async () => {
  const { executeKittyClassTool } = require(toolsPath);
  const result = await executeKittyClassTool(
    {},
    { kind: "admin", profileId: "profile-1", channel: "imessage" },
    "preview_class",
    {
      kind: "weekly", title: "Legacy maths", timezone: "America/New_York",
      durationMinutes: 60, effectiveStart: "2026-08-11",
      recurrence: { frequency: "weekly", weekdays: [2], localTime: "16:00", intervalWeeks: 1 },
      participants: [
        { contactId: "teacher-1", role: "teacher", decisionSide: "teacher", receivesNotifications: true, confirmsCancellation: true, confirmsReschedule: true },
        { contactId: "student-1", role: "student", decisionSide: "student", receivesNotifications: true, confirmsCancellation: false, confirmsReschedule: true },
        { contactId: "parent-1", role: "parent_guardian", decisionSide: "student", receivesNotifications: true, confirmsCancellation: true, confirmsReschedule: true },
      ],
    },
    { clientRequestId: "hermes-request-legacy-1" },
  );

  assert.equal(result.preview.teacherContactId, "teacher-1");
  assert.equal(result.preview.clientRequestId, "hermes-request-legacy-1");
  assert.deepEqual(result.preview.enrollments, [{
    studentContactId: "student-1",
    contacts: [
      { contactId: "student-1", role: "student", receivesNotifications: true, confirmsCancellation: false, confirmsReschedule: true },
      { contactId: "parent-1", role: "parent_guardian", receivesNotifications: true, confirmsCancellation: true, confirmsReschedule: true },
    ],
  }]);
  assert.equal("participants" in result.preview, false);
});

test("create payload cannot mix native enrollments with legacy participants", async () => {
  const { executeKittyClassTool } = require(toolsPath);
  await assert.rejects(() => executeKittyClassTool(
    {},
    { kind: "admin", profileId: "profile-1", channel: "imessage" },
    "preview_class",
    {
      kind: "one_off", title: "Mixed contract", timezone: "UTC",
      startsAt: "2026-08-12T20:00:00.000Z", endsAt: "2026-08-12T21:00:00.000Z", localDate: "2026-08-12",
      teacherContactId: "teacher-1", enrollments: [enrollment], clientRequestId: "native-1",
      participants: [
        { contactId: "teacher-1", role: "teacher", decisionSide: "teacher", receivesNotifications: true, confirmsCancellation: true, confirmsReschedule: true },
        { contactId: "student-a", role: "student", decisionSide: "student", receivesNotifications: true, confirmsCancellation: true, confirmsReschedule: true },
      ],
    },
  ), /invalid_payload/);
});

test("legacy participants reject every native roster marker even when malformed", () => {
  const { normalizeKittyClassCreatePayload } = require(toolsPath);
  const legacy = {
    kind: "one_off", title: "Mixed contract", timezone: "UTC",
    startsAt: "2026-08-12T20:00:00.000Z", endsAt: "2026-08-12T21:00:00.000Z", localDate: "2026-08-12",
    participants: [
      { contactId: "teacher-1", role: "teacher", decisionSide: "teacher", receivesNotifications: true, confirmsCancellation: true, confirmsReschedule: true },
      { contactId: "student-a", role: "student", decisionSide: "student", receivesNotifications: true, confirmsCancellation: true, confirmsReschedule: true },
    ],
  };

  for (const nativeFields of [
    { teacherContactId: "teacher-1" },
    { enrollments: { studentContactId: "student-a" } },
    { enrollments: undefined },
  ]) {
    assert.throws(
      () => normalizeKittyClassCreatePayload({ ...legacy, ...nativeFields }, "mixed-request"),
      /invalid_payload/,
    );
  }
});

test("malformed native enrollments never fall through to the legacy adapter", () => {
  const { normalizeKittyClassCreatePayload } = require(toolsPath);
  assert.throws(() => normalizeKittyClassCreatePayload({
    kind: "one_off", title: "Native malformed", timezone: "UTC",
    startsAt: "2026-08-12T20:00:00.000Z", endsAt: "2026-08-12T21:00:00.000Z", localDate: "2026-08-12",
    teacherContactId: "teacher-1", enrollments: { studentContactId: "student-a" },
  }, "native-malformed-request"), /enrollment_required/);
});

test("verified Kitty route supplies its stable request id to legacy creation", async () => {
  const routePath = path.join(process.cwd(), "src/app/api/hermes/class-tools/route.ts");
  const calls = [];
  const client = {
    from() {
      return {
        insert: async () => ({ error: null }),
        update() { return { eq: async () => ({ error: null }) }; },
      };
    },
    rpc: async (name, payload) => {
      calls.push({ name, payload });
      return { data: {
        id: "occurrence-legacy", series_id: null, title: "Legacy tool maths", subject: "Math",
        starts_at: "2026-08-12T20:00:00.000Z", ends_at: "2026-08-12T21:00:00.000Z",
        local_date: "2026-08-12", timezone: "America/New_York", status: "scheduled", version: 1,
      }, error: null };
    },
  };
  const originalLoad = Module._load;
  const previous = {
    flag: process.env.KITTY_CLASS_CALENDAR_ENABLED,
    secret: process.env.HERMES_ADMIN_TOOL_SHARED_SECRET,
  };
  Module._load = function load(request, parent, isMain) {
    if (request === "next/server") return { NextResponse: { json(value, init) { return new Response(JSON.stringify(value), { status: init?.status ?? 200 }); } } };
    if (request === "@/lib/hermes/auth") return { verifyServiceRequest: () => ({ requestId: "hermes-legacy-request-1" }) };
    if (request === "@/lib/hermes/cases") return {
      communicationDecision: () => ({ allowed: true }),
      parseIMessageAdminActor: () => ({ e164: "+15555550123" }),
      parseWhatsAppToolActor: () => null,
    };
    if (request === "@/lib/hermes/kitty-class-tools") return originalLoad(toolsPath, parent, isMain);
    if (request === "@/lib/supabase/admin") return { createAdminClient: () => client };
    return originalLoad(request, parent, isMain);
  };
  process.env.KITTY_CLASS_CALENDAR_ENABLED = "true";
  process.env.HERMES_ADMIN_TOOL_SHARED_SECRET = "test-secret";
  delete require.cache[routePath];
  try {
    const { POST } = require(routePath);
    const response = await POST(new Request("https://insight.test/api/hermes/class-tools", {
      method: "POST",
      body: JSON.stringify({
        actor: { platform: "photon" }, action: "create_class",
        payload: {
          kind: "one_off", title: "Legacy tool maths", subject: "Math", timezone: "America/New_York",
          startsAt: "2026-08-12T20:00:00.000Z", endsAt: "2026-08-12T21:00:00.000Z", localDate: "2026-08-12",
          participants: [
            { contactId: "teacher-1", role: "teacher", decisionSide: "teacher", receivesNotifications: true, confirmsCancellation: true, confirmsReschedule: true },
            { contactId: "student-1", role: "student", decisionSide: "student", receivesNotifications: true, confirmsCancellation: true, confirmsReschedule: true },
          ],
        },
      }),
    }));

    assert.equal(response.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].payload.p_client_request_id, "class-create:hermes-legacy-request-1");
    assert.equal(calls[0].payload.p_teacher_contact_id, "teacher-1");
    assert.equal(calls[0].payload.p_enrollments[0].studentContactId, "student-1");
  } finally {
    Module._load = originalLoad;
    if (previous.flag === undefined) delete process.env.KITTY_CLASS_CALENDAR_ENABLED;
    else process.env.KITTY_CLASS_CALENDAR_ENABLED = previous.flag;
    if (previous.secret === undefined) delete process.env.HERMES_ADMIN_TOOL_SHARED_SECRET;
    else process.env.HERMES_ADMIN_TOOL_SHARED_SECRET = previous.secret;
    delete require.cache[routePath];
  }
});

test("enrollment actions require a version and effective date", async () => {
  const { executeKittyClassTool } = require(toolsPath);
  const actor = { kind: "admin", profileId: "profile-1", channel: "imessage" };
  await assert.rejects(() => executeKittyClassTool({}, actor, "add_enrollment", {
    occurrenceId: "occurrence-1", enrollment,
  }), /invalid_payload/);
  await assert.rejects(() => executeKittyClassTool({}, actor, "end_enrollment", {
    occurrenceId: "occurrence-1", enrollmentId: "enrollment-1", version: 2,
  }), /invalid_payload/);
});

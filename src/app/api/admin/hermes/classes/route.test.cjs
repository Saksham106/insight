/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const Module = require("node:module");
const ts = require("typescript");

require.extensions[".ts"] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  });
  module._compile(output.outputText, filename);
};

const read = (relative) => fs.readFileSync(path.join(process.cwd(), relative), "utf8");

test("Kitty class routes are admin-only, flagged, and service-backed", () => {
  const collection = read("src/app/api/admin/hermes/classes/route.ts");
  const item = read("src/app/api/admin/hermes/classes/[id]/route.ts");
  for (const source of [collection, item]) {
    assert.match(source, /getUserProfile\(\)/);
    assert.match(source, /profile\.role !== "admin"/);
    assert.match(source, /KITTY_CLASS_CALENDAR_ENABLED/);
  }
  assert.match(collection, /createKittyClass/);
  assert.match(collection, /listKittyClasses/);
  assert.match(item, /editKittyClass/);
  assert.match(item, /overrideKittyClass/);
  assert.match(item, /overrideReason/);
  assert.match(collection, /normalizeKittyClassCreatePayload/);
  assert.match(item, /addKittyClassEnrollment/);
  assert.match(item, /endKittyClassEnrollment/);
  assert.match(item, /body\.scope !== "enrollment"/);
  assert.match(item, /effectiveDate/);
});

async function captureAdminPost(body, requestId) {
  const routePath = path.join(process.cwd(), "src/app/api/admin/hermes/classes/route.ts");
  const toolsPath = path.join(process.cwd(), "src/lib/hermes/kitty-class-tools.ts");
  let capturedInput;
  const originalLoad = Module._load;
  const previousFlag = process.env.KITTY_CLASS_CALENDAR_ENABLED;
  Module._load = function load(request, parent, isMain) {
    if (request === "next/server") return { NextResponse: { json(value, init) { return new Response(JSON.stringify(value), { status: init?.status ?? 200, headers: { "content-type": "application/json" } }); } } };
    if (request === "@/lib/auth/get-user-profile") return { getUserProfile: async () => ({ id: "admin-1", role: "admin" }) };
    if (request === "@/lib/hermes/kitty-classes") return { kittyLocalDateTimeToUtc: () => "2026-08-12T20:00:00.000Z" };
    if (request === "@/lib/hermes/kitty-class-tools") return originalLoad(toolsPath, parent, isMain);
    if (request === "@/lib/hermes/kitty-class-service") return {
      createKittyClass: async (_client, _actor, input) => { capturedInput = input; return { id: "class-1" }; },
      listKittyClasses: async () => [], retryKittyClassNotification: async () => ({}),
    };
    if (request === "@/lib/supabase/admin") return { createAdminClient: () => ({}) };
    return originalLoad(request, parent, isMain);
  };
  process.env.KITTY_CLASS_CALENDAR_ENABLED = "true";
  delete require.cache[routePath];
  try {
    const { POST } = require(routePath);
    const request = new Request("https://insight.test/api/admin/hermes/classes", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": requestId },
      body: JSON.stringify(body),
    });
    const response = await POST(request);
    return { response, capturedInput };
  } finally {
    Module._load = originalLoad;
    if (previousFlag === undefined) delete process.env.KITTY_CLASS_CALENDAR_ENABLED;
    else process.env.KITTY_CLASS_CALENDAR_ENABLED = previousFlag;
    delete require.cache[routePath];
  }
}

test("admin POST adapts the current dashboard participant payload", async () => {
  const { response, capturedInput } = await captureAdminPost({
        kind: "one_off", title: "Legacy dashboard maths", subject: "Math",
        timezone: "America/New_York", localStartsAt: "2026-08-12T16:00", durationMinutes: 60,
        localDate: "2026-08-12",
        participants: [
          { contactId: "teacher-1", role: "teacher", decisionSide: "teacher", receivesNotifications: true, confirmsCancellation: true, confirmsReschedule: true },
          { contactId: "student-1", role: "student", decisionSide: "student", receivesNotifications: true, confirmsCancellation: true, confirmsReschedule: true },
          { contactId: "parent-1", role: "parent_guardian", decisionSide: "student", receivesNotifications: false, confirmsCancellation: false, confirmsReschedule: true },
        ],
      }, "dashboard-legacy-submit-1");

    assert.equal(response.status, 201);
    assert.equal(capturedInput.teacherContactId, "teacher-1");
    assert.equal(capturedInput.clientRequestId, "dashboard-legacy-submit-1");
    assert.deepEqual(capturedInput.enrollments, [{
      studentContactId: "student-1",
      contacts: [
        { contactId: "student-1", role: "student", receivesNotifications: true, confirmsCancellation: true, confirmsReschedule: true },
        { contactId: "parent-1", role: "parent_guardian", receivesNotifications: false, confirmsCancellation: false, confirmsReschedule: true },
      ],
    }]);
});

test("admin POST preserves a native multi-enrollment roster and stable request id", async () => {
  const enrollments = [
    {
      studentContactId: "student-a",
      contacts: [{ contactId: "student-a", role: "student", receivesNotifications: true, confirmsCancellation: false, confirmsReschedule: true }],
    },
    {
      studentContactId: "student-b",
      contacts: [
        { contactId: "student-b", role: "student", receivesNotifications: false, confirmsCancellation: false, confirmsReschedule: false },
        { contactId: "parent-b", role: "parent_guardian", receivesNotifications: true, confirmsCancellation: true, confirmsReschedule: true },
      ],
    },
  ];
  const { response, capturedInput } = await captureAdminPost({
    kind: "weekly", title: "Group maths", timezone: "America/New_York", durationMinutes: 60,
    effectiveStart: "2026-08-12",
    recurrence: { frequency: "weekly", weekdays: [3], localTime: "16:00", intervalWeeks: 1 },
    teacherContactId: "teacher-1", enrollments,
  }, "dashboard-group-submit-1");

  assert.equal(response.status, 201);
  assert.equal(capturedInput.teacherContactId, "teacher-1");
  assert.equal(capturedInput.clientRequestId, "dashboard-group-submit-1");
  assert.deepEqual(capturedInput.enrollments, enrollments);
  assert.equal("participants" in capturedInput, false);
});

test("ending an enrollment requires explicit scope and effective date before the service call", async () => {
  const routePath = path.join(process.cwd(), "src/app/api/admin/hermes/classes/[id]/route.ts");
  const originalLoad = Module._load;
  const previousFlag = process.env.KITTY_CLASS_CALENDAR_ENABLED;
  const calls = [];
  Module._load = function load(request, parent, isMain) {
    if (request === "next/server") return { NextResponse: { json(value, init) { return new Response(JSON.stringify(value), { status: init?.status ?? 200, headers: { "content-type": "application/json" } }); } } };
    if (request === "@/lib/auth/get-user-profile") return { getUserProfile: async () => ({ id: "admin-1", role: "admin" }) };
    if (request === "@/lib/hermes/kitty-class-service") return {
      addKittyClassEnrollment: async () => ({}), editKittyClass: async () => ({}),
      getKittyClassOccurrence: async () => ({}), overrideKittyClass: async () => ({}),
      endKittyClassEnrollment: async (_client, _actor, input) => { calls.push(input); return { id: "occurrence-1" }; },
    };
    if (request === "@/lib/supabase/admin") return { createAdminClient: () => ({}) };
    return originalLoad(request, parent, isMain);
  };
  process.env.KITTY_CLASS_CALENDAR_ENABLED = "true";
  delete require.cache[routePath];
  try {
    const { PATCH } = require(routePath);
    const context = { params: Promise.resolve({ id: "occurrence-1" }) };
    const withoutScope = await PATCH(new Request("https://insight.test/api/admin/hermes/classes/occurrence-1", {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "end_enrollment", enrollmentId: "enrollment-1", version: 3, effectiveDate: "2026-08-31" }),
    }), context);
    assert.equal(withoutScope.status, 400);
    assert.equal(calls.length, 0);

    const withScope = await PATCH(new Request("https://insight.test/api/admin/hermes/classes/occurrence-1", {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "end_enrollment", scope: "enrollment", enrollmentId: "enrollment-1", version: 3, effectiveDate: "2026-08-31" }),
    }), context);
    assert.equal(withScope.status, 200);
    assert.equal(calls[0].effectiveDate, "2026-08-31");
    assert.equal(calls[0].enrollmentId, "enrollment-1");
  } finally {
    Module._load = originalLoad;
    if (previousFlag === undefined) delete process.env.KITTY_CLASS_CALENDAR_ENABLED;
    else process.env.KITTY_CLASS_CALENDAR_ENABLED = previousFlag;
    delete require.cache[routePath];
  }
});

/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");
const { createClient } = require("@supabase/supabase-js");

require.extensions[".ts"] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } });
  module._compile(output.outputText, filename);
};

const modulePath = path.join(__dirname, "lesson-cycle-index.ts");

test("filters tutor membership before limiting cycle discovery", async () => {
  assert.ok(fs.existsSync(modulePath), "lesson-cycle-index.ts must implement bounded cycle discovery");
  const { loadLessonCycleIndex } = require(modulePath);
  const requests = [];
  const tutorId = "40000000-0000-4000-8000-000000000001";
  const cycleId = "10000000-0000-4000-8000-000000000001";
  const collectionId = "20000000-0000-4000-8000-000000000001";
  const client = createClient("https://example.supabase.co", "test-key", {
    auth: { persistSession: false },
    global: { fetch: async (url) => {
      requests.push(String(url));
      return new Response(JSON.stringify([{
        id: cycleId,
        period_start: "2026-07-01",
        status: "collecting",
        version: 1,
        collections: [{ id: collectionId, lesson_cycle_id: cycleId, tutor_contact_id: tutorId, status: "awaiting_reply" }],
      }]), { status: 200, headers: { "content-type": "application/json" } });
    } },
  });

  const result = await loadLessonCycleIndex(client, { tutorContactId: tutorId, limit: 3 });

  assert.equal(requests.length, 1);
  const request = new URL(requests[0]);
  assert.match(request.searchParams.get("select"), /academy_teacher_collections!inner/);
  assert.equal(request.searchParams.get("collections.tutor_contact_id"), `eq.${tutorId}`);
  assert.equal(request.searchParams.get("limit"), "3");
  assert.deepEqual(result.map((cycle) => cycle.id), [cycleId]);
  assert.deepEqual(result[0].collections.map((collection) => collection.tutorContactId), [tutorId]);
});

test("rejects present invalid tutor filters before issuing a database request", async () => {
  assert.ok(fs.existsSync(modulePath), "lesson-cycle-index.ts must implement bounded cycle discovery");
  const { loadLessonCycleIndex } = require(modulePath);
  let requestCount = 0;
  const client = createClient("https://example.supabase.co", "test-key", {
    auth: { persistSession: false },
    global: { fetch: async () => {
      requestCount += 1;
      return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    } },
  });

  for (const tutorContactId of [null, 123, {}, "not-a-uuid", ""]) {
    await assert.rejects(loadLessonCycleIndex(client, { tutorContactId }), /invalid_tutor_contact_id/);
  }
  assert.equal(requestCount, 0);
});

test("unfiltered discovery omits collection expansion and remains cycle-bounded", async () => {
  assert.ok(fs.existsSync(modulePath), "lesson-cycle-index.ts must implement bounded cycle discovery");
  const { loadLessonCycleIndex } = require(modulePath);
  const requests = [];
  const client = createClient("https://example.supabase.co", "test-key", {
    auth: { persistSession: false },
    global: { fetch: async (url) => {
      requests.push(String(url));
      return new Response(JSON.stringify([{
        id: "10000000-0000-4000-8000-000000000001",
        period_start: "2026-07-01",
        status: "collecting",
        version: 1,
      }]), { status: 200, headers: { "content-type": "application/json" } });
    } },
  });

  const result = await loadLessonCycleIndex(client, { limit: 24 });

  const request = new URL(requests[0]);
  assert.doesNotMatch(request.searchParams.get("select"), /academy_teacher_collections/);
  assert.equal(request.searchParams.get("limit"), "24");
  assert.deepEqual(result[0].collections, []);
});

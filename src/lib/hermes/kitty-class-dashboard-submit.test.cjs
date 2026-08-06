/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
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

const submitterPath = path.join(__dirname, "kitty-class-dashboard-submit.ts");

test("dashboard class retries retain one request id and a later submission gets a new id", async () => {
  const calls = [];
  const responses = [new Response("failure", { status: 503 }), new Response("created", { status: 201 }), new Response("created", { status: 201 })];
  const ids = ["dashboard-create-1", "dashboard-create-2"];
  const { createKittyClassDashboardSubmitter } = require(submitterPath);
  const submit = createKittyClassDashboardSubmitter({
    createRequestId: () => ids.shift(),
    fetcher: async (input, init) => {
      calls.push({ input, init });
      return responses.shift();
    },
  });

  await submit({ title: "Maths" });
  await submit({ title: "Maths" });
  await submit({ title: "Physics" });

  assert.equal(calls.length, 3);
  assert.equal(calls[0].init.headers["idempotency-key"], "dashboard-create-1");
  assert.equal(calls[1].init.headers["idempotency-key"], "dashboard-create-1");
  assert.equal(calls[2].init.headers["idempotency-key"], "dashboard-create-2");
  assert.equal(calls[0].input, "/api/admin/hermes/classes");
});

test("the classes panel uses the retry-stable dashboard submitter", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/components/admin/hermes-classes-panel.tsx"), "utf8");
  assert.match(source, /createKittyClassDashboardSubmitter/);
  assert.match(source, /submitClass\(payload\)/);
});

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

require.extensions[".ts"] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  module._compile(output.outputText, filename);
};

const {
  getOnboardingStatus,
} = require(path.join(__dirname, "onboarding-status.ts"));

test("marks invited users as invite sent until they accept the invite", () => {
  assert.deepEqual(
    getOnboardingStatus({
      invite_sent_at: "2026-06-01T10:00:00Z",
      invite_accepted_at: null,
      password_set_at: null,
    }),
    {
      label: "Invite sent",
      variant: "gold",
    },
  );
});

test("marks users as needs password after accepting invite but before setting password", () => {
  assert.deepEqual(
    getOnboardingStatus({
      invite_sent_at: "2026-06-01T10:00:00Z",
      invite_accepted_at: "2026-06-01T10:05:00Z",
      password_set_at: null,
    }),
    {
      label: "Needs password",
      variant: "gold",
    },
  );
});

test("marks users as ready after setting password", () => {
  assert.deepEqual(
    getOnboardingStatus({
      invite_sent_at: "2026-06-01T10:00:00Z",
      invite_accepted_at: "2026-06-01T10:05:00Z",
      password_set_at: "2026-06-01T10:08:00Z",
    }),
    {
      label: "Ready",
      variant: "default",
    },
  );
});

test("uses auth invite state when profile invite timestamps are missing", () => {
  assert.deepEqual(
    getOnboardingStatus({
      invite_sent_at: null,
      invite_accepted_at: null,
      password_set_at: null,
      auth_invited_at: "2026-06-09T13:49:44Z",
      auth_email_confirmed_at: null,
      auth_last_sign_in_at: null,
    }),
    {
      label: "Invite sent",
      variant: "gold",
    },
  );
});

test("keeps legacy signed-in users ready when profile onboarding timestamps are missing", () => {
  assert.deepEqual(
    getOnboardingStatus({
      invite_sent_at: null,
      invite_accepted_at: null,
      password_set_at: null,
      auth_invited_at: "2026-06-08T04:28:22Z",
      auth_email_confirmed_at: "2026-06-08T04:29:23Z",
      auth_last_sign_in_at: "2026-06-08T04:29:23Z",
    }),
    {
      label: "Ready",
      variant: "default",
    },
  );
});

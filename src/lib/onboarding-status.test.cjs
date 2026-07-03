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

test("marks a never-logged-in invitee as invite sent", () => {
  assert.deepEqual(
    getOnboardingStatus({
      password_set_at: null,
      auth_last_sign_in_at: null,
    }),
    {
      label: "Invite sent",
      variant: "gold",
    },
  );
});

test("marks a user who logged in but never changed their password as logged in with temp password", () => {
  assert.deepEqual(
    getOnboardingStatus({
      password_set_at: null,
      auth_last_sign_in_at: "2026-07-03T10:05:00Z",
    }),
    {
      label: "Logged in (temp password)",
      variant: "gold",
    },
  );
});

test("marks a user who changed their password as password changed", () => {
  assert.deepEqual(
    getOnboardingStatus({
      password_set_at: "2026-07-03T10:08:00Z",
      auth_last_sign_in_at: "2026-07-03T10:05:00Z",
    }),
    {
      label: "Password changed",
      variant: "default",
    },
  );
});

test("password_set_at takes priority even if auth_last_sign_in_at is somehow missing", () => {
  assert.deepEqual(
    getOnboardingStatus({
      password_set_at: "2026-07-03T10:08:00Z",
      auth_last_sign_in_at: null,
    }),
    {
      label: "Password changed",
      variant: "default",
    },
  );
});

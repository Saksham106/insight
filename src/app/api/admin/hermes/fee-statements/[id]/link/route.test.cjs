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
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  module._compile(output.outputText, filename);
};

const routePath = path.join(__dirname, "route.ts");

function loadRoute({
  profile,
  storedHash = "stored-hash",
  derivedHash = "stored-hash",
  status = "published",
  linkError = false,
}) {
  const originalLoad = Module._load;
  let privilegedReads = 0;
  Module._load = function load(request, parent, isMain) {
    if (request === "next/server") {
      return {
        NextResponse: {
          json(value, init = {}) {
            return new Response(JSON.stringify(value), {
              status: init.status ?? 200,
              headers: { "content-type": "application/json", ...(init.headers ?? {}) },
            });
          },
        },
      };
    }
    if (request === "@/lib/auth/get-user-profile") {
      return { getUserProfile: async () => profile };
    }
    if (request === "@/lib/hermes/fee-statement-link") {
      return {
        feeStatementPublicUrl: () => {
          if (linkError) throw new Error("capability_execution_unavailable");
          return {
            token: "private-token",
            tokenHash: derivedHash,
            url: "https://academy.example/statement/private-token",
          };
        },
        feeStatementTokenHash: () => derivedHash,
      };
    }
    if (request === "@/lib/supabase/admin") {
      return {
        createAdminClient() {
          privilegedReads += 1;
          return {
            from() {
              return {
                select() {
                  return {
                    eq() {
                      return {
                        maybeSingle: async () => ({
                          data: {
                            client_request_id: "statement-request-1",
                            public_token_hash: storedHash,
                            status,
                          },
                          error: null,
                        }),
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    }
    return originalLoad(request, parent, isMain);
  };
  delete require.cache[routePath];
  const route = require(routePath);
  Module._load = originalLoad;
  return { route, privilegedReads: () => privilegedReads };
}

const context = {
  params: Promise.resolve({ id: "375f7b98-9c2b-4ee8-b609-e408bff4a4b0" }),
};

function sameOriginRequest() {
  return new Request("https://academy.example/api", {
    method: "POST",
    headers: { origin: "https://academy.example" },
  });
}

test("statement link retrieval rejects non-admins before privileged database access", async () => {
  const { route, privilegedReads } = loadRoute({ profile: null });
  const response = await route.POST(sameOriginRequest(), context);
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal(privilegedReads(), 0);
});

test("inactive admins cannot recover bearer URLs", async () => {
  const { route, privilegedReads } = loadRoute({
    profile: { id: "admin-1", role: "admin", is_active: false },
  });
  const response = await route.POST(sameOriginRequest(), context);
  assert.equal(response.status, 403);
  assert.equal(privilegedReads(), 0);
});

test("cross-origin requests fail before privileged database access", async () => {
  const { route, privilegedReads } = loadRoute({
    profile: { id: "admin-1", role: "admin", is_active: true },
  });
  const response = await route.POST(new Request("https://academy.example/api", {
    method: "POST",
    headers: { origin: "https://attacker.example" },
  }), context);
  assert.equal(response.status, 403);
  assert.equal(privilegedReads(), 0);
});

test("an admin receives only the recovered URL in a private no-store response", async () => {
  const { route, privilegedReads } = loadRoute({ profile: { id: "admin-1", role: "admin", is_active: true } });
  const response = await route.POST(sameOriginRequest(), context);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.deepEqual(await response.json(), {
    url: "https://academy.example/statement/private-token",
  });
  assert.equal(privilegedReads(), 1);
});

test("a rotated or mismatched secret never returns an invalid private link", async () => {
  const { route } = loadRoute({
    profile: { id: "admin-1", role: "admin", is_active: true },
    storedHash: "original-hash",
    derivedHash: "different-hash",
  });
  const response = await route.POST(sameOriginRequest(), context);
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: "This statement link cannot be recovered safely.",
  });
});

test("void statements never return an active private link", async () => {
  const { route } = loadRoute({
    profile: { id: "admin-1", role: "admin", is_active: true },
    status: "void",
  });
  const response = await route.POST(sameOriginRequest(), context);
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: "Voided statements do not have an active payment link.",
  });
});

test("missing or unsafe recovery configuration fails closed", async () => {
  const { route } = loadRoute({
    profile: { id: "admin-1", role: "admin", is_active: true },
    linkError: true,
  });
  const response = await route.POST(sameOriginRequest(), context);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "Statement links are temporarily unavailable.",
  });
});

/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = function compileTypeScript(module, filename) {
  let source = fs.readFileSync(filename, "utf8");
  source = source.replace(/from\s+["']\.\/([^"']+)["']/g, (match, target) =>
    match.replace(`./${target}`, `./${target}.ts`),
  );
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  module._compile(output.outputText, filename);
};

const { deriveMessagingName, messagingName } = require(path.join(__dirname, "contact-name.ts"));

test("takes the first word of a name padded with Swati's own notes", () => {
  assert.equal(deriveMessagingName("Anjali Chemistry Teacher 12/15"), "Anjali");
  assert.equal(deriveMessagingName("Ravi"), "Ravi");
  assert.equal(deriveMessagingName("Ravi Uncle"), "Ravi");
});

test("keeps an address title attached to the name after it", () => {
  assert.equal(deriveMessagingName("Dr. Sharma"), "Dr. Sharma");
  assert.equal(deriveMessagingName("Dr Sharma"), "Dr Sharma");
  assert.equal(deriveMessagingName("Mrs Kulkarni Maths"), "Mrs Kulkarni");
  assert.equal(deriveMessagingName("Prof. Iyer"), "Prof. Iyer");
});

test("drops qualification prefixes and trailing honorifics", () => {
  assert.equal(deriveMessagingName("C.A. Ritesh Sir"), "Ritesh");
  assert.equal(deriveMessagingName("CA Ritesh"), "Ritesh");
  assert.equal(deriveMessagingName("Priya Ma'am"), "Priya");
  assert.equal(deriveMessagingName("Adv Nikhil ji"), "Nikhil");
});

test("falls back to the original when stripping would leave nothing", () => {
  assert.equal(deriveMessagingName("Sir"), "Sir");
  assert.equal(deriveMessagingName("   "), "");
  assert.equal(deriveMessagingName("  Meera  "), "Meera");
});

test("an explicit preferred name always wins", () => {
  assert.equal(
    messagingName({ display_name: "Anjali Chemistry Teacher 12/15", preferred_name: "Anju" }),
    "Anju",
  );
  assert.equal(
    messagingName({ display_name: "Anjali Chemistry Teacher 12/15", preferred_name: null }),
    "Anjali",
  );
  assert.equal(messagingName({ display_name: "C.A. Ritesh Sir" }), "Ritesh");
  assert.equal(
    messagingName({ display_name: "C.A. Ritesh Sir", preferred_name: "   " }),
    "Ritesh",
    "a whitespace-only override is not an override",
  );
});

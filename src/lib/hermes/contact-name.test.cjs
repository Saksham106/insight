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

test("uses a neutral greeting when a phone label names a relative instead of the recipient", () => {
  assert.equal(deriveMessagingName("Aarav Mom"), "there");
  assert.equal(deriveMessagingName("Pooja's Mother"), "there");
  assert.equal(deriveMessagingName("Rohan Dad"), "there");
});

test("does not greet people by initials, conjunctions, emoji, or a qualification", () => {
  assert.equal(deriveMessagingName("A K Sharma"), "A K Sharma");
  assert.equal(deriveMessagingName("Mr and Mrs Sharma"), "there");
  assert.equal(deriveMessagingName("🧪 Anjali Chemistry Teacher"), "Anjali");
  assert.equal(deriveMessagingName("CA Sir"), "Sir");
});

test("keeps common abbreviated Indian given-name prefixes with the following name", () => {
  assert.equal(deriveMessagingName("Mohd Arif"), "Mohd Arif");
  assert.equal(deriveMessagingName("Md. Irfan"), "Md. Irfan");
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
    "there",
  );
  assert.equal(messagingName({ display_name: "C.A. Ritesh Sir" }), "there");
  assert.equal(
    messagingName({ display_name: "C.A. Ritesh Sir", preferred_name: "   " }),
    "there",
    "a whitespace-only override is not a confirmed name",
  );
});

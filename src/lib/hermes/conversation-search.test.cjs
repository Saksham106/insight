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

const { filterConversationContacts } = require(path.join(__dirname, "conversation-search.ts"));

function contact(overrides) {
  return {
    id: overrides.id,
    display_name: overrides.display_name,
    preferred_name: overrides.preferred_name ?? null,
    whatsapp_e164: overrides.whatsapp_e164,
    role: overrides.role ?? "parent",
  };
}

const PRIYA = contact({
  id: "priya",
  display_name: "Priya Sharma Chemistry 12/15",
  preferred_name: "Priya",
  whatsapp_e164: "+919876543210",
});
const ANJALI = contact({
  id: "anjali",
  display_name: "Anjali Verma",
  preferred_name: null,
  whatsapp_e164: "+919812345678",
});
const RITESH = contact({
  id: "ritesh",
  display_name: "C.A. Ritesh Sir",
  preferred_name: "Ritesh",
  whatsapp_e164: "+61412000111",
});
const ALL = [PRIYA, ANJALI, RITESH];

const ids = (rows) => rows.map((row) => row.id);

test("an empty query shows every contact", () => {
  assert.deepEqual(ids(filterConversationContacts(ALL, "")), ["priya", "anjali", "ritesh"]);
});

test("a whitespace-only query is treated as empty", () => {
  assert.deepEqual(ids(filterConversationContacts(ALL, "   ")), ["priya", "anjali", "ritesh"]);
});

test("matches on the directory display name", () => {
  assert.deepEqual(ids(filterConversationContacts(ALL, "Verma")), ["anjali"]);
});

test("matches on a note buried in the display name", () => {
  assert.deepEqual(ids(filterConversationContacts(ALL, "chemistry")), ["priya"]);
});

test("matches on the confirmed messaging name", () => {
  assert.deepEqual(ids(filterConversationContacts(ALL, "Ritesh")), ["ritesh"]);
});

test("matching is case-insensitive in both directions", () => {
  assert.deepEqual(ids(filterConversationContacts(ALL, "PRIYA")), ["priya"]);
  assert.deepEqual(ids(filterConversationContacts(ALL, "anjali verma")), ["anjali"]);
});

test("the query is trimmed before matching", () => {
  assert.deepEqual(ids(filterConversationContacts(ALL, "  Verma  ")), ["anjali"]);
});

test("matches on the full WhatsApp number", () => {
  assert.deepEqual(ids(filterConversationContacts(ALL, "+919876543210")), ["priya"]);
});

test("matches on a trailing fragment of the WhatsApp number", () => {
  assert.deepEqual(ids(filterConversationContacts(ALL, "543210")), ["priya"]);
});

test("matches a number typed with spaces and punctuation", () => {
  assert.deepEqual(ids(filterConversationContacts(ALL, "+61 412 000 111")), ["ritesh"]);
});

test("a short non-numeric query does not match every phone number", () => {
  // Guards the digits-only path: stripping punctuation from "a" leaves "",
  // and "".includes("") is true for every contact.
  assert.deepEqual(ids(filterConversationContacts(ALL, "zzz")), []);
});

test("no results returns an empty list rather than falling back to everything", () => {
  assert.deepEqual(filterConversationContacts(ALL, "nobody here"), []);
});

test("results keep the order they were given in", () => {
  // The caller has already sorted by the conversation-summary ordering;
  // filtering must not reshuffle it.
  assert.deepEqual(ids(filterConversationContacts(ALL, "1")), ["priya", "anjali", "ritesh"]);
});

test("a null preferred name never matches the neutral greeting fallback", () => {
  // messagingName() returns "there" when unconfirmed; searching "there"
  // must not surface every contact that has no preferred name.
  assert.deepEqual(ids(filterConversationContacts(ALL, "there")), []);
});

test("the input array is not mutated", () => {
  const input = [...ALL];
  filterConversationContacts(input, "Verma");
  assert.deepEqual(ids(input), ["priya", "anjali", "ritesh"]);
});

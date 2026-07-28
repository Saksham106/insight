const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

// Compile the sibling .ts on require, mirroring group-derive.test.cjs.
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

const s = require(path.join(__dirname, "conversation-shape.ts"));

test("isGroupConversation is true only above two members", () => {
  assert.equal(s.isGroupConversation(0), false);
  assert.equal(s.isGroupConversation(1), false);
  assert.equal(s.isGroupConversation(2), false);
  assert.equal(s.isGroupConversation(3), true);
  assert.equal(s.isGroupConversation(9), true);
});

test("isDirectConversationKey matches exactly two members with no title", () => {
  assert.equal(s.isDirectConversationKey(2, null), true);
  assert.equal(s.isDirectConversationKey(2, ""), true);
  assert.equal(s.isDirectConversationKey(2, "   "), true);
});

test("isDirectConversationKey rejects a deliberately named pair", () => {
  assert.equal(s.isDirectConversationKey(2, "Algebra tutoring"), false);
});

test("isDirectConversationKey rejects rosters that are not exactly two", () => {
  assert.equal(s.isDirectConversationKey(1, null), false);
  assert.equal(s.isDirectConversationKey(3, null), false);
});

test("hasMinimumRoster requires two people", () => {
  assert.equal(s.hasMinimumRoster(0), false);
  assert.equal(s.hasMinimumRoster(1), false);
  assert.equal(s.hasMinimumRoster(2), true);
  assert.equal(s.hasMinimumRoster(5), true);
});

// --- resolveConversationTitle ------------------------------------------------

const alice = { id: "alice", full_name: "Alice Smith", role: "teacher" };
const bob = { id: "bob", full_name: "Bob Jones", role: "student" };
const carol = { id: "carol", full_name: "Carol Lee", role: "parent" };

const dm = [alice, bob];
const group = [alice, bob, carol];

test("ordinary DM, participant view: other member's name", () => {
  assert.equal(s.resolveConversationTitle(dm, null, "alice"), "Bob Jones");
});

test("ordinary DM, admin view: both members' names", () => {
  assert.equal(s.resolveConversationTitle(dm, null, null), "Alice Smith, Bob Jones");
});

test("named pair, participant view: stored name wins", () => {
  assert.equal(s.resolveConversationTitle(dm, "Algebra tutoring", "alice"), "Algebra tutoring");
});

test("named pair, admin view: stored name wins", () => {
  assert.equal(s.resolveConversationTitle(dm, "Algebra tutoring", null), "Algebra tutoring");
});

test("unnamed group, participant view: other members' names", () => {
  assert.equal(s.resolveConversationTitle(group, null, "alice"), "Bob Jones, Carol Lee");
});

test("unnamed group, admin view: all members' names", () => {
  assert.equal(s.resolveConversationTitle(group, null, null), "Alice Smith, Bob Jones, Carol Lee");
});

test("named group, participant view: stored name wins", () => {
  assert.equal(s.resolveConversationTitle(group, "Study group", "alice"), "Study group");
});

test("named group, admin view: stored name wins", () => {
  assert.equal(s.resolveConversationTitle(group, "Study group", null), "Study group");
});

test("participant is the only member: falls back to 'You'", () => {
  // otherMembersTitle([alice], "alice") has no "others" and returns "You"
  // directly, so the "|| \"Group\"\" fallback after it is never reached in
  // this path — a truthy "You" always short-circuits the `||`. Documented
  // here rather than changed: this is moved behaviour, not a redesign.
  assert.equal(s.resolveConversationTitle([alice], null, "alice"), "You");
});

// --- Fix 2 round-trip: customTitle vs. resolved title ------------------------

test("customTitle round-trip: stored name survives even when roster would resolve differently", () => {
  // Mirrors the normalisation hydrateSummaries applies to the raw `title`
  // column before handing it to callers as `customTitle`.
  const normalize = (raw) => raw?.trim() || null;

  // Unnamed group: the resolved display title is a synthesized roster string,
  // but customTitle (what the members modal seeds its name field from) must
  // stay null — never that synthesized string — or a stale title gets saved
  // back as real data the next time someone opens "Members" and hits Save.
  const rawTitle = null;
  const customTitle = normalize(rawTitle);
  const resolvedTitle = s.resolveConversationTitle(group, customTitle, null);
  assert.equal(customTitle, null);
  assert.equal(resolvedTitle, "Alice Smith, Bob Jones, Carol Lee");
  assert.notEqual(customTitle, resolvedTitle);

  // Named pair: customTitle must carry the real stored name through, not the
  // empty string a `conversation.isGroup ? title : ""` ternary would produce
  // for a 2-person conversation (isGroup is false even though it has a name).
  const rawPairTitle = "Algebra tutoring";
  const pairCustomTitle = normalize(rawPairTitle);
  assert.equal(pairCustomTitle, "Algebra tutoring");
  assert.notEqual(pairCustomTitle, "");
});

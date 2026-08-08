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

const { projectAttentionItems } = require(path.join(__dirname, "attention.ts"));

function contact(overrides = {}) {
  return {
    id: overrides.id ?? "contact-1",
    display_name: overrides.display_name ?? "Priya Sharma",
    role: overrides.role ?? "parent",
    profile_link_status: overrides.profile_link_status ?? "confirmed",
    communication_policy: overrides.communication_policy ?? "direct",
  };
}

const EMPTY = {
  approvals: [],
  contacts: [],
  messages: [],
  cases: [],
  classAttentionIssues: [],
  guardianIssues: [],
};

const project = (overrides) => projectAttentionItems({ ...EMPTY, ...overrides });

test("nothing to do produces no items", () => {
  assert.deepEqual(project({}), []);
});

// --- intentional settings are not problems -------------------------------

test("a paused contact is not an attention item", () => {
  const items = project({ contacts: [contact({ communication_policy: "paused" })] });
  assert.deepEqual(items, [], "pausing a contact is a decision Swati already made");
});

test("an opted-out contact is not an attention item", () => {
  assert.deepEqual(project({ contacts: [contact({ communication_policy: "opted_out" })] }), []);
});

test("a guardian-only contact is not an attention item", () => {
  assert.deepEqual(project({ contacts: [contact({ communication_policy: "guardian_only" })] }), []);
});

test("an approval-required contact is not an attention item", () => {
  assert.deepEqual(project({ contacts: [contact({ communication_policy: "approval_required" })] }), []);
});

test("every intentional policy together still yields nothing to do", () => {
  const items = project({
    contacts: ["paused", "opted_out", "guardian_only", "approval_required"].map((policy, index) =>
      contact({ id: `c-${index}`, communication_policy: policy }),
    ),
  });
  assert.deepEqual(items, []);
});

// --- genuine work ---------------------------------------------------------

test("an unclassified contact needs a role decision", () => {
  const items = project({ contacts: [contact({ role: "unclassified" })] });
  assert.equal(items.length, 1);
  assert.match(items[0].whatToDo, /role/i);
  assert.equal(items[0].where, "contacts");
});

test("a suggested identity link needs confirmation", () => {
  const items = project({ contacts: [contact({ profile_link_status: "suggested" })] });
  assert.equal(items.length, 1);
  assert.match(items[0].whatHappened, /match/i);
  assert.equal(items[0].where, "contacts");
});

test("a pending approval is an attention item", () => {
  const items = project({ approvals: [{ id: "a-1", action: "send_proposal" }] });
  assert.equal(items.length, 1);
  assert.equal(items[0].where, "attention");
});

test("a failed delivery is an attention item that names the contact", () => {
  const items = project({
    messages: [{ id: "m-1", status: "failed", direction: "outbound", contact: { display_name: "Priya" } }],
  });
  assert.equal(items.length, 1);
  assert.match(items[0].who, /Priya/);
});

test("a delivered message is not an attention item", () => {
  assert.deepEqual(
    project({ messages: [{ id: "m-1", status: "delivered", direction: "outbound", contact: null }] }),
    [],
  );
});

test("human takeover on a case is an attention item", () => {
  const items = project({
    cases: [{ id: "case-1", title: "Reschedule Tuesday", status: "collecting_availability", human_takeover: true }],
  });
  assert.equal(items.length, 1);
  assert.match(items[0].whatToDo, /take over|takeover/i);
});

test("a missing guardian link is an attention item", () => {
  const items = project({
    guardianIssues: [{ id: "g-1", kind: "missing_guardian", studentName: "Aarav", occurrenceTitle: "Physics" }],
  });
  assert.equal(items.length, 1);
  assert.match(items[0].whatHappened, /guardian/i);
});

test("an ambiguous guardian choice is an attention item", () => {
  const items = project({
    guardianIssues: [{ id: "g-2", kind: "ambiguous_guardian", studentName: "Aarav", occurrenceTitle: "Physics" }],
  });
  assert.equal(items.length, 1);
  assert.match(items[0].whatToDo, /choose|which/i);
});

test("class workflow exceptions are included", () => {
  const items = project({
    classAttentionIssues: [{ id: "i-1", kind: "ambiguous_scope", occurrenceId: "occ-1", seriesId: null }],
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].where, "classes");
});

// --- shape ----------------------------------------------------------------

test("every item answers what happened, who it affects, what to do, and where", () => {
  const items = project({
    approvals: [{ id: "a-1", action: "send_proposal" }],
    contacts: [contact({ role: "unclassified" }), contact({ id: "c-2", profile_link_status: "suggested" })],
    messages: [{ id: "m-1", status: "failed", direction: "outbound", contact: { display_name: "Priya" } }],
    cases: [{ id: "case-1", title: "Reschedule", status: "collecting_availability", human_takeover: true }],
    guardianIssues: [{ id: "g-1", kind: "missing_guardian", studentName: "Aarav", occurrenceTitle: "Physics" }],
    classAttentionIssues: [{ id: "i-1", kind: "expired_request", occurrenceId: "occ-1", seriesId: null }],
  });
  assert.ok(items.length >= 6);
  for (const item of items) {
    assert.ok(item.id, "every item is keyable");
    assert.ok(item.whatHappened, `missing whatHappened: ${JSON.stringify(item)}`);
    assert.ok(item.who, `missing who: ${JSON.stringify(item)}`);
    assert.ok(item.whatToDo, `missing whatToDo: ${JSON.stringify(item)}`);
    assert.ok(item.where, `missing where: ${JSON.stringify(item)}`);
  }
});

test("item ids are unique so the badge count cannot double-count", () => {
  const items = project({
    contacts: [contact({ id: "c-1", role: "unclassified", profile_link_status: "suggested" })],
  });
  const ids = items.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("the badge count equals the number of actionable items", () => {
  const items = project({
    approvals: [{ id: "a-1", action: "send_proposal" }],
    contacts: [contact({ communication_policy: "paused" }), contact({ id: "c-2", role: "unclassified" })],
  });
  // One approval + one unclassified contact. The paused contact is a setting.
  assert.equal(items.length, 2);
});

test("a class exception names the class when the title is known", () => {
  const items = projectAttentionItems({
    ...EMPTY,
    classAttentionIssues: [{ id: "i-1", kind: "ambiguous_scope", occurrenceId: "occ-1", seriesId: null }],
    occurrenceTitles: { "occ-1": "Physics · Tuesday" },
  });
  assert.equal(items[0].who, "Physics · Tuesday");
});

test("a class exception falls back safely when the title is unknown", () => {
  const items = projectAttentionItems({
    ...EMPTY,
    classAttentionIssues: [{ id: "i-1", kind: "ambiguous_scope", occurrenceId: "occ-x", seriesId: null }],
    occurrenceTitles: {},
  });
  assert.equal(items[0].who, "A class");
});

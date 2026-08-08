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

const {
  RELATIONSHIP_SOURCE_CHANNEL,
  parseRelationshipMutation,
  relationshipErrorResponse,
  projectRelationshipsForContact,
  selectableLinkTargets,
} = require(path.join(__dirname, "relationships.ts"));

const contact = (id, role, overrides = {}) => ({
  id,
  display_name: overrides.display_name ?? id,
  role,
  is_active: overrides.is_active ?? true,
  deleted_at: overrides.deleted_at ?? null,
});

const rel = (id, parentId, studentId, isActive = true) => ({
  id,
  source_contact_id: parentId,
  target_contact_id: studentId,
  relationship_type: "parent_guardian",
  is_active: isActive,
});

// --- request validation ---------------------------------------------------

test("a well-formed add is accepted", () => {
  const parsed = parseRelationshipMutation({
    parentContactId: "mum",
    studentContactId: "kid",
    active: true,
  });
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.value, { parentContactId: "mum", studentContactId: "kid", active: true });
});

test("a deactivation is accepted", () => {
  const parsed = parseRelationshipMutation({
    parentContactId: "mum",
    studentContactId: "kid",
    active: false,
  });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.active, false);
});

test("linking a contact to itself is refused before reaching the database", () => {
  const parsed = parseRelationshipMutation({
    parentContactId: "same",
    studentContactId: "same",
    active: true,
  });
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /themselves/i);
  assert.equal(parsed.status, 400);
});

test("a missing contact id is refused", () => {
  assert.equal(parseRelationshipMutation({ parentContactId: "mum", active: true }).ok, false);
  assert.equal(parseRelationshipMutation({ studentContactId: "kid", active: true }).ok, false);
});

test("a blank contact id is refused", () => {
  const parsed = parseRelationshipMutation({
    parentContactId: "   ",
    studentContactId: "kid",
    active: true,
  });
  assert.equal(parsed.ok, false);
});

test("a non-boolean active flag is refused rather than coerced", () => {
  const parsed = parseRelationshipMutation({
    parentContactId: "mum",
    studentContactId: "kid",
    active: "yes",
  });
  assert.equal(parsed.ok, false);
});

test("an absent body is refused safely", () => {
  assert.equal(parseRelationshipMutation(undefined).ok, false);
  assert.equal(parseRelationshipMutation(null).ok, false);
});

test("the admin channel is the one the dashboard declares", () => {
  assert.equal(RELATIONSHIP_SOURCE_CHANNEL, "admin");
});

// --- database error mapping ----------------------------------------------

test("a role mismatch on the parent is explained", () => {
  const response = relationshipErrorResponse('relationship_source_role_invalid');
  assert.match(response.message, /parent/i);
  assert.equal(response.status, 400);
});

test("a non-student target is explained", () => {
  const response = relationshipErrorResponse('relationship_student_required');
  assert.match(response.message, /student/i);
  assert.equal(response.status, 400);
});

test("a missing or deleted contact is a stale-state conflict", () => {
  const response = relationshipErrorResponse('relationship_contact_unavailable');
  assert.equal(response.status, 409);
  assert.match(response.message, /refresh/i);
});

test("an unrecognised database error never leaks internals", () => {
  const response = relationshipErrorResponse(
    'duplicate key value violates unique constraint "hermes_contact_relationships_pkey"',
  );
  assert.equal(response.status, 500);
  assert.equal(response.message, "Could not update the link.");
  assert.equal(response.message.includes("constraint"), false);
});

test("a null error message is handled", () => {
  assert.equal(relationshipErrorResponse(null).status, 500);
});

// --- presentation ---------------------------------------------------------

const CONTACTS = [
  contact("mum", "parent", { display_name: "Priya" }),
  contact("dad", "parent", { display_name: "Ravi" }),
  contact("kid", "student", { display_name: "Aarav" }),
  contact("kid2", "student", { display_name: "Ishaan" }),
];

test("a parent shows their linked children", () => {
  const view = projectRelationshipsForContact({
    contactId: "mum",
    relationships: [rel("r-1", "mum", "kid"), rel("r-2", "mum", "kid2")],
    contacts: CONTACTS,
  });
  assert.deepEqual(view.children.map((c) => c.displayName), ["Aarav", "Ishaan"]);
  assert.deepEqual(view.guardians, []);
});

test("a student shows their linked guardians reciprocally", () => {
  const view = projectRelationshipsForContact({
    contactId: "kid",
    relationships: [rel("r-1", "mum", "kid"), rel("r-2", "dad", "kid")],
    contacts: CONTACTS,
  });
  assert.deepEqual(view.guardians.map((c) => c.displayName), ["Priya", "Ravi"]);
  assert.deepEqual(view.children, []);
});

test("a deactivated link is not shown as current", () => {
  const view = projectRelationshipsForContact({
    contactId: "mum",
    relationships: [rel("r-1", "mum", "kid", false)],
    contacts: CONTACTS,
  });
  assert.deepEqual(view.children, [], "history is retained in the database, not displayed as active");
});

test("a link to a removed contact is not shown", () => {
  const view = projectRelationshipsForContact({
    contactId: "mum",
    relationships: [rel("r-1", "mum", "gone")],
    contacts: [...CONTACTS, contact("gone", "student", { deleted_at: "2026-08-01T00:00:00.000Z" })],
  });
  assert.deepEqual(view.children, []);
});

test("a contact with no links yields empty lists, not an error", () => {
  const view = projectRelationshipsForContact({
    contactId: "mum",
    relationships: [],
    contacts: CONTACTS,
  });
  assert.deepEqual(view, { children: [], guardians: [] });
});

test("one family's links never appear on another family's card", () => {
  const view = projectRelationshipsForContact({
    contactId: "mum",
    relationships: [rel("r-1", "mum", "kid"), rel("r-2", "dad", "kid2")],
    contacts: CONTACTS,
  });
  assert.deepEqual(view.children.map((c) => c.contactId), ["kid"]);
});

// --- selector -------------------------------------------------------------

test("only active students can be selected as children", () => {
  const options = selectableLinkTargets({
    contactId: "mum",
    wantedRole: "student",
    contacts: [...CONTACTS, contact("removed", "student", { deleted_at: "2026-08-01T00:00:00.000Z" })],
    alreadyLinkedIds: [],
  });
  assert.deepEqual(options.map((c) => c.id), ["kid", "kid2"]);
});

test("an inactive student cannot be selected", () => {
  const options = selectableLinkTargets({
    contactId: "mum",
    wantedRole: "student",
    contacts: [contact("kid", "student", { is_active: false })],
    alreadyLinkedIds: [],
  });
  assert.deepEqual(options, []);
});

test("a parent cannot be selected as a child", () => {
  const options = selectableLinkTargets({
    contactId: "mum",
    wantedRole: "student",
    contacts: CONTACTS,
    alreadyLinkedIds: [],
  });
  assert.equal(options.some((c) => c.role === "parent"), false);
});

test("the contact being edited is never offered as its own link", () => {
  const options = selectableLinkTargets({
    contactId: "kid",
    wantedRole: "student",
    contacts: CONTACTS,
    alreadyLinkedIds: [],
  });
  assert.equal(options.some((c) => c.id === "kid"), false);
});

test("an already-linked student is not offered twice", () => {
  const options = selectableLinkTargets({
    contactId: "mum",
    wantedRole: "student",
    contacts: CONTACTS,
    alreadyLinkedIds: ["kid"],
  });
  assert.deepEqual(options.map((c) => c.id), ["kid2"]);
});

test("a student card offers parents as guardians", () => {
  const options = selectableLinkTargets({
    contactId: "kid",
    wantedRole: "parent",
    contacts: CONTACTS,
    alreadyLinkedIds: [],
  });
  assert.deepEqual(options.map((c) => c.id), ["mum", "dad"]);
});

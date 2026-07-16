/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

function read(relative) {
  return fs.readFileSync(path.join(process.cwd(), relative), "utf8");
}

test("admin overview links to Kitty without exposing the internal Hermes name", () => {
  const source = read("src/components/admin/admin-dashboard.tsx");
  assert.match(source, /href: "\/admin\/hermes"/);
  assert.match(source, /title: "Kitty"/);
  assert.doesNotMatch(source, /title: "Hermes Assistant"/);
});

test("Kitty admin page exposes the four minimal operating sections", () => {
  const source = read("src/components/admin/hermes-assistant-dashboard.tsx");
  assert.match(source, /> Kitty/);
  assert.doesNotMatch(source, /> Hermes Assistant/);
  for (const label of ["Contacts", "Needs attention", "Active scheduling", "Recent activity"]) {
    assert.ok(source.includes(label), `missing ${label}`);
  }
});

test("contact import supports the required classifications and consent", () => {
  const source = read("src/components/admin/hermes-contact-import.tsx");
  for (const role of ["Teacher", "Student", "Parent", "Employee", "Other"]) {
    assert.ok(source.includes(role), `missing ${role}`);
  }
  assert.match(source, /consent/i);
  assert.match(source, /\.vcf/);
});

test("contact mutation routes authorize administrators before privileged access", () => {
  for (const relative of [
    "src/app/api/admin/hermes/contacts/route.ts",
    "src/app/api/admin/hermes/contacts/[id]/route.ts",
  ]) {
    const source = read(relative);
    assert.match(source, /getUserProfile\(\)/);
    assert.match(source, /profile\.role !== "admin"/);
  }
});

test("pending approvals expose approve and reject controls through an admin-only route", () => {
  const dashboard = read("src/components/admin/hermes-approval-actions.tsx");
  assert.match(dashboard, /Approve/);
  assert.match(dashboard, /Reject/);
  const route = read("src/app/api/admin/hermes/approvals/[id]/route.ts");
  assert.match(route, /getUserProfile\(\)/);
  assert.match(route, /profile\.role !== "admin"/);
  assert.match(route, /decided_by/);
});

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

test("Kitty admin page exposes scheduling, ledger, and audit sections", () => {
  const shell = read("src/components/admin/hermes-assistant-dashboard.tsx");
  assert.match(shell, /> Kitty/);
  assert.doesNotMatch(shell, /> Hermes Assistant/);

  const panels = [
    "src/components/admin/hermes-conversations-panel.tsx",
    "src/components/admin/hermes-attention-panel.tsx",
    "src/components/admin/hermes-scheduling-panel.tsx",
    "src/components/admin/hermes-settlements-panel.tsx",
  ]
    .map(read)
    .join("\n");

  for (const label of ["WhatsApp conversations", "Needs attention", "Active scheduling", "Lesson collection", "Financial settlements", "Recent activity"]) {
    assert.ok(panels.includes(label), `missing ${label}`);
  }
  for (const label of ["Tutor reports", "Family invoices", "Tutor payouts"]) {
    assert.ok(panels.includes(label), `missing ${label}`);
  }
});

test("every section stays reachable from the tab bar", () => {
  const shell = read("src/components/admin/hermes-assistant-dashboard.tsx");
  const shared = read("src/components/admin/hermes-dashboard-shared.tsx");

  // Conversations is the landing view when no tab is requested.
  assert.match(shared, /DEFAULT_HERMES_TAB: HermesTab = "conversations"/);
  for (const id of ["conversations", "attention", "scheduling", "ledger", "contacts", "classes"]) {
    assert.ok(shared.includes(`"${id}"`), `missing tab id ${id}`);
    assert.ok(shell.includes(`tab === "${id}"`), `tab ${id} renders no panel`);
  }
  // Switching tabs must not drop the contact currently being read.
  assert.match(shared, /if \(contactId\) params\.set\("contact", contactId\)/);
  assert.match(shell, /href=\{hermesTabHref\(id, selectedContact\?\.id \?\? null\)\}/);
  assert.match(shell, /aria-label="Kitty sections"/);

  // An unknown tab value falls back rather than rendering an empty page.
  assert.match(shared, /HERMES_TABS\.includes\(candidate as HermesTab\)/);
});

test("admins can select every contact and read a privacy-minimized transcript", () => {
  // The contact column is a client component so it can hold the search box;
  // the transcript stays server-rendered. Both halves are checked together.
  const list = read("src/components/admin/hermes-conversation-list.tsx");
  const source = [read("src/components/admin/hermes-conversations-panel.tsx"), list].join("\n");
  assert.match(list, /import Link from "next\/link"/);
  assert.doesNotMatch(source, /contacts\.slice\(0,\s*12\)/);
  assert.match(list, /href=\{hermesTabHref\("conversations", contact\.id\)\}/);
  assert.match(list, /aria-current=\{isSelected \? "page" : undefined\}/);
  assert.match(source, /No WhatsApp messages yet/);
  assert.match(source, /Select a contact to view their WhatsApp conversation/);
  assert.match(source, /Conversation with \{selectedContact\.display_name\}/);
  assert.match(source, /message\.speaker === "kitty"/);
  assert.match(source, />Kitty</);
  assert.match(source, />Contact</);
  assert.match(source, /Transcript temporarily unavailable/);
  assert.doesNotMatch(source, /dangerouslySetInnerHTML/);
  for (const forbidden of [
    "System prompt",
    "Tool call",
    "Reasoning",
    "Model tokens",
    "Raw JSON",
  ]) {
    assert.doesNotMatch(source, new RegExp(forbidden, "i"));
  }
});

test("admin page loads lesson cycles after authorization and wires the combined Ledger tab", () => {
  const page = read("src/app/(dashboard)/admin/hermes/page.tsx");
  const shared = read("src/components/admin/hermes-dashboard-shared.tsx");
  const shell = read("src/components/admin/hermes-assistant-dashboard.tsx");

  assert.match(page, /loadAdminLessonCycles/);
  assert.match(page, /lessonCycles=/);
  assert.match(page, /lessonLedgerError=/);
  assert.ok(
    page.indexOf('requireRole(["admin"])') < page.indexOf("createAdminClient()"),
  );
  assert.match(page, /\.from\("academy_settlement_cycles"\)/);
  assert.ok(shared.includes('"ledger"'));
  assert.doesNotMatch(shared, /"settlements"/);
  const tabModel = read("src/lib/hermes/admin-tabs.ts");
  assert.match(tabModel, /label: "Ledger"/);
  assert.match(shell, /tab === "ledger"/);
  assert.match(shell, /lessonCycles\.length \+ settlements\.length/);
});

test("combined Ledger shows lesson evidence before financial settlement tracking", () => {
  const panel = read("src/components/admin/hermes-settlements-panel.tsx");
  for (const label of [
    "Lesson collection",
    "Financial settlements",
    "Tutors confirmed",
    "Lessons recorded",
    "Students unresolved",
    "Tutor unavailable",
    "Awaiting lesson report",
    "Confirmed with no lessons",
    "Reported as",
    "Delivery failed",
    "Corrections remain available in audit history",
  ]) {
    assert.ok(panel.includes(label), `missing ${label}`);
  }
  assert.ok(
    panel.indexOf("Lesson collection") < panel.indexOf("Financial settlements"),
    "lesson collection must appear before financial settlements",
  );
  for (const collection of [
    "lessonCycles.map",
    "cycle.collections.map",
    "report.lessons.map",
  ]) {
    assert.ok(panel.includes(collection), `missing iteration ${collection}`);
  }
  assert.match(panel, /readyReports/);
  assert.match(panel, /paidInvoices/);
  assert.match(panel, /paidPayouts/);
  assert.doesNotMatch(panel, /"use client"/);
});

test("contact import supports the required classifications and consent", () => {
  const source = read("src/components/admin/hermes-contact-import.tsx");
  for (const role of ["Teacher", "Student", "Parent", "Employee", "Other"]) {
    assert.ok(source.includes(role), `missing ${role}`);
  }
  assert.match(source, /consent/i);
  assert.match(source, /\.vcf/);
});

test("Kitty dashboard quick-adds one consented WhatsApp contact at a time", () => {
  const source = read("src/components/admin/hermes-contact-quick-add.tsx");
  for (const role of ["Teacher", "Student", "Parent", "Employee", "Other"]) {
    assert.ok(source.includes(role), `missing ${role}`);
  }
  assert.match(source, /Quick add contact/);
  assert.match(source, /\/api\/admin\/hermes\/contacts/);
  assert.match(source, /consent/i);
  assert.match(source, /setDisplayName\(""\)/);
  assert.match(source, /setPhone\(""\)/);
  assert.match(source, /setRole\(""\)/);
  assert.match(source, /setConsent\(false\)/);
  assert.match(source, /router\.refresh\(\)/);

  const panel = read("src/components/admin/hermes-contacts-panel.tsx");
  assert.match(panel, /HermesContactQuickAdd/);
  assert.ok(
    panel.indexOf("<HermesContactQuickAdd") < panel.indexOf("<HermesContactImport"),
    "quick add should appear before bulk import",
  );
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

test("fee statements form a searchable private-link library for administrators", () => {
  const panel = read("src/components/admin/hermes-fee-statements-panel.tsx");
  for (const label of [
    "Search students or references",
    "All months",
    "All statuses",
    "Copy link",
    "Open statement",
    "Copy WhatsApp message",
  ]) {
    assert.ok(panel.includes(label), `missing fee statement control ${label}`);
  }
  assert.match(panel, /\/api\/admin\/hermes\/fee-statements\/\$\{statementId\}\/link/);
  assert.match(panel, /navigator\.clipboard\.writeText/);
  assert.match(panel, /window\.open/);
  assert.doesNotMatch(panel, /public_token_hash|client_request_id/);

  const route = read("src/app/api/admin/hermes/fee-statements/[id]/link/route.ts");
  assert.match(route, /getUserProfile\(\)/);
  assert.match(route, /profile\.role !== "admin"/);
  assert.ok(
    route.indexOf('profile.role !== "admin"') < route.indexOf("createAdminClient()"),
    "authorization must happen before privileged database access",
  );
  assert.match(route, /feeStatementPublicUrl/);
  assert.match(route, /feeStatementTokenHash/);
  assert.match(route, /Cache-Control.*no-store/);
  assert.doesNotMatch(route, /academy_fee_statement_audit_events|insert\(/);
});

test("pending approvals expose approve and reject controls through an admin-only route", () => {
  const dashboard = read("src/components/admin/hermes-approval-actions.tsx");
  assert.match(dashboard, /Approve/);
  assert.match(dashboard, /Reject/);
  const route = read("src/app/api/admin/hermes/approvals/[id]/route.ts");
  assert.match(route, /getUserProfile\(\)/);
  assert.match(route, /profile\.role !== "admin"/);
  assert.match(route, /decide_hermes_approval_by_channel/);
  assert.match(route, /p_channel: "dashboard"/);
  assert.match(route, /finalize_academy_settlement/);
});

test("settlement mutations remain admin-only and never move money", () => {
  const route = read("src/app/api/admin/hermes/settlements/[id]/route.ts");
  assert.match(route, /getUserProfile\(\)/);
  assert.match(route, /profile\.role !== "admin"/);
  assert.match(route, /record_academy_family_payment/);
  assert.match(route, /record_academy_tutor_payout/);
  assert.doesNotMatch(route, /stripe|transfer|bank|paypal/i);
});

test("tab bar leads with the sections Swati opens most", () => {
  const shared = read("src/components/admin/hermes-dashboard-shared.tsx");
  const order = shared
    .match(/export const HERMES_TABS = \[([\s\S]*?)\] as const;/)[1]
    .match(/"([a-z]+)"/g)
    .map((quoted) => quoted.replaceAll('"', ""));
  assert.deepEqual(order, ["conversations", "ledger", "statements", "contacts", "classes", "scheduling", "attention"]);

  const tabModel = read("src/lib/hermes/admin-tabs.ts");
  const rendered = [...tabModel.matchAll(/\{ id: "([a-z]+)", label:/g)].map((match) => match[1]);
  assert.deepEqual(rendered, order, "rendered tab order must match HERMES_TABS");
});

test("the phone tab bar wraps into a grid instead of scrolling sideways", () => {
  const css = read("src/app/globals.css");
  const mobile = css.slice(css.indexOf("@media (max-width: 768px)"));
  const tabRules = mobile.slice(mobile.indexOf(".kitty-tabs"));
  assert.doesNotMatch(tabRules, /overflow-x:\s*auto/);
  assert.doesNotMatch(tabRules, /flex-wrap:\s*nowrap/);
  assert.match(tabRules, /flex:\s*1 1 calc\(50% - 3px\)/);
});

test("each tutor in the lesson ledger collapses to a summary row", () => {
  const panel = read("src/components/admin/hermes-settlements-panel.tsx");
  assert.match(panel, /unresolvedCount/, "summary must count unresolved students");
  assert.match(panel, /awaiting report/, "a tutor with no report says so on the row");
  assert.match(panel, /delivery failed/, "a failed request is visible while collapsed");
  const collectionBlock = panel.slice(panel.indexOf("cycle.collections.map"));
  assert.match(collectionBlock.slice(0, 800), /<details/, "collections render as <details>");
  assert.doesNotMatch(collectionBlock, /<section/, "no collection is left permanently expanded");
});

test("the conversations list carries a search field above the contacts", () => {
  const list = read("src/components/admin/hermes-conversation-list.tsx");
  assert.match(list, /"use client"/, "search state is local, so the column is a client component");
  assert.match(list, /filterConversationContacts/);
  assert.match(list, /htmlFor="kitty-conversation-search"/, "the field is labelled, not placeholder-only");
  assert.match(list, /id="kitty-conversation-search"/);
  assert.ok(
    list.indexOf("kitty-conversation-search") < list.indexOf("visible.map"),
    "the search field renders above the contact list",
  );
  assert.match(list, /No contact matches that name or number/, "empty results explain themselves");
  assert.match(list, /is still open but not in these results/, "a hidden selection is never a trap");
  assert.match(list, /Clear search/);
});

test("searching narrows the contact list without touching the transcript", () => {
  const panel = read("src/components/admin/hermes-conversations-panel.tsx");
  // The transcript is rendered from the server-loaded `transcript` prop and is
  // never passed through the filter, so searching cannot alter what is open.
  assert.doesNotMatch(panel, /filterConversationContacts/);
  assert.match(panel, /transcript\.map/);
});

test("Conversations and Classes tabs render no badge", () => {
  const tabModel = read("src/lib/hermes/admin-tabs.ts");
  const conversations = tabModel.match(/\{ id: "conversations",[^}]*\}/)[0];
  const classes = tabModel.match(/\{ id: "classes",[^}]*\}/)[0];
  assert.doesNotMatch(conversations, /count/, "a contact total is not an unread count");
  assert.doesNotMatch(classes, /count/, "the tab only ever shows the next five");
});

test("the delivery log names the contact instead of restating the raw row", () => {
  const panel = read("src/components/admin/hermes-attention-panel.tsx");
  const page = read("src/app/(dashboard)/admin/hermes/page.tsx");
  assert.match(panel, /projectDeliveryLog\(messages\)/);
  assert.match(panel, /\{row\.who\}/, "each row reads 'To Priya' / 'From Priya'");
  assert.doesNotMatch(
    panel,
    /message\.direction\} \{message\.message_kind\}/,
    "the raw direction/kind pair is gone",
  );
  // The relation was already joined; it just was not used.
  assert.match(page, /contact:contact_id\(display_name\)/);
});

test("the delivery log query selects no sensitive message columns", () => {
  const page = read("src/app/(dashboard)/admin/hermes/page.tsx");
  const after = page.slice(page.indexOf('.from("hermes_messages")'));
  // Just the select() argument, so the surrounding comment does not count.
  const columns = after.match(/\.select\("([^"]*)"\)/)[1];
  for (const forbidden of ["error_detail", "meta_message_id", "idempotency_key"]) {
    assert.ok(!columns.includes(forbidden), `delivery log must not select ${forbidden}`);
  }
  assert.ok(columns.includes("template_name"), "template name is available to the log");
  assert.match(page, /\.limit\(25\)/, "the conservative 25-row bound is preserved");
});

test("relationship mutations are administrator-only and go through the RPC", () => {
  const route = read("src/app/api/admin/hermes/relationships/route.ts");
  // Same authorization shape as every other Kitty admin mutation.
  const guards = route.match(/profile\.role !== "admin"/g) ?? [];
  assert.equal(guards.length, 2, "both GET and POST are guarded");
  assert.match(route, /status: 403/);
  assert.match(route, /admin_upsert_hermes_guardian_relationship/, "rules and audit stay in one database transaction");
  assert.match(route, /p_source_channel: RELATIONSHIP_SOURCE_CHANNEL/);
  // Never a raw table write, and never a delete.
  assert.doesNotMatch(route, /\.from\("hermes_contact_relationships"\)\s*\.(insert|update|upsert|delete)/);
  assert.doesNotMatch(route, /\.delete\(\)/, "links are deactivated, never deleted");
});

test("relationship changes are audited against the signed-in administrator", () => {
  const route = read("src/app/api/admin/hermes/relationships/route.ts");
  assert.match(route, /admin_upsert_hermes_guardian_relationship/);
  assert.match(route, /p_actor_profile_id: profile\.id/);
});

test("the service-role client is only ever created on the server route", () => {
  const links = read("src/components/admin/hermes-contact-links.tsx");
  assert.match(links, /"use client"/);
  assert.doesNotMatch(links, /createAdminClient|SERVICE_ROLE/, "no service-role credential in the browser");
  assert.match(links, /fetch\("\/api\/admin\/hermes\/relationships"/);
});

test("the directory offers links on parent and student cards with empty states", () => {
  const panel = read("src/components/admin/hermes-contacts-panel.tsx");
  const links = read("src/components/admin/hermes-contact-links.tsx");
  assert.match(panel, /contact\.role === "parent" \|\| contact\.role === "student"/);
  assert.match(links, /No children linked yet/);
  assert.match(links, /No guardian linked yet/);
  assert.match(links, /Remove the link to \$\{person\.displayName\}/, "the remove control is labelled");
  assert.doesNotMatch(links, /window\.confirm/, "deactivation is reversible, so it needs no prompt");
});

test("scheduling shows the derived next action rather than a raw status", () => {
  const panel = read("src/components/admin/hermes-scheduling-panel.tsx");
  const page = read("src/app/(dashboard)/admin/hermes/page.tsx");
  assert.match(panel, /\{item\.nextAction\}/);
  assert.match(panel, /item\.participants\.map/, "participants and their states are shown");
  // JSON.stringify appears only in the close-case request body, never in the
  // rendered output: no <pre> dump of availability or proposed times.
  assert.doesNotMatch(panel, /<pre/, "no raw payload is the primary UI");
  assert.doesNotMatch(panel, /\{JSON\.stringify/, "nothing is rendered as raw JSON");
  // The page must actually load participants, which it never used to.
  assert.match(page, /\.from\("hermes_case_participants"\)/);
  assert.match(page, /projectActiveSchedulingCases/);
});

test("an obsolete case can be closed without deleting it", () => {
  const route = read("src/app/api/admin/hermes/cases/[id]/route.ts");
  assert.match(route, /profile\.role !== "admin"/);
  assert.match(route, /admin_close_hermes_scheduling_case/, "one RPC closes and audits atomically");
  assert.doesNotMatch(route, /\.delete\(\)/, "the case row is kept");
  assert.match(route, /admin_close_hermes_scheduling_case/, "the transition is validated in the database transaction");
  assert.match(route, /p_actor_profile_id: profile\.id/, "the closing admin is audited");
  assert.match(route, /status: stale \? 409 : 500/, "a stale close is refused");
});

test("no new case status was invented for closing", () => {
  const cases = read("src/lib/hermes/cases.ts");
  const statuses = cases.match(/export type HermesCaseStatus = ([^;]+);/)[1];
  assert.equal(statuses.includes("dismissed"), false);
  assert.equal(statuses.includes("closed"), false);
  assert.match(statuses, /"cancelled"/);
});

test("phantom-case reconciliation has a previewable admin runner with database revalidation", () => {
  const route = read("src/app/api/admin/hermes/cases/reconcile/route.ts");
  assert.match(route, /profile\.role !== "admin"/);
  assert.match(route, /planCaseReconciliation/);
  assert.match(route, /body\.apply !== true/);
  assert.match(route, /admin_reconcile_hermes_phantom_case/);
});

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
  RECONCILIATION_REASON_LIMIT,
  assessCaseForReconciliation,
  planCaseReconciliation,
} = require(path.join(__dirname, "case-reconciliation.ts"));

const ID = "case-1";

const phantom = (overrides = {}) => ({
  case: {
    id: ID,
    status: "collecting_availability",
    proposed_times: [],
    resolution: null,
    human_takeover: false,
    ...(overrides.case ?? {}),
  },
  participants: overrides.participants ?? [{ case_id: ID, response_status: "pending", availability: [] }],
  auditEvents: overrides.auditEvents ?? [{ entity_id: ID, event_type: "case_created" }],
  messages: overrides.messages ?? [{ case_id: ID, intent: "class_reminder" }],
  approvals: overrides.approvals ?? [],
});

// --- the case this exists for --------------------------------------------

test("a reminder-only case with nothing else on it is reconcilable", () => {
  const verdict = assessCaseForReconciliation(phantom());
  assert.equal(verdict.reconcilable, true);
  assert.match(verdict.reason, /reminder/i);
});

test("a case with no messages at all and only pending participants is reconcilable", () => {
  const verdict = assessCaseForReconciliation(phantom({ messages: [] }));
  assert.equal(verdict.reconcilable, true);
});

test("a human_attention wrapper is reconcilable", () => {
  const verdict = assessCaseForReconciliation(phantom({ messages: [{ case_id: ID, intent: "human_attention" }] }));
  assert.equal(verdict.reconcilable, true);
});

test("the stored reason is bounded", () => {
  const verdict = assessCaseForReconciliation(phantom());
  assert.ok(verdict.reason.length <= RECONCILIATION_REASON_LIMIT);
});

// --- every refusal --------------------------------------------------------

test("a case in any other status is left alone", () => {
  for (const status of ["draft", "proposing", "awaiting_approval", "confirmed", "cancelled", "needs_attention"]) {
    const verdict = assessCaseForReconciliation(phantom({ case: { status } }));
    assert.equal(verdict.reconcilable, false, `${status} must not be reconciled`);
  }
});

test("an already-cancelled case is not reconciled again, so a rerun is idempotent", () => {
  const verdict = assessCaseForReconciliation(phantom({ case: { status: "cancelled" } }));
  assert.equal(verdict.reconcilable, false);
});

test("a case under human takeover is left alone", () => {
  const verdict = assessCaseForReconciliation(phantom({ case: { human_takeover: true } }));
  assert.equal(verdict.blockedBy, "human_takeover");
});

test("a case with proposed times is left alone", () => {
  const verdict = assessCaseForReconciliation(phantom({ case: { proposed_times: [{ start: "x" }] } }));
  assert.equal(verdict.blockedBy, "has_proposed_times");
});

test("a case with a resolution is left alone", () => {
  const verdict = assessCaseForReconciliation(phantom({ case: { resolution: { outcome: "confirmed" } } }));
  assert.equal(verdict.blockedBy, "has_resolution");
});

test("a participant with availability blocks reconciliation", () => {
  const verdict = assessCaseForReconciliation(
    phantom({ participants: [{ case_id: ID, response_status: "pending", availability: [{ start: "x" }] }] }),
  );
  assert.equal(verdict.blockedBy, "participant_has_availability");
});

test("a contacted, responded, declined or failed participant blocks reconciliation", () => {
  for (const status of ["contacted", "responded", "declined", "failed"]) {
    const verdict = assessCaseForReconciliation(
      phantom({ participants: [{ case_id: ID, response_status: status, availability: [] }] }),
    );
    assert.equal(verdict.reconcilable, false, `${status} must block`);
  }
});

test("any approval blocks reconciliation", () => {
  const verdict = assessCaseForReconciliation(
    phantom({ approvals: [{ case_id: ID, status: "rejected" }] }),
  );
  assert.equal(verdict.blockedBy, "has_approval");
});

test("audit history showing real scheduling progress blocks reconciliation", () => {
  for (const event of ["availability_recorded", "times_proposed", "approval_requested", "human_escalation"]) {
    const verdict = assessCaseForReconciliation(
      phantom({ auditEvents: [{ entity_id: ID, event_type: "case_created" }, { entity_id: ID, event_type: event }] }),
    );
    assert.equal(verdict.reconcilable, false, `${event} must block`);
  }
});

test("a coordination message blocks reconciliation", () => {
  const verdict = assessCaseForReconciliation(
    phantom({ messages: [{ case_id: ID, intent: "availability_request" }] }),
  );
  assert.equal(verdict.blockedBy, "has_coordination_message");
});

test("an unknown message intent is not assumed to be transport", () => {
  const verdict = assessCaseForReconciliation(phantom({ messages: [{ case_id: ID, intent: null }] }));
  assert.equal(verdict.reconcilable, false, "ambiguous cases are left for manual review");
});

test("a mix of reminder and coordination messages blocks reconciliation", () => {
  const verdict = assessCaseForReconciliation(
    phantom({
      messages: [
        { case_id: ID, intent: "class_reminder" },
        { case_id: ID, intent: "time_proposal" },
      ],
    }),
  );
  assert.equal(verdict.reconcilable, false);
});

// --- scoping --------------------------------------------------------------

test("another case's participants, messages, approvals and events are ignored", () => {
  const verdict = assessCaseForReconciliation({
    ...phantom(),
    participants: [
      { case_id: ID, response_status: "pending", availability: [] },
      { case_id: "other", response_status: "responded", availability: [{ start: "x" }] },
    ],
    messages: [
      { case_id: ID, intent: "class_reminder" },
      { case_id: "other", intent: "time_proposal" },
    ],
    approvals: [{ case_id: "other", status: "pending" }],
    auditEvents: [
      { entity_id: ID, event_type: "case_created" },
      { entity_id: "other", event_type: "times_proposed" },
    ],
  });
  assert.equal(verdict.reconcilable, true);
});

// --- planning -------------------------------------------------------------

test("the plan separates what would close from what is left alone, with reasons", () => {
  const base = phantom();
  const plan = planCaseReconciliation({
    cases: [base.case, { id: "keep", status: "proposing", proposed_times: [], resolution: null }],
    participants: base.participants,
    auditEvents: base.auditEvents,
    messages: base.messages,
    approvals: [],
  });
  assert.deepEqual(plan.close.map((row) => row.id), [ID]);
  assert.deepEqual(plan.skip.map((row) => row.id), ["keep"]);
  assert.ok(plan.skip[0].blockedBy, "a skipped case says why it was skipped");
});

test("planning nothing produces an empty plan rather than throwing", () => {
  const plan = planCaseReconciliation({
    cases: [],
    participants: [],
    auditEvents: [],
    messages: [],
    approvals: [],
  });
  assert.deepEqual(plan, { close: [], skip: [] });
});

test("planning is pure, so it can be reviewed before anything is written", () => {
  const base = phantom();
  const input = {
    cases: [base.case],
    participants: base.participants,
    auditEvents: base.auditEvents,
    messages: base.messages,
    approvals: [],
  };
  const first = planCaseReconciliation(input);
  const second = planCaseReconciliation(input);
  assert.deepEqual(first, second);
  assert.equal(input.cases[0].status, "collecting_availability", "planning mutates nothing");
});

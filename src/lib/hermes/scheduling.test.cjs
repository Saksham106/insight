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
  RESOLVED_CASE_STATUSES,
  joinNames,
  projectSchedulingCase,
  projectActiveSchedulingCases,
} = require(path.join(__dirname, "scheduling.ts"));

const CASE_ID = "case-1";

function kase(overrides = {}) {
  return {
    id: CASE_ID,
    title: "Reschedule Tuesday chemistry",
    status: overrides.status ?? "collecting_availability",
    human_takeover: overrides.human_takeover ?? false,
    proposed_times: overrides.proposed_times ?? [],
    resolution: overrides.resolution ?? null,
    updated_at: overrides.updated_at ?? "2026-08-07T09:00:00.000Z",
  };
}

function participant(name, responseStatus, overrides = {}) {
  return {
    id: `p-${name}`,
    case_id: overrides.case_id ?? CASE_ID,
    contact_id: `c-${name}`,
    participant_role: overrides.participant_role ?? "parent",
    response_status: responseStatus,
    availability: overrides.availability ?? [],
    contact: { display_name: name },
  };
}

const next = (caseOverrides, participants, awaitingApproval = false) =>
  projectSchedulingCase({ case: kase(caseOverrides), participants, awaitingApproval }).nextAction;

// --- name joining ---------------------------------------------------------

test("names are joined the way a person would say them", () => {
  assert.equal(joinNames(["Priya"]), "Priya");
  assert.equal(joinNames(["Priya", "Ravi"]), "Priya and Ravi");
  assert.equal(joinNames(["Priya", "Ravi", "Meera"]), "Priya, Ravi and Meera");
});

// --- next action ----------------------------------------------------------

test("a pending participant is who the case waits on", () => {
  assert.equal(next({}, [participant("Priya", "pending")]), "Waiting on Priya");
});

test("a contacted participant is still someone the case waits on", () => {
  assert.equal(next({}, [participant("Priya", "contacted")]), "Waiting on Priya");
});

test("several outstanding participants are all named", () => {
  const action = next({}, [participant("Priya", "pending"), participant("Teacher A", "contacted")]);
  assert.equal(action, "Waiting on Priya and Teacher A");
});

test("a partially responded case still waits on the outstanding person", () => {
  const action = next({}, [
    participant("Priya", "responded", { availability: [{ start: "x" }] }),
    participant("Ravi", "pending"),
  ]);
  assert.equal(action, "Waiting on Ravi");
});

test("all responded with availability is ready for Kitty to propose", () => {
  const action = next({}, [
    participant("Priya", "responded", { availability: [{ start: "x" }] }),
    participant("Ravi", "responded", { availability: [{ start: "y" }] }),
  ]);
  assert.equal(action, "Ready for Kitty to propose times");
});

test("collecting availability flips to ready the moment the last person replies", () => {
  const waiting = next({}, [
    participant("Priya", "responded", { availability: [{ start: "x" }] }),
    participant("Ravi", "contacted"),
  ]);
  const ready = next({}, [
    participant("Priya", "responded", { availability: [{ start: "x" }] }),
    participant("Ravi", "responded", { availability: [{ start: "y" }] }),
  ]);
  assert.equal(waiting, "Waiting on Ravi");
  assert.equal(ready, "Ready for Kitty to propose times");
});

test("a declined response is represented accurately, not as still waiting", () => {
  const action = next({}, [participant("Priya", "declined")]);
  assert.match(action, /declined/i);
  assert.equal(action.includes("Waiting on Priya"), false);
});

test("an unreachable participant is called out", () => {
  assert.match(next({}, [participant("Priya", "failed")]), /Could not reach Priya/);
});

test("a proposing case waits on Kitty to send the proposal", () => {
  assert.equal(next({ status: "proposing" }, []), "Waiting on Kitty to send the proposal");
});

test("an awaiting_approval case waits on Swati", () => {
  assert.equal(next({ status: "awaiting_approval" }, []), "Waiting on Swati's approval");
});

test("an outstanding approval waits on Swati whatever the case status says", () => {
  const action = next({ status: "collecting_availability" }, [participant("Priya", "pending")], true);
  assert.equal(action, "Waiting on Swati's approval");
});

test("human takeover outranks everything else", () => {
  const action = next({ human_takeover: true, status: "collecting_availability" }, [
    participant("Priya", "pending"),
  ]);
  assert.equal(action, "Swati needs to take over");
});

test("a needs_attention case asks for Swati", () => {
  assert.equal(next({ status: "needs_attention" }, []), "Swati needs to take over");
});

test("a confirmed case reads as confirmed", () => {
  assert.equal(next({ status: "confirmed" }, []), "Confirmed");
});

test("a cancelled case reads as closed", () => {
  assert.equal(next({ status: "cancelled" }, []), "Closed");
});

test("a case with no participants asks Swati to look", () => {
  // This is the shape of the reminder-wrapper cases in production.
  assert.match(next({}, []), /no participants/i);
});

test("everyone replying with no availability is not treated as ready", () => {
  const action = next({}, [participant("Priya", "responded", { availability: [] })]);
  assert.equal(action.includes("Ready for Kitty"), false);
  assert.match(action, /Swati needs to decide/);
});

// --- projection shape -----------------------------------------------------

test("availability is counted, never surfaced as a raw payload", () => {
  const view = projectSchedulingCase({
    case: kase(),
    participants: [
      participant("Priya", "responded", {
        availability: [{ start: "2026-08-10T09:00:00Z" }, { start: "2026-08-11T09:00:00Z" }],
      }),
    ],
  });
  assert.equal(view.participants[0].windowCount, 2);
  assert.equal(view.participants[0].hasAvailability, true);
  assert.equal(JSON.stringify(view).includes("2026-08-10T09:00:00Z"), false, "no raw payload");
});

test("only this case's participants are projected onto it", () => {
  const view = projectSchedulingCase({
    case: kase(),
    participants: [participant("Priya", "pending"), participant("Other", "pending", { case_id: "case-2" })],
  });
  assert.deepEqual(view.participants.map((p) => p.name), ["Priya"]);
});

test("a removed participant contact degrades safely", () => {
  const view = projectSchedulingCase({
    case: kase(),
    participants: [{ ...participant("x", "pending"), contact: null }],
  });
  assert.equal(view.participants[0].name, "a removed contact");
});

test("proposed times are counted", () => {
  const view = projectSchedulingCase({
    case: kase({ proposed_times: [{ start: "a" }, { start: "b" }] }),
    participants: [],
  });
  assert.equal(view.proposedTimeCount, 2);
});

// --- active list ----------------------------------------------------------

test("confirmed and cancelled cases never appear in Active Scheduling", () => {
  assert.deepEqual([...RESOLVED_CASE_STATUSES].sort(), ["cancelled", "confirmed"]);
  const views = projectActiveSchedulingCases({
    cases: [
      kase({ status: "collecting_availability" }),
      { ...kase({ status: "confirmed" }), id: "case-2" },
      { ...kase({ status: "cancelled" }), id: "case-3" },
    ],
    participants: [],
  });
  assert.deepEqual(views.map((view) => view.id), [CASE_ID]);
});

test("a case with a pending approval is marked as awaiting approval", () => {
  const views = projectActiveSchedulingCases({
    cases: [kase()],
    participants: [],
    approvalCaseIds: [CASE_ID],
  });
  assert.equal(views[0].awaitingApproval, true);
  assert.equal(views[0].nextAction, "Waiting on Swati's approval");
});

test("an empty case list projects to nothing", () => {
  assert.deepEqual(projectActiveSchedulingCases({ cases: [], participants: [] }), []);
});

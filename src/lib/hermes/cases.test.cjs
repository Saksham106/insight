/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } });
  module._compile(output.outputText, filename);
};

const { academyInformation, canTransitionCase, communicationDecision, parseIMessageAdminActor, parseWhatsAppToolActor, projectCaseParticipantsForActor, projectContact, sanitizeAvailability, toolActorScope } = require(path.join(__dirname, "cases.ts"));
const { signServiceRequest, verifyServiceRequest } = require(path.join(__dirname, "auth.ts"));

test("tool authentication rejects invalid and expired signatures", () => {
  const body = JSON.stringify({ action: "get_contact", payload: { contactId: "contact-1" } });
  const timestamp = "1784217600000";
  const requestId = "request_12345678";
  const request = new Request("https://example.test/api/hermes/tools", { method: "POST", headers: { "x-hermes-timestamp": timestamp, "x-hermes-request-id": requestId, "x-hermes-signature": signServiceRequest(body, timestamp, requestId, "secret") }, body });
  assert.deepEqual(verifyServiceRequest(request, body, "secret", 1784217600000), { requestId, timestampMs: 1784217600000 });
  assert.equal(verifyServiceRequest(request, body, "wrong", 1784217600000), null);
  assert.equal(verifyServiceRequest(request, body, "secret", 1784218000001), null);
});

test("case transitions are explicit and confirmation cannot bypass approval", () => {
  assert.equal(canTransitionCase("collecting_availability", "proposing"), true);
  assert.equal(canTransitionCase("proposing", "awaiting_approval"), true);
  assert.equal(canTransitionCase("awaiting_approval", "confirmed"), true);
  assert.equal(canTransitionCase("collecting_availability", "confirmed"), false);
  assert.equal(canTransitionCase("confirmed", "proposing"), false);
});

test("communication policy and opt-out precedence fail closed", () => {
  assert.deepEqual(communicationDecision({ consentStatus: "withdrawn", communicationPolicy: "direct", isActive: true }), { allowed: false, reason: "opted_out" });
  assert.deepEqual(communicationDecision({ consentStatus: "attested", communicationPolicy: "guardian_only", isActive: true }), { allowed: false, reason: "guardian_only" });
  assert.deepEqual(communicationDecision({ consentStatus: "attested", communicationPolicy: "approval_required", isActive: true }), { allowed: false, reason: "approval_required" });
  assert.deepEqual(communicationDecision({ consentStatus: "attested", communicationPolicy: "direct", isActive: true }), { allowed: true });
});

test("contact projection exposes only role-aware operational fields", () => {
  const raw = { id: "contact-1", display_name: "Asha", whatsapp_e164: "+84901112233", role: "student", timezone: "Asia/Ho_Chi_Minh", communication_policy: "direct", consent_status: "attested", profile_id: "private-profile", last_inbound_at: "today" };
  assert.deepEqual(projectContact(raw), { id: "contact-1", displayName: "Asha", role: "student", timezone: "Asia/Ho_Chi_Minh", communicationPolicy: "direct", canMessage: true });
  assert.equal(JSON.stringify(projectContact(raw)).includes("profile"), false);
  assert.equal(JSON.stringify(projectContact(raw)).includes("whatsapp"), false);
});

test("availability is bounded structured data and never stores a transcript", () => {
  assert.deepEqual(sanitizeAvailability([{ start: "2026-07-20T09:00:00Z", end: "2026-07-20T10:00:00Z", timezone: "Asia/Ho_Chi_Minh", transcript: "private chat", extra: "drop" }]), [{ start: "2026-07-20T09:00:00.000Z", end: "2026-07-20T10:00:00.000Z", timezone: "Asia/Ho_Chi_Minh" }]);
  assert.throws(() => sanitizeAvailability([{ start: "bad", end: "also bad" }]), /invalid_availability/);
  assert.throws(() => sanitizeAvailability(Array.from({ length: 51 }, () => ({ start: "2026-07-20T09:00:00Z", end: "2026-07-20T10:00:00Z" }))), /invalid_availability/);
});

test("derives the actor only from a direct WhatsApp Cloud session", () => {
  assert.deepEqual(parseWhatsAppToolActor({ platform: "whatsapp_cloud", chatId: "84917583553", userId: "84917583553" }), { e164: "+84917583553" });
  assert.equal(parseWhatsAppToolActor({ platform: "whatsapp_cloud", chatId: "84917583553", userId: "84900000000" }), null);
  assert.equal(parseWhatsAppToolActor({ platform: "whatsapp_cloud", chatId: "84917583553" }), null);
  assert.equal(parseWhatsAppToolActor({ platform: "telegram", chatId: "84917583553", userId: "84917583553" }), null);
  assert.equal(parseWhatsAppToolActor({ platform: "whatsapp_cloud", chatId: "+84 hello" }), null);
});

test("derives the iMessage administrator only from a verified direct session", () => {
  const crypto = require("node:crypto");
  const stableId = "photon:swati:verified";
  const digest = crypto.createHash("sha256").update(stableId).digest("hex");
  assert.deepEqual(
    parseIMessageAdminActor(
      { platform: "imessage", chatId: stableId, userId: stableId },
      digest,
    ),
    { stableId },
  );
  assert.equal(parseIMessageAdminActor({ platform: "imessage", chatId: stableId, userId: "other" }, digest), null);
  assert.equal(parseIMessageAdminActor({ platform: "whatsapp_cloud", chatId: stableId, userId: stableId }, digest), null);
  assert.equal(parseIMessageAdminActor({ platform: "imessage", chatId: stableId, userId: stableId }, "0".repeat(64)), null);
  assert.equal(parseIMessageAdminActor({ platform: "imessage", chatId: "", userId: "" }, digest), null);
});

test("case contacts receive only their own participant record", () => {
  const participants = [
    { contact_id: "student-1", participant_role: "student", availability: [{ start: "2026-07-20T09:00:00Z", end: "2026-07-20T10:00:00Z" }], response_status: "responded", contact: { id: "student-1", display_name: "Asha", role: "student", timezone: "Asia/Ho_Chi_Minh", communication_policy: "direct", consent_status: "attested" } },
    { contact_id: "teacher-1", participant_role: "teacher", availability: [{ start: "2026-07-20T13:00:00Z", end: "2026-07-20T14:00:00Z" }], response_status: "responded", contact: { id: "teacher-1", display_name: "Private Teacher", role: "teacher", timezone: "Asia/Kolkata", communication_policy: "direct", consent_status: "attested" } },
  ];
  const projected = projectCaseParticipantsForActor(participants, "contact", "student-1");
  assert.equal(projected.length, 1);
  assert.equal(projected[0].contact.id, "student-1");
  assert.equal(JSON.stringify(projected).includes("Private Teacher"), false);
  assert.equal(JSON.stringify(projected).includes("13:00:00Z"), false);
  assert.equal(projectCaseParticipantsForActor(participants, "admin", null).length, 2);
});

test("gives Swati broad scheduling scope and contacts only self or case-member scope", () => {
  assert.equal(toolActorScope("search_contacts", "admin"), "admin");
  assert.equal(toolActorScope("confirm_class", "admin"), "admin");
  assert.equal(toolActorScope("get_contact", "contact"), "self");
  assert.equal(toolActorScope("record_availability", "contact"), "self_case_member");
  assert.equal(toolActorScope("list_my_cases", "contact"), "self");
  assert.equal(toolActorScope("get_case", "contact"), "case_member");
  assert.equal(toolActorScope("request_reschedule", "contact"), "case_member");
  assert.equal(toolActorScope("send_message", "contact"), "denied");
  assert.equal(toolActorScope("request_swati_freebusy", "admin"), "admin");
  assert.equal(toolActorScope("request_swati_freebusy", "contact"), "denied");
  assert.equal(toolActorScope("get_workspace_job", "contact"), "denied");
  assert.equal(toolActorScope("search_contacts", "unknown"), "denied");
  assert.equal(toolActorScope("get_academy_info", "contact"), "self");
});

test("Academy information is a small verified public knowledge surface", () => {
  const about = academyInformation("about");
  assert.match(about.answer, /tutoring/i);
  assert.match(about.answer, /Vietnam/i);
  assert.equal(about.sources.includes("https://myinsightacademy.com"), true);
  const subjects = academyInformation("subjects");
  assert.match(subjects.answer, /confirm/i);
  assert.equal(JSON.stringify(subjects).includes("phone"), false);
});

test("tool route requires signed replay-protected requests and audits actions", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/app/api/hermes/tools/route.ts"), "utf8");
  assert.match(source, /verifyServiceRequest/);
  assert.match(source, /hermes_audit_events/);
  assert.match(source, /request_id/);
  for (const action of ["get_academy_info", "search_contacts", "get_contact", "create_case", "get_case", "list_my_cases", "record_availability", "request_reschedule", "propose_times", "request_approval", "confirm_class", "send_message", "escalate_to_swati"]) assert.match(source, new RegExp(action));
  assert.match(source, /parseWhatsAppToolActor/);
  assert.match(source, /HERMES_ADMIN_WHATSAPP_E164/);
});

test("iMessage admin route is separately signed and disabled by default", () => {
  const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/hermes/tools/route.ts"), "utf8");
  const adminRoute = fs.readFileSync(path.join(process.cwd(), "src/app/api/hermes/admin-tools/route.ts"), "utf8");
  const env = fs.readFileSync(path.join(process.cwd(), ".env.example"), "utf8");
  assert.match(adminRoute, /handleHermesToolPost/);
  assert.match(adminRoute, /"imessage_admin"/);
  assert.match(route, /HERMES_ADMIN_TOOL_SHARED_SECRET/);
  assert.match(route, /HERMES_ADMIN_IMESSAGE_ID_SHA256/);
  assert.match(route, /HERMES_IMESSAGE_INTAKE_ENABLED/);
  assert.match(route, /parseIMessageAdminActor/);
  assert.match(env, /HERMES_IMESSAGE_INTAKE_ENABLED=false/);
});

test("tool route exposes admin-only minimized Calendar freebusy jobs", () => {
  const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/hermes/tools/route.ts"), "utf8");
  const env = fs.readFileSync(path.join(process.cwd(), ".env.example"), "utf8");
  assert.match(route, /request_swati_freebusy/);
  assert.match(route, /get_workspace_job/);
  assert.match(route, /parseFreeBusyPayload/);
  assert.match(route, /parseFreeBusyResult/);
  assert.match(route, /workspaceJobIdempotencyKey/);
  assert.match(route, /HERMES_WORKSPACE_JOBS_ENABLED/);
  assert.match(route, /id, case_id, job_type, status, result, error_code, created_at, updated_at/);
  assert.doesNotMatch(route, /get_workspace_job[\s\S]{0,1600}select\("\*"\)/);
  assert.match(env, /HERMES_WORKSPACE_JOBS_ENABLED=false/);
  assert.match(env, /HERMES_WORKSPACE_WORKER_SECRET=/);
});

test("Hermes skill identifies automation, honors STOP, forbids transcript sharing, and escalates", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "infra/hermes-skills/insight-scheduling/SKILL.md"), "utf8");
  assert.match(source, /automated assistant/i);
  assert.match(source, /STOP/);
  assert.match(source, /never.*transcript/i);
  assert.match(source, /escalate_to_swati/);
  assert.match(source, /approval/i);
});

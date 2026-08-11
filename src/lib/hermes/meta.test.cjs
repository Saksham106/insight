/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = function compileTypeScript(module, filename) {
  let source = fs.readFileSync(filename, "utf8");
  source = source.replace(/from\s+["']\.\/([^"']+)["']/g, (match, target) => match.replace(`./${target}`, `./${target}.ts`));
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } });
  module._compile(output.outputText, filename);
};

const { buildGraphMessageRequest, buildHumanAttentionFallbackContent, buildLessonReportRequestContent, buildSchedulingMessageContent, classifyMetaFailure, selectWhatsAppDelivery, templateMapFromEnv, validateSchedulingBodyParameters } = require(path.join(__dirname, "meta.ts"));

const templates = {
  availability_request: { name: "class_availability_request", locale: "en_US" },
  time_proposal: { name: "class_time_proposal", locale: "en_US" },
};

function contact(extra = {}) {
  return {
    whatsappE164: "+84917583553",
    communicationPolicy: "direct",
    consentStatus: "attested",
    serviceWindowExpiresAt: "2026-07-16T18:00:00.000Z",
    ...extra,
  };
}

test("uses free-form delivery only inside that recipient's open service window", () => {
  assert.deepEqual(selectWhatsAppDelivery(contact(), "availability_request", new Date("2026-07-16T17:00:00Z"), templates), { kind: "free_form" });
  assert.deepEqual(selectWhatsAppDelivery(contact(), "availability_request", new Date("2026-07-16T19:00:00Z"), templates), { kind: "template", name: "class_availability_request", locale: "en_US" });
});

test("fails closed for communication policy and consent restrictions", () => {
  assert.deepEqual(selectWhatsAppDelivery(contact({ communicationPolicy: "paused" }), "availability_request", new Date(), templates), { kind: "blocked", reason: "paused" });
  assert.deepEqual(selectWhatsAppDelivery(contact({ communicationPolicy: "guardian_only" }), "availability_request", new Date(), templates), { kind: "blocked", reason: "guardian_only" });
  assert.deepEqual(selectWhatsAppDelivery(contact({ communicationPolicy: "approval_required" }), "availability_request", new Date(), templates), { kind: "blocked", reason: "approval_required" });
  assert.deepEqual(selectWhatsAppDelivery(contact({ consentStatus: "withdrawn" }), "availability_request", new Date(), templates), { kind: "blocked", reason: "opted_out" });
});

test("fails closed when a required approved template is missing", () => {
  assert.deepEqual(selectWhatsAppDelivery(contact({ serviceWindowExpiresAt: null }), "class_confirmation", new Date(), templates), { kind: "blocked", reason: "template_unavailable" });
});

test("maps the fixed permission request template from the environment", () => {
  assert.deepEqual(templateMapFromEnv({ WHATSAPP_TEMPLATE_PERMISSION_REQUEST: "academy_whatsapp_permission" }).permission_request, {
    name: "academy_whatsapp_permission",
    locale: "en_US",
  });
});

test("maps every settlement template and fails closed without one", () => {
  const mapped = templateMapFromEnv({
    WHATSAPP_TEMPLATE_TUTOR_REPORT_REQUEST: "academy_tutor_report",
    WHATSAPP_TEMPLATE_FAMILY_INVOICE: "academy_invoice_ready",
    WHATSAPP_TEMPLATE_PAYMENT_REMINDER: "academy_payment_reminder",
    WHATSAPP_TEMPLATE_PAYMENT_RECEIVED: "academy_payment_received",
  });
  assert.equal(mapped.tutor_report_request.name, "academy_tutor_report");
  assert.equal(mapped.family_invoice.name, "academy_invoice_ready");
  assert.equal(mapped.payment_reminder.name, "academy_payment_reminder");
  assert.equal(mapped.payment_received.name, "academy_payment_received");
  assert.deepEqual(selectWhatsAppDelivery(contact({ serviceWindowExpiresAt: null }), "family_invoice", new Date(), {}), { kind: "blocked", reason: "template_unavailable" });
});

test("maps an existing approved template for lesson reports and fails closed without it", () => {
  const mapped = templateMapFromEnv({ WHATSAPP_TEMPLATE_LESSON_REPORT_REQUEST: "class_human_attention" });
  assert.deepEqual(mapped.lesson_report_request, { name: "class_human_attention", locale: "en_US" });
  assert.deepEqual(selectWhatsAppDelivery(contact({ serviceWindowExpiresAt: null }), "lesson_report_request", new Date(), {}), { kind: "blocked", reason: "template_unavailable" });
});

test("puts the concise lesson request in the existing human-attention template variable", () => {
  assert.deepEqual(buildLessonReportRequestContent("2026-07-01", "Teacher A"), {
    body: "Hello Teacher A, Swati from MyInsightAcademy needs your input about details of all classes you taught in July 2026 so invoices can be prepared for the respective students or parents. Please reply here when convenient.",
    bodyParameters: [
      "Teacher A",
      "details of all classes you taught in July 2026 so invoices can be prepared for the respective students or parents",
    ],
  });
});

test("builds exact semantic parameters for approved scheduling templates", () => {
  assert.deepEqual(buildSchedulingMessageContent({ intent: "permission_request", recipientName: "Little", templateData: {} }).bodyParameters, []);
  assert.deepEqual(buildSchedulingMessageContent({ intent: "availability_request", recipientName: "Little", templateData: { classDescription: "mathematics class" } }).bodyParameters, ["Little", "mathematics class"]);
  assert.deepEqual(buildSchedulingMessageContent({ intent: "time_proposal", recipientName: "Little", templateData: { proposedDateTime: "Monday at 4 PM Eastern Time", classDescription: "mathematics class" } }).bodyParameters, ["Little", "Monday at 4 PM Eastern Time", "mathematics class"]);
  assert.deepEqual(buildSchedulingMessageContent({ intent: "class_confirmation", recipientName: "Little", templateData: { classDescription: "mathematics class", confirmedDateTime: "Monday at 4 PM Eastern Time" } }).bodyParameters, ["Little", "mathematics class", "Monday at 4 PM Eastern Time"]);
  assert.deepEqual(buildSchedulingMessageContent({ intent: "reschedule_request", recipientName: "Little", templateData: { classDescription: "mathematics class on Monday at 3 PM Eastern Time" } }).bodyParameters, ["Little", "mathematics class on Monday at 3 PM Eastern Time"]);
  assert.deepEqual(buildSchedulingMessageContent({ intent: "class_reminder", recipientName: "Little", templateData: { classDescription: "mathematics class", scheduledDateTime: "Monday at 3 PM Eastern Time" } }).bodyParameters, ["Little", "mathematics class", "Monday at 3 PM Eastern Time"]);
  assert.deepEqual(buildSchedulingMessageContent({ intent: "human_attention", recipientName: "Little", templateData: { matter: "your mathematics schedule" } }).bodyParameters, ["Little", "your mathematics schedule"]);
  assert.deepEqual(buildSchedulingMessageContent({ intent: "admin_reschedule_alert", recipientName: "Swati", templateData: { requesterName: "Little", caseSummary: "mathematics class: requested Monday at 4 PM" } }).bodyParameters, ["Swati", "Little", "mathematics class: requested Monday at 4 PM"]);
  assert.deepEqual(buildSchedulingMessageContent({ intent: "class_cancelled", recipientName: "Little", templateData: { classDescription: "mathematics", originalDateTime: "Tuesday at 4 PM", referenceCode: "AB12CD" } }).bodyParameters, ["Little", "mathematics", "Tuesday at 4 PM", "AB12CD"]);
  assert.deepEqual(buildSchedulingMessageContent({ intent: "class_rescheduled", recipientName: "Little", templateData: { classDescription: "mathematics", originalDateTime: "Tuesday at 4 PM", replacementDateTime: "Wednesday at 5 PM", referenceCode: "AB12CD" } }).bodyParameters, ["Little", "mathematics", "Tuesday at 4 PM", "Wednesday at 5 PM", "AB12CD"]);
});

test("semantic scheduling builders reject missing, blank, and unknown fields", () => {
  assert.throws(() => buildSchedulingMessageContent({ intent: "class_reminder", recipientName: "Little", templateData: { classDescription: "Math" } }), /invalid_scheduledDateTime/);
  assert.throws(() => buildSchedulingMessageContent({ intent: "class_reminder", recipientName: "Devon", templateData: { classDescription: "IB Chemistry with Anjali. If anything changes, please tell me", scheduledDateTime: "tomorrow at 7:30 PM Vietnam time" } }), /invalid_class_description/);
  assert.throws(() => buildSchedulingMessageContent({ intent: "admin_reschedule_alert", recipientName: "Swati", templateData: { requesterName: "Little", caseSummary: "" } }), /invalid_caseSummary/);
  assert.throws(() => buildSchedulingMessageContent({ intent: "family_invoice", recipientName: "Parent", templateData: {} }), /unsupported_scheduling_intent/);
});

test("legacy scheduling arrays are count-checked and recipient-bound", () => {
  assert.deepEqual(validateSchedulingBodyParameters("class_reminder", "Little", ["Wrong", "mathematics class", "Monday at 3 PM"]), ["Little", "mathematics class", "Monday at 3 PM"]);
  assert.throws(() => validateSchedulingBodyParameters("class_reminder", "Little", ["Little", "Monday at 3 PM"]), /invalid_bodyParameters/);
});

test("maps the internal Swati reschedule alert template", () => {
  assert.deepEqual(templateMapFromEnv({ WHATSAPP_TEMPLATE_ADMIN_RESCHEDULE_ALERT: "kitty_reschedule_alert" }).admin_reschedule_alert, {
    name: "kitty_reschedule_alert",
    locale: "en_US",
  });
});

test("maps every isolated class-change template", () => {
  const mapped = templateMapFromEnv({
    WHATSAPP_TEMPLATE_CLASS_CHANGE_REQUEST: "kitty_change_request",
    WHATSAPP_TEMPLATE_CLASS_CHANGE_PROPOSAL: "kitty_change_proposal",
    WHATSAPP_TEMPLATE_CLASS_CANCELLED: "kitty_class_cancelled",
    WHATSAPP_TEMPLATE_CLASS_RESCHEDULED: "kitty_class_rescheduled",
    WHATSAPP_TEMPLATE_CLASS_CHANGE_REJECTED: "kitty_change_rejected",
  });
  assert.equal(mapped.class_change_request.name, "kitty_change_request");
  assert.equal(mapped.class_change_proposal.name, "kitty_change_proposal");
  assert.equal(mapped.class_cancelled.name, "kitty_class_cancelled");
  assert.equal(mapped.class_rescheduled.name, "kitty_class_rescheduled");
  assert.equal(mapped.class_change_rejected.name, "kitty_change_rejected");
});

test("maps and builds bounded Kitty relay templates", () => {
  const mapped = templateMapFromEnv({
    WHATSAPP_TEMPLATE_CLASS_ATTENDANCE_UPDATE: "kitty_attendance",
    WHATSAPP_TEMPLATE_CLASS_TEACHER_DELAY: "kitty_teacher_delay",
    WHATSAPP_TEMPLATE_CLASS_OPERATIONAL_UPDATE: "kitty_operational_update",
  });
  assert.equal(mapped.class_attendance_update.name, "kitty_attendance");
  assert.equal(mapped.class_teacher_delay.name, "kitty_teacher_delay");
  assert.equal(mapped.class_operational_update.name, "kitty_operational_update");
  for (const intent of ["class_attendance_update", "class_teacher_delay", "class_operational_update"]) {
    assert.deepEqual(buildSchedulingMessageContent({
      intent,
      recipientName: "Little",
      templateData: { classDescription: "group piano", relaySummary: "The teacher is running late." },
    }).bodyParameters, ["Little", "group piano", "The teacher is running late."]);
  }
});

test("reuses the approved human-attention template for every Kitty notification", () => {
  const mapped = templateMapFromEnv({
    WHATSAPP_TEMPLATE_HUMAN_ATTENTION: "class_human_attention",
  });
  for (const intent of [
    "class_change_request", "class_change_proposal", "class_cancelled", "class_rescheduled",
    "class_change_rejected", "class_attendance_update", "class_teacher_delay", "class_operational_update",
  ]) {
    assert.deepEqual(mapped[intent], {
      name: "class_human_attention",
      locale: "en_US",
      parameterStyle: "human_attention",
    });
  }
});

test("adapts a bounded Kitty message to the existing two-variable template", () => {
  assert.deepEqual(
    buildHumanAttentionFallbackContent("Little", "Hi Little, mathematics at Tuesday 4 PM has been cancelled. Reference AB12CD."),
    { bodyParameters: ["Little", "mathematics at Tuesday 4 PM has been cancelled. Reference AB12CD"] },
  );
  assert.throws(
    () => buildHumanAttentionFallbackContent("Little", `Hi Little, ${"x".repeat(501)}`),
    /invalid_matter/,
  );
});

test("builds the Utility-compatible Swati reschedule alert body", () => {
  assert.equal(
    buildSchedulingMessageContent({ intent: "admin_reschedule_alert", recipientName: "Swati", templateData: { requesterName: "Little", caseSummary: "mathematics class - requested Monday at 4 PM Eastern Time" } }).body,
    "Hi Swati, scheduling update for Little: mathematics class - requested Monday at 4 PM Eastern Time. Reply to coordinate this existing class.",
  );
});

test("builds fixed text and template Graph payloads", () => {
  assert.deepEqual(buildGraphMessageRequest({ to: "+84 917 583 553", delivery: { kind: "free_form" }, body: "Hello" }), {
    messaging_product: "whatsapp", recipient_type: "individual", to: "84917583553", type: "text", text: { preview_url: false, body: "Hello" },
  });
  assert.deepEqual(buildGraphMessageRequest({ to: "+84917583553", delivery: { kind: "template", name: "class_time_proposal", locale: "en_US" }, bodyParameters: ["Priya", "Tuesday 6 PM"] }), {
    messaging_product: "whatsapp", recipient_type: "individual", to: "84917583553", type: "template", template: { name: "class_time_proposal", language: { code: "en_US" }, components: [{ type: "body", parameters: [{ type: "text", text: "Priya" }, { type: "text", text: "Tuesday 6 PM" }] }] },
  });
});

test("classifies bounded retry versus permanent Meta failures", () => {
  assert.equal(classifyMetaFailure(500, 2), "retryable");
  assert.equal(classifyMetaFailure(429, 4), "retryable");
  assert.equal(classifyMetaFailure(400, 131047), "permanent");
  assert.equal(classifyMetaFailure(401, 190), "permanent");
});

test("sender route is internal-authenticated and idempotent", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/app/api/whatsapp/send/route.ts"), "utf8");
  assert.match(source, /verifyServiceRequest/);
  assert.match(source, /idempotencyKey/);
  assert.match(source, /hermes_messages/);
  assert.match(source, /tutor_kind/);
  assert.match(source, /workspace_state/);
  assert.match(source, /class_confirmation/);
  for (const intent of ["tutor_report_request", "family_invoice", "payment_reminder", "payment_received"]) assert.match(source, new RegExp(intent));
  assert.match(source, /academy_family_invoices/);
  assert.match(source, /billed_contact_id/);
  assert.match(source, /academy_settlement_cycles/);
  assert.match(source, /family_invoice_id/);
  assert.match(source, /settlement_cycle_id/);
  assert.match(source, /buildSettlementMessageContent/);
  assert.match(source, /body\.text = financialContent\.body/);
  assert.match(source, /body\.bodyParameters = financialContent\.bodyParameters/);
  assert.match(source, /const recipientName = messagingName\(contact\)/);
  assert.match(source, /invoiceReference: `MIA-/);
  assert.match(source, /buildSchedulingMessageContent/);
  assert.match(source, /validateSchedulingBodyParameters/);
  assert.match(source, /display_name/);
  assert.match(source, /admin_reschedule_alert/);
  assert.match(source, /HERMES_ADMIN_WHATSAPP_E164/);
  assert.match(source, /lesson_report_request/);
  assert.match(source, /lessonCycleId/);
  assert.match(source, /academy_teacher_collections/);
  assert.match(source, /buildLessonReportRequestContent/);
  assert.match(source, /lesson_cycle_id/);
  assert.match(source, /getClassReminderTemplateHealth/);
  assert.match(source, /template_contract_unavailable/);
});

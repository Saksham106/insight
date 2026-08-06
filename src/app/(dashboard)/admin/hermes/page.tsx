import { HermesAssistantDashboard } from "@/components/admin/hermes-assistant-dashboard";
import { parseHermesTab } from "@/components/admin/hermes-dashboard-shared";
import { requireRole } from "@/lib/auth/require-role";
import { loadAdminLessonCycles } from "@/lib/hermes/lesson-ledger-admin";
import type { KittyAdminAttentionIssue } from "@/lib/hermes/kitty-class-admin";
import {
  attachAndSortConversationSummaries,
  loadConversationSummaries,
  loadSelectedConversation,
  parseSelectedContactId,
} from "@/lib/hermes/transcript-queries";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface HermesAdminPageProps {
  searchParams: Promise<{
    contact?: string | string[];
    tab?: string | string[];
  }>;
}

export default async function HermesAdminPage({
  searchParams,
}: HermesAdminPageProps) {
  await requireRole(["admin"]);
  const query = await searchParams;
  const requestedContactId = parseSelectedContactId(query.contact);
  const tab = parseHermesTab(query.tab);
  const supabase = createAdminClient();
  const [
    contacts,
    cases,
    approvals,
    messages,
    settlements,
    summaryResult,
    lessonResult,
    classOccurrences,
    classSeries,
    classNotificationIssues,
    classChangeAttention,
    classAmbiguityEvents,
    classEnrollmentDecisionContacts,
  ] =
    await Promise.all([
      supabase
        .from("hermes_contacts")
        .select("id, display_name, preferred_name, whatsapp_e164, role, profile_id, profile_link_status, communication_policy, consent_status, timezone, updated_at, deleted_at, is_active")
        .order("display_name"),
      supabase
        .from("hermes_scheduling_cases")
        .select("id, title, status, human_takeover, updated_at")
        .not("status", "in", '("confirmed","cancelled")')
        .order("updated_at", { ascending: false })
        .limit(20),
      supabase
        .from("hermes_approvals")
        .select("id, action, status, requested_at, payload, proposal_version, case:case_id(id, title), settlement:settlement_cycle_id(id, period_start, currency)")
        .eq("status", "pending")
        .order("requested_at")
        .limit(20),
      supabase
        .from("hermes_messages")
        .select("id, direction, message_kind, status, occurred_at, contact:contact_id(display_name)")
        .order("occurred_at", { ascending: false })
        .limit(25),
      supabase
        .from("academy_settlement_cycles")
        .select("id, period_start, currency, status, updated_at, tutor_reports:academy_tutor_reports(status), family_invoices:academy_family_invoices(status), tutor_payouts:academy_tutor_payouts(status)")
        .order("period_start", { ascending: false })
        .limit(12),
      loadConversationSummaries(supabase)
        .then((data) => ({ data, error: false }))
        .catch(() => ({ data: [], error: true })),
      loadAdminLessonCycles(supabase)
        .then((data) => ({ data, error: false }))
        .catch(() => ({ data: [], error: true })),
      supabase
        .from("kitty_class_occurrences")
        .select("id, series_id, title, subject, starts_at, ends_at, timezone, status, version")
        .order("starts_at", { ascending: true })
        .limit(200),
      supabase
        .from("kitty_class_series")
        .select("id, title, weekdays, local_time, timezone, status")
        .order("title"),
      supabase
        .from("kitty_class_notification_outbox")
        .select("id, occurrence_id, status, last_error_code, updated_at")
        .in("status", ["failed", "blocked"])
        .order("updated_at", { ascending: false })
        .limit(50),
      supabase
        .from("kitty_class_change_requests")
        .select("id, occurrence_id, status")
        .order("updated_at", { ascending: false })
        .limit(500),
      supabase
        .from("kitty_class_audit_events")
        .select("id, event_type, entity_type, entity_id")
        .in("event_type", ["ambiguous_scope", "scope_ambiguous"])
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("kitty_class_enrollments")
        .select("id, series_id, occurrence_id, contacts:kitty_class_enrollment_contacts(confirms_reschedule, is_active)")
        .eq("is_active", true)
        .limit(500),
    ]);

  const changeOccurrenceById = new Map(
    (classChangeAttention.data ?? []).map((request) => [request.id, request.occurrence_id]),
  );
  const classAttentionIssues: KittyAdminAttentionIssue[] = [
    ...(classChangeAttention.data ?? []).flatMap((request) => {
      if (request.status !== "expired" && request.status !== "rejected") return [];
      return [{
        id: request.id,
        occurrenceId: request.occurrence_id,
        seriesId: null,
        kind: request.status === "expired" ? "expired_request" as const : "rejected_proposal" as const,
      }];
    }),
    ...(classAmbiguityEvents.data ?? []).flatMap((event) => {
      const occurrenceId = event.entity_type === "occurrence"
        ? event.entity_id
        : event.entity_type === "change_request"
          ? changeOccurrenceById.get(event.entity_id) ?? null
          : null;
      return occurrenceId ? [{
        id: event.id,
        occurrenceId,
        seriesId: null,
        kind: "ambiguous_scope" as const,
      }] : [];
    }),
    ...(classEnrollmentDecisionContacts.data ?? []).flatMap((enrollment) => {
      const contacts = Array.isArray(enrollment.contacts) ? enrollment.contacts : [];
      const hasDecisionMaker = contacts.some((contact) => contact.is_active && contact.confirms_reschedule);
      return hasDecisionMaker ? [] : [{
        id: `missing-decision-maker:${enrollment.id}`,
        occurrenceId: enrollment.occurrence_id,
        seriesId: enrollment.series_id,
        kind: "missing_decision_maker" as const,
      }];
    }),
  ];

  // The query above returns active and removed contacts together so the
  // Contacts tab can offer restore. Every other consumer on this page
  // (conversations, attention, header stats, tab counts) must only ever see
  // the active set — a removed contact is not someone Kitty still messages.
  // "Active" agrees with the rest of the system (whatsapp/send, hermes/tools,
  // hermes/transcripts, admin/hermes/contacts, isInboundContactEligible):
  // deleted_at is null AND is_active is true.
  const allContacts = contacts.data ?? [];
  const activeContacts = allContacts.filter(
    (contact) => !contact.deleted_at && contact.is_active,
  );
  // directoryContacts below is derived from allContacts, so its "active" rows
  // are exactly this id set — computed once, not re-filtered independently.
  const activeContactIds = new Set(activeContacts.map((contact) => contact.id));
  const selectedContact =
    requestedContactId === null
      ? null
      : activeContacts.find((contact) => contact.id === requestedContactId) ??
        null;
  const transcriptResult = selectedContact
    ? await loadSelectedConversation(supabase, selectedContact.id)
        .then((data) => ({ data, error: false }))
        .catch(() => ({ data: [], error: true }))
    : { data: [], error: false };

  const directoryContacts = attachAndSortConversationSummaries(
    allContacts,
    summaryResult.data,
  );

  return (
    <HermesAssistantDashboard
      tab={tab}
      contacts={directoryContacts.filter((contact) => activeContactIds.has(contact.id))}
      directoryContacts={directoryContacts}
      selectedContact={selectedContact}
      transcript={transcriptResult.data}
      transcriptError={
        summaryResult.error || transcriptResult.error
          ? "Transcript temporarily unavailable."
          : null
      }
      cases={cases.data ?? []}
      approvals={approvals.data ?? []}
      messages={messages.data ?? []}
      lessonCycles={lessonResult.data}
      lessonLedgerError={
        lessonResult.error ? "Lesson ledger temporarily unavailable." : null
      }
      settlements={settlements.data ?? []}
      loadError={contacts.error || cases.error || approvals.error || messages.error || settlements.error || classOccurrences.error || classSeries.error || classNotificationIssues.error || classChangeAttention.error || classAmbiguityEvents.error || classEnrollmentDecisionContacts.error ? "Some Kitty information could not be loaded." : null}
      classOccurrences={classOccurrences.data ?? []}
      classSeries={classSeries.data ?? []}
      classNotificationIssues={classNotificationIssues.data ?? []}
      classAttentionIssues={classAttentionIssues}
      classCalendarEnabled={process.env.KITTY_CLASS_CALENDAR_ENABLED === "true"}
    />
  );
}

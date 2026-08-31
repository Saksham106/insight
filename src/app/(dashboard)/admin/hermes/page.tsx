import { HermesAssistantDashboard } from "@/components/admin/hermes-assistant-dashboard";
import { parseHermesTab } from "@/components/admin/hermes-dashboard-shared";
import { requireRole } from "@/lib/auth/require-role";
import { loadAdminLessonCycles } from "@/lib/hermes/lesson-ledger-admin";
import { collectKittyAttentionOccurrenceIds, KITTY_UPCOMING_CLASS_LIMIT, loadKittyAdminAttentionIssues } from "@/lib/hermes/kitty-class-admin";
import {
  attachAndSortConversationSummaries,
  loadConversationSummaries,
  loadSelectedConversation,
  parseSelectedContactId,
} from "@/lib/hermes/transcript-queries";
import {
  projectGuardianIssues,
  type EnrollmentContactForRouting,
} from "@/lib/hermes/guardian-routing";
import { projectActiveSchedulingCases } from "@/lib/hermes/scheduling";
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
    statements,
    summaryResult,
    lessonResult,
    classUpcomingOccurrences,
    classHistoryOccurrences,
    classSeries,
    classNotificationIssues,
    classAttentionResult,
  ] =
    await Promise.all([
      supabase
        .from("hermes_contacts")
        .select("id, display_name, preferred_name, whatsapp_e164, role, profile_id, profile_link_status, communication_policy, consent_status, timezone, updated_at, deleted_at, is_active")
        .order("display_name"),
      supabase
        .from("hermes_scheduling_cases")
        .select("id, title, status, human_takeover, proposed_times, resolution, updated_at")
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
        // intent/template_name/body feed the delivery log's projection.
        // error_detail and meta_message_id are deliberately not selected.
        .select("id, direction, message_kind, intent, template_name, body, status, error_code, occurred_at, contact:contact_id(display_name)")
        .order("occurred_at", { ascending: false })
        .limit(25),
      supabase
        .from("academy_settlement_cycles")
        .select("id, period_start, currency, status, updated_at, tutor_reports:academy_tutor_reports(status), family_invoices:academy_family_invoices(status), tutor_payouts:academy_tutor_payouts(status)")
        .order("period_start", { ascending: false })
        .limit(12),
      supabase
        .from("academy_fee_statements")
        .select("id, statement_reference, student_name, billed_to_name, period_start, period_end, currency, total_minor, status, issued_at, paid_at, voided_at")
        .order("issued_at", { ascending: false })
        .limit(50),
      loadConversationSummaries(supabase)
        .then((data) => ({ data, error: false }))
        .catch(() => ({ data: [], error: true })),
      loadAdminLessonCycles(supabase)
        .then((data) => ({ data, error: false }))
        .catch(() => ({ data: [], error: true })),
      // Bounded here rather than in the browser: Upcoming shows the next five,
      // so there is no reason to ship 200 generated occurrences to the client
      // and slice them there.
      supabase
        .from("kitty_class_occurrences")
        .select("id, series_id, title, subject, starts_at, ends_at, timezone, status, version")
        .in("status", ["scheduled", "change_requested"])
        .gte("ends_at", new Date().toISOString())
        .order("starts_at", { ascending: true })
        .limit(KITTY_UPCOMING_CLASS_LIMIT),
      supabase
        .from("kitty_class_occurrences")
        .select("id, series_id, title, subject, starts_at, ends_at, timezone, status, version")
        .in("status", ["completed", "cancelled", "rescheduled"])
        .order("starts_at", { ascending: false })
        .limit(50),
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
      loadKittyAdminAttentionIssues(supabase)
        .then((data) => ({ data, error: false }))
        .catch(() => ({ data: [], error: true })),
    ]);

  const classAttentionIssues = classAttentionResult.data;
  const classChangeRequestedOccurrences = await supabase
    .from("kitty_class_occurrences")
    .select("id")
    .eq("status", "change_requested")
    .limit(200);
  const primaryOccurrences = [
    ...(classUpcomingOccurrences.data ?? []),
    ...(classHistoryOccurrences.data ?? []),
  ];
  const primaryOccurrenceIds = new Set(primaryOccurrences.map((occurrence) => occurrence.id));
  const attentionOccurrenceIds = collectKittyAttentionOccurrenceIds({
    workflowIssues: classAttentionIssues,
    deliveryIssues: classNotificationIssues.data ?? [],
    changeRequestedOccurrences: classChangeRequestedOccurrences.data ?? [],
    excludeIds: [...primaryOccurrenceIds],
  }).slice(0, 200);
  const classAttentionOccurrences = attentionOccurrenceIds.length
    ? await supabase
        .from("kitty_class_occurrences")
        .select("id, series_id, title, subject, starts_at, ends_at, timezone, status, version")
        .in("id", attentionOccurrenceIds)
        .limit(200)
    : { data: [], error: null };
  const classOccurrences = [...primaryOccurrences, ...(classAttentionOccurrences.data ?? [])];

  // Guardian routing for the classes actually coming up. Bounded to the
  // upcoming occurrences so this never walks the whole enrollment history.
  const upcomingOccurrenceIds = (classUpcomingOccurrences.data ?? []).map((occurrence) => occurrence.id);
  const upcomingSeriesIds = [...new Set((classUpcomingOccurrences.data ?? []).flatMap((occurrence) => occurrence.series_id ? [occurrence.series_id] : []))];
  const enrollmentScope = [
    upcomingOccurrenceIds.length ? `occurrence_id.in.(${upcomingOccurrenceIds.join(",")})` : null,
    upcomingSeriesIds.length ? `series_id.in.(${upcomingSeriesIds.join(",")})` : null,
  ].filter(Boolean).join(",");
  const openCaseIds = (cases.data ?? []).map((item: { id: string }) => item.id);
  const [relationshipRows, enrollmentRows, participantRows] = await Promise.all([
    supabase
      .from("hermes_contact_relationships")
      .select("id, source_contact_id, target_contact_id, relationship_type, is_active")
      .eq("relationship_type", "parent_guardian")
      .eq("is_active", true)
      .limit(1000),
    enrollmentScope
      ? supabase
          .from("kitty_class_enrollments")
          .select("id, student_contact_id, occurrence_id, is_active, contacts:kitty_class_enrollment_contacts(enrollment_id, contact_id, contact_role, receives_notifications, is_active)")
          .or(enrollmentScope)
          .eq("is_active", true)
          .limit(200)
      : { data: [], error: null },
    // Only the open cases' participants, so "who is waiting on whom" can be
    // derived without loading the whole participation history.
    openCaseIds.length
      ? supabase
          .from("hermes_case_participants")
          .select("id, case_id, contact_id, participant_role, response_status, availability, updated_at, contact:contact_id(display_name)")
          .in("case_id", openCaseIds)
          .limit(200)
      : { data: [], error: null },
  ]);
  const enrollments = enrollmentRows.data ?? [];
  const schedulingCases = projectActiveSchedulingCases({
    cases: cases.data ?? [],
    participants: participantRows.data ?? [],
    approvalCaseIds: (approvals.data ?? []).flatMap((approval: { case?: { id?: string } | Array<{ id?: string }> | null }) => {
      const record = Array.isArray(approval.case) ? approval.case[0] : approval.case;
      return record?.id ? [record.id] : [];
    }),
  });

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

  const occurrenceTitles = Object.fromEntries(
    classOccurrences.map((occurrence) => [occurrence.id, occurrence.title]),
  );
  const guardianIssues = projectGuardianIssues({
    enrollments: enrollments.map((row: { id: string; student_contact_id: string; occurrence_id: string | null }) => ({
      id: row.id,
      student_contact_id: row.student_contact_id,
      occurrence_id: row.occurrence_id,
    })),
    enrollmentContacts: enrollments.flatMap(
      (row: { contacts?: EnrollmentContactForRouting[] }) => row.contacts ?? [],
    ),
    contacts: allContacts,
    relationships: relationshipRows.data ?? [],
    occurrenceTitles,
  });

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
      cases={schedulingCases}
      approvals={approvals.data ?? []}
      messages={messages.data ?? []}
      lessonCycles={lessonResult.data}
      lessonLedgerError={
        lessonResult.error ? "Lesson ledger temporarily unavailable." : null
      }
      statements={statements.data ?? []}
      settlements={settlements.data ?? []}
      loadError={contacts.error || cases.error || approvals.error || messages.error || settlements.error || statements.error || classUpcomingOccurrences.error || classHistoryOccurrences.error || classSeries.error || classNotificationIssues.error || classAttentionResult.error || classChangeRequestedOccurrences.error || classAttentionOccurrences.error || relationshipRows.error || enrollmentRows.error || participantRows.error ? "Some Kitty information could not be loaded." : null}
      classOccurrences={classOccurrences}
      classSeries={classSeries.data ?? []}
      classNotificationIssues={classNotificationIssues.data ?? []}
      classAttentionIssues={classAttentionIssues}
      guardianIssues={guardianIssues}
      relationships={relationshipRows.data ?? []}
      classCalendarEnabled={process.env.KITTY_CLASS_CALENDAR_ENABLED === "true"}
    />
  );
}

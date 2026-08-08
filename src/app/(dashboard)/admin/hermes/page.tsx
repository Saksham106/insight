import { HermesAssistantDashboard } from "@/components/admin/hermes-assistant-dashboard";
import { parseHermesTab } from "@/components/admin/hermes-dashboard-shared";
import { requireRole } from "@/lib/auth/require-role";
import { loadAdminLessonCycles } from "@/lib/hermes/lesson-ledger-admin";
import { KITTY_UPCOMING_CLASS_LIMIT, loadKittyAdminAttentionIssues } from "@/lib/hermes/kitty-class-admin";
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
  const primaryOccurrences = [
    ...(classUpcomingOccurrences.data ?? []),
    ...(classHistoryOccurrences.data ?? []),
  ];
  const primaryOccurrenceIds = new Set(primaryOccurrences.map((occurrence) => occurrence.id));
  const attentionOccurrenceIds = [...new Set(classAttentionIssues.flatMap((issue: { occurrenceId: string | null }) =>
    issue.occurrenceId && !primaryOccurrenceIds.has(issue.occurrenceId) ? [issue.occurrenceId] : [],
  ))].slice(0, 200);
  const classAttentionOccurrences = attentionOccurrenceIds.length
    ? await supabase
        .from("kitty_class_occurrences")
        .select("id, series_id, title, subject, starts_at, ends_at, timezone, status, version")
        .in("id", attentionOccurrenceIds)
        .limit(200)
    : { data: [], error: null };
  const classOccurrences = [...primaryOccurrences, ...(classAttentionOccurrences.data ?? [])];

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
      loadError={contacts.error || cases.error || approvals.error || messages.error || settlements.error || classUpcomingOccurrences.error || classHistoryOccurrences.error || classSeries.error || classNotificationIssues.error || classAttentionResult.error || classAttentionOccurrences.error ? "Some Kitty information could not be loaded." : null}
      classOccurrences={classOccurrences}
      classSeries={classSeries.data ?? []}
      classNotificationIssues={classNotificationIssues.data ?? []}
      classAttentionIssues={classAttentionIssues}
      classCalendarEnabled={process.env.KITTY_CLASS_CALENDAR_ENABLED === "true"}
    />
  );
}

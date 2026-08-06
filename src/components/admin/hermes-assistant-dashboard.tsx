import Link from "next/link";
import { AlertCircle, Banknote, Bot, CalendarDays, Clock3, Contact, Users } from "lucide-react";

import { HermesAttentionPanel } from "@/components/admin/hermes-attention-panel";
import { HermesContactsPanel } from "@/components/admin/hermes-contacts-panel";
import { HermesConversationsPanel } from "@/components/admin/hermes-conversations-panel";
import { HermesClassesPanel } from "@/components/admin/hermes-classes-panel";
import {
  DEFAULT_HERMES_TAB,
  hermesTabHref,
  type HermesAdminContact,
  type HermesApproval,
  type HermesCase,
  type HermesContactIdentity,
  type HermesMessage,
  type HermesSettlementCycle,
  type HermesTab,
  type HermesTranscriptMessage,
} from "@/components/admin/hermes-dashboard-shared";
import { HermesSchedulingPanel } from "@/components/admin/hermes-scheduling-panel";
import { HermesSettlementsPanel } from "@/components/admin/hermes-settlements-panel";
import type { AdminLessonCycle } from "@/lib/hermes/lesson-ledger-admin";
import type { KittyAdminAttentionIssue } from "@/lib/hermes/kitty-class-admin";

interface HermesAssistantDashboardProps {
  tab: HermesTab;
  contacts: HermesAdminContact[];
  /** Active and removed contacts together, for the Contacts tab's directory. */
  directoryContacts: HermesAdminContact[];
  selectedContact: HermesContactIdentity | null;
  transcript: HermesTranscriptMessage[];
  transcriptError: string | null;
  cases: HermesCase[];
  approvals: HermesApproval[];
  messages: HermesMessage[];
  lessonCycles: AdminLessonCycle[];
  lessonLedgerError: string | null;
  settlements: HermesSettlementCycle[];
  loadError: string | null;
  classOccurrences: Array<{ id: string; series_id: string | null; title: string; subject: string | null; starts_at: string; ends_at: string; timezone: string; status: string; version: number }>;
  classSeries: Array<{ id: string; title: string; weekdays: number[]; local_time: string; timezone: string; status: string }>;
  classNotificationIssues: Array<{ id: string; occurrence_id: string; status: string; last_error_code: string | null; updated_at: string }>;
  classAttentionIssues: KittyAdminAttentionIssue[];
  classCalendarEnabled: boolean;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <span className="text-sm text-muted">
      <strong className="text-navy">{value}</strong> {label}
    </span>
  );
}

export function HermesAssistantDashboard({
  tab = DEFAULT_HERMES_TAB,
  contacts,
  directoryContacts,
  selectedContact,
  transcript,
  transcriptError,
  cases,
  approvals,
  messages,
  lessonCycles,
  lessonLedgerError,
  settlements,
  loadError,
  classOccurrences,
  classSeries,
  classNotificationIssues,
  classAttentionIssues,
  classCalendarEnabled,
}: HermesAssistantDashboardProps) {
  const attentionContacts = contacts.filter((contact) =>
    contact.role === "unclassified" || contact.profile_link_status === "suggested" || contact.communication_policy !== "direct",
  );
  const attentionCount = approvals.length + attentionContacts.length;

  const tabs: Array<{ id: HermesTab; label: string; icon: React.ReactNode; count?: number }> = [
    { id: "conversations", label: "Conversations", icon: <Users size={16} />, count: contacts.length },
    { id: "ledger", label: "Ledger", icon: <Banknote size={16} />, count: lessonCycles.length + settlements.length },
    { id: "contacts", label: "Contacts", icon: <Contact size={16} /> },
    { id: "classes", label: "Classes", icon: <CalendarDays size={16} />, count: classOccurrences.filter((item) => item.status === "scheduled" || item.status === "change_requested").length },
    { id: "scheduling", label: "Scheduling", icon: <Clock3 size={16} />, count: cases.length },
    { id: "attention", label: "Needs attention", icon: <AlertCircle size={16} />, count: attentionCount },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <header>
        <h1 className="text-2xl font-semibold text-navy" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Bot size={24} /> Kitty
        </h1>
        <p className="text-sm text-muted" style={{ marginTop: "4px" }}>
          Import academy contacts and review only the work that needs you.
        </p>
        <div style={{ marginTop: "10px", display: "flex", flexWrap: "wrap", gap: "6px 16px" }}>
          <Stat label="contacts" value={contacts.length} />
          <Stat label="approvals pending" value={approvals.length} />
          <Stat label="active cases" value={cases.length} />
        </div>
      </header>

      {loadError ? <p className="text-sm text-error">{loadError}</p> : null}

      <nav aria-label="Kitty sections" className="kitty-tabs">
        {tabs.map(({ id, label, icon, count }) => {
          const active = tab === id;
          return (
            <Link
              key={id}
              href={hermesTabHref(id, selectedContact?.id ?? null)}
              aria-current={active ? "page" : undefined}
              scroll={false}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                minHeight: "40px",
                padding: "0 14px",
                borderRadius: "8px",
                border: "1px solid transparent",
                background: active ? "var(--color-accent-soft)" : "transparent",
                color: active ? "var(--color-navy)" : "var(--color-slate)",
                fontSize: "14px",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              {icon}
              {label}
              {count !== undefined && count > 0 ? (
                <span
                  className="text-xs"
                  style={{
                    minWidth: "20px",
                    textAlign: "center",
                    borderRadius: "999px",
                    padding: "1px 6px",
                    background: active ? "var(--color-navy)" : "var(--color-soft)",
                    color: active ? "#ffffff" : "var(--color-muted)",
                    fontWeight: 600,
                  }}
                >
                  {count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      {tab === "conversations" ? (
        <HermesConversationsPanel
          contacts={contacts}
          selectedContact={selectedContact}
          transcript={transcript}
          transcriptError={transcriptError}
        />
      ) : null}

      {tab === "attention" ? (
        <HermesAttentionPanel
          approvals={approvals}
          attentionContacts={attentionContacts}
          messages={messages}
        />
      ) : null}

      {tab === "scheduling" ? <HermesSchedulingPanel cases={cases} /> : null}

      {tab === "ledger" ? (
        <HermesSettlementsPanel
          lessonCycles={lessonCycles}
          lessonLedgerError={lessonLedgerError}
          settlements={settlements}
        />
      ) : null}

      {tab === "contacts" ? <HermesContactsPanel contacts={directoryContacts} /> : null}

      {tab === "classes" ? <HermesClassesPanel classes={classOccurrences} series={classSeries} contacts={directoryContacts} notificationIssues={classNotificationIssues} attentionIssues={classAttentionIssues} enabled={classCalendarEnabled} /> : null}
    </div>
  );
}

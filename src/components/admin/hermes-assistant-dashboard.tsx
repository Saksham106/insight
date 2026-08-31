import Link from "next/link";
import { AlertCircle, Banknote, Bot, CalendarDays, Clock3, Contact, ReceiptText, Users } from "lucide-react";

import { HermesAttentionPanel } from "@/components/admin/hermes-attention-panel";
import { HermesContactsPanel } from "@/components/admin/hermes-contacts-panel";
import { HermesConversationsPanel } from "@/components/admin/hermes-conversations-panel";
import { HermesFeeStatementsPanel } from "@/components/admin/hermes-fee-statements-panel";
import { HermesClassesPanel } from "@/components/admin/hermes-classes-panel";
import {
  DEFAULT_HERMES_TAB,
  hermesTabHref,
  type HermesAdminContact,
  type HermesApproval,
  type HermesContactIdentity,
  type HermesFeeStatementSummary,
  type HermesMessage,
  type HermesSettlementCycle,
  type HermesTab,
  type HermesTranscriptMessage,
} from "@/components/admin/hermes-dashboard-shared";
import { HermesSchedulingPanel } from "@/components/admin/hermes-scheduling-panel";
import { HermesSettlementsPanel } from "@/components/admin/hermes-settlements-panel";
import { buildHermesTabs } from "@/lib/hermes/admin-tabs";
import { projectAttentionItems, type GuardianRoutingIssue } from "@/lib/hermes/attention";
import type { RelationshipRow } from "@/lib/hermes/relationships";
import type { SchedulingCaseView } from "@/lib/hermes/scheduling";
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
  cases: SchedulingCaseView[];
  approvals: HermesApproval[];
  messages: HermesMessage[];
  lessonCycles: AdminLessonCycle[];
  lessonLedgerError: string | null;
  statements: HermesFeeStatementSummary[];
  settlements: HermesSettlementCycle[];
  loadError: string | null;
  classOccurrences: Array<{ id: string; series_id: string | null; title: string; subject: string | null; starts_at: string; ends_at: string; timezone: string; status: string; version: number }>;
  classSeries: Array<{ id: string; title: string; weekdays: number[]; local_time: string; timezone: string; status: string }>;
  classNotificationIssues: Array<{ id: string; occurrence_id: string; status: string; last_error_code: string | null; updated_at: string }>;
  classAttentionIssues: KittyAdminAttentionIssue[];
  classCalendarEnabled: boolean;
  /** Guardian-routing exceptions raised when a class must reach a guardian. */
  guardianIssues: GuardianRoutingIssue[];
  /** Active parent/guardian links, for the Contact Directory. */
  relationships: RelationshipRow[];
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
  statements,
  settlements,
  loadError,
  classOccurrences,
  classSeries,
  classNotificationIssues,
  classAttentionIssues,
  classCalendarEnabled,
  guardianIssues,
  relationships,
}: HermesAssistantDashboardProps) {
  const attentionItems = projectAttentionItems({
    approvals,
    contacts,
    messages,
    cases: cases.map((item) => ({
      id: item.id,
      title: item.title,
      status: item.status,
      human_takeover: item.humanTakeover,
    })),
    classAttentionIssues,
    guardianIssues,
    occurrenceTitles: Object.fromEntries(
      classOccurrences.map((occurrence) => [occurrence.id, occurrence.title]),
    ),
  });
  const attentionCount = attentionItems.length;

  const tabIcons: Record<HermesTab, React.ReactNode> = {
    conversations: <Users size={16} />,
    ledger: <Banknote size={16} />,
    statements: <ReceiptText size={16} />,
    contacts: <Contact size={16} />,
    classes: <CalendarDays size={16} />,
    scheduling: <Clock3 size={16} />,
    attention: <AlertCircle size={16} />,
  };
  const tabs = buildHermesTabs({
    ledgerItems: lessonCycles.length + settlements.length,
    openSchedulingCases: cases.length,
    attentionItems: attentionCount,
  });

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
        {tabs.map(({ id, label, count }) => {
          const icon = tabIcons[id];
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
          attentionItems={attentionItems}
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

      {tab === "statements" ? <HermesFeeStatementsPanel statements={statements} /> : null}

      {tab === "contacts" ? <HermesContactsPanel contacts={directoryContacts} relationships={relationships} /> : null}

      {tab === "classes" ? <HermesClassesPanel classes={classOccurrences} series={classSeries} contacts={directoryContacts} notificationIssues={classNotificationIssues} attentionIssues={classAttentionIssues} enabled={classCalendarEnabled} /> : null}
    </div>
  );
}

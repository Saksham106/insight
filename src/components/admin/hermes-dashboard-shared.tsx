import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export interface HermesContactIdentity {
  id: string;
  display_name: string;
  /** Null means the messaging name is unconfirmed and outbound greetings stay neutral. */
  preferred_name: string | null;
  whatsapp_e164: string;
  role: string;
  profile_id: string | null;
  profile_link_status: string;
  communication_policy: string;
  consent_status: string;
  timezone: string | null;
  updated_at: string;
  /** Non-null means the contact was removed from the directory. */
  deleted_at: string | null;
}

export interface HermesAdminContact extends HermesContactIdentity {
  conversation: {
    latestBody: string;
    latestSpeaker: "contact" | "kitty";
    latestAt: string;
    messageCount: number;
  } | null;
}

export interface HermesTranscriptMessage {
  id: string;
  speaker: "contact" | "kitty";
  body: string;
  occurredAt: string;
}

export interface HermesCase {
  id: string;
  title: string;
  status: string;
  human_takeover: boolean;
  updated_at: string;
}

export interface HermesApproval {
  id: string;
  action: string;
  status: string;
  requested_at: string;
  payload: unknown;
  proposal_version: number;
  case: unknown;
  settlement: unknown;
}

export interface HermesMessage {
  id: string;
  direction: string;
  message_kind: string;
  intent: string | null;
  template_name: string | null;
  body: string | null;
  status: string;
  error_code: string | null;
  occurred_at: string;
  /** Joined contact; null once the contact is removed. */
  contact: { display_name: string | null } | Array<{ display_name: string | null }> | null;
}

export interface HermesSettlementCycle {
  id: string;
  period_start: string;
  currency: string;
  status: string;
  updated_at: string;
  tutor_reports: Array<{ status: string }>;
  family_invoices: Array<{ status: string }>;
  tutor_payouts: Array<{ status: string }>;
}

export const HERMES_TABS = [
  "conversations",
  "ledger",
  "contacts",
  "classes",
  "scheduling",
  "attention",
] as const;

export type HermesTab = (typeof HERMES_TABS)[number];

export const DEFAULT_HERMES_TAB: HermesTab = "conversations";

export function parseHermesTab(value: string | string[] | undefined): HermesTab {
  const candidate = Array.isArray(value) ? value[0] : value;
  return HERMES_TABS.includes(candidate as HermesTab)
    ? (candidate as HermesTab)
    : DEFAULT_HERMES_TAB;
}

/** Keeps the selected contact when moving between tabs. */
export function hermesTabHref(tab: HermesTab, contactId: string | null) {
  const params = new URLSearchParams({ tab });
  if (contactId) params.set("contact", contactId);
  return `/admin/hermes?${params.toString()}`;
}

export function Empty({ children }: { children: string }) {
  return <p className="text-sm text-muted">{children}</p>;
}

export function formatMessageTime(value: string) {
  return new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** One tab's surface: a single card with a title, a one-line explanation, and body. */
export function PanelCard({
  icon,
  title,
  description,
  contentStyle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  contentStyle?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {icon} {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent style={contentStyle}>{children}</CardContent>
    </Card>
  );
}

/**
 * Collapsed-by-default section, used for occasional actions and diagnostics.
 * `bare` drops the box when the children already carry their own card surface.
 */
export function Disclosure({
  summary,
  hint,
  bare = false,
  children,
}: {
  summary: string;
  hint?: string;
  bare?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      className={bare ? undefined : "border border-border bg-surface"}
      style={bare ? undefined : { borderRadius: "10px", padding: "12px 14px" }}
    >
      <summary className="text-sm font-semibold text-navy" style={{ cursor: "pointer" }}>
        {summary}
        {hint ? <span className="text-xs font-normal text-muted"> · {hint}</span> : null}
      </summary>
      <div style={{ marginTop: "14px", display: "flex", flexDirection: "column", gap: "12px" }}>
        {children}
      </div>
    </details>
  );
}

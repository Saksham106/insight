/**
 * Which Kitty tabs carry a badge, and what the badge counts.
 *
 * A badge is a claim that there are N things to deal with. It is only added
 * where that claim is true. Conversations and Classes deliberately have none:
 * a contact total read as an unread count Kitty cannot compute (there is no
 * administrator read cursor), and a future-occurrence total contradicted a tab
 * that only ever shows the next five.
 */

import type { HermesTab } from "@/components/admin/hermes-dashboard-shared";

export interface HermesTabModel {
  id: HermesTab;
  label: string;
  /** Omitted entirely when the tab has no honest actionable count. */
  count?: number;
}

export interface HermesTabCounts {
  ledgerItems: number;
  openSchedulingCases: number;
  attentionItems: number;
}

export function buildHermesTabs(counts: HermesTabCounts): HermesTabModel[] {
  return [
    { id: "conversations", label: "Conversations" },
    { id: "ledger", label: "Ledger", count: counts.ledgerItems },
    { id: "contacts", label: "Contacts" },
    { id: "classes", label: "Classes" },
    { id: "scheduling", label: "Scheduling", count: counts.openSchedulingCases },
    { id: "attention", label: "Needs attention", count: counts.attentionItems },
  ];
}

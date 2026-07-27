import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export interface ConversationSummaryRow {
  contact_id: string;
  latest_body: string;
  latest_speaker: "contact" | "kitty";
  latest_at: string;
  message_count: number;
}

export interface ConversationSummary {
  latestBody: string;
  latestSpeaker: "contact" | "kitty";
  latestAt: string;
  messageCount: number;
}

interface ConversationMessageRow {
  source: "session" | "delivery";
  source_id: string;
  contact_id: string;
  speaker: "contact" | "kitty";
  body: string;
  occurred_at: string;
}

export interface AdminTranscriptMessage {
  id: string;
  speaker: "contact" | "kitty";
  body: string;
  occurredAt: string;
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SUMMARY_PAGE_SIZE = 1_000;
export const TRANSCRIPT_MESSAGE_LIMIT = 500;

export function parseSelectedContactId(
  value: string | string[] | undefined,
): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

export function attachAndSortConversationSummaries<
  T extends { id: string; display_name: string },
>(
  contacts: T[],
  summaries: ConversationSummaryRow[],
): Array<T & { conversation: ConversationSummary | null }> {
  const byContact = new Map(
    summaries.map((summary) => [
      summary.contact_id,
      {
        latestBody: summary.latest_body,
        latestSpeaker: summary.latest_speaker,
        latestAt: summary.latest_at,
        messageCount: Number(summary.message_count),
      },
    ]),
  );

  return contacts
    .map((contact) => ({
      ...contact,
      conversation: byContact.get(contact.id) ?? null,
    }))
    .sort((left, right) => {
      const leftTime = left.conversation?.latestAt;
      const rightTime = right.conversation?.latestAt;
      if (leftTime && rightTime) {
        const byTime = rightTime.localeCompare(leftTime);
        if (byTime !== 0) return byTime;
      } else if (leftTime) {
        return -1;
      } else if (rightTime) {
        return 1;
      }
      return left.display_name.localeCompare(right.display_name);
    });
}

export function normalizeTranscriptRows(
  rows: ConversationMessageRow[],
): AdminTranscriptMessage[] {
  return [...rows]
    .sort((left, right) => {
      const byTime = left.occurred_at.localeCompare(right.occurred_at);
      return byTime || left.source_id.localeCompare(right.source_id);
    })
    .map((row) => ({
      id: `${row.source}:${row.source_id}`,
      speaker: row.speaker,
      body: row.body,
      occurredAt: row.occurred_at,
    }));
}

export async function loadConversationSummaries(
  supabase: AdminClient,
): Promise<ConversationSummaryRow[]> {
  const summaries: ConversationSummaryRow[] = [];
  for (let from = 0; ; from += SUMMARY_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("hermes_admin_conversation_summaries")
      .select(
        "contact_id, latest_body, latest_speaker, latest_at, message_count",
      )
      .order("latest_at", { ascending: false })
      .range(from, from + SUMMARY_PAGE_SIZE - 1);
    if (error) throw new Error("transcript_summaries_unavailable");
    const page = (data ?? []) as ConversationSummaryRow[];
    summaries.push(...page);
    if (page.length < SUMMARY_PAGE_SIZE) return summaries;
  }
}

export async function loadSelectedConversation(
  supabase: AdminClient,
  contactId: string,
): Promise<AdminTranscriptMessage[]> {
  const { data, error } = await supabase
    .from("hermes_admin_conversation_messages")
    .select("source, source_id, contact_id, speaker, body, occurred_at")
    .eq("contact_id", contactId)
    .order("occurred_at", { ascending: false })
    .order("source_id", { ascending: false })
    .limit(TRANSCRIPT_MESSAGE_LIMIT);
  if (error) throw new Error("transcript_messages_unavailable");
  return normalizeTranscriptRows((data ?? []) as ConversationMessageRow[]);
}

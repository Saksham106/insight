"use client";

import type { ChatContact } from "@/lib/chat-types";
import { useUnread } from "@/lib/unread-context";

// Storage helpers + event moved to unread-context; re-exported for existing imports.
export { MARK_READ_EVENT, getLastRead, markRead } from "@/lib/unread-context";

// Thin view over the layout-level UnreadProvider: no queries or subscriptions of
// its own. `total` preserves the old semantics (sum over this caller's contacts).
export function useUnreadCounts(contacts: ChatContact[]) {
  const { unread, markAsRead } = useUnread();
  const total = contacts.reduce((sum, c) => sum + (unread[c.conversationId] ?? 0), 0);
  return { unread, markAsRead, total };
}

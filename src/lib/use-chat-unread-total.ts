"use client";

import { useUnread } from "@/lib/unread-context";

// Header badge total, served by the layout-level UnreadProvider (no own queries).
export function useChatUnreadTotal() {
  return useUnread().total;
}

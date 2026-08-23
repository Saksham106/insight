'use client';

import { useUnread } from '@/lib/unread-context';

export function useChatUnreadCount() {
  const { total } = useUnread();
  return total;
}

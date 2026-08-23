'use client';

import { useUnread } from '@/lib/unread-context';

export function useChatUnreadTotal() {
  const { total } = useUnread();
  return total;
}

export function useChatUnreadForContact(contacts: { conversationId: string }[]) {
  const { unread, total } = useUnread();

  const contactUnread = contacts.reduce((sum, contact) => {
    return sum + (unread[contact.conversationId] || 0);
  }, 0);

  return {
    total: contactUnread,
    unread,
  };
}

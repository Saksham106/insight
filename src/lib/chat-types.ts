export interface ChatContact {
  conversationId: string;
  name: string;
}

export interface ChatMember {
  id: string;
  full_name: string;
  role: string;
}

export interface ConversationSummary {
  id: string;
  isGroup: boolean;
  title: string; // resolved display title (group name, or the other member for 1:1)
  members: ChatMember[];
  lastMessage: { body: string | null; fileName: string | null; createdAt: string; senderId: string } | null;
  updatedAt: string;
}

export interface ChattableContact {
  id: string;
  full_name: string;
  role: string;
}

// Messages fetched per page; older history loads on demand.
export const MESSAGE_PAGE_SIZE = 50;

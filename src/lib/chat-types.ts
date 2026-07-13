export interface ChatContact {
  conversationId: string;
  name: string;
}

// Messages fetched per page; older history loads on demand.
export const MESSAGE_PAGE_SIZE = 50;

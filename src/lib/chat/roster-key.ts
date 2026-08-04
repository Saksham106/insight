// The canonical identity of a conversation's roster. Two chats holding the same
// people are the same relationship — whatever order the ids arrived in, and
// however many times one was repeated — so the key sorts and dedupes before
// joining. The separator matters: without it ["ab","c"] and ["a","bc"] would
// collide and two unrelated pairs would be treated as one conversation.
//
// Kept pure and DB-free alongside conversation-shape.ts, because this is what
// decides whether creating a chat reuses an existing thread or spawns a
// duplicate.
export function rosterKey(memberIds: string[]): string {
  return [...new Set(memberIds)].sort().join(",");
}

// Do these two rosters hold exactly the same people?
export function sameRoster(a: string[], b: string[]): boolean {
  return rosterKey(a) === rosterKey(b);
}

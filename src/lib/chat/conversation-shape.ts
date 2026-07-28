// Pure shape helpers for conversations. A conversation is N people and an
// optional name; "group" vs "DM" is a rendering detail derived from the roster,
// not a stored type. Keeping these pure makes the derivation testable without a
// database — it decides whether "message this person" reuses a thread or opens
// a duplicate, so it is worth covering directly.

// A conversation needs at least two people; one participant has nobody to talk to.
export const MINIMUM_ROSTER = 2;

// Renders as a group once a third person joins. Adding someone to a 1:1
// promotes it; removing them back down renders it as a DM again.
export function isGroupConversation(memberCount: number): boolean {
  return memberCount > 2;
}

// The dedupe key for "do these two already have a direct thread?". A pair the
// admin deliberately named is NOT a DM — reusing it would silently hijack a
// named conversation as someone's 1:1.
export function isDirectConversationKey(memberCount: number, title: string | null): boolean {
  return memberCount === 2 && !title?.trim();
}

export function hasMinimumRoster(memberCount: number): boolean {
  return memberCount >= MINIMUM_ROSTER;
}

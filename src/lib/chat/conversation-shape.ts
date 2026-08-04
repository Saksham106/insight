import type { ChatMember } from "@/lib/chat-types";

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

export function hasMinimumRoster(memberCount: number): boolean {
  return memberCount >= MINIMUM_ROSTER;
}

// The other participants' names, from someone inside the conversation looking
// out. Used to resolve a display title for a participant viewer ("You" is
// never listed). Empty roster (a participant alone) has nobody to name.
function otherMembersTitle(members: ChatMember[], selfId: string): string {
  const others = members.filter((m) => m.id !== selfId);
  if (others.length === 0) return "You";
  return others.map((m) => m.full_name).join(", ");
}

// Every member's name, for the admin's outside view where nobody is "you".
function allMembersTitle(members: ChatMember[]): string {
  if (members.length === 0) return "Group";
  return members.map((m) => m.full_name).join(", ");
}

// Resolve the display title shown in chat lists/threads. A stored custom title
// always wins, group or not — a deliberately named pair is a real conversation
// in its own right, not just a DM that happens to have a label. Absent a
// custom title, fall back to the roster: `viewerId === null` is the admin's
// outside view (every member named); a non-null `viewerId` is a participant's
// view (other members named, "You" when alone in the roster).
export function resolveConversationTitle(
  members: ChatMember[],
  storedTitle: string | null,
  viewerId: string | null,
): string {
  const groupName = storedTitle?.trim();
  if (viewerId === null) {
    return groupName || allMembersTitle(members);
  }
  return groupName || otherMembersTitle(members, viewerId) || "Group";
}

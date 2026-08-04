import { createAdminClient } from "@/lib/supabase/admin";
import type { ChatMember, ChattableContact, ConversationSummary } from "@/lib/chat-types";
import { derivePairs, type MemberRole } from "@/lib/chat/group-derive";
import {
  hasMinimumRoster,
  isGroupConversation,
  resolveConversationTitle,
} from "@/lib/chat/conversation-shape";
import { rosterKey } from "@/lib/chat/roster-key";

interface Profile {
  id: string;
  role: string;
}

type AdminClient = ReturnType<typeof createAdminClient>;

// Hydrate a set of conversation ids into list-ready summaries: member roster,
// last message, resolved display title, sorted by newest activity. When
// viewerId is provided titles are resolved relative to that viewer ("You" is
// hidden); when null (admin viewing everyone) the full roster is used. A
// custom name always wins, group or not: a deliberately named pair is a real
// conversation in its own right, not just a DM that happens to have a label.
async function hydrateSummaries(
  admin: AdminClient,
  ids: string[],
  viewerId: string | null,
): Promise<ConversationSummary[]> {
  if (ids.length === 0) return [];

  const [{ data: convos }, { data: parts }, { data: msgs }] = await Promise.all([
    admin
      .from("conversations")
      .select("id, is_group, title, created_at, updated_at")
      .in("id", ids)
      .is("archived_at", null),
    admin.from("conversation_participants").select("conversation_id, user_id").in("conversation_id", ids),
    admin
      .from("messages")
      .select("conversation_id, body, file_name, created_at, sender_id")
      .in("conversation_id", ids)
      .order("created_at", { ascending: false }),
  ]);

  const memberIds = [...new Set((parts ?? []).map((p) => p.user_id as string))];
  const { data: profiles } = memberIds.length
    ? await admin.from("profiles").select("id, full_name, role").in("id", memberIds)
    : { data: [] as ChatMember[] };
  const profileById = new Map((profiles ?? []).map((p) => [p.id as string, p as ChatMember]));

  const membersByConvo = new Map<string, ChatMember[]>();
  for (const p of parts ?? []) {
    const cid = p.conversation_id as string;
    const profile = profileById.get(p.user_id as string);
    if (!profile) continue;
    const list = membersByConvo.get(cid) ?? [];
    list.push(profile);
    membersByConvo.set(cid, list);
  }

  const lastByConvo = new Map<string, ConversationSummary["lastMessage"]>();
  for (const m of msgs ?? []) {
    const cid = m.conversation_id as string;
    if (lastByConvo.has(cid)) continue;
    lastByConvo.set(cid, {
      body: (m.body as string | null) ?? null,
      fileName: (m.file_name as string | null) ?? null,
      createdAt: m.created_at as string,
      senderId: m.sender_id as string,
    });
  }

  const summaries: ConversationSummary[] = (convos ?? []).map((c) => {
    const members = membersByConvo.get(c.id as string) ?? [];
    // Derived, not read from the column: a conversation is a group once it has
    // a third member. Keeps the flag from ever disagreeing with the roster.
    const isGroup = isGroupConversation(members.length);
    // The stored title, normalised the same way the resolved title's fallback
    // check is (trim, blank -> null). This is what clients should seed an
    // editable name field from — never the resolved `title` below, which may
    // be a synthesized roster string that was never actually stored.
    const customTitle = (c.title as string | null)?.trim() || null;
    const title = resolveConversationTitle(members, customTitle, viewerId);
    const lastMessage = lastByConvo.get(c.id as string) ?? null;
    return {
      id: c.id as string,
      isGroup,
      title,
      customTitle,
      members,
      lastMessage,
      updatedAt: lastMessage?.createdAt ?? (c.updated_at as string) ?? (c.created_at as string),
    };
  });

  summaries.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return summaries;
}

// All conversations the user is a member of, newest activity first, with the
// full member roster and last message for list rendering.
export async function getConversationsForUser(userId: string): Promise<ConversationSummary[]> {
  const admin = createAdminClient();

  const { data: myMemberships } = await admin
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", userId);

  const ids = (myMemberships ?? []).map((r) => r.conversation_id as string);
  return hydrateSummaries(admin, ids, userId);
}

// Admin-only: every conversation (groups + DMs) for the read-only Chats viewer.
export async function getAllConversationsForAdmin(): Promise<ConversationSummary[]> {
  const admin = createAdminClient();
  const { data } = await admin.from("conversations").select("id").is("archived_at", null);
  const ids = (data ?? []).map((r) => r.id as string);
  return hydrateSummaries(admin, ids, null);
}

// The set of user ids a person is allowed to include in a conversation. Everyone
// can reach the admin(s); otherwise the network is resolved through assignments
// and parent links so people only chat within their academy relationships.
export async function getChattableContacts(profile: Profile): Promise<ChattableContact[]> {
  const admin = createAdminClient();
  const ids = new Set<string>();

  // Admins can reach anyone.
  if (profile.role === "admin") {
    const { data } = await admin
      .from("profiles")
      .select("id, full_name, role")
      .neq("id", profile.id)
      .eq("is_active", true);
    return (data ?? []) as ChattableContact[];
  }

  // Everyone can reach active admins.
  const { data: admins } = await admin.from("profiles").select("id").eq("role", "admin").eq("is_active", true);
  for (const a of admins ?? []) ids.add(a.id as string);

  const { data: assignments } = await admin
    .from("teacher_student_assignments")
    .select("teacher_id, student_id")
    .eq("is_active", true);

  if (profile.role === "teacher") {
    const studentIds = new Set<string>();
    for (const a of assignments ?? []) {
      if (a.teacher_id === profile.id) {
        ids.add(a.student_id as string);
        studentIds.add(a.student_id as string);
      }
    }
    // Parents of those students.
    if (studentIds.size > 0) {
      const { data: links } = await admin
        .from("parent_student_links")
        .select("parent_id, student_id")
        .in("student_id", [...studentIds]);
      for (const l of links ?? []) ids.add(l.parent_id as string);
    }
  } else if (profile.role === "student") {
    for (const a of assignments ?? []) {
      if (a.student_id === profile.id) ids.add(a.teacher_id as string);
    }
    const { data: links } = await admin
      .from("parent_student_links")
      .select("parent_id")
      .eq("student_id", profile.id);
    for (const l of links ?? []) ids.add(l.parent_id as string);
  } else if (profile.role === "parent") {
    const { data: links } = await admin
      .from("parent_student_links")
      .select("student_id")
      .eq("parent_id", profile.id);
    const childIds = new Set((links ?? []).map((l) => l.student_id as string));
    for (const id of childIds) ids.add(id);
    // Teachers of those children.
    for (const a of assignments ?? []) {
      if (childIds.has(a.student_id as string)) ids.add(a.teacher_id as string);
    }
  }

  ids.delete(profile.id);
  if (ids.size === 0) return [];

  const { data: contacts } = await admin
    .from("profiles")
    .select("id, full_name, role")
    .in("id", [...ids])
    .eq("is_active", true);

  return (contacts ?? []) as ChattableContact[];
}

// Create a conversation with the given members (creator always included).
// Returns the new conversation id, or the id of the conversation that already
// holds exactly these people — `existing` says which happened so callers can
// explain the redirect instead of silently landing somewhere unexpected.
export async function createConversation(params: {
  creatorId: string;
  memberIds: string[];
  isGroup: boolean;
  title: string | null;
}): Promise<{ conversationId: string; existing: boolean } | { error: string }> {
  const admin = createAdminClient();

  const uniqueMembers = [...new Set([params.creatorId, ...params.memberIds])];
  if (!hasMinimumRoster(uniqueMembers.length)) {
    return { error: "A conversation needs at least one other person." };
  }

  // The title that will actually be stored: non-group requests never persist a
  // title.
  const effectiveTitle = params.isGroup ? params.title : null;

  // One relationship, one thread: if these exact people already have a live
  // conversation, reuse it rather than opening a second one beside it.
  const existing = await findConversationByExactRoster(admin, uniqueMembers);
  if (existing) return { conversationId: existing, existing: true };

  const { data: convo, error: convoError } = await admin
    .from("conversations")
    .insert({
      is_group: params.isGroup,
      title: effectiveTitle,
      created_by: params.creatorId,
    })
    .select("id")
    .single();

  if (convoError || !convo) return { error: convoError?.message ?? "Could not create conversation." };

  const rows = uniqueMembers.map((user_id) => ({ conversation_id: convo.id as string, user_id }));
  const { error: partError } = await admin.from("conversation_participants").insert(rows);
  if (partError) {
    await admin.from("conversations").delete().eq("id", convo.id);
    return { error: partError.message };
  }

  return { conversationId: convo.id as string, existing: false };
}

// The live conversation whose roster is exactly these people, or null.
//
// Any roster size, and the chat's name is irrelevant: a named chat and an
// unnamed chat holding the same people are the same relationship, and letting
// one hide from the other is precisely how duplicate threads appear. Pass
// `excludeId` when re-checking a conversation that is itself being edited, so
// it doesn't match itself.
//
// Archived chats are excluded: otherwise deleting a chat would permanently trap
// those people, since every later attempt to start one would dedupe into the
// deleted — and now unreachable — thread.
async function findConversationByExactRoster(
  admin: AdminClient,
  memberIds: string[],
  excludeId?: string,
): Promise<string | null> {
  const target = [...new Set(memberIds)];
  if (target.length === 0) return null;

  // Any matching conversation must contain the first member, so their
  // memberships are the whole candidate set.
  const { data: seeded } = await admin
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", target[0]);
  const candidateIds = [...new Set((seeded ?? []).map((r) => r.conversation_id as string))].filter(
    (id) => id !== excludeId,
  );
  if (candidateIds.length === 0) return null;

  const { data: live } = await admin
    .from("conversations")
    .select("id")
    .in("id", candidateIds)
    .is("archived_at", null);
  const liveIds = (live ?? []).map((r) => r.id as string);
  if (liveIds.length === 0) return null;

  const { data: parts } = await admin
    .from("conversation_participants")
    .select("conversation_id, user_id")
    .in("conversation_id", liveIds);

  const rosterByConvo = new Map<string, string[]>();
  for (const p of parts ?? []) {
    const cid = p.conversation_id as string;
    const roster = rosterByConvo.get(cid) ?? [];
    roster.push(p.user_id as string);
    rosterByConvo.set(cid, roster);
  }

  const wanted = rosterKey(target);
  for (const [cid, roster] of rosterByConvo) {
    if (rosterKey(roster) === wanted) return cid;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Admin conversation management. A conversation is N participants and an
// optional name; whether it renders as a group or a DM is derived from roster
// size (see conversation-shape.ts), not stored. The admin creates conversations
// and manages their membership but is NOT added as a participant (they are not
// in the chat). teacher_student_assignments are DERIVED from membership so the
// booking/availability engine keeps working.
// ---------------------------------------------------------------------------

async function memberRoles(admin: AdminClient, memberIds: string[]): Promise<MemberRole[]> {
  if (memberIds.length === 0) return [];
  const { data } = await admin.from("profiles").select("id, role").in("id", memberIds);
  return (data ?? []).map((p) => ({ id: p.id as string, role: p.role as string }));
}

// Ensure an active teacher_student_assignments row exists for each pair. Existing
// active rows are left alone; inactive rows are reactivated; missing rows created.
async function ensureAssignments(admin: AdminClient, members: MemberRole[]): Promise<void> {
  const pairs = derivePairs(members);
  for (const { teacherId, studentId } of pairs) {
    const { data: existing } = await admin
      .from("teacher_student_assignments")
      .select("id, is_active")
      .eq("teacher_id", teacherId)
      .eq("student_id", studentId)
      .maybeSingle();

    if (!existing) {
      await admin.from("teacher_student_assignments").insert({ teacher_id: teacherId, student_id: studentId });
    } else if (!existing.is_active) {
      await admin.from("teacher_student_assignments").update({ is_active: true }).eq("id", existing.id);
    }
  }
}

export async function createAdminConversation(params: {
  creatorId: string;
  memberIds: string[];
  title: string | null;
}): Promise<{ conversationId: string; existing: boolean } | { error: string }> {
  const admin = createAdminClient();
  const uniqueMembers = [...new Set(params.memberIds)].filter((id) => id !== params.creatorId);
  if (!hasMinimumRoster(uniqueMembers.length)) {
    return { error: "A conversation needs at least two people." };
  }

  const cleanTitle = params.title?.trim() ? params.title.trim().slice(0, 80) : null;

  // "New chat" for people who already have one hands back the chat they have.
  // The name the admin typed is not part of the match: two threads holding the
  // same people are one relationship however they're labelled.
  const existing = await findConversationByExactRoster(admin, uniqueMembers);
  if (existing) return { conversationId: existing, existing: true };

  const { data: convo, error: convoError } = await admin
    .from("conversations")
    .insert({ is_group: isGroupConversation(uniqueMembers.length), title: cleanTitle, created_by: params.creatorId })
    .select("id")
    .single();
  if (convoError || !convo) return { error: convoError?.message ?? "Could not create conversation." };

  const rows = uniqueMembers.map((user_id) => ({ conversation_id: convo.id as string, user_id }));
  const { error: partError } = await admin.from("conversation_participants").insert(rows);
  if (partError) {
    await admin.from("conversations").delete().eq("id", convo.id);
    return { error: partError.message };
  }

  await ensureAssignments(admin, await memberRoles(admin, uniqueMembers));
  return { conversationId: convo.id as string, existing: false };
}

export async function renameConversation(id: string, title: string | null): Promise<{ error?: string }> {
  const admin = createAdminClient();
  const cleanTitle = title?.trim() ? title.trim().slice(0, 80) : null;
  const { error } = await admin.from("conversations").update({ title: cleanTitle }).eq("id", id);
  return error ? { error: error.message } : {};
}

export async function archiveConversation(id: string): Promise<{ error?: string }> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("conversations")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  return error ? { error: error.message } : {};
}

// Replace a conversation's participants with the given set. Added teacher x
// student pairs get derived assignment rows; removals leave assignments intact
// (a past pairing may still own sessions/history).
export async function updateConversationMembers(
  id: string,
  memberIds: string[],
): Promise<{ error?: string }> {
  const admin = createAdminClient();
  const target = [...new Set(memberIds)];
  if (!hasMinimumRoster(target.length)) {
    return { error: "A conversation needs at least two people." };
  }

  // The roster editor is the other route to a duplicate: editing this chat's
  // members into another live chat's exact roster would leave the same people
  // holding two threads, which creation now refuses to produce.
  const clash = await findConversationByExactRoster(admin, target, id);
  if (clash) {
    return { error: "Another chat already has exactly these people." };
  }

  const { data: current } = await admin
    .from("conversation_participants")
    .select("user_id")
    .eq("conversation_id", id);
  const currentIds = new Set((current ?? []).map((r) => r.user_id as string));
  const targetSet = new Set(target);

  const toAdd = target.filter((uid) => !currentIds.has(uid));
  const toRemove = [...currentIds].filter((uid) => !targetSet.has(uid));

  if (toAdd.length) {
    const { error } = await admin
      .from("conversation_participants")
      .insert(toAdd.map((user_id) => ({ conversation_id: id, user_id })));
    if (error) return { error: error.message };
  }
  if (toRemove.length) {
    const { error } = await admin
      .from("conversation_participants")
      .delete()
      .eq("conversation_id", id)
      .in("user_id", toRemove);
    if (error) return { error: error.message };
  }

  // Re-derive assignments across the full new roster.
  await ensureAssignments(admin, await memberRoles(admin, target));
  return {};
}

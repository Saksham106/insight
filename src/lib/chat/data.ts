import { createAdminClient } from "@/lib/supabase/admin";
import type { ChatMember, ChattableContact, ConversationSummary } from "@/lib/chat-types";
import { derivePairs, type MemberRole } from "@/lib/chat/group-derive";

interface Profile {
  id: string;
  role: string;
}

function otherMembersTitle(members: ChatMember[], selfId: string): string {
  const others = members.filter((m) => m.id !== selfId);
  if (others.length === 0) return "You";
  return others.map((m) => m.full_name).join(", ");
}

function allMembersTitle(members: ChatMember[]): string {
  if (members.length === 0) return "Group";
  return members.map((m) => m.full_name).join(", ");
}

type AdminClient = ReturnType<typeof createAdminClient>;

// Hydrate a set of conversation ids into list-ready summaries: member roster,
// last message, resolved display title, sorted by newest activity. When
// viewerId is provided titles are resolved relative to that viewer ("You" is
// hidden); when null (admin viewing everyone) the full roster is used.
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
    const isGroup = Boolean(c.is_group);
    const groupName = (c.title as string | null)?.trim();
    const title =
      viewerId === null
        ? groupName || allMembersTitle(members)
        : isGroup
          ? groupName || otherMembersTitle(members, viewerId) || "Group"
          : otherMembersTitle(members, viewerId);
    const lastMessage = lastByConvo.get(c.id as string) ?? null;
    return {
      id: c.id as string,
      isGroup,
      title,
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

// Admin-only: every group (regardless of admin membership), for the Groups page.
export async function getAllGroupsForAdmin(): Promise<ConversationSummary[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("conversations")
    .select("id")
    .eq("is_group", true)
    .is("archived_at", null);
  const ids = (data ?? []).map((r) => r.id as string);
  return hydrateSummaries(admin, ids, null);
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

// Create a conversation with the given members (creator always included). Returns
// the new conversation id, or an existing 1:1 conversation id if one already
// exists between exactly these two people.
export async function createConversation(params: {
  creatorId: string;
  memberIds: string[];
  isGroup: boolean;
  title: string | null;
}): Promise<{ conversationId: string } | { error: string }> {
  const admin = createAdminClient();

  const uniqueMembers = [...new Set([params.creatorId, ...params.memberIds])];
  if (uniqueMembers.length < 2) return { error: "A conversation needs at least one other person." };

  // For a 1:1, reuse any existing conversation between exactly these two people
  // so we never create duplicate DM threads.
  if (!params.isGroup && uniqueMembers.length === 2) {
    const existing = await findExistingDirectConversation(uniqueMembers[0], uniqueMembers[1]);
    if (existing) return { conversationId: existing };
  }

  const { data: convo, error: convoError } = await admin
    .from("conversations")
    .insert({
      is_group: params.isGroup,
      title: params.isGroup ? params.title : null,
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

  return { conversationId: convo.id as string };
}

async function findExistingDirectConversation(a: string, b: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data: aConvos } = await admin.from("conversation_participants").select("conversation_id").eq("user_id", a);
  const aIds = (aConvos ?? []).map((r) => r.conversation_id as string);
  if (aIds.length === 0) return null;

  const { data: shared } = await admin
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", b)
    .in("conversation_id", aIds);
  const sharedIds = (shared ?? []).map((r) => r.conversation_id as string);
  if (sharedIds.length === 0) return null;

  // Of the shared conversations, find one that is a non-group with exactly 2 members.
  const { data: convos } = await admin
    .from("conversations")
    .select("id, is_group")
    .in("id", sharedIds)
    .eq("is_group", false);

  for (const c of convos ?? []) {
    const { count } = await admin
      .from("conversation_participants")
      .select("*", { count: "exact", head: true })
      .eq("conversation_id", c.id as string);
    if (count === 2) return c.id as string;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Admin group management. A group is the admin-facing unit; teaching
// relationships (teacher_student_assignments) are DERIVED from membership so the
// booking/availability engine keeps working. The admin is the group's creator
// but is NOT added as a participant (they are not in the chat).
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

export async function createAdminGroup(params: {
  creatorId: string;
  memberIds: string[];
  title: string | null;
}): Promise<{ conversationId: string } | { error: string }> {
  const admin = createAdminClient();
  const uniqueMembers = [...new Set(params.memberIds)].filter((id) => id !== params.creatorId);
  if (uniqueMembers.length < 1) return { error: "Add at least one person to the group." };

  const cleanTitle = params.title?.trim() ? params.title.trim().slice(0, 80) : null;

  const { data: convo, error: convoError } = await admin
    .from("conversations")
    .insert({ is_group: true, title: cleanTitle, created_by: params.creatorId })
    .select("id")
    .single();
  if (convoError || !convo) return { error: convoError?.message ?? "Could not create group." };

  const rows = uniqueMembers.map((user_id) => ({ conversation_id: convo.id as string, user_id }));
  const { error: partError } = await admin.from("conversation_participants").insert(rows);
  if (partError) {
    await admin.from("conversations").delete().eq("id", convo.id);
    return { error: partError.message };
  }

  await ensureAssignments(admin, await memberRoles(admin, uniqueMembers));
  return { conversationId: convo.id as string };
}

export async function renameGroup(id: string, title: string | null): Promise<{ error?: string }> {
  const admin = createAdminClient();
  const cleanTitle = title?.trim() ? title.trim().slice(0, 80) : null;
  const { error } = await admin.from("conversations").update({ title: cleanTitle }).eq("id", id);
  return error ? { error: error.message } : {};
}

export async function archiveGroup(id: string): Promise<{ error?: string }> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("conversations")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  return error ? { error: error.message } : {};
}

// Replace a group's participants with the given set. Added teacher x student
// pairs get derived assignment rows; removals leave assignments intact (a past
// pairing may still own sessions/history).
export async function updateGroupMembers(
  id: string,
  memberIds: string[],
): Promise<{ error?: string }> {
  const admin = createAdminClient();
  const target = [...new Set(memberIds)];
  if (target.length < 1) return { error: "A group needs at least one person." };

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

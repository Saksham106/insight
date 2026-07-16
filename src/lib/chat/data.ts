import { createAdminClient } from "@/lib/supabase/admin";
import type { ChatMember, ChattableContact, ConversationSummary } from "@/lib/chat-types";

interface Profile {
  id: string;
  role: string;
}

function otherMembersTitle(members: ChatMember[], selfId: string): string {
  const others = members.filter((m) => m.id !== selfId);
  if (others.length === 0) return "You";
  return others.map((m) => m.full_name).join(", ");
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
  if (ids.length === 0) return [];

  const [{ data: convos }, { data: parts }, { data: msgs }] = await Promise.all([
    admin.from("conversations").select("id, is_group, title, created_at, updated_at").in("id", ids),
    admin.from("conversation_participants").select("conversation_id, user_id").in("conversation_id", ids),
    admin
      .from("messages")
      .select("conversation_id, body, file_name, created_at, sender_id")
      .in("conversation_id", ids)
      .order("created_at", { ascending: false }),
  ]);

  // Resolve member profiles in one query.
  const memberIds = [...new Set((parts ?? []).map((p) => p.user_id as string))];
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, full_name, role")
    .in("id", memberIds);
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

  // First (newest) message seen per conversation.
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
    const title = isGroup
      ? (c.title as string | null)?.trim() || otherMembersTitle(members, userId) || "Group"
      : otherMembersTitle(members, userId);
    const lastMessage = lastByConvo.get(c.id as string) ?? null;
    return {
      id: c.id as string,
      isGroup,
      title,
      members,
      lastMessage,
      updatedAt: (lastMessage?.createdAt ?? (c.updated_at as string) ?? (c.created_at as string)),
    };
  });

  summaries.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return summaries;
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

import { NextResponse } from "next/server";

import { getUserProfile } from "@/lib/auth/get-user-profile";
import { sendPushToUsers } from "@/lib/push-notifications";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

interface AttachmentInput {
  url?: unknown;
  name?: unknown;
  type?: unknown;
}

export async function POST(request: Request) {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = await request.json().catch(() => null);
  const conversationId = typeof payload?.conversationId === "string" ? payload.conversationId : "";
  const text = typeof payload?.body === "string" ? payload.body.trim().slice(0, 5000) : "";
  const rawAttachment = payload?.attachment as AttachmentInput | null | undefined;
  const attachment = rawAttachment &&
    typeof rawAttachment.url === "string" &&
    typeof rawAttachment.name === "string" &&
    typeof rawAttachment.type === "string"
    ? {
        url: rawAttachment.url,
        name: rawAttachment.name.slice(0, 255),
        type: rawAttachment.type.slice(0, 120),
      }
    : null;

  if (!conversationId || (!text && !attachment)) {
    return NextResponse.json({ error: "A message or attachment is required." }, { status: 400 });
  }

  // The authenticated client keeps conversation-membership enforcement in RLS.
  const supabase = await createClient();
  const { data: message, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: profile.id,
      body: text || null,
      ...(attachment
        ? { file_url: attachment.url, file_name: attachment.name, file_type: attachment.type }
        : {}),
    })
    .select("id, body, created_at, sender_id, file_url, file_name, file_type")
    .single();

  if (error || !message) {
    return NextResponse.json({ error: error?.message ?? "Could not send message." }, { status: 403 });
  }

  // Push is best-effort. A push provider failure must never make a successfully
  // stored chat message look failed to its sender.
  const admin = createAdminClient();
  const { data: recipients } = await admin
    .from("conversation_participants")
    .select("user_id, profile:user_id (role, notify_chat_messages)")
    .eq("conversation_id", conversationId)
    .neq("user_id", profile.id);

  const recipientGroups = new Map<string, string[]>();
  for (const recipient of recipients ?? []) {
    const profileRow = Array.isArray(recipient.profile) ? recipient.profile[0] : recipient.profile;
    const role = profileRow?.role;
    if (typeof role !== "string" || profileRow?.notify_chat_messages === false) continue;
    recipientGroups.set(role, [...(recipientGroups.get(role) ?? []), recipient.user_id]);
  }

  const body = text || (attachment ? `Sent ${attachment.name}` : "New message");
  await Promise.all(
    [...recipientGroups.entries()].map(([role, userIds]) =>
      sendPushToUsers(userIds, {
        title: profile.full_name,
        body: body.length > 120 ? `${body.slice(0, 117)}…` : body,
        url: `/${role}/chats?conversation=${conversationId}`,
        tag: `conversation-${conversationId}`,
      }),
    ),
  );

  return NextResponse.json({ message });
}

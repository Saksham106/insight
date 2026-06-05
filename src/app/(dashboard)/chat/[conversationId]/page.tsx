import { notFound } from "next/navigation";

import { ChatWindow, type ChatMessage } from "@/components/chat/chat-window";
import { requireRole } from "@/lib/auth/require-role";
import { createServerClientWithBypass } from "@/lib/supabase/server";

interface ChatPageProps {
  params: Promise<{ conversationId: string }>;
}

export default async function ChatPage({ params }: ChatPageProps) {
  const { conversationId } = await params;
  const profile = await requireRole(["admin", "teacher", "student"]);
  const supabase = await createServerClientWithBypass();

  const { data: conversation } = await supabase
    .from("conversations")
    .select(
      "id, assignment:assignment_id (id, teacher:teacher_id (id, full_name), student:student_id (id, full_name))",
    )
    .eq("id", conversationId)
    .single();

  if (!conversation) {
    notFound();
  }

  const { data: messages } = await supabase
    .from("messages")
    .select("id, body, created_at, sender_id, file_url, file_name, file_type, sender:sender_id (id, full_name)")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  const assignment = Array.isArray(conversation.assignment)
    ? conversation.assignment[0]
    : conversation.assignment;
  const teacher = Array.isArray(assignment?.teacher)
    ? assignment?.teacher[0]
    : assignment?.teacher;
  const student = Array.isArray(assignment?.student)
    ? assignment?.student[0]
    : assignment?.student;

  const teacherName = teacher?.full_name ?? "Teacher";
  const studentName = student?.full_name ?? "Student";

  const title =
    profile.role === "teacher"
      ? `Chat with ${studentName}`
      : profile.role === "student"
        ? `Chat with ${teacherName}`
        : `${teacherName} and ${studentName}`;

  const normalizedMessages = (messages ?? []).map((message) => {
    const sender = Array.isArray(message.sender)
      ? message.sender[0]
      : message.sender;
    return { ...message, sender } as ChatMessage;
  });

  return (
    <ChatWindow
      conversationId={conversation.id}
      currentUserId={profile.id}
      title={title}
      initialMessages={normalizedMessages}
    />
  );
}

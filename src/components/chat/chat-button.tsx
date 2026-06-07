"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ChatDrawer } from "@/components/chat/chat-drawer";

interface ChatButtonProps {
  conversationId: string;
  name: string;
  currentUserId: string;
  readOnly?: boolean;
}

export function ChatButton({ conversationId, name, currentUserId, readOnly }: ChatButtonProps) {
  const [open, setOpen] = useState(false);
  const contacts = [{ conversationId, name }];

  return (
    <>
      <Button onClick={() => setOpen(true)} style={{ width: "fit-content" }}>
        Open chat
      </Button>
      {open && (
        <ChatDrawer
          contacts={contacts}
          initialConversationId={conversationId}
          currentUserId={currentUserId}
          readOnly={readOnly}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

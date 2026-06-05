"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ChatDrawer } from "@/components/chat/chat-drawer";

interface ChatButtonProps {
  conversationId: string;
  currentUserId: string;
  title: string;
  readOnly?: boolean;
}

export function ChatButton({ conversationId, currentUserId, title, readOnly }: ChatButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)} style={{ width: "fit-content" }}>
        Open chat
      </Button>
      {open && (
        <ChatDrawer
          conversationId={conversationId}
          currentUserId={currentUserId}
          title={title}
          readOnly={readOnly}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

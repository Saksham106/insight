"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { containsContactInfo } from "@/lib/validators/contact-info";

interface MessageInputProps {
  onSend: (message: string) => Promise<string | null>;
  disabled?: boolean;
}

export function MessageInput({ onSend, disabled }: MessageInputProps) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const trimmed = message.trim();
    if (!trimmed) {
      return;
    }

    if (containsContactInfo(trimmed)) {
      setError(
        "For privacy and safety, please keep communication inside the platform and do not share contact details.",
      );
      return;
    }

    setSending(true);
    const sendError = await onSend(trimmed);
    setSending(false);

    if (sendError) {
      setError(sendError);
      return;
    }

    setMessage("");
  };

  return (
    <form className="space-y-2" onSubmit={handleSubmit}>
      <Textarea
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        placeholder="Write a message..."
        className="min-h-[96px]"
        disabled={disabled || sending}
      />
      {error ? <p className="text-sm text-error">{error}</p> : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={disabled || sending}>
          {sending ? "Sending..." : "Send"}
        </Button>
      </div>
    </form>
  );
}

import { cn } from "@/lib/utils";

interface Message {
  id: string;
  body: string;
  created_at: string;
  sender_id: string;
  sender: { id: string; full_name: string } | null;
}

interface MessageListProps {
  messages: Message[];
  currentUserId: string;
}

export function MessageList({ messages, currentUserId }: MessageListProps) {
  return (
    <div className="space-y-3">
      {messages.map((message) => {
        const isMine = message.sender_id === currentUserId;
        return (
          <div
            key={message.id}
            className={cn("flex", isMine ? "justify-end" : "justify-start")}
          >
            <div
              className={cn(
                "max-w-[80%] rounded-lg px-4 py-3 text-sm",
                isMine
                  ? "bg-navy text-white"
                  : "bg-soft text-foreground",
              )}
            >
              <div className="text-xs opacity-80">
                {message.sender?.full_name ?? "User"}
              </div>
              <p className="mt-1 whitespace-pre-wrap">{message.body}</p>
              <div className="mt-2 text-[11px] opacity-70">
                {new Date(message.created_at).toLocaleString()}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

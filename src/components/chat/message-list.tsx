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
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {messages.map((message) => {
        const isMine = message.sender_id === currentUserId;
        return (
          <div
            key={message.id}
            style={{ display: "flex", justifyContent: isMine ? "flex-end" : "flex-start" }}
          >
            <div
              className={cn(
                "max-w-[80%] rounded-lg px-4 py-3 text-sm",
                isMine ? "bg-navy text-white" : "bg-soft text-foreground",
              )}
            >
              <div className="text-xs opacity-80">
                {message.sender?.full_name ?? "User"}
              </div>
              <p className="whitespace-pre-wrap" style={{ marginTop: "4px" }}>
                {message.body}
              </p>
              <div className="text-[11px] opacity-70" style={{ marginTop: "8px" }}>
                {new Date(message.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                {" · "}
                {new Date(message.created_at).toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit", hour12: false })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

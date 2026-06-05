import { FileText } from "lucide-react";

import { cn } from "@/lib/utils";

interface Message {
  id: string;
  body: string | null;
  created_at: string;
  sender_id: string;
  sender: { id: string; full_name: string } | null;
  file_url?: string | null;
  file_name?: string | null;
  file_type?: string | null;
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
        const isImage = message.file_type?.startsWith("image/");
        const hasFile = !!message.file_url;

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

              {/* Image attachment */}
              {hasFile && isImage && (
                <a href={message.file_url!} target="_blank" rel="noopener noreferrer" style={{ display: "block", marginTop: "8px" }}>
                  <img
                    src={message.file_url!}
                    alt={message.file_name ?? "image"}
                    style={{ maxWidth: "220px", maxHeight: "220px", borderRadius: "8px", display: "block", objectFit: "cover" }}
                  />
                </a>
              )}

              {/* Non-image file attachment */}
              {hasFile && !isImage && (
                <a
                  href={message.file_url!}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    marginTop: "8px",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    backgroundColor: isMine ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.06)",
                    textDecoration: "none",
                    color: "inherit",
                    fontSize: "13px",
                    fontWeight: 500,
                  }}
                >
                  <FileText size={16} style={{ flexShrink: 0 }} />
                  <span style={{ wordBreak: "break-all" }}>{message.file_name ?? "File"}</span>
                </a>
              )}

              {/* Text body */}
              {message.body && (
                <p className="whitespace-pre-wrap" style={{ marginTop: hasFile ? "6px" : "4px" }}>
                  {message.body}
                </p>
              )}

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

"use client";

import { FileText } from "lucide-react";

import { useSignedAttachmentUrls } from "@/lib/chat-attachments";
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
  adminView?: boolean;
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function formatDay(d: Date) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(d) === dayKey(today)) return "Today";
  if (dayKey(d) === dayKey(yesterday)) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function formatTime(d: Date) {
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function MessageList({ messages, currentUserId, adminView = false }: MessageListProps) {
  // Signed URLs keep working after the bucket goes private; falls back to the
  // stored URL while resolving.
  const signedUrls = useSignedAttachmentUrls(messages.map((m) => m.file_url));

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {messages.map((msg, i) => {
        const isMine = msg.sender_id === currentUserId;
        const prev = messages[i - 1];
        const next = messages[i + 1];
        const date = new Date(msg.created_at);
        const prevDate = prev ? new Date(prev.created_at) : null;
        const nextDate = next ? new Date(next.created_at) : null;

        const GAP_MS = 5 * 60 * 1000;
        const isNewDay = !prevDate || dayKey(date) !== dayKey(prevDate);
        // Name only repeats when sender actually changes or it's a new day
        const isFirstInGroup = !prev || prev.sender_id !== msg.sender_id || isNewDay;
        // Time shown when sender changes, new day, or 5+ min gap to next message
        const isLastInGroup =
          !next ||
          next.sender_id !== msg.sender_id ||
          !nextDate ||
          dayKey(date) !== dayKey(nextDate) ||
          nextDate.getTime() - date.getTime() > GAP_MS;

        // Same sender but 5+ min gap from previous — add spacing without repeating name
        const isTimeGapFromPrev = !isFirstInGroup && prevDate !== null && date.getTime() - prevDate.getTime() > GAP_MS;

        const isImage = msg.file_type?.startsWith("image/");
        const hasFile = !!msg.file_url;
        const fileHref = msg.file_url ? (signedUrls[msg.file_url] ?? msg.file_url) : null;

        return (
          <div key={msg.id}>
            {/* Day separator */}
            {isNewDay && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  margin: `${i === 0 ? 0 : 20}px 0 16px`,
                }}
              >
                <div style={{ flex: 1, height: "1px", backgroundColor: "var(--color-border)" }} />
                <span className="text-xs text-muted" style={{ fontWeight: 500, whiteSpace: "nowrap" }}>
                  {formatDay(date)}
                </span>
                <div style={{ flex: 1, height: "1px", backgroundColor: "var(--color-border)" }} />
              </div>
            )}

            {/* Extra gap between groups (different sender, same day) */}
            {!isNewDay && isFirstInGroup && i > 0 && (
              <div style={{ height: "16px" }} />
            )}

            {/* Gap between time-split sub-groups (same sender, 5+ min gap) */}
            {isTimeGapFromPrev && (
              <div style={{ height: "10px" }} />
            )}

            {/* Sender name above first bubble in group */}
            {isFirstInGroup && (
              <div
                style={{
                  display: "flex",
                  justifyContent: isMine ? "flex-end" : "flex-start",
                  marginBottom: "4px",
                }}
              >
                <span
                  className="text-xs font-semibold"
                  style={{ color: isMine ? "var(--color-muted)" : "var(--color-navy)" }}
                >
                  {adminView ? (msg.sender?.full_name ?? "User") : isMine ? "You" : (msg.sender?.full_name ?? "User")}
                </span>
              </div>
            )}

            {/* Bubble row */}
            <div
              style={{
                display: "flex",
                justifyContent: isMine ? "flex-end" : "flex-start",
                marginBottom: isLastInGroup ? 0 : "3px",
              }}
            >
              <div
                className={cn(
                  "text-sm",
                  isMine ? "bg-navy text-white" : "bg-soft text-foreground",
                )}
                style={{
                  maxWidth: "75%",
                  padding: hasFile && !msg.body ? "6px" : "8px 14px",
                  borderRadius: "18px",
                }}
              >
                {/* Image attachment */}
                {hasFile && isImage && (
                  <a href={fileHref!} target="_blank" rel="noopener noreferrer" style={{ display: "block" }}>
                    <img
                      src={fileHref!}
                      alt={msg.file_name ?? "image"}
                      loading="lazy"
                      decoding="async"
                      style={{ maxWidth: "220px", maxHeight: "220px", borderRadius: "12px", display: "block", objectFit: "cover" }}
                    />
                  </a>
                )}

                {/* Non-image file */}
                {hasFile && !isImage && (
                  <a
                    href={fileHref!}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "inline-flex", alignItems: "center", gap: "8px",
                      padding: "6px 10px", borderRadius: "8px",
                      backgroundColor: isMine ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.06)",
                      textDecoration: "none", color: "inherit", fontSize: "13px", fontWeight: 500,
                    }}
                  >
                    <FileText size={15} style={{ flexShrink: 0 }} />
                    <span style={{ wordBreak: "break-all" }}>{msg.file_name ?? "File"}</span>
                  </a>
                )}

                {/* Text */}
                {msg.body && (
                  <p className="whitespace-pre-wrap" style={{ marginTop: hasFile ? "6px" : 0, lineHeight: 1.5 }}>
                    {msg.body}
                  </p>
                )}
              </div>
            </div>

            {/* Time — shown once below the last bubble in each group */}
            {isLastInGroup && (
              <div
                style={{
                  display: "flex",
                  justifyContent: isMine ? "flex-end" : "flex-start",
                  marginTop: "3px",
                  marginBottom: "2px",
                }}
              >
                <span className="text-[11px] text-muted" suppressHydrationWarning>
                  {formatTime(date)}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import { Paperclip, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { containsContactInfo } from "@/lib/validators/contact-info";
import { createClient } from "@/lib/supabase/client";

export interface FileAttachment {
  url: string;
  name: string;
  type: string;
}

interface MessageInputProps {
  conversationId: string;
  onSend: (body: string | null, attachment?: FileAttachment | null) => Promise<string | null>;
  disabled?: boolean;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ACCEPTED = ["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"];

export function MessageInput({ conversationId, onSend, disabled }: MessageInputProps) {
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0] ?? null;
    if (!picked) return;
    if (!ACCEPTED.includes(picked.type)) {
      setError("Only PNG, JPG, GIF, WebP, and PDF files are supported.");
      return;
    }
    if (picked.size > MAX_FILE_SIZE) {
      setError("File must be under 10 MB.");
      return;
    }
    setError(null);
    setFile(picked);
    // Reset so same file can be re-selected
    e.target.value = "";
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const trimmed = message.trim();
    if (!trimmed && !file) return;

    if (trimmed && containsContactInfo(trimmed)) {
      setError("For privacy and safety, please keep communication inside the platform and do not share contact details.");
      return;
    }

    setSending(true);

    let attachment: FileAttachment | null = null;

    if (file) {
      const supabase = createClient();
      const path = `${conversationId}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("chat-attachments")
        .upload(path, file);

      if (uploadError) {
        setError("Failed to upload file: " + uploadError.message);
        setSending(false);
        return;
      }

      const { data: { publicUrl } } = supabase.storage
        .from("chat-attachments")
        .getPublicUrl(path);

      attachment = { url: publicUrl, name: file.name, type: file.type };
    }

    const sendError = await onSend(trimmed || null, attachment);
    setSending(false);

    if (sendError) {
      setError(sendError);
      return;
    }

    setMessage("");
    setFile(null);
  };

  const isImage = file?.type.startsWith("image/");

  return (
    <form style={{ display: "flex", flexDirection: "column", gap: "8px" }} onSubmit={handleSubmit}>
      {/* File preview */}
      {file && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 12px",
            borderRadius: "8px",
            border: "1px solid var(--color-border)",
            backgroundColor: "var(--color-background)",
          }}
        >
          {isImage ? (
            <img
              src={URL.createObjectURL(file)}
              alt={file.name}
              style={{ width: "40px", height: "40px", objectFit: "cover", borderRadius: "4px", flexShrink: 0 }}
            />
          ) : (
            <div style={{ width: "40px", height: "40px", borderRadius: "4px", backgroundColor: "var(--color-soft)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--color-navy)" }}>PDF</span>
            </div>
          )}
          <span className="text-sm text-foreground" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {file.name}
          </span>
          <button
            type="button"
            onClick={() => setFile(null)}
            style={{ background: "none", border: "none", cursor: "pointer", padding: "2px", color: "var(--color-muted)", flexShrink: 0 }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      <Textarea
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
        placeholder="Write a message…"
        style={{ minHeight: "96px", resize: "none" }}
        disabled={disabled || sending}
      />

      {error && <p className="text-sm text-error">{error}</p>}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {/* Attach button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || sending}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "6px",
            color: "var(--color-muted)",
            display: "flex",
            alignItems: "center",
          }}
          title="Attach file"
        >
          <Paperclip size={18} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".png,.jpg,.jpeg,.gif,.webp,.pdf"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />

        <Button type="submit" disabled={disabled || sending || (!message.trim() && !file)}>
          {sending ? "Sending…" : "Send"}
        </Button>
      </div>
    </form>
  );
}

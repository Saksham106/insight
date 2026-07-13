"use client";

import { useRef, useState } from "react";
import { Paperclip, Send, X } from "lucide-react";

import { compressImage } from "@/lib/chat-attachments";
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

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED = ["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"];

export function MessageInput({ conversationId, onSend, disabled }: MessageInputProps) {
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canSend = message.trim().length > 0 || !!file;

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 120) + "px";
    }
  };

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
    e.target.value = "";
  };

  const handleSubmit = async () => {
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
      // Downscale large images before they cross the network; PDFs/GIFs pass through
      const upload = await compressImage(file);
      const path = `${conversationId}/${Date.now()}_${upload.name}`;
      const { error: uploadError } = await supabase.storage.from("chat-attachments").upload(path, upload);
      if (uploadError) {
        setError("Failed to upload file: " + uploadError.message);
        setSending(false);
        return;
      }
      const { data: { publicUrl } } = supabase.storage.from("chat-attachments").getPublicUrl(path);
      attachment = { url: publicUrl, name: upload.name, type: upload.type };
    }

    const sendError = await onSend(trimmed || null, attachment);
    setSending(false);

    if (sendError) {
      setError(sendError);
      return;
    }

    setMessage("");
    setFile(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const isImage = file?.type.startsWith("image/");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {/* File preview */}
      {file && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", borderRadius: "12px", border: "1px solid var(--color-border)", backgroundColor: "var(--color-background)" }}>
          {isImage ? (
            <img src={URL.createObjectURL(file)} alt={file.name} style={{ width: "40px", height: "40px", objectFit: "cover", borderRadius: "4px", flexShrink: 0 }} />
          ) : (
            <div style={{ width: "40px", height: "40px", borderRadius: "4px", backgroundColor: "var(--color-soft)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--color-navy)" }}>PDF</span>
            </div>
          )}
          <span className="text-sm text-foreground" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</span>
          <button type="button" onClick={() => setFile(null)} style={{ background: "none", border: "none", cursor: "pointer", padding: "2px", color: "var(--color-muted)", flexShrink: 0 }}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* Pill input row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "8px 8px 8px 16px",
          border: "1px solid var(--color-border)",
          borderRadius: "22px",
          backgroundColor: "var(--color-background)",
        }}
      >
        <textarea
          ref={textareaRef}
          value={message}
          onChange={handleTextChange}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSubmit();
            }
          }}
          placeholder="Message…"
          rows={1}
          disabled={disabled || sending}
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            background: "transparent",
            resize: "none",
            fontSize: "16px",
            lineHeight: "24px",
            padding: 0,
            maxHeight: "120px",
            overflowY: "auto",
            color: "var(--color-foreground)",
            fontFamily: "inherit",
          }}
        />

        <div style={{ flexShrink: 0 }}>
          {canSend ? (
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={disabled || sending}
              style={{
                width: "34px",
                height: "34px",
                borderRadius: "50%",
                border: "none",
                padding: 0,
                lineHeight: 0,
                backgroundColor: "var(--color-navy)",
                color: "#fff",
                cursor: disabled || sending ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: sending ? 0.6 : 1,
              }}
            >
              <Send size={15} style={{ transform: "translate(-1px, 1px)" }} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || sending}
              style={{
                width: "34px",
                height: "34px",
                borderRadius: "50%",
                border: "none",
                background: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--color-muted)",
              }}
            >
              <Paperclip size={19} />
            </button>
          )}
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept=".png,.jpg,.jpeg,.gif,.webp,.pdf" style={{ display: "none" }} onChange={handleFileChange} />

      {sending && file && (
        <p className="text-xs text-muted" style={{ paddingLeft: "4px" }}>Uploading {file.name}…</p>
      )}

      {error && <p className="text-sm text-error" style={{ paddingLeft: "4px" }}>{error}</p>}
    </div>
  );
}

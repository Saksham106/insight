"use client";

import { useEffect, useRef, useState } from "react";
import { Mail, Minus, Send, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ProfileRow } from "@/lib/dashboard-data";

type Recipient =
  | { kind: "user"; id: string; name: string; role: "teacher" | "student" }
  | { kind: "email"; email: string };

function recipientKey(r: Recipient) {
  return r.kind === "user" ? `user:${r.id}` : `email:${r.email}`;
}

function recipientLabel(r: Recipient) {
  return r.kind === "user" ? r.name : r.email;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ComposeProps {
  teachers: ProfileRow[];
  students: ProfileRow[];
  onClose: () => void;
}

function ComposePanel({ teachers, students, onClose }: ComposeProps) {
  const [minimized, setMinimized] = useState(false);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [search, setSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [sending, setSending] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const allPeople = [
    ...teachers.map(t => ({ kind: "user" as const, id: t.id, name: t.full_name, role: "teacher" as const })),
    ...students.map(s => ({ kind: "user" as const, id: s.id, name: s.full_name, role: "student" as const })),
  ];

  const selectedKeys = new Set(recipients.map(recipientKey));
  const filtered = allPeople.filter(
    p =>
      !selectedKeys.has(recipientKey(p)) &&
      p.name.toLowerCase().includes(search.toLowerCase()),
  );

  const addRecipient = (r: Recipient) => {
    if (selectedKeys.has(recipientKey(r))) return;
    setRecipients(prev => [...prev, r]);
    setSearch("");
    setShowDropdown(false);
    searchRef.current?.focus();
  };

  const tryAddEmail = () => {
    const val = search.trim();
    if (!EMAIL_RE.test(val)) return;
    addRecipient({ kind: "email", email: val });
  };

  const removeRecipient = (key: string) => {
    setRecipients(prev => prev.filter(r => recipientKey(r) !== key));
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "Tab" || e.key === ",") {
      e.preventDefault();
      tryAddEmail();
    }
  };

  const canSend = recipients.length > 0 && subject.trim() && message.trim();

  const handleSend = async () => {
    if (!canSend || sending) return;
    // Commit any typed email still in the input before sending
    tryAddEmail();
    setSending(true);
    setStatus(null);

    const userIds = recipients.filter(r => r.kind === "user").map(r => (r as { kind: "user"; id: string }).id);
    const rawEmails = recipients.filter(r => r.kind === "email").map(r => (r as { kind: "email"; email: string }).email);

    try {
      const res = await fetch("/api/admin/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds, rawEmails, subject: subject.trim(), message: message.trim() }),
      });

      const data = await res.json();
      if (res.ok) {
        setStatus({ type: "success", text: `Sent to ${data.sent} recipient${data.sent !== 1 ? "s" : ""}` });
        setTimeout(onClose, 1800);
      } else {
        setStatus({ type: "error", text: data.error ?? "Failed to send." });
      }
    } catch {
      setStatus({ type: "error", text: "Network error. Please try again." });
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        right: "24px",
        width: "500px",
        backgroundColor: "var(--color-surface)",
        borderRadius: "12px 12px 0 0",
        boxShadow: "0 -2px 16px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.08)",
        zIndex: 200,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        onClick={() => setMinimized(m => !m)}
        style={{
          backgroundColor: "var(--color-navy)",
          padding: "10px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <span style={{ color: "#fff", fontSize: "14px", fontWeight: 600, letterSpacing: "-0.01em" }}>
          New message
        </span>
        <div
          style={{ display: "flex", gap: "4px", alignItems: "center" }}
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={() => setMinimized(m => !m)}
            aria-label="Minimize"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "rgba(255,255,255,0.75)",
              padding: "4px 6px",
              borderRadius: "4px",
              lineHeight: 1,
              display: "flex",
              alignItems: "center",
            }}
          >
            <Minus size={14} />
          </button>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "rgba(255,255,255,0.75)",
              padding: "4px 6px",
              borderRadius: "4px",
              lineHeight: 1,
              display: "flex",
              alignItems: "center",
            }}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {!minimized && (
        <>
          {/* To field */}
          <div
            ref={dropdownRef}
            style={{ position: "relative", borderBottom: "1px solid var(--color-border)" }}
          >
            <div
              onClick={() => { searchRef.current?.focus(); setShowDropdown(true); }}
              style={{
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "4px",
                padding: "8px 14px",
                minHeight: "44px",
                cursor: "text",
              }}
            >
              <span
                style={{
                  fontSize: "13px",
                  color: "var(--color-muted)",
                  marginRight: "4px",
                  flexShrink: 0,
                  fontWeight: 500,
                }}
              >
                To
              </span>

              {recipients.map(r => {
                const key = recipientKey(r);
                return (
                  <span
                    key={key}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      backgroundColor: "rgba(27,53,96,0.1)",
                      color: "var(--color-navy)",
                      borderRadius: "4px",
                      padding: "2px 6px 2px 8px",
                      fontSize: "13px",
                      fontWeight: 500,
                    }}
                  >
                    {recipientLabel(r)}
                    <button
                      onClick={e => { e.stopPropagation(); removeRecipient(key); }}
                      aria-label={`Remove ${recipientLabel(r)}`}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: 0,
                        color: "var(--color-muted)",
                        lineHeight: 1,
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      <X size={12} />
                    </button>
                  </span>
                );
              })}

              <input
                ref={searchRef}
                value={search}
                onChange={e => { setSearch(e.target.value); setShowDropdown(true); }}
                onFocus={() => setShowDropdown(true)}
                onKeyDown={handleSearchKeyDown}
                onBlur={tryAddEmail}
                placeholder={recipients.length === 0 ? "Name or email address..." : ""}
                style={{
                  border: "none",
                  outline: "none",
                  fontSize: "13px",
                  flex: 1,
                  minWidth: "100px",
                  background: "transparent",
                  color: "var(--color-foreground)",
                }}
              />
            </div>

            {showDropdown && filtered.length > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,
                  backgroundColor: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderTop: "none",
                  borderRadius: "0 0 8px 8px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                  zIndex: 10,
                  maxHeight: "200px",
                  overflowY: "auto",
                }}
              >
                {filtered.map(p => (
                  <button
                    key={p.id}
                    onMouseDown={() => addRecipient(p)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "9px 14px",
                      border: "none",
                      background: "none",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      fontSize: "13px",
                    }}
                  >
                    <span style={{ color: "var(--color-navy)", fontWeight: 500 }}>{p.name}</span>
                    <span
                      style={{
                        color: "var(--color-muted)",
                        fontSize: "11px",
                        textTransform: "capitalize",
                        backgroundColor: "var(--color-border)",
                        padding: "2px 6px",
                        borderRadius: "4px",
                      }}
                    >
                      {p.role}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Subject */}
          <div style={{ borderBottom: "1px solid var(--color-border)", padding: "0 14px" }}>
            <input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Subject"
              style={{
                width: "100%",
                border: "none",
                outline: "none",
                fontSize: "13px",
                padding: "10px 0",
                background: "transparent",
                color: "var(--color-foreground)",
              }}
            />
          </div>

          {/* Message body */}
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Write your message..."
            style={{
              border: "none",
              outline: "none",
              resize: "none",
              fontSize: "13px",
              padding: "12px 14px",
              minHeight: "240px",
              background: "transparent",
              fontFamily: "inherit",
              lineHeight: 1.65,
              color: "var(--color-foreground)",
            }}
          />

          {/* Footer */}
          <div
            style={{
              padding: "10px 14px",
              borderTop: "1px solid var(--color-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
            }}
          >
            <Button
              onClick={handleSend}
              disabled={sending || !canSend}
              style={{ display: "flex", alignItems: "center", gap: "6px" }}
            >
              <Send size={13} />
              {sending ? "Sending..." : "Send"}
            </Button>
            {status && (
              <p
                style={{
                  fontSize: "13px",
                  color: status.type === "success" ? "#16a34a" : "#dc2626",
                  margin: 0,
                }}
              >
                {status.text}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

interface ComposeEmailButtonProps {
  teachers: ProfileRow[];
  students: ProfileRow[];
}

export function ComposeEmailButton({ teachers, students }: ComposeEmailButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          padding: "7px 14px",
          borderRadius: "8px",
          border: "1px solid var(--color-border)",
          background: "var(--color-surface)",
          cursor: "pointer",
          fontSize: "13px",
          fontWeight: 500,
          color: "var(--color-navy)",
          boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        }}
      >
        <Mail size={14} />
        Compose
      </button>

      {open && (
        <ComposePanel
          teachers={teachers}
          students={students}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

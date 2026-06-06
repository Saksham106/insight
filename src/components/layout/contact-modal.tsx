"use client";

import { useState } from "react";
import { HelpCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";

const CATEGORIES = ["Bug report", "Question", "Feedback", "Other"];

export function ContactModal() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setCategory(CATEGORIES[0]);
    setMessage("");
    setSent(false);
    setError(null);
  };

  const handleClose = () => {
    setOpen(false);
    reset();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, message }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError((data as { error?: string }).error ?? "Something went wrong. Please try again.");
      return;
    }

    setSent(true);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          bottom: "24px",
          right: "24px",
          zIndex: 40,
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "10px 16px",
          borderRadius: "9999px",
          border: "1px solid var(--color-border)",
          backgroundColor: "var(--color-surface)",
          boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
          cursor: "pointer",
          color: "var(--color-navy)",
          fontSize: "13px",
          fontWeight: 600,
        }}
        aria-label="Help and feedback"
      >
        <HelpCircle size={15} />
        Help
      </button>

      {open && (
        <Modal
          title="Contact us"
          description="Report a bug, ask a question, or share feedback."
          onClose={handleClose}
        >
          {sent ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <p className="text-sm text-foreground">
                Message sent — we&apos;ll get back to you soon.
              </p>
              <Button onClick={handleClose} style={{ width: "fit-content" }}>Close</Button>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              style={{ display: "flex", flexDirection: "column", gap: "16px" }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <Label htmlFor="contact-category">Category</Label>
                <select
                  id="contact-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="rounded-md border border-border bg-background px-3 text-sm text-foreground"
                  style={{ height: "40px", width: "100%" }}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <Label htmlFor="contact-message">Message</Label>
                <Textarea
                  id="contact-message"
                  placeholder="Describe your issue or question..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  required
                />
              </div>
              {error && <p className="text-sm text-error">{error}</p>}
              <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading || !message.trim()}>
                  {loading ? "Sending..." : "Send message"}
                </Button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}

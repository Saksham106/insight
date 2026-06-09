"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";

const CATEGORIES = ["General question", "Program support", "Partnership", "Technical issue", "Other"];

interface LandingContactModalProps {
  buttonLabel?: string;
  buttonStyle?: React.CSSProperties;
  buttonVariant?: ButtonProps["variant"];
}

export function LandingContactModal({
  buttonLabel = "Contact us",
  buttonStyle,
  buttonVariant = "outline",
}: LandingContactModalProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName("");
    setEmail("");
    setCategory(CATEGORIES[0]);
    setMessage("");
    setLoading(false);
    setSent(false);
    setError(null);
  };

  const handleClose = () => {
    setOpen(false);
    reset();
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const response = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, category, message }),
    });

    const data = await response.json().catch(() => ({}));
    setLoading(false);

    if (!response.ok) {
      setError((data as { error?: string }).error ?? "Something went wrong. Please try again.");
      return;
    }

    setSent(true);
  };

  return (
    <>
      <Button size="lg" variant={buttonVariant} style={buttonStyle} onClick={() => setOpen(true)}>
        <MessageCircle size={17} />
        {buttonLabel}
      </Button>

      {open ? (
        <Modal
          title={sent ? "Message sent" : "Contact Insight Academy"}
          description={
            sent
              ? "Thanks for reaching out. We will get back to you soon."
              : "Send us a question, support request, partnership note, or anything else."
          }
          onClose={handleClose}
          showCloseButton={!sent}
          centeredHeader={sent}
        >
          {sent ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", textAlign: "center" }}>
              <Button onClick={handleClose} style={{ width: "fit-content" }}>
                Close
              </Button>
            </div>
          ) : (
            <form noValidate onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div className="form-grid-2">
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <Label htmlFor="contact-name">Name</Label>
                  <Input
                    id="contact-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Your name"
                    maxLength={120}
                    required
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <Label htmlFor="contact-email">Email</Label>
                  <Input
                    id="contact-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    maxLength={254}
                    required
                  />
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <Label htmlFor="contact-category">Topic</Label>
                <select
                  id="contact-category"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className="rounded-md border border-border bg-background px-3 text-sm text-foreground"
                  style={{ height: "40px", width: "100%" }}
                >
                  {CATEGORIES.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <Label htmlFor="contact-message">Message</Label>
                <Textarea
                  id="contact-message"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="How can we help?"
                  rows={4}
                  maxLength={2000}
                  required
                />
              </div>

              {error ? <p className="text-sm text-error">{error}</p> : null}

              <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading || !name.trim() || !email.trim() || !message.trim()}>
                  {loading ? "Sending..." : "Send message"}
                </Button>
              </div>
            </form>
          )}
        </Modal>
      ) : null}
    </>
  );
}

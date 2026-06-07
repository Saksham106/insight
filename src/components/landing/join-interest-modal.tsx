"use client";

import { useState } from "react";
import { MailPlus } from "lucide-react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";

type Role = "student" | "teacher";

interface JoinInterestModalProps {
  buttonLabel?: string;
  buttonStyle?: React.CSSProperties;
  buttonVariant?: ButtonProps["variant"];
}

export function JoinInterestModal({
  buttonLabel = "I'm interested in joining",
  buttonStyle,
  buttonVariant = "default",
}: JoinInterestModalProps) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<Role>("student");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setRole("student");
    setFullName("");
    setEmail("");
    setPhone("");
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

    const response = await fetch("/api/join-interest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, fullName, email, phone, message }),
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
        <MailPlus size={17} />
        {buttonLabel}
      </Button>

      {open ? (
        <Modal
          title={sent ? "You're on the list" : "Join the invite list"}
          description={
            sent
              ? "We'll reach out when an invite is available."
              : "Tell us whether you're joining as a student or teacher, and how we can reach you."
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
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <Label htmlFor="join-role">I am a</Label>
                <select
                  id="join-role"
                  value={role}
                  onChange={(event) => setRole(event.target.value as Role)}
                  className="rounded-md border border-border bg-background px-3 text-sm text-foreground"
                  style={{ height: "40px", width: "100%" }}
                >
                  <option value="student">Student or parent</option>
                  <option value="teacher">Teacher</option>
                </select>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <Label htmlFor="join-name">Name</Label>
                <Input
                  id="join-name"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="Your name"
                  maxLength={120}
                />
              </div>

              <div className="form-grid-2">
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <Label htmlFor="join-email">Email</Label>
                  <Input
                    id="join-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    maxLength={254}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <Label htmlFor="join-phone">Phone</Label>
                  <Input
                    id="join-phone"
                    type="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="(555) 123-4567"
                    maxLength={40}
                  />
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <Label htmlFor="join-message">Note</Label>
                <Textarea
                  id="join-message"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Anything you'd like us to know?"
                  rows={3}
                  maxLength={1000}
                />
              </div>

              <p className="text-sm text-muted" style={{ margin: 0 }}>
                Please include at least one contact method.
              </p>
              {error ? <p className="text-sm text-error">{error}</p> : null}

              <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading || (!email.trim() && !phone.trim())}>
                  {loading ? "Sending..." : "Send request"}
                </Button>
              </div>
            </form>
          )}
        </Modal>
      ) : null}
    </>
  );
}

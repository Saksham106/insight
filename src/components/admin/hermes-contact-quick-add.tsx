"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { HermesContactRole } from "@/lib/hermes/types";

type QuickAddRole = Exclude<HermesContactRole, "unclassified">;

const ROLES: Array<{ value: QuickAddRole; label: string }> = [
  { value: "teacher", label: "Teacher" },
  { value: "student", label: "Student" },
  { value: "parent", label: "Parent" },
  { value: "employee", label: "Employee" },
  { value: "other", label: "Other" },
];

export function HermesContactQuickAdd() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [callingCode, setCallingCode] = useState("");
  const [role, setRole] = useState<QuickAddRole | "">("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);
  const [loading, setLoading] = useState(false);

  async function addContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!displayName.trim() || !phone.trim() || !role || !consent || loading) return;

    setLoading(true);
    setStatus(null);
    setSucceeded(false);

    try {
      const response = await fetch("/api/admin/hermes/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: displayName.trim(),
          phone: phone.trim(),
          defaultCallingCode: callingCode.trim() || undefined,
          role,
          consentAttested: true,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setStatus(data.error ?? "The contact was not added.");
        return;
      }

      setDisplayName("");
      setPhone("");
      setRole("");
      setConsent(false);
      setSucceeded(true);
      setStatus("Contact added successfully.");
      router.refresh();
    } catch {
      setStatus("Could not reach the contact service. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = Boolean(displayName.trim() && phone.trim() && role && consent && !loading);

  return (
    <Card>
      <CardHeader>
        <CardTitle style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <UserPlus size={18} /> Quick add contact
        </CardTitle>
        <CardDescription>Add one WhatsApp contact without uploading a contact file.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={addContact} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div className="form-grid-2" style={{ gap: "12px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <Label htmlFor="hermes-quick-name">Name</Label>
              <Input
                id="hermes-quick-name"
                autoComplete="name"
                placeholder="Student, parent, or tutor name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <Label htmlFor="hermes-quick-phone">WhatsApp number</Label>
              <Input
                id="hermes-quick-phone"
                type="tel"
                autoComplete="tel"
                placeholder="+84 901 234 567"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <Label htmlFor="hermes-quick-code">Default country code for a local number</Label>
              <Input
                id="hermes-quick-code"
                inputMode="numeric"
                placeholder="84"
                value={callingCode}
                onChange={(event) => setCallingCode(event.target.value)}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <Label htmlFor="hermes-quick-role">Role</Label>
              <select
                id="hermes-quick-role"
                className="flex h-10 w-full rounded-md border border-border bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate"
                value={role}
                onChange={(event) => setRole(event.target.value as QuickAddRole | "")}
              >
                <option value="">Choose a role</option>
                {ROLES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </div>
          </div>

          <label className="text-sm" style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            I confirm this contact agreed to receive MyInsightAcademy WhatsApp messages.
          </label>

          <Button type="submit" disabled={!canSubmit}>
            {loading ? "Adding contact…" : "Add contact"}
          </Button>
          {status ? <p aria-live="polite" className={succeeded ? "text-sm text-success" : "text-sm text-error"}>{status}</p> : null}
        </form>
      </CardContent>
    </Card>
  );
}

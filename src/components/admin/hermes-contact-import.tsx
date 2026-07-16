"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { HermesContactRole } from "@/lib/hermes/types";

const ROLES: Array<{ value: Exclude<HermesContactRole, "unclassified">; label: string }> = [
  { value: "teacher", label: "Teacher" },
  { value: "student", label: "Student" },
  { value: "parent", label: "Parent" },
  { value: "employee", label: "Employee" },
  { value: "other", label: "Other" },
];

interface PreviewSuggestion {
  profileId: string;
  fullName: string;
  role: string;
  timezone: string | null;
}

interface PreviewRow {
  sourceIndex: number;
  displayName: string;
  rawPhone: string;
  normalizedPhone: string | null;
  existingContactId: string | null;
  suggestions: PreviewSuggestion[];
  error: string | null;
}

interface PreviewResponse {
  rows: PreviewRow[];
  previewToken: string;
  summary: { total: number; ready: number; errors: number; existing: number; suggestedMatches: number };
  error?: string;
}

interface Choice {
  role: HermesContactRole;
  profileId: string | null;
}

export function HermesContactImport() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [callingCode, setCallingCode] = useState("");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [choices, setChoices] = useState<Record<number, Choice>>({});
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function previewContacts() {
    if (!file) return;
    setLoading(true);
    setStatus(null);
    const form = new FormData();
    form.set("file", file);
    if (callingCode.trim()) form.set("defaultCallingCode", callingCode.trim());
    const response = await fetch("/api/admin/hermes/import/preview", { method: "POST", body: form });
    const data = (await response.json()) as PreviewResponse;
    setLoading(false);
    if (!response.ok) {
      setStatus(data.error ?? "Could not read that contact file.");
      return;
    }
    setPreview(data);
    setChoices({});
  }

  function chooseRole(index: number, role: HermesContactRole) {
    setChoices((current) => ({ ...current, [index]: { role, profileId: null } }));
  }

  function chooseProfile(index: number, suggestion: PreviewSuggestion) {
    setChoices((current) => ({ ...current, [index]: { role: suggestion.role as HermesContactRole, profileId: suggestion.profileId } }));
  }

  async function importContacts() {
    if (!preview) return;
    const validRows = preview.rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => !row.error && row.normalizedPhone);
    const unresolved = validRows.filter(({ index }) => !choices[index] || choices[index].role === "unclassified");
    if (unresolved.length > 0) {
      setStatus("Choose a role or confirm an Insight match for every valid contact.");
      return;
    }
    if (!consent) {
      setStatus("Confirm that these contacts agreed to receive MyInsightAcademy WhatsApp messages.");
      return;
    }

    setLoading(true);
    const response = await fetch("/api/admin/hermes/import/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        previewToken: preview.previewToken,
        previewRows: preview.rows,
        consentAttested: true,
        contacts: validRows.map(({ row, index }) => ({
          displayName: row.displayName,
          normalizedPhone: row.normalizedPhone,
          role: choices[index].role,
          profileId: choices[index].profileId,
        })),
      }),
    });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) {
      setStatus(data.error ?? "The contacts were not imported.");
      return;
    }
    setStatus("Contacts imported successfully.");
    setPreview(null);
    setFile(null);
    setConsent(false);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle style={{ display: "flex", gap: "8px", alignItems: "center" }}><Upload size={18} /> Import iPhone contacts</CardTitle>
        <CardDescription>Upload an academy-only .vcf file. Insight keeps names and phone numbers only.</CardDescription>
      </CardHeader>
      <CardContent style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div className="form-grid-2" style={{ gap: "12px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <Label htmlFor="hermes-vcard">Contact list (.vcf)</Label>
            <Input id="hermes-vcard" type="file" accept=".vcf,text/vcard,text/x-vcard" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <Label htmlFor="hermes-calling-code">Default country code for local numbers</Label>
            <Input id="hermes-calling-code" inputMode="numeric" placeholder="84" value={callingCode} onChange={(event) => setCallingCode(event.target.value)} />
          </div>
        </div>
        <Button type="button" onClick={previewContacts} disabled={!file || loading}>{loading ? "Reading contacts…" : "Preview contacts"}</Button>

        {preview ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <p className="text-sm text-muted">{preview.summary.ready} ready · {preview.summary.errors} need correction · {preview.summary.suggestedMatches} possible Insight matches</p>
            {preview.rows.map((row, index) => (
              <div key={`${row.sourceIndex}-${row.rawPhone}`} style={{ border: "1px solid var(--color-border)", borderRadius: "10px", padding: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
                <div><p className="text-sm font-semibold">{row.displayName || "Unnamed contact"}</p><p className="text-sm text-muted">{row.normalizedPhone ?? (row.rawPhone || "No phone number")}</p></div>
                {row.error ? <p className="text-sm text-error">{row.error.replaceAll("_", " ")}</p> : (
                  <>
                    {row.suggestions.map((suggestion) => (
                      <Button key={suggestion.profileId} type="button" size="sm" variant={choices[index]?.profileId === suggestion.profileId ? "default" : "outline"} onClick={() => chooseProfile(index, suggestion)}>
                        Same as {suggestion.fullName} ({suggestion.role})
                      </Button>
                    ))}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                      {ROLES.map((role) => <Button key={role.value} type="button" size="sm" variant={choices[index]?.role === role.value && !choices[index]?.profileId ? "default" : "outline"} onClick={() => chooseRole(index, role.value)}>{role.label}</Button>)}
                    </div>
                  </>
                )}
              </div>
            ))}
            <label className="text-sm" style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
              <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
              I confirm these contacts agreed to receive MyInsightAcademy WhatsApp messages.
            </label>
            <Button type="button" onClick={importContacts} disabled={loading}>{loading ? "Importing…" : "Import contacts"}</Button>
          </div>
        ) : null}
        {status ? <p className={status.includes("successfully") ? "text-sm text-success" : "text-sm text-error"}>{status}</p> : null}
      </CardContent>
    </Card>
  );
}

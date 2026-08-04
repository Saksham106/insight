"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";

import { Disclosure } from "@/components/admin/hermes-dashboard-shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { HermesContactRole } from "@/lib/hermes/types";

type AssignableRole = Exclude<HermesContactRole, "unclassified">;

const ROLES: Array<{ value: AssignableRole; label: string }> = [
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
  status: "new" | "existing" | "removed" | "error";
  existing: { id: string; displayName: string; role: string; deleted: boolean } | null;
  suggestions: PreviewSuggestion[];
  error: string | null;
}

interface PreviewResponse {
  rows: PreviewRow[];
  previewToken: string;
  summary: { total: number; new: number; existing: number; removed: number; errors: number };
  error?: string;
}

interface Choice {
  role: HermesContactRole;
  profileId: string | null;
}

interface RestoredMutedContact {
  contactId: string;
  displayName: string;
  communicationPolicy: string;
}

const rowCard: CSSProperties = {
  border: "1px solid var(--color-border)",
  borderRadius: "10px",
  padding: "12px",
  display: "flex",
  flexDirection: "column",
  gap: "8px",
};

function readable(value: string) {
  return value.replaceAll("_", " ");
}

function joinNames(names: string[]) {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

export function HermesContactImport() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [callingCode, setCallingCode] = useState("");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [choices, setChoices] = useState<Record<number, Choice>>({});
  const [roleChanges, setRoleChanges] = useState<Record<string, AssignableRole>>({});
  const [restoring, setRestoring] = useState<Record<string, AssignableRole | "keep">>({});
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const buckets = useMemo(() => {
    const rows = (preview?.rows ?? []).map((row, index) => ({ row, index }));
    return {
      fresh: rows.filter(({ row }) => row.status === "new"),
      known: rows.filter(({ row }) => row.status === "existing"),
      removed: rows.filter(({ row }) => row.status === "removed"),
      broken: rows.filter(({ row }) => row.status === "error"),
    };
  }, [preview]);

  function reset() {
    setPreview(null);
    setFile(null);
    setChoices({});
    setRoleChanges({});
    setRestoring({});
    setConsent(false);
  }

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
    setRoleChanges({});
    setRestoring({});
  }

  function chooseRole(index: number, role: HermesContactRole) {
    setChoices((current) => ({ ...current, [index]: { role, profileId: null } }));
  }

  function chooseProfile(index: number, suggestion: PreviewSuggestion) {
    setChoices((current) => ({ ...current, [index]: { role: suggestion.role as HermesContactRole, profileId: suggestion.profileId } }));
  }

  const updates = Object.entries(roleChanges).map(([contactId, role]) => ({ contactId, role }));
  const restores = Object.entries(restoring).map(([contactId, role]) => ({
    contactId,
    role: role === "keep" ? null : role,
  }));
  const unresolved = buckets.fresh.filter(({ index }) => !choices[index] || choices[index].role === "unclassified");
  const nothingToDo = buckets.fresh.length === 0 && updates.length === 0 && restores.length === 0;

  const actionLabel = [
    buckets.fresh.length > 0 ? `Import ${buckets.fresh.length}` : null,
    updates.length > 0 ? `update ${updates.length}` : null,
    restores.length > 0 ? `restore ${restores.length}` : null,
  ].filter(Boolean).join(" · ") || "Nothing to import";

  async function importContacts() {
    if (!preview) return;
    if (unresolved.length > 0) {
      setStatus("Choose a role or confirm an Insight match for every new contact.");
      return;
    }
    if (buckets.fresh.length > 0 && !consent) {
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
        consentAttested: buckets.fresh.length > 0,
        contacts: buckets.fresh.map(({ row, index }) => ({
          displayName: row.displayName,
          normalizedPhone: row.normalizedPhone,
          role: choices[index].role,
          profileId: choices[index].profileId,
        })),
        updates,
        restores,
      }),
    });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) {
      setStatus(data.error ?? "The contacts were not imported.");
      return;
    }
    const { created = 0, updated = 0, restored = 0 } = data.result ?? {};
    const restoredMuted = (data.restoredMuted ?? []) as RestoredMutedContact[];
    let message =
      `Done — ${created} added, ${updated} updated, ${restored} restored. ` +
      `${preview.summary.existing - updated} left untouched.`;
    if (restoredMuted.length > 0) {
      const names = joinNames(restoredMuted.map((contact) => contact.displayName));
      const verb = restoredMuted.length === 1 ? "is" : "are";
      message += ` ${names} ${verb} opted out — Kitty will not message them.`;
    }
    setStatus(message);
    reset();
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
            <p className="text-sm text-muted">
              {preview.summary.total} in file · {preview.summary.new} new · {preview.summary.existing} already yours
              {preview.summary.removed > 0 ? ` · ${preview.summary.removed} previously removed` : ""}
              {preview.summary.errors > 0 ? ` · ${preview.summary.errors} need fixing` : ""}
            </p>

            {buckets.fresh.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <p className="text-sm font-semibold text-navy">New contacts ({buckets.fresh.length})</p>
                {buckets.fresh.map(({ row, index }) => (
                  <div key={`${row.sourceIndex}-${row.rawPhone}`} style={rowCard}>
                    <div>
                      <p className="text-sm font-semibold">{row.displayName || "Unnamed contact"}</p>
                      <p className="text-sm text-muted">{row.normalizedPhone ?? (row.rawPhone || "No phone number")}</p>
                    </div>
                    {row.suggestions.map((suggestion) => (
                      <Button key={suggestion.profileId} type="button" size="sm" variant={choices[index]?.profileId === suggestion.profileId ? "default" : "outline"} onClick={() => chooseProfile(index, suggestion)}>
                        Same as {suggestion.fullName} ({suggestion.role})
                      </Button>
                    ))}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                      {ROLES.map((role) => (
                        <Button key={role.value} type="button" size="sm" variant={choices[index]?.role === role.value && !choices[index]?.profileId ? "default" : "outline"} onClick={() => chooseRole(index, role.value)}>
                          {role.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {buckets.known.length > 0 ? (
              <Disclosure bare summary={`Already in your directory (${buckets.known.length})`} hint="left as they are">
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {buckets.known.map(({ row }) => (
                    <div key={row.existing!.id} style={{ ...rowCard, flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ minWidth: 0 }}>
                        <p className="text-sm font-semibold">{row.existing!.displayName}</p>
                        <p className="text-xs text-muted">
                          {row.normalizedPhone} · filed as {readable(row.existing!.role)}
                          {roleChanges[row.existing!.id] ? ` → ${readable(roleChanges[row.existing!.id])}` : ""}
                        </p>
                      </div>
                      <select
                        value={roleChanges[row.existing!.id] ?? ""}
                        aria-label={`Change the role for ${row.existing!.displayName}`}
                        onChange={(event) => {
                          const value = event.target.value;
                          setRoleChanges((current) => {
                            const next = { ...current };
                            if (!value) delete next[row.existing!.id];
                            else next[row.existing!.id] = value as AssignableRole;
                            return next;
                          });
                        }}
                        style={{ height: "32px", borderRadius: "8px", border: "1px solid var(--color-border)", padding: "0 8px" }}
                      >
                        <option value="">Keep {readable(row.existing!.role)}</option>
                        {ROLES.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </Disclosure>
            ) : null}

            {buckets.removed.length > 0 ? (
              <Disclosure bare summary={`Previously removed (${buckets.removed.length})`} hint="ignored unless you restore them">
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {buckets.removed.map(({ row }) => (
                    <div key={row.existing!.id} style={{ ...rowCard, flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ minWidth: 0 }}>
                        <p className="text-sm font-semibold">{row.existing!.displayName}</p>
                        <p className="text-xs text-muted">{row.normalizedPhone} · was {readable(row.existing!.role)}</p>
                      </div>
                      {restoring[row.existing!.id] ? (
                        <Button type="button" size="sm" variant="outline" onClick={() => setRestoring((current) => {
                          const next = { ...current };
                          delete next[row.existing!.id];
                          return next;
                        })}>
                          Cancel restore
                        </Button>
                      ) : (
                        <Button type="button" size="sm" onClick={() => setRestoring((current) => ({ ...current, [row.existing!.id]: "keep" }))}>
                          Restore
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </Disclosure>
            ) : null}

            {buckets.broken.length > 0 ? (
              <Disclosure bare summary={`Needs fixing (${buckets.broken.length})`} hint="skipped by this import">
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {buckets.broken.map(({ row }) => (
                    <div key={`${row.sourceIndex}-${row.rawPhone}`} style={rowCard}>
                      <p className="text-sm font-semibold">{row.displayName || "Unnamed contact"}</p>
                      <p className="text-sm text-muted">{row.rawPhone || "No phone number"}</p>
                      <p className="text-sm text-error">{readable(row.error ?? "")}</p>
                    </div>
                  ))}
                </div>
              </Disclosure>
            ) : null}

            {buckets.fresh.length > 0 ? (
              <label className="text-sm" style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
                I confirm these contacts agreed to receive MyInsightAcademy WhatsApp messages.
              </label>
            ) : null}

            <Button type="button" onClick={importContacts} disabled={loading || nothingToDo}>
              {loading ? "Importing…" : actionLabel}
            </Button>
          </div>
        ) : null}
        {status ? <p className={status.startsWith("Done") ? "text-sm text-success" : "text-sm text-error"}>{status}</p> : null}
      </CardContent>
    </Card>
  );
}

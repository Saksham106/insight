"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMinorCurrency } from "@/lib/format-minor-currency";
import type { FeeStatementAdjustment, FeeStatementBalance } from "@/lib/hermes/fee-statement-adjustments";
import { amountToMinor } from "./fee-statement-adjustment-amount";

type Kind = "extra_fee" | "advance";
type ResponseBody = { adjustments?: FeeStatementAdjustment[]; balance?: FeeStatementBalance; error?: string; code?: string };

function minorDigits(currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).resolvedOptions().maximumFractionDigits ?? 2;
}

export function FeeStatementAdjustmentForm({
  statementId, currency, onSaved, onCancel,
}: {
  statementId: string;
  currency: string;
  onSaved: (adjustments: FeeStatementAdjustment[], balance: FeeStatementBalance) => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<Kind>("extra_fee");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [canonical, setCanonical] = useState<ResponseBody | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const endpoint = `/api/admin/hermes/fee-statements/${encodeURIComponent(statementId)}/adjustments`;

  const loadCanonical = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const response = await fetch(endpoint, { method: "GET", cache: "no-store" });
      const body = await response.json() as ResponseBody;
      if (!response.ok || !body.balance || !body.adjustments) throw new Error(body.error ?? "Could not load the current invoice balance.");
      setCanonical(body);
      setError(null);
      setRequestId(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load the current invoice balance.");
    } finally { setLoading(false); }
  }, [endpoint]);

  useEffect(() => {
    let active = true;
    void fetch(endpoint, { method: "GET", cache: "no-store" }).then(async (response) => {
      const body = await response.json() as ResponseBody;
      if (!response.ok || !body.balance || !body.adjustments) throw new Error(body.error ?? "Could not load the current invoice balance.");
      if (active) { setCanonical(body); setRequestId(null); }
    }).catch((caught: unknown) => {
      if (active) setError(caught instanceof Error ? caught.message : "Could not load the current invoice balance.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [endpoint]);

  const amountMinor = amountToMinor(amount, currency);
  const preview = useMemo(() => {
    if (!canonical?.balance || amountMinor === null || (kind === "advance" && amountMinor > canonical.balance.amountDueMinor)) return null;
    const current = canonical.balance;
    const grossMinor = current.grossMinor + (kind === "extra_fee" ? amountMinor : 0);
    const advancesMinor = current.advancesMinor + (kind === "advance" ? amountMinor : 0);
    return { grossMinor, advancesMinor, amountDueMinor: grossMinor - advancesMinor };
  }, [amountMinor, canonical, kind]);

  function payloadChanged() { setRequestId(null); }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !canonical?.balance || amountMinor === null || !label.trim() || !reference.trim()) return;
    if (kind === "advance" && (!confirmed || amountMinor > canonical.balance.amountDueMinor)) return;
    const stableRequestId = requestId ?? crypto.randomUUID();
    setRequestId(stableRequestId);
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, label: label.trim(), amountMinor, reference: reference.trim(), expectedVersion: canonical.balance.version, clientRequestId: stableRequestId }),
      });
      const body = await response.json() as ResponseBody;
      if (!response.ok) {
        if (body.code === "stale_fee_statement_adjustments") {
          setCanonical(null);
          throw new Error("This invoice changed since you loaded it. Reload the balance before making another adjustment.");
        }
        throw new Error(body.error ?? "Could not save this adjustment.");
      }
      if (!body.adjustments || !body.balance) throw new Error("The saved adjustment could not be verified. Reload the balance before retrying.");
      onSaved(body.adjustments, body.balance);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save this adjustment.");
    } finally { setSaving(false); }
  }

  const advanceTooLarge = kind === "advance" && amountMinor !== null && canonical?.balance && amountMinor > canonical.balance.amountDueMinor;
  return <form onSubmit={(event) => void submit(event)} style={{ display: "grid", gap: "12px", border: "1px solid var(--color-border)", borderRadius: "10px", padding: "14px", background: "var(--color-background)" }}>
    <strong className="text-navy">Add fee / advance</strong>
    {loading ? <p className="text-sm text-muted">Loading current invoice balance…</p> : null}
    <label className="text-xs font-semibold text-navy">Type<select className="border border-border bg-background text-sm text-navy" value={kind} onChange={(e) => { setKind(e.target.value as Kind); payloadChanged(); }} style={{ display: "block", width: "100%", height: 40, marginTop: 5, borderRadius: 8, padding: "0 10px" }}><option value="extra_fee">Extra fee</option><option value="advance">Advance already received</option></select></label>
    <label className="text-xs font-semibold text-navy">Description<Input value={label} maxLength={120} onChange={(e) => { setLabel(e.target.value); payloadChanged(); }} placeholder={kind === "advance" ? "e.g. Bank transfer" : "e.g. Materials"} required /></label>
    <label className="text-xs font-semibold text-navy">Amount ({currency.toUpperCase()})<Input type="number" min="0" step={10 ** -minorDigits(currency)} value={amount} onChange={(e) => { setAmount(e.target.value); payloadChanged(); }} placeholder={minorDigits(currency) === 0 ? "Whole amount" : "0.00"} required /></label>
    <label className="text-xs font-semibold text-navy">{kind === "advance" ? "Receipt / payment reference" : "Internal reference"}<Input value={reference} maxLength={500} onChange={(e) => { setReference(e.target.value); payloadChanged(); }} placeholder="Required to identify this entry" required /></label>
    {kind === "advance" ? <label style={{ display: "flex", gap: 8, alignItems: "start", fontSize: 13 }}><input type="checkbox" checked={confirmed} onChange={(e) => { setConfirmed(e.target.checked); payloadChanged(); }} /><span>I have verified this payment was received. This applies only to this invoice, not an unused balance.</span></label> : null}
    <p className="text-xs text-muted" style={{ margin: 0 }}>Already received — this does not collect money.</p>
    {preview ? <div aria-live="polite" className="text-sm" style={{ display: "grid", gap: 4 }}><p style={{ margin: 0 }}>New total charges: <strong>{formatMinorCurrency(preview.grossMinor, currency)}</strong></p><p style={{ margin: 0 }}>Advance already received: <strong>{formatMinorCurrency(preview.advancesMinor, currency)}</strong></p><p style={{ margin: 0 }}>Amount due: <strong>{formatMinorCurrency(preview.amountDueMinor, currency)}</strong></p></div> : null}
    {advanceTooLarge ? <p role="alert" style={{ color: "var(--color-error)", margin: 0 }}>An advance cannot exceed the current amount due for this invoice.</p> : null}
    {error ? <p role="alert" style={{ color: "var(--color-error)", margin: 0 }}>{error} {error.includes("Reload") ? <Button type="button" size="sm" variant="secondary" onClick={() => void loadCanonical(true)}>Reload balance</Button> : null}</p> : null}
    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button><Button type="submit" disabled={loading || !canonical?.balance || saving || amountMinor === null || !label.trim() || !reference.trim() || (kind === "advance" && (!confirmed || Boolean(advanceTooLarge)))}>{saving ? "Saving…" : "Save adjustment"}</Button></div>
  </form>;
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function HermesApprovalActions({ approvalId }: { approvalId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "approved" | "rejected") {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/admin/hermes/approvals/${approvalId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) setError(result.error ?? "Could not record the decision.");
    else router.refresh();
    setBusy(false);
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
      <Button size="sm" disabled={busy} onClick={() => void decide("approved")}>Approve</Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void decide("rejected")}>Reject</Button>
      {error ? <span className="text-sm text-error">{error}</span> : null}
    </div>
  );
}

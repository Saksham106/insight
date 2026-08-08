"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Clock3 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Disclosure,
  Empty,
  PanelCard,
  formatMessageTime,
} from "@/components/admin/hermes-dashboard-shared";
import type { SchedulingCaseView } from "@/lib/hermes/scheduling";

/** Plain words for a participant's response state. */
const RESPONSE_LABELS: Record<string, string> = {
  pending: "not contacted yet",
  contacted: "asked, no reply yet",
  responded: "replied",
  declined: "declined",
  failed: "could not be reached",
};

function CloseCase({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function close() {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/admin/hermes/cases/${caseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    setBusy(false);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setError(payload.error ?? "Could not close the case.");
      return;
    }
    router.refresh();
  }

  return (
    <Disclosure summary="Close this case" hint="keeps the history">
      <label htmlFor={`close-reason-${caseId}`} className="text-xs text-muted">
        Why is this being closed?
      </label>
      <Input
        id={`close-reason-${caseId}`}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Duplicate of the Tuesday case"
      />
      <div>
        <Button type="button" variant="secondary" size="sm" disabled={busy || reason.trim() === ""} onClick={() => void close()}>
          Close case
        </Button>
      </div>
      <p className="text-xs text-muted">
        The case is marked cancelled and kept, along with its messages and history.
      </p>
      {error ? <span className="text-xs text-error">{error}</span> : null}
    </Disclosure>
  );
}

export function HermesSchedulingPanel({ cases }: { cases: SchedulingCaseView[] }) {
  return (
    <PanelCard
      icon={<Clock3 size={18} />}
      title="Active scheduling"
      description="What is being scheduled, and who it is waiting on"
    >
      {cases.length === 0 ? (
        <Empty>No active scheduling cases.</Empty>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "10px" }}>
          {cases.map((item) => (
            <li
              key={item.id}
              className="border border-border"
              style={{ borderRadius: "10px", padding: "12px 14px", display: "flex", flexDirection: "column", gap: "6px" }}
            >
              <div style={{ display: "flex", gap: "10px", justifyContent: "space-between", alignItems: "start", flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <p className="text-sm font-semibold text-navy">{item.title}</p>
                  {/* The one line the tab exists to show. */}
                  <p className="text-sm">{item.nextAction}</p>
                </div>
                <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                  {item.humanTakeover ? <Badge>takeover</Badge> : null}
                  <time className="text-xs text-muted" dateTime={item.lastUpdatedAt}>
                    {formatMessageTime(item.lastUpdatedAt)}
                  </time>
                </div>
              </div>

              <p className="text-xs text-muted">
                {item.status.replaceAll("_", " ")}
                {item.proposedTimeCount > 0
                  ? ` · ${item.proposedTimeCount} proposed ${item.proposedTimeCount === 1 ? "time" : "times"}`
                  : ""}
              </p>

              {item.participants.length > 0 ? (
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "2px" }}>
                  {item.participants.map((participant) => (
                    <li key={participant.id} className="text-xs text-muted">
                      {participant.name} ({participant.role}) — {RESPONSE_LABELS[participant.responseStatus] ?? participant.responseStatus}
                      {participant.hasAvailability
                        ? ` · ${participant.windowCount} ${participant.windowCount === 1 ? "window" : "windows"}`
                        : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted">No participants on this case.</p>
              )}

              <CloseCase caseId={item.id} />
            </li>
          ))}
        </ul>
      )}
    </PanelCard>
  );
}

"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AvailabilitySlot } from "@/lib/availability/types";

interface BookSessionModalProps {
  assignmentId: string;
  teacherName: string;
  slot: AvailabilitySlot;
  onClose: () => void;
  onBooked: () => void;
}

function formatDuration(minutes: number) {
  return minutes >= 120 && minutes % 60 === 0 ? `${minutes / 60} hours` : `${minutes} min`;
}

export function BookSessionModal({ assignmentId, teacherName, slot, onClose, onBooked }: BookSessionModalProps) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = new Date(slot.starts_at);
  const dateLabel = start.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const timeLabel = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/booking/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assignment_id: assignmentId,
        scheduled_at: slot.starts_at,
        duration_minutes: slot.duration_minutes,
        notes: notes.trim() || null,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) {
        setError(data.error ?? "That time was just booked. Pick another slot.");
      } else {
        setError(data.error ?? "Something went wrong.");
      }
      setLoading(false);
      return;
    }

    router.refresh();
    onBooked();
  };

  return (
    <>
      <div
        style={{ position: "fixed", inset: 0, zIndex: 40, backgroundColor: "rgba(0,0,0,0.35)" }}
        onClick={onClose}
      />
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 50,
          width: "100%",
          maxWidth: "440px",
          borderRadius: "16px",
          border: "1px solid var(--color-border)",
          backgroundColor: "var(--color-surface)",
          padding: "24px",
        }}
        className="shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "20px" }}>
          <div>
            <h3 className="text-base font-semibold text-navy">Confirm session</h3>
            <p className="text-sm text-muted" style={{ marginTop: "2px" }}>{teacherName}</p>
          </div>
          <button
            onClick={onClose}
            style={{ padding: "4px" }}
            className="text-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form style={{ display: "flex", flexDirection: "column", gap: "14px" }} onSubmit={handleSubmit}>
          <div
            className="border border-border bg-background"
            style={{ borderRadius: "10px", padding: "12px 14px", display: "flex", flexDirection: "column", gap: "4px" }}
          >
            <p className="text-sm font-semibold text-navy">{dateLabel}</p>
            <p className="text-sm text-muted" suppressHydrationWarning>
              {timeLabel} · {formatDuration(slot.duration_minutes)}
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <Label>Notes (optional)</Label>
            <Textarea
              placeholder="Topic, chapter, questions you have..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          {error && <p className="text-sm text-error">{error}</p>}

          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "4px" }}>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Booking..." : "Confirm booking"}
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";

export interface Session {
  id: string;
  assignment_id: string;
  scheduled_at: string;
  duration_minutes: number;
  notes: string | null;
  status: "proposed" | "confirmed" | "cancelled";
  proposed_by: string | null;
}

const statusBadge: Record<Session["status"], { variant: "default" | "navy" | "gold"; label: string }> = {
  proposed: { variant: "gold", label: "Pending" },
  confirmed: { variant: "navy", label: "Confirmed" },
  cancelled: { variant: "default", label: "Cancelled" },
};

interface SessionCardProps {
  session: Session;
  currentUserId: string;
  role: "teacher" | "student" | "admin";
}

export function SessionCard({ session, currentUserId, role }: SessionCardProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<"confirm" | "cancel" | null>(null);
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);

  const start = new Date(session.scheduled_at);
  const end = new Date(start.getTime() + session.duration_minutes * 60 * 1000);
  const dateStr = start.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const startTime = start.toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit", hour12: false });
  const endTime = end.toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit", hour12: false });

  const initialDate = [
    start.getFullYear(),
    String(start.getMonth() + 1).padStart(2, "0"),
    String(start.getDate()).padStart(2, "0"),
  ].join("-");
  const initialTime = `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`;

  const [newDate, setNewDate] = useState(initialDate);
  const [newTime, setNewTime] = useState(initialTime);
  const [newDuration, setNewDuration] = useState(String(session.duration_minutes));
  const [newNotes, setNewNotes] = useState(session.notes ?? "");

  const update = async (status: "confirmed" | "cancelled") => {
    const action = status === "confirmed" ? "confirm" : "cancel";
    setLoading(action);
    const supabase = createClient();
    await supabase
      .from("sessions")
      .update({
        status,
        ...(status === "cancelled" ? { cancelled_by: currentUserId } : {}),
      })
      .eq("id", session.id);
    setLoading(null);
    router.refresh();
  };

  const handleReschedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setRescheduleError(null);
    setRescheduleLoading(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("sessions")
      .update({
        scheduled_at: new Date(`${newDate}T${newTime}:00`).toISOString(),
        duration_minutes: parseInt(newDuration),
        notes: newNotes.trim() || null,
        status: "proposed",
        proposed_by: currentUserId,
      })
      .eq("id", session.id);
    if (error) {
      setRescheduleError(error.message);
      setRescheduleLoading(false);
      return;
    }
    setRescheduleLoading(false);
    setShowReschedule(false);
    router.refresh();
  };

  const { variant, label } = statusBadge[session.status];

  return (
    <Card>
      <CardContent className="py-4" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <p className="text-sm font-medium text-navy">{dateStr}</p>
            <p className="text-xs text-muted">
              {startTime} – {endTime} · {session.duration_minutes} min
            </p>
            {session.notes && (
              <p className="text-xs text-foreground">{session.notes}</p>
            )}
          </div>
          <Badge variant={variant}>{label}</Badge>
        </div>

        {/* proposed_by === currentUserId means the current user proposed it (awaiting other party) */}
        {(() => {
          const iAmProposer = session.proposed_by !== null
            ? session.proposed_by === currentUserId
            : role === "teacher"; // null = legacy teacher-proposed

          if (session.status === "proposed") {
            if (iAmProposer) {
              // I proposed it — teacher gets reschedule+cancel, student just gets cancel
              return (
                <div style={{ display: "flex", gap: "8px" }}>
                  {role === "teacher" && (
                    <Button size="sm" variant="outline" style={{ width: "fit-content" }} onClick={() => setShowReschedule((v) => !v)}>
                      {showReschedule ? "Close" : "Reschedule"}
                    </Button>
                  )}
                  <Button size="sm" variant="outline" style={{ width: "fit-content" }} onClick={() => update("cancelled")} disabled={loading !== null}>
                    {loading === "cancel" ? "Cancelling..." : "Cancel"}
                  </Button>
                </div>
              );
            } else {
              // Other party proposed it — show confirm + decline
              return (
                <div style={{ display: "flex", gap: "8px" }}>
                  <Button size="sm" onClick={() => update("confirmed")} disabled={loading !== null}>
                    {loading === "confirm" ? "Confirming..." : "Confirm"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => update("cancelled")} disabled={loading !== null}>
                    {loading === "cancel" ? "Declining..." : "Decline"}
                  </Button>
                </div>
              );
            }
          }

          if (session.status === "confirmed" && role !== "admin") {
            return (
              <div style={{ display: "flex", gap: "8px" }}>
                {role === "teacher" && (
                  <Button size="sm" variant="outline" style={{ width: "fit-content" }} onClick={() => setShowReschedule((v) => !v)}>
                    {showReschedule ? "Close" : "Reschedule"}
                  </Button>
                )}
                <Button size="sm" variant="outline" style={{ width: "fit-content" }} onClick={() => update("cancelled")} disabled={loading !== null}>
                  {loading === "cancel" ? "Cancelling..." : "Cancel session"}
                </Button>
              </div>
            );
          }

          return null;
        })()}

        {/* Reschedule form */}
        {showReschedule && (
          <form
            onSubmit={handleReschedule}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              padding: "16px",
              borderRadius: "12px",
              border: "1px solid var(--color-border)",
              backgroundColor: "var(--color-background)",
            }}
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">
              Propose new time
            </p>
            <div className="form-grid-3">
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <Label>Date</Label>
                <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} required />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <Label>Time</Label>
                <Input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} required />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <Label>Duration</Label>
                <select
                  value={newDuration}
                  onChange={(e) => setNewDuration(e.target.value)}
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                  style={{ width: "100%", height: "40px" }}
                >
                  <option value="30">30 min</option>
                  <option value="45">45 min</option>
                  <option value="60">60 min</option>
                  <option value="90">90 min</option>
                  <option value="120">2 hours</option>
                </select>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <Label>Notes (optional)</Label>
              <Textarea
                placeholder="Topic, chapter, what to bring..."
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                rows={2}
              />
            </div>
            {rescheduleError && <p className="text-sm text-error">{rescheduleError}</p>}
            <p className="text-xs text-muted">
              The student will be asked to re-confirm the new time.
            </p>
            <div style={{ display: "flex", gap: "8px" }}>
              <Button type="submit" size="sm" disabled={rescheduleLoading}>
                {rescheduleLoading ? "Saving..." : "Propose new time"}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setShowReschedule(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

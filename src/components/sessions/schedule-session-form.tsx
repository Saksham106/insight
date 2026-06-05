"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface ScheduleSessionFormProps {
  assignmentId: string;
  studentName: string;
  proposedBy: string;
  onSuccess?: () => void;
}

export function ScheduleSessionForm({ assignmentId, studentName, proposedBy, onSuccess }: ScheduleSessionFormProps) {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("60");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setLoading(true);

    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assignment_id: assignmentId,
        scheduled_at: new Date(`${date}T${time}:00`).toISOString(),
        duration_minutes: parseInt(duration),
        notes: notes.trim() || null,
        proposed_by: proposedBy,
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      setLoading(false);
      return;
    }

    setSuccess(true);
    setDate("");
    setTime("");
    setDuration("60");
    setNotes("");
    setLoading(false);
    router.refresh();
    onSuccess?.();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-navy">
          Schedule session with {studentName}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {success && (
          <p className="text-sm text-emerald-600" style={{ marginBottom: "16px" }}>
            Session proposed — the student will be notified.
          </p>
        )}
        <form style={{ display: "flex", flexDirection: "column", gap: "16px" }} onSubmit={handleSubmit}>
          <div className="form-grid-3">
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <Label htmlFor={`date-${assignmentId}`}>Date</Label>
              <Input
                id={`date-${assignmentId}`}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <Label htmlFor={`time-${assignmentId}`}>Time</Label>
              <Input
                id={`time-${assignmentId}`}
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                required
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <Label htmlFor={`duration-${assignmentId}`}>Duration</Label>
              <select
                id={`duration-${assignmentId}`}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
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
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <Label htmlFor={`notes-${assignmentId}`}>Notes (optional)</Label>
            <Textarea
              id={`notes-${assignmentId}`}
              placeholder="Topic, chapter, what to bring..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
          {error && <p className="text-sm text-error">{error}</p>}
          <Button type="submit" disabled={loading} style={{ width: "fit-content" }}>
            {loading ? "Proposing..." : "Propose session"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

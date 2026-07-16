"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TimePicker } from "@/components/ui/time-picker";

interface AdminScheduleAssignment {
  id: string;
  teacher: { id: string; full_name: string } | null;
  student: { id: string; full_name: string } | null;
}

interface AdminScheduleSessionFormProps {
  assignments: AdminScheduleAssignment[];
}

function todayDateString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function AdminScheduleSessionForm({ assignments }: AdminScheduleSessionFormProps) {
  const router = useRouter();
  const [assignmentId, setAssignmentId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [duration, setDuration] = useState("60");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!assignmentId) {
      setError("Please choose a teacher and student pair.");
      return;
    }

    const scheduledAt = new Date(`${date}T${time}:00`);
    if (scheduledAt <= new Date()) {
      setError("Please choose a date and time in the future.");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assignment_id: assignmentId,
        scheduled_at: scheduledAt.toISOString(),
        duration_minutes: parseInt(duration),
        notes: notes.trim() || null,
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      setLoading(false);
      return;
    }

    setSuccess(true);
    setAssignmentId("");
    setDate("");
    setTime("09:00");
    setDuration("60");
    setNotes("");
    setLoading(false);
    router.refresh();
  };

  if (assignments.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-navy">Schedule a session</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted">
            Create a teacher–student assignment first, then you can schedule sessions for them.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-navy">Schedule a session</CardTitle>
      </CardHeader>
      <CardContent>
        {success && (
          <p className="text-sm text-success" style={{ marginBottom: "16px" }}>
            Session scheduled — teacher and student notified.
          </p>
        )}
        <form style={{ display: "flex", flexDirection: "column", gap: "16px" }} onSubmit={handleSubmit}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <Label htmlFor="admin-schedule-assignment">Teacher &amp; student</Label>
            <select
              id="admin-schedule-assignment"
              value={assignmentId}
              onChange={(e) => setAssignmentId(e.target.value)}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              style={{ width: "100%", height: "40px" }}
              required
            >
              <option value="" disabled>
                Select a pair…
              </option>
              {assignments.map((a) => (
                <option key={a.id} value={a.id}>
                  {(a.teacher?.full_name ?? "Teacher")} → {(a.student?.full_name ?? "Student")}
                </option>
              ))}
            </select>
          </div>
          <div className="form-grid-3">
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <Label htmlFor="admin-schedule-date">Date</Label>
              <Input
                id="admin-schedule-date"
                type="date"
                value={date}
                min={todayDateString()}
                onChange={(e) => setDate(e.target.value)}
                required
                suppressHydrationWarning
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <Label htmlFor="admin-schedule-time">Time</Label>
              <TimePicker id="admin-schedule-time" value={time} onChange={setTime} required />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <Label htmlFor="admin-schedule-duration">Duration</Label>
              <select
                id="admin-schedule-duration"
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
            <Label htmlFor="admin-schedule-notes">Notes (optional)</Label>
            <Textarea
              id="admin-schedule-notes"
              placeholder="Topic, chapter, what to bring..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
          {error && <p className="text-sm text-error">{error}</p>}
          <Button type="submit" disabled={loading} style={{ width: "fit-content" }}>
            {loading ? "Scheduling..." : "Schedule session"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

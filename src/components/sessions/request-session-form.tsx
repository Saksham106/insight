"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";

interface RequestSessionFormProps {
  assignmentId: string;
  studentId: string;
  teacherName: string;
}

function Form({ assignmentId, studentId, onSuccess }: { assignmentId: string; studentId: string; onSuccess: () => void }) {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("60");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setLoading(true);

    const supabase = createClient();
    const { error: insertError } = await supabase.from("sessions").insert({
      assignment_id: assignmentId,
      scheduled_at: new Date(`${date}T${time}:00`).toISOString(),
      duration_minutes: parseInt(duration),
      notes: notes.trim() || null,
      proposed_by: studentId,
    });

    if (insertError) {
      setError(insertError.message);
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
    onSuccess();
  };

  return (
    <form style={{ display: "flex", flexDirection: "column", gap: "16px" }} onSubmit={handleSubmit}>
      {success && (
        <p className="text-sm text-emerald-600">
          Request sent — your teacher will confirm the time.
        </p>
      )}
      <div className="form-grid-3">
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <Label htmlFor="req-date">Date</Label>
          <Input
            id="req-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <Label htmlFor="req-time">Time</Label>
          <Input
            id="req-time"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            required
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <Label htmlFor="req-duration">Duration</Label>
          <select
            id="req-duration"
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
        <Label htmlFor="req-notes">Notes (optional)</Label>
        <Textarea
          id="req-notes"
          placeholder="What you'd like to cover, questions you have..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
        />
      </div>
      {error && <p className="text-sm text-error">{error}</p>}
      <p className="text-xs text-muted">Your teacher will confirm or suggest a different time.</p>
      <Button type="submit" disabled={loading} style={{ width: "fit-content" }}>
        {loading ? "Sending..." : "Send request"}
      </Button>
    </form>
  );
}

export function RequestSessionForm({ assignmentId, studentId, teacherName }: RequestSessionFormProps) {
  const [show, setShow] = useState(false);

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 className="text-lg font-semibold text-navy">Request a session</h2>
        <Button
          size="sm"
          variant={show ? "default" : "outline"}
          onClick={() => setShow((v) => !v)}
          style={{ display: "flex", alignItems: "center", gap: "6px" }}
        >
          {!show && <Plus style={{ height: "14px", width: "14px" }} />}
          {show ? "Close" : "Request a session"}
        </Button>
      </div>
      {show && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-navy">
              Request a session with {teacherName}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Form
              assignmentId={assignmentId}
              studentId={studentId}
              onSuccess={() => setShow(false)}
            />
          </CardContent>
        </Card>
      )}
    </section>
  );
}

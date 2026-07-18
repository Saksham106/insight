"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TimePicker } from "@/components/ui/time-picker";

interface ScheduleAssignment {
  id: string;
  is_active: boolean;
  teacher: { id: string; full_name: string } | null;
  student: { id: string; full_name: string } | null;
}

interface AdminScheduleGroupFormProps {
  assignments: ScheduleAssignment[];
}

interface TeacherGroup {
  teacherId: string;
  teacherName: string;
  students: { id: string; full_name: string }[];
}

function todayDateString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function AdminScheduleGroupForm({ assignments }: AdminScheduleGroupFormProps) {
  const router = useRouter();

  // teacherId -> { teacher, students[] } from active assignments.
  const teachers = useMemo<TeacherGroup[]>(() => {
    const byTeacher = new Map<string, TeacherGroup>();
    for (const a of assignments) {
      if (!a.is_active || !a.teacher || !a.student) continue;
      const existing = byTeacher.get(a.teacher.id);
      const studentEntry = { id: a.student.id, full_name: a.student.full_name };
      if (existing) {
        if (!existing.students.some((s) => s.id === studentEntry.id)) existing.students.push(studentEntry);
      } else {
        byTeacher.set(a.teacher.id, { teacherId: a.teacher.id, teacherName: a.teacher.full_name, students: [studentEntry] });
      }
    }
    const list = [...byTeacher.values()];
    list.forEach((t) => t.students.sort((a, b) => a.full_name.localeCompare(b.full_name)));
    return list.sort((a, b) => a.teacherName.localeCompare(b.teacherName));
  }, [assignments]);

  const [teacherId, setTeacherId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [duration, setDuration] = useState("60");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const activeTeacher = teachers.find((t) => t.teacherId === teacherId) ?? null;
  const students = activeTeacher?.students ?? [];
  const allSelected = students.length > 0 && students.every((s) => selected.has(s.id));

  const chooseTeacher = (id: string) => {
    setTeacherId(id);
    const t = teachers.find((x) => x.teacherId === id);
    // Default to selecting everyone — the common case is a whole group class.
    setSelected(new Set((t?.students ?? []).map((s) => s.id)));
  };

  const toggleStudent = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(students.map((s) => s.id)));

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!teacherId) return setError("Choose a teacher.");
    if (selected.size === 0) return setError("Choose at least one student.");

    const scheduledAt = new Date(`${date}T${time}:00`);
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt <= new Date()) {
      return setError("Choose a date and time in the future.");
    }

    setLoading(true);
    const res = await fetch("/api/sessions/group", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teacherId,
        studentIds: [...selected],
        scheduled_at: scheduledAt.toISOString(),
        duration_minutes: parseInt(duration),
        notes: notes.trim() || null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }

    const count = data.count as number;
    const skipped = (data.skipped as number) ?? 0;
    setSuccess(
      `Scheduled for ${count} student${count === 1 ? "" : "s"}${skipped ? ` · ${skipped} skipped (not assigned)` : ""} — everyone notified.`,
    );
    setTeacherId("");
    setSelected(new Set());
    setDate("");
    setTime("09:00");
    setDuration("60");
    setNotes("");
    router.refresh();
  };

  if (teachers.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-navy">Schedule a session</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted">
            Create a group with a teacher and one or more students first, then you can schedule sessions here.
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
        {success && <p className="text-sm text-success" style={{ marginBottom: "16px" }}>{success}</p>}
        <form style={{ display: "flex", flexDirection: "column", gap: "16px" }} onSubmit={handleSubmit}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <Label htmlFor="group-teacher">Teacher</Label>
            <select
              id="group-teacher"
              value={teacherId}
              onChange={(e) => chooseTeacher(e.target.value)}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              style={{ width: "100%", height: "40px" }}
              required
            >
              <option value="" disabled>Select a teacher…</option>
              {teachers.map((t) => (
                <option key={t.teacherId} value={t.teacherId}>
                  {t.teacherName} ({t.students.length} student{t.students.length === 1 ? "" : "s"})
                </option>
              ))}
            </select>
          </div>

          {activeTeacher && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <Label>Students</Label>
                <button
                  type="button"
                  onClick={toggleAll}
                  className="text-sm text-navy"
                  style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 500 }}
                >
                  {allSelected ? "Clear all" : "Select all"}
                </button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {students.map((s) => {
                  const checked = selected.has(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggleStudent(s.id)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: "9999px",
                        fontSize: "13px",
                        fontWeight: 500,
                        cursor: "pointer",
                        border: `1px solid ${checked ? "var(--color-navy)" : "var(--color-border)"}`,
                        background: checked ? "var(--color-navy)" : "transparent",
                        color: checked ? "#fff" : "var(--color-muted)",
                      }}
                    >
                      {s.full_name}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted">
                {selected.size === 0
                  ? "Select one or more students for this session."
                  : `${selected.size} selected${selected.size > 1 ? " · one group class" : ""}`}
              </p>
            </div>
          )}

          <div className="form-grid-3">
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <Label htmlFor="group-date">Date</Label>
              <Input
                id="group-date"
                type="date"
                value={date}
                min={todayDateString()}
                onChange={(e) => setDate(e.target.value)}
                required
                suppressHydrationWarning
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <Label htmlFor="group-time">Time</Label>
              <TimePicker id="group-time" value={time} onChange={setTime} required />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <Label htmlFor="group-duration">Duration</Label>
              <select
                id="group-duration"
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
            <Label htmlFor="group-notes">Notes (optional)</Label>
            <Textarea
              id="group-notes"
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

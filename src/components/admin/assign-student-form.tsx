"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

interface Option {
  id: string;
  full_name: string;
}

interface AssignStudentFormProps {
  teachers: Option[];
  students: Option[];
}

export function AssignStudentForm({ teachers, students }: AssignStudentFormProps) {
  const [teacherId, setTeacherId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus(null);
    setLoading(true);

    const response = await fetch("/api/admin/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teacherId, studentId }),
    });

    const data = await response.json();

    if (!response.ok) {
      setStatus(data.error ?? "Failed to create assignment.");
      setLoading(false);
      return;
    }

    setStatus("Assignment created.");
    setTeacherId("");
    setStudentId("");
    setLoading(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-navy">Assign student</CardTitle>
      </CardHeader>
      <CardContent>
        <form style={{ display: "flex", flexDirection: "column", gap: "12px" }} onSubmit={handleSubmit}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <Label htmlFor="teacher">Teacher</Label>
            <select
              id="teacher"
              className="rounded-md border border-border bg-white px-3 text-sm"
              style={{ height: "40px", width: "100%" }}
              value={teacherId}
              onChange={(event) => setTeacherId(event.target.value)}
              required
            >
              <option value="">Select teacher</option>
              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.full_name}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <Label htmlFor="student">Student/Parent</Label>
            <select
              id="student"
              className="rounded-md border border-border bg-white px-3 text-sm"
              style={{ height: "40px", width: "100%" }}
              value={studentId}
              onChange={(event) => setStudentId(event.target.value)}
              required
            >
              <option value="">Select student</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.full_name}
                </option>
              ))}
            </select>
          </div>
          {status ? <p className="text-sm text-muted">{status}</p> : null}
          <Button type="submit" disabled={loading}>
            {loading ? "Assigning..." : "Create assignment"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

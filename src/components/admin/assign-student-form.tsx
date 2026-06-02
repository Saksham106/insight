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
        <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="teacher">Teacher</Label>
            <select
              id="teacher"
              className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
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
          <div className="space-y-2">
            <Label htmlFor="student">Student/Parent</Label>
            <select
              id="student"
              className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
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

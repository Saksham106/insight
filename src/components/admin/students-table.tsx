"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { GraduationCap, Pencil } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeleteUserButton } from "@/components/admin/delete-user-button";
import { EditUserModal, type UserOption } from "@/components/admin/edit-user-modal";
import { getOnboardingStatus } from "@/lib/onboarding-status";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Student {
  id: string;
  full_name: string;
  email: string;
  is_active: boolean;
  invite_sent_at: string | null;
  password_set_at: string | null;
  auth_last_sign_in_at: string | null;
  created_at: string;
  parentIds: string[];
}

interface StudentsTableProps {
  students: Student[];
  allParents: UserOption[];
}

export function StudentsTable({ students, allParents }: StudentsTableProps) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Student | null>(null);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 480px)").matches : false,
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 480px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const colSpan = isMobile ? 3 : 4;

  const toggleUser = async (student: Student) => {
    setStatus(null);
    setLoadingId(student.id);

    const response = await fetch("/api/admin/toggle-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: student.id, isActive: !student.is_active }),
    });

    const data = await response.json();

    if (!response.ok) {
      setStatus(data.error ?? "Failed to update user.");
      setLoadingId(null);
      return;
    }

    setStatus("Updated user status.");
    setLoadingId(null);
    router.refresh();
  };

  const resendCredentials = async (student: Student) => {
    setStatus(null);
    setResendingId(student.id);

    const response = await fetch("/api/admin/invite-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: student.email, fullName: student.full_name, role: "student", resend: true }),
    });

    const data = await response.json();
    setResendingId(null);

    if (!response.ok) {
      setStatus(data.error ?? "Failed to resend credentials.");
      return;
    }

    if (data.emailError) {
      setStatus(`Password reset for ${student.full_name}, but the email failed to send. New password: ${data.password}`);
    } else {
      setStatus(`Credentials resent to ${student.full_name}. New password: ${data.password}`);
    }
    router.refresh();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {status ? <p className="text-sm text-muted">{status}</p> : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Onboarding</TableHead>
            {!isMobile && <TableHead>Created</TableHead>}
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {students.length === 0 && (
            <tr><td colSpan={colSpan} style={{ padding: "0", paddingTop: "8px" }}>
              <EmptyState icon={GraduationCap} title="No students yet" description="Invite a student to get started." />
            </td></tr>
          )}
          {students.map((student) => {
            const onboarding = getOnboardingStatus(student);

            return (
              <TableRow key={student.id} style={student.is_active ? undefined : { opacity: 0.55 }}>
                <TableCell className="font-medium">{student.full_name}</TableCell>
                <TableCell>
                  <Badge variant={onboarding.variant}>{onboarding.label}</Badge>
                </TableCell>
                {!isMobile && (
                  <TableCell>
                    {new Date(student.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                  </TableCell>
                )}
                <TableCell className="text-right">
                  <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", alignItems: "center" }}>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditing(student)}
                      aria-label={`Edit ${student.full_name}`}
                      style={{ display: "flex", alignItems: "center", padding: "0 10px" }}
                    >
                      <Pencil size={14} />
                    </Button>
                    {onboarding.label === "Invite sent" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => resendCredentials(student)}
                        disabled={resendingId === student.id}
                      >
                        {resendingId === student.id ? "Resending..." : "Resend"}
                      </Button>
                    ) : null}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleUser(student)}
                      disabled={loadingId === student.id}
                    >
                      {student.is_active ? "Disable" : "Enable"}
                    </Button>
                    <DeleteUserButton
                      userId={student.id}
                      userName={student.full_name}
                      onError={setStatus}
                      onDeleted={setStatus}
                    />
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {editing && (
        <EditUserModal
          user={{ id: editing.id, full_name: editing.full_name }}
          role="student"
          relationTitle="Linked parents"
          relationOptions={allParents}
          initialRelationIds={editing.parentIds}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

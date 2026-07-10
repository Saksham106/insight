"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Users } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DeleteUserButton } from "@/components/admin/delete-user-button";
import { EditUserModal, type LabelOption } from "@/components/admin/edit-user-modal";
import { getOnboardingStatus } from "@/lib/onboarding-status";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Teacher {
  id: string;
  full_name: string;
  email: string;
  is_active: boolean;
  invite_sent_at: string | null;
  password_set_at: string | null;
  auth_last_sign_in_at: string | null;
  created_at: string;
  labels: LabelOption[];
}

interface TeachersTableProps {
  teachers: Teacher[];
  allLabels: LabelOption[];
}

function LabelBadges({ labels }: { labels: LabelOption[] }) {
  if (labels.length === 0) {
    return <span className="text-sm text-muted">—</span>;
  }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
      {labels.map((label) => (
        <span
          key={label.id}
          style={{
            display: "inline-flex",
            alignItems: "center",
            borderRadius: "9999px",
            padding: "2px 9px",
            fontSize: "12px",
            fontWeight: 500,
            border: "1px solid var(--color-border)",
            backgroundColor: label.color ?? "var(--color-soft)",
            color: label.color ? "#ffffff" : "var(--color-foreground)",
          }}
        >
          {label.name}
        </span>
      ))}
    </div>
  );
}

export function TeachersTable({ teachers, allLabels }: TeachersTableProps) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Teacher | null>(null);
  const [filter, setFilter] = useState("");
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 480px)").matches : false,
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 480px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return teachers;
    return teachers.filter(
      (t) =>
        t.full_name.toLowerCase().includes(q) ||
        t.labels.some((l) => l.name.toLowerCase().includes(q)),
    );
  }, [teachers, filter]);

  const colSpan = isMobile ? 4 : 5;

  const toggleUser = async (teacher: Teacher) => {
    setStatus(null);
    setLoadingId(teacher.id);

    const response = await fetch("/api/admin/toggle-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: teacher.id, isActive: !teacher.is_active }),
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

  const resendCredentials = async (teacher: Teacher) => {
    setStatus(null);
    setResendingId(teacher.id);

    const response = await fetch("/api/admin/invite-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: teacher.email, fullName: teacher.full_name, role: "teacher", resend: true }),
    });

    const data = await response.json();
    setResendingId(null);

    if (!response.ok) {
      setStatus(data.error ?? "Failed to resend credentials.");
      return;
    }

    if (data.emailError) {
      setStatus(`Password reset for ${teacher.full_name}, but the email failed to send. New password: ${data.password}`);
    } else {
      setStatus(`Credentials resent to ${teacher.full_name}. New password: ${data.password}`);
    }
    router.refresh();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <Input
        placeholder="Filter by name or label…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        style={{ maxWidth: "320px" }}
      />
      {status ? <p className="text-sm text-muted">{status}</p> : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Labels</TableHead>
            <TableHead>Onboarding</TableHead>
            {!isMobile && <TableHead>Created</TableHead>}
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 && (
            <tr><td colSpan={colSpan} style={{ padding: "0", paddingTop: "8px" }}>
              <EmptyState icon={Users} title="No teachers found" description="Invite a teacher or adjust the filter." />
            </td></tr>
          )}
          {filtered.map((teacher) => {
            const onboarding = getOnboardingStatus(teacher);

            return (
              <TableRow key={teacher.id} style={teacher.is_active ? undefined : { opacity: 0.55 }}>
                <TableCell className="font-medium">{teacher.full_name}</TableCell>
                <TableCell>
                  <LabelBadges labels={teacher.labels} />
                </TableCell>
                <TableCell>
                  <Badge variant={onboarding.variant}>{onboarding.label}</Badge>
                </TableCell>
                {!isMobile && (
                  <TableCell>
                    {new Date(teacher.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                  </TableCell>
                )}
                <TableCell className="text-right">
                  <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", alignItems: "center" }}>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditing(teacher)}
                      aria-label={`Edit ${teacher.full_name}`}
                      style={{ display: "flex", alignItems: "center", padding: "0 10px" }}
                    >
                      <Pencil size={14} />
                    </Button>
                    {onboarding.label === "Invite sent" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => resendCredentials(teacher)}
                        disabled={resendingId === teacher.id}
                      >
                        {resendingId === teacher.id ? "Resending..." : "Resend"}
                      </Button>
                    ) : null}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleUser(teacher)}
                      disabled={loadingId === teacher.id}
                    >
                      {teacher.is_active ? "Disable" : "Enable"}
                    </Button>
                    <DeleteUserButton
                      userId={teacher.id}
                      userName={teacher.full_name}
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
          role="teacher"
          allLabels={allLabels}
          initialLabelIds={editing.labels.map((l) => l.id)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

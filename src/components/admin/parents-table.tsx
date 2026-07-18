"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Users } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AdminUserCard } from "@/components/admin/admin-user-card";
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

interface Parent {
  id: string;
  full_name: string;
  email: string;
  is_active: boolean;
  invite_sent_at: string | null;
  password_set_at: string | null;
  auth_last_sign_in_at: string | null;
  created_at: string;
  childIds: string[];
}

interface ParentsTableProps {
  parents: Parent[];
  allStudents: UserOption[];
}

export function ParentsTable({ parents, allStudents }: ParentsTableProps) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Parent | null>(null);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 480px)").matches : false,
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 480px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const studentNameById = useMemo(
    () => new Map(allStudents.map((s) => [s.id, s.full_name])),
    [allStudents],
  );


  const toggleUser = async (parent: Parent) => {
    setStatus(null);
    setLoadingId(parent.id);

    const response = await fetch("/api/admin/toggle-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: parent.id, isActive: !parent.is_active }),
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

  const resendCredentials = async (parent: Parent) => {
    setStatus(null);
    setResendingId(parent.id);

    const response = await fetch("/api/admin/invite-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: parent.email, fullName: parent.full_name, role: "parent", resend: true }),
    });

    const data = await response.json();
    setResendingId(null);

    if (!response.ok) {
      setStatus(data.error ?? "Failed to resend credentials.");
      return;
    }

    if (data.emailError) {
      setStatus(`Password reset for ${parent.full_name}, but the email failed to send. New password: ${data.password}`);
    } else {
      setStatus(`Credentials resent to ${parent.full_name}. New password: ${data.password}`);
    }
    router.refresh();
  };

  const renderActions = (parent: Parent) => {
    const onboarding = getOnboardingStatus(parent);
    return (
      <>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setEditing(parent)}
          aria-label={`Edit ${parent.full_name}`}
          style={{ display: "flex", alignItems: "center", padding: "0 10px" }}
        >
          <Pencil size={14} />
        </Button>
        {onboarding.label === "Invite sent" ? (
          <Button variant="outline" size="sm" onClick={() => resendCredentials(parent)} disabled={resendingId === parent.id}>
            {resendingId === parent.id ? "Resending..." : "Resend"}
          </Button>
        ) : null}
        <Button variant="outline" size="sm" onClick={() => toggleUser(parent)} disabled={loadingId === parent.id}>
          {parent.is_active ? "Disable" : "Enable"}
        </Button>
        <DeleteUserButton userId={parent.id} userName={parent.full_name} onError={setStatus} onDeleted={setStatus} />
      </>
    );
  };

  const childNamesFor = (parent: Parent) =>
    parent.childIds.map((id) => studentNameById.get(id)).filter((name): name is string => Boolean(name));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {status ? <p className="text-sm text-muted">{status}</p> : null}

      {parents.length === 0 ? (
        <EmptyState icon={Users} title="No parents yet" description="Invite a parent and link them to their children." />
      ) : isMobile ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {parents.map((parent) => {
            const onboarding = getOnboardingStatus(parent);
            const childNames = childNamesFor(parent);
            return (
              <AdminUserCard
                key={parent.id}
                name={parent.full_name}
                active={parent.is_active}
                status={<Badge variant={onboarding.variant}>{onboarding.label}</Badge>}
                meta={
                  <p className="text-sm text-muted">
                    {childNames.length > 0 ? `Children: ${childNames.join(", ")}` : "No linked children"}
                  </p>
                }
                actions={renderActions(parent)}
              />
            );
          })}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Children</TableHead>
              <TableHead>Onboarding</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {parents.map((parent) => {
              const onboarding = getOnboardingStatus(parent);
              const childNames = childNamesFor(parent);
              return (
                <TableRow key={parent.id} style={parent.is_active ? undefined : { opacity: 0.55 }}>
                  <TableCell className="font-medium">{parent.full_name}</TableCell>
                  <TableCell>
                    {childNames.length > 0 ? (
                      <span className="text-sm text-foreground">{childNames.join(", ")}</span>
                    ) : (
                      <span className="text-sm text-muted">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={onboarding.variant}>{onboarding.label}</Badge>
                  </TableCell>
                  <TableCell>
                    {new Date(parent.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                  </TableCell>
                  <TableCell className="text-right">
                    <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", alignItems: "center" }}>
                      {renderActions(parent)}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {editing && (
        <EditUserModal
          user={{ id: editing.id, full_name: editing.full_name }}
          role="parent"
          relationTitle="Linked children"
          relationOptions={allStudents}
          initialRelationIds={editing.childIds}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

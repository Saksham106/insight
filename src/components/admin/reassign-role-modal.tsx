"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { ASSIGNABLE_ROLES, type AssignableRole } from "@/lib/admin/role-reassign";

// What each role is called in the admin UI. "Tutor" is the academy's word for
// the teacher role, which is what the database calls it.
const ROLE_LABEL: Record<AssignableRole, string> = {
  teacher: "Tutor",
  student: "Student",
  parent: "Parent",
};

// Fixing someone who was filed under the wrong role — a parent invited as a
// student, a tutor sitting in the parents list. Deliberately separate from
// "Edit user": every field in that modal is role-specific and would be stale
// the moment the role changed.
export function ReassignRoleModal({
  user,
  currentRole,
  onClose,
}: {
  user: { id: string; full_name: string };
  currentRole: AssignableRole;
  onClose: () => void;
}) {
  const router = useRouter();
  const [role, setRole] = useState<AssignableRole>(currentRole);
  // Non-null once the server has told us what this change would clear; that
  // reply is the confirm step's entire content.
  const [impact, setImpact] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const post = async (preview: boolean) => {
    setError(null);
    setBusy(true);
    const res = await fetch("/api/admin/reassign-role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id, role, preview }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Could not reassign this person.");
      return null;
    }
    return data as { impact?: string[] };
  };

  const check = async () => {
    const data = await post(true);
    if (data) setImpact(data.impact ?? []);
  };

  const confirm = async () => {
    const data = await post(false);
    if (!data) return;
    onClose();
    router.refresh();
  };

  if (impact) {
    return (
      <Modal
        title={`Reassign to ${ROLE_LABEL[role].toLowerCase()}?`}
        description={`${user.full_name} moves from ${ROLE_LABEL[currentRole].toLowerCase()} to ${ROLE_LABEL[role].toLowerCase()} and will see the ${ROLE_LABEL[role].toLowerCase()} dashboard from their next sign-in.`}
        onClose={() => setImpact(null)}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {impact.length === 0 ? (
            <p className="text-sm text-muted">
              They have no tutor assignments or parent links, so nothing else changes.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <p className="text-sm text-navy">Relationships that no longer apply will be cleared:</p>
              <ul style={{ margin: 0, paddingLeft: "18px" }}>
                {impact.map((line) => (
                  <li key={line} className="text-sm text-muted">{line}</li>
                ))}
              </ul>
              <p className="text-xs text-muted">
                Labels, availability, and booking settings are left as they are.
              </p>
            </div>
          )}
          {error && <p className="text-sm text-error">{error}</p>}
          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
            <Button variant="outline" disabled={busy} onClick={() => setImpact(null)}>Back</Button>
            <Button disabled={busy} onClick={confirm}>{busy ? "Reassigning…" : "Yes, reassign"}</Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title="Reassign role"
      description={`Change what ${user.full_name} is classified as. Use this when someone was filed under the wrong role.`}
      onClose={onClose}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <Label>Role</Label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {ASSIGNABLE_ROLES.map((option) => {
              const selected = option === role;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setRole(option)}
                  style={{
                    borderRadius: "9999px",
                    border: `1px solid ${selected ? "var(--color-navy)" : "var(--color-border)"}`,
                    backgroundColor: selected ? "var(--color-navy)" : "var(--color-surface)",
                    color: selected ? "#ffffff" : "var(--color-foreground)",
                    padding: "7px 14px",
                    fontSize: "13px",
                    cursor: "pointer",
                  }}
                >
                  {ROLE_LABEL[option]}
                  {option === currentRole ? " (current)" : ""}
                </button>
              );
            })}
          </div>
        </div>

        {error && <p className="text-sm text-error">{error}</p>}

        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={check} disabled={busy || role === currentRole}>
            {busy ? "Checking…" : "Continue"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

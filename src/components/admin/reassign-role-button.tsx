"use client";

import { useState } from "react";
import { UserCog } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ReassignRoleModal } from "@/components/admin/reassign-role-modal";
import type { AssignableRole } from "@/lib/admin/role-reassign";

// Row action for the tutors / students / parents tables. Owns its own open
// state so the three tables don't each have to carry a copy of it.
export function ReassignRoleButton({
  user,
  currentRole,
}: {
  user: { id: string; full_name: string };
  currentRole: AssignableRole;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label={`Reassign ${user.full_name}`}
        title="Reassign role"
        style={{ display: "flex", alignItems: "center", padding: "0 10px" }}
      >
        <UserCog size={14} />
      </Button>
      {open && (
        <ReassignRoleModal user={user} currentRole={currentRole} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

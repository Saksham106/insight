"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";

interface DeleteUserButtonProps {
  userId: string;
  userName: string;
  onError: (message: string) => void;
  onDeleted: (message: string) => void;
}

// Two-step confirm: the first click arms the button, the second deletes.
// Arming lapses after a few seconds so a stray click can't sit there waiting
// for an accidental second one.
const ARM_TIMEOUT_MS = 4000;

export function DeleteUserButton({ userId, userName, onError, onDeleted }: DeleteUserButtonProps) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const disarm = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setArmed(false);
  };

  const handleClick = async () => {
    if (!armed) {
      setArmed(true);
      timerRef.current = setTimeout(() => setArmed(false), ARM_TIMEOUT_MS);
      return;
    }

    disarm();
    setDeleting(true);

    const response = await fetch("/api/admin/delete-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });

    const data = await response.json().catch(() => null);
    setDeleting(false);

    if (!response.ok) {
      onError(data?.error ?? "Failed to delete user.");
      return;
    }

    onDeleted(`${userName} was removed. Their messages and session history are kept.`);
    router.refresh();
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      onBlur={disarm}
      disabled={deleting}
      aria-label={armed ? `Confirm removal of ${userName}` : `Remove ${userName}`}
      style={{
        display: "flex",
        alignItems: "center",
        padding: "0 10px",
        ...(armed ? { borderColor: "#b91c1c", color: "#b91c1c" } : null),
      }}
    >
      {deleting ? "Removing…" : armed ? "Confirm?" : <Trash2 size={14} />}
    </Button>
  );
}

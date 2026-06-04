"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/layout/notification-bell";
import { createClient } from "@/lib/supabase/client";

interface DashboardHeaderProps {
  userName: string;
  role: "admin" | "teacher" | "student";
  userId: string;
}

const roleLabels: Record<DashboardHeaderProps["role"], string> = {
  admin: "Admin",
  teacher: "Teacher",
  student: "Student/Parent",
};

export function DashboardHeader({ userName, role, userId }: DashboardHeaderProps) {
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
  };

  return (
    <header
      className="bg-surface"
      style={{ position: "sticky", top: 0, zIndex: 30, borderBottom: "1px solid var(--color-border)" }}
    >
      <div
        className="px-6 py-4"
        style={{
          marginLeft: "auto",
          marginRight: "auto",
          width: "100%",
          maxWidth: "72rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">
            Insight Tutors
          </p>
          <p className="text-lg font-semibold text-navy">Dashboard</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <NotificationBell userId={userId} />
          <div className="text-right">
            <p className="text-sm font-medium text-foreground">{userName}</p>
            <p className="text-xs text-muted">{roleLabels[role]}</p>
          </div>
          <Button variant="outline" onClick={handleLogout}>
            Log out
          </Button>
        </div>
      </div>
    </header>
  );
}

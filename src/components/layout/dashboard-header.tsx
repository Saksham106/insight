"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

interface DashboardHeaderProps {
  userName: string;
  role: "admin" | "teacher" | "student";
}

const roleLabels: Record<DashboardHeaderProps["role"], string> = {
  admin: "Admin",
  teacher: "Teacher",
  student: "Student/Parent",
};

export function DashboardHeader({ userName, role }: DashboardHeaderProps) {
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
  };

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">
            Insight Tutors
          </p>
          <p className="text-lg font-semibold text-navy">Dashboard</p>
        </div>
        <div className="flex items-center gap-4">
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

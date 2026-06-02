import { DashboardHeader } from "@/components/layout/dashboard-header";

interface AppShellProps {
  userName: string;
  role: "admin" | "teacher" | "student";
  children: React.ReactNode;
}

export function AppShell({ userName, role, children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader userName={userName} role={role} />
      <main className="mx-auto w-full max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}

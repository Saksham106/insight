import { DashboardHeader } from "@/components/layout/dashboard-header";
import { PageMain } from "@/components/layout/page-main";

interface AppShellProps {
  userName: string;
  role: "admin" | "teacher" | "student";
  userId: string;
  children: React.ReactNode;
}

export function AppShell({ userName, role, userId, children }: AppShellProps) {
  return (
    <div className="bg-background" style={{ minHeight: "100vh" }}>
      <DashboardHeader userName={userName} role={role} userId={userId} />
      <PageMain>{children}</PageMain>
    </div>
  );
}

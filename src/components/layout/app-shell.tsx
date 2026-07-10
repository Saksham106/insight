import { ContactModal } from "@/components/layout/contact-modal";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { NavigationProgress } from "@/components/layout/navigation-progress";
import { PageMain } from "@/components/layout/page-main";
import { TimezoneSync } from "@/components/layout/timezone-sync";

interface AppShellProps {
  userName: string;
  role: "admin" | "teacher" | "student" | "parent";
  userId: string;
  avatarUrl?: string | null;
  children: React.ReactNode;
}

export function AppShell({ userName, role, userId, avatarUrl, children }: AppShellProps) {
  return (
    <div className="bg-background" style={{ minHeight: "100vh" }}>
      <NavigationProgress />
      <TimezoneSync />
      <DashboardHeader userName={userName} role={role} userId={userId} avatarUrl={avatarUrl} />
      <ContactModal />
      <PageMain>{children}</PageMain>
    </div>
  );
}

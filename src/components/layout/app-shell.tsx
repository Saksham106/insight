import { ContactModal } from "@/components/layout/contact-modal";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { NavigationProgress } from "@/components/layout/navigation-progress";
import { PageMain } from "@/components/layout/page-main";
import { TimezoneSync } from "@/components/layout/timezone-sync";
import { UnreadProvider } from "@/lib/unread-context";

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
      <UnreadProvider userId={userId} role={role}>
        <DashboardHeader userName={userName} role={role} userId={userId} avatarUrl={avatarUrl} />
        <ContactModal />
        <PageMain>{children}</PageMain>
      </UnreadProvider>
    </div>
  );
}

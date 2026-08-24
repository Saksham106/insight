import { ContactModal } from "@/components/layout/contact-modal";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { NavigationProgress } from "@/components/layout/navigation-progress";
import { OfflineIndicator } from "@/components/layout/offline-indicator";
import { PageMain } from "@/components/layout/page-main";
import { TimezoneSync } from "@/components/layout/timezone-sync";
import { UnreadProvider } from "@/lib/unread-context";
import { BottomNavigation } from "@/components/layout/bottom-navigation";

interface AppShellProps {
  userName: string;
  role: "admin" | "teacher" | "student" | "parent";
  availableRoles: ("admin" | "teacher" | "student" | "parent")[];
  userId: string;
  avatarUrl?: string | null;
  children: React.ReactNode;
}

export function AppShell({ userName, role, availableRoles, userId, avatarUrl, children }: AppShellProps) {
  return (
    <div className="bg-background" style={{ minHeight: "100dvh" }}>
      <OfflineIndicator />
      <NavigationProgress />
      <TimezoneSync />
      <UnreadProvider userId={userId} role={role}>
        <DashboardHeader userName={userName} role={role} availableRoles={availableRoles} userId={userId} avatarUrl={avatarUrl} />
        <ContactModal />
        <PageMain>{children}</PageMain>
        <BottomNavigation role={role} />
      </UnreadProvider>
    </div>
  );
}

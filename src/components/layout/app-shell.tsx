import { UnreadProvider } from '@/lib/unread-context';
import { DashboardHeader } from '@/components/layout/dashboard-header';
import { NavigationProgress } from '@/components/layout/navigation-progress';
import { PageMain } from '@/components/layout/page-main';
import { TimezoneSync } from '@/components/layout/timezone-sync';
import { ContactModal } from '@/components/layout/contact-modal';
import { OfflineIndicator } from '@/components/layout/offline-indicator';

interface AppShellProps {
  userName: string;
  role: 'admin' | 'teacher' | 'student' | 'parent';
  userId: string;
  avatarUrl?: string | null;
  children: React.ReactNode;
  online: boolean;
}

export function AppShell({ userName, role, userId, avatarUrl, children, online }: AppShellProps) {
  return (
    <div className="bg-background" style={{ minHeight: '100vh' }}>
      <OfflineIndicator online={online} />
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

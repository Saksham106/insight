import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/lib/auth/require-role";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireUser();

  return (
    <AppShell
      userName={profile.full_name}
      role={profile.role}
      userId={profile.id}
      avatarUrl={profile.avatar_url}
      online={typeof navigator !== "undefined" ? navigator.onLine : true}
      // Ideally this would come from a server-side signal in production, but
      // for the app-shell polish we wire it from the client through the shell.
    >
      {children}
    </AppShell>
  );
}

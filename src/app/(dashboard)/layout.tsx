import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/lib/auth/require-role";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireUser();

  return (
    <AppShell userName={profile.full_name} role={profile.role}>
      {children}
    </AppShell>
  );
}

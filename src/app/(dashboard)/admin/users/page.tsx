import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { getAdminDashboardData } from "@/lib/dashboard-data";

export default async function AdminUsersPage() {
  const data = await getAdminDashboardData();

  return <AdminDashboard view="users" {...data} />;
}

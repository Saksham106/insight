import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { getAdminDashboardData } from "@/lib/dashboard-data";

export default async function AdminAssignmentsPage() {
  const data = await getAdminDashboardData();

  return <AdminDashboard view="assignments" {...data} />;
}

import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { getUserProfile } from "@/lib/auth/get-user-profile";
import { getAdminDashboardData } from "@/lib/dashboard-data";

export default async function AdminChatsPage() {
  const [profile, data] = await Promise.all([getUserProfile(), getAdminDashboardData()]);

  return <AdminDashboard view="chats" currentUserId={profile?.id} {...data} />;
}

import { ParentDashboard } from "@/components/parent/parent-dashboard";
import { getParentDashboardData } from "@/lib/dashboard-data";

export default async function ParentPage() {
  const { profile, children } = await getParentDashboardData();

  return <ParentDashboard childProfiles={children} parentId={profile.id} view="overview" />;
}

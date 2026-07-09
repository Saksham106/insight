import { ParentDashboard } from "@/components/parent/parent-dashboard";
import { getParentDashboardData } from "@/lib/dashboard-data";

export default async function ParentSchedulePage() {
  const { profile, children } = await getParentDashboardData();

  return <ParentDashboard childProfiles={children} parentId={profile.id} view="schedule" />;
}

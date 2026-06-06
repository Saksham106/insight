import { TeacherDashboard } from "@/components/teacher/teacher-dashboard";
import { getTeacherDashboardData } from "@/lib/dashboard-data";

export default async function TeacherSchedulePage() {
  const { profile, assignments } = await getTeacherDashboardData();

  return <TeacherDashboard assignments={assignments} teacherId={profile.id} view="schedule" />;
}

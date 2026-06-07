import { TeacherDashboard } from "@/components/teacher/teacher-dashboard";
import { getTeacherDashboardData } from "@/lib/dashboard-data";

export default async function TeacherChatsPage() {
  const { profile, assignments } = await getTeacherDashboardData();
  return <TeacherDashboard assignments={assignments} teacherId={profile.id} view="chats" />;
}

import { StudentDashboard } from "@/components/student/student-dashboard";
import { getStudentDashboardData } from "@/lib/dashboard-data";

export default async function StudentRequestsPage() {
  const { profile, assignments } = await getStudentDashboardData();

  return <StudentDashboard assignments={assignments} studentId={profile.id} view="requests" />;
}

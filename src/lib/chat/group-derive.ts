// Pure helpers for turning a group's member roster into the booking substrate.
// A group is the admin-facing unit; teacher_student_assignments are derived from
// it so the existing availability/booking engine keeps working unchanged.

export interface MemberRole {
  id: string;
  role: string;
}

export interface Pair {
  teacherId: string;
  studentId: string;
}

// Every teacher x student pair in the roster. Parents (and any other role) are
// ignored for the booking relationship; they still participate in the chat.
export function derivePairs(members: MemberRole[]): Pair[] {
  const teachers = members.filter((m) => m.role === "teacher");
  const students = members.filter((m) => m.role === "student");
  const pairs: Pair[] = [];
  for (const t of teachers) {
    for (const s of students) {
      pairs.push({ teacherId: t.id, studentId: s.id });
    }
  }
  return pairs;
}

// Suggested group title from members' first names, used when the admin leaves
// the name blank. Mirrors the server-side fallback so previews match.
export function suggestGroupTitle(names: string[]): string {
  const firsts = names.map((n) => n.trim().split(/\s+/)[0]).filter(Boolean);
  if (firsts.length === 0) return "Group";
  if (firsts.length <= 3) return firsts.join(", ");
  return `${firsts.slice(0, 3).join(", ")} +${firsts.length - 3}`;
}

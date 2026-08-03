// Correcting a miscategorised person: someone invited as a student who is
// really their child's parent, a parent who is really a tutor, and so on.
//
// `profiles.role` decides which dashboard a person sees and which relationships
// they may hold, so changing it leaves relationship rows behind that no longer
// mean anything — a "student" who is still listed as the tutor of five other
// students. This module is the pure decision layer: given the old and new role
// it says which relationship classes stop making sense. Doing the reasoning
// here rather than inline in the route keeps every transition testable without
// a database.

export type AssignableRole = "teacher" | "student" | "parent";

// Admin is deliberately absent. Moving someone in or out of it is a privilege
// change rather than a miscategorisation, and it can lock the academy out of
// its own admin surface.
export const ASSIGNABLE_ROLES: AssignableRole[] = ["teacher", "student", "parent"];

export function isAssignableRole(role: string): role is AssignableRole {
  return (ASSIGNABLE_ROLES as string[]).includes(role);
}

export interface ReassignPlan {
  // teacher_student_assignments where this person is the tutor.
  deactivateAssignmentsAsTeacher: boolean;
  // teacher_student_assignments where this person is the student.
  deactivateAssignmentsAsStudent: boolean;
  // parent_student_links where this person is the parent (links to children).
  removeParentLinksAsParent: boolean;
  // parent_student_links where this person is the student (links to parents).
  removeParentLinksAsStudent: boolean;
}

export interface RelationshipCounts {
  assignmentsAsTeacher: number;
  assignmentsAsStudent: number;
  parentLinksAsParent: number;
  parentLinksAsStudent: number;
}

// What stops making sense when someone leaves `from` for `to`. Keyed entirely
// on the role being *left* — the new role brings no relationships with it, the
// admin builds those afterwards.
//
// Labels, availability rules, and booking settings are deliberately not listed.
// They are configuration rather than relationships: harmless while unused, and
// correct again if the person is ever reassigned back.
export function planReassignment(from: string, to: string): ReassignPlan {
  const plan: ReassignPlan = {
    deactivateAssignmentsAsTeacher: false,
    deactivateAssignmentsAsStudent: false,
    removeParentLinksAsParent: false,
    removeParentLinksAsStudent: false,
  };

  if (from === to) return plan;

  if (from === "teacher") {
    plan.deactivateAssignmentsAsTeacher = true;
  } else if (from === "student") {
    plan.deactivateAssignmentsAsStudent = true;
    plan.removeParentLinksAsStudent = true;
  } else if (from === "parent") {
    plan.removeParentLinksAsParent = true;
  }

  return plan;
}

// The reason a reassignment is refused, or null when it may proceed.
export function reassignmentError(params: {
  from: string;
  to: string;
  isSelf: boolean;
}): string | null {
  if (params.isSelf) {
    return "You can't reassign your own account.";
  }
  if (params.from === "admin" || params.to === "admin") {
    return "Admin accounts can't be reassigned here.";
  }
  if (!isAssignableRole(params.from)) {
    return "This person's current role can't be reassigned.";
  }
  if (!isAssignableRole(params.to)) {
    return "Pick a tutor, student, or parent role.";
  }
  if (params.from === params.to) {
    return "This person already has that role.";
  }
  return null;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

// Human-readable lines for the confirm step, one per relationship class the
// plan touches. Classes the person has none of are left out entirely so the
// admin only reads about changes that will actually happen.
export function describeImpact(plan: ReassignPlan, counts: RelationshipCounts): string[] {
  const lines: string[] = [];

  if (plan.deactivateAssignmentsAsTeacher && counts.assignmentsAsTeacher > 0) {
    lines.push(
      `${plural(counts.assignmentsAsTeacher, "tutor assignment", "tutor assignments")} will be deactivated`,
    );
  }
  if (plan.deactivateAssignmentsAsStudent && counts.assignmentsAsStudent > 0) {
    lines.push(
      `${plural(counts.assignmentsAsStudent, "tutor assignment", "tutor assignments")} will be deactivated`,
    );
  }
  if (plan.removeParentLinksAsParent && counts.parentLinksAsParent > 0) {
    lines.push(`${plural(counts.parentLinksAsParent, "child", "children")} will be unlinked`);
  }
  if (plan.removeParentLinksAsStudent && counts.parentLinksAsStudent > 0) {
    lines.push(`${plural(counts.parentLinksAsStudent, "parent link", "parent links")} will be removed`);
  }

  return lines;
}

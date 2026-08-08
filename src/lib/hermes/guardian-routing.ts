/**
 * Deciding who a class message actually goes to.
 *
 * A directory link is only worth having if it changes what Kitty does. When a
 * student should not be contacted directly — a guardian_only policy, an
 * enrollment that does not notify the student, or an explicit parent-as-contact
 * choice — this resolves the guardian from the active relationship graph.
 *
 * Two rules matter more than convenience:
 *   * Kitty never guesses between guardians, and never broadcasts to all of
 *     them. Several eligible guardians is an exception for Swati to resolve.
 *   * Only the student's own links are ever consulted, so one family's
 *     contacts can never surface in another family's routing.
 */

export interface RoutingContact {
  id: string;
  display_name: string;
  role: string;
  is_active: boolean;
  deleted_at: string | null;
  communication_policy: string;
}

export interface RoutingRelationship {
  source_contact_id: string;
  target_contact_id: string;
  relationship_type: string;
  is_active: boolean;
}

export type ClassRecipient =
  | { kind: "contact"; contactId: string }
  | {
      kind: "exception";
      reason: "missing_guardian" | "ambiguous_guardian";
      studentName: string;
      /** Candidates, for the admin to choose from. Never messaged in bulk. */
      candidateIds: string[];
    };

/** A guardian Kitty is actually allowed to message right now. */
function isMessageable(contact: RoutingContact): boolean {
  return (
    contact.is_active
    && contact.deleted_at === null
    && contact.role === "parent"
    && contact.communication_policy !== "opted_out"
  );
}

export function activeGuardiansForStudent({
  studentId,
  contacts,
  relationships,
}: {
  studentId: string;
  contacts: readonly RoutingContact[];
  relationships: readonly RoutingRelationship[];
}): RoutingContact[] {
  const byId = new Map(contacts.map((contact) => [contact.id, contact]));
  const guardianIds = relationships
    .filter(
      (relationship) =>
        relationship.target_contact_id === studentId
        && relationship.relationship_type === "parent_guardian"
        && relationship.is_active,
    )
    .map((relationship) => relationship.source_contact_id);

  const seen = new Set<string>();
  const guardians: RoutingContact[] = [];
  for (const id of guardianIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const contact = byId.get(id);
    if (contact && isMessageable(contact)) guardians.push(contact);
  }
  return guardians;
}

export function resolveClassRecipient({
  student,
  contacts,
  relationships,
  enrollmentContactId,
  requiresGuardian,
}: {
  student: RoutingContact;
  contacts: readonly RoutingContact[];
  relationships: readonly RoutingRelationship[];
  /** A contact named on the enrollment. Authoritative when set. */
  enrollmentContactId: string | null;
  requiresGuardian: boolean;
}): ClassRecipient {
  // A class-specific enrollment setting is a decision already made; the
  // directory only supplies defaults and fallback context.
  if (enrollmentContactId) return { kind: "contact", contactId: enrollmentContactId };

  const guardianRequired = requiresGuardian || student.communication_policy === "guardian_only";
  if (!guardianRequired) return { kind: "contact", contactId: student.id };

  const guardians = activeGuardiansForStudent({
    studentId: student.id,
    contacts,
    relationships,
  });

  if (guardians.length === 1) return { kind: "contact", contactId: guardians[0].id };
  return {
    kind: "exception",
    reason: guardians.length === 0 ? "missing_guardian" : "ambiguous_guardian",
    studentName: student.display_name,
    candidateIds: guardians.map((guardian) => guardian.id),
  };
}

export interface EnrollmentForRouting {
  id: string;
  student_contact_id: string;
  /** Occurrence this enrollment resolves for; null for a series enrollment. */
  occurrence_id: string | null;
}

export interface EnrollmentContactForRouting {
  enrollment_id: string;
  contact_id: string;
  contact_role: string;
  receives_notifications: boolean;
  is_active: boolean;
}

export interface GuardianIssue {
  id: string;
  kind: "missing_guardian" | "ambiguous_guardian";
  studentName: string;
  occurrenceTitle: string | null;
}

/**
 * Guardian exceptions across a set of enrollments.
 *
 * An enrollment needs guardian routing when nothing on it notifies the student
 * directly — either no active student contact receives notifications, or the
 * student's own policy is guardian_only. If the enrollment already names a
 * notifying parent/guardian, that choice stands and no exception is raised.
 */
export function projectGuardianIssues({
  enrollments,
  enrollmentContacts,
  contacts,
  relationships,
  occurrenceTitles = {},
}: {
  enrollments: readonly EnrollmentForRouting[];
  enrollmentContacts: readonly EnrollmentContactForRouting[];
  contacts: readonly RoutingContact[];
  relationships: readonly RoutingRelationship[];
  occurrenceTitles?: Readonly<Record<string, string>>;
}): GuardianIssue[] {
  const byId = new Map(contacts.map((contact) => [contact.id, contact]));
  const issues: GuardianIssue[] = [];
  const seen = new Set<string>();

  for (const enrollment of enrollments) {
    const student = byId.get(enrollment.student_contact_id);
    if (!student) continue;

    const rows = enrollmentContacts.filter(
      (row) => row.enrollment_id === enrollment.id && row.is_active,
    );
    const notifiedGuardian = rows.find(
      (row) => row.contact_role === "parent_guardian" && row.receives_notifications,
    );
    const notifiedStudent = rows.find(
      (row) => row.contact_role === "student" && row.receives_notifications,
    );

    const recipient = resolveClassRecipient({
      student,
      contacts,
      relationships,
      enrollmentContactId: notifiedGuardian?.contact_id ?? null,
      requiresGuardian: !notifiedStudent,
    });
    if (recipient.kind !== "exception") continue;

    // One exception per student per class, however many enrollments overlap.
    const key = `${recipient.reason}:${enrollment.student_contact_id}:${enrollment.occurrence_id ?? "series"}`;
    if (seen.has(key)) continue;
    seen.add(key);

    issues.push({
      id: key,
      kind: recipient.reason,
      studentName: recipient.studentName,
      occurrenceTitle: enrollment.occurrence_id
        ? occurrenceTitles[enrollment.occurrence_id] ?? null
        : null,
    });
  }
  return issues;
}

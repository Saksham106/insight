export type KittyEnrollmentContactInput = {
  contactId: string;
  role: "student" | "parent_guardian";
  receivesNotifications: boolean;
  confirmsCancellation: boolean;
  confirmsReschedule: boolean;
};

export type KittyEnrollmentInput = {
  studentContactId: string;
  contacts: KittyEnrollmentContactInput[];
};

export type KittyEnrollmentProjection = KittyEnrollmentInput & {
  id: string;
};

export type KittyEnrollmentRosterActor =
  | { kind: "admin" }
  | { kind: "contact"; contactId: string };

function nonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function invalidEnrollmentContact(): never {
  throw new Error("invalid_enrollment_contact");
}

function assertEnrollmentContact(contact: unknown): asserts contact is KittyEnrollmentContactInput {
  if (!contact || typeof contact !== "object" || Array.isArray(contact)) return invalidEnrollmentContact();
  const value = contact as Record<string, unknown>;
  if (!nonEmptyString(value.contactId)
    || (value.role !== "student" && value.role !== "parent_guardian")
    || typeof value.receivesNotifications !== "boolean"
    || typeof value.confirmsCancellation !== "boolean"
    || typeof value.confirmsReschedule !== "boolean") return invalidEnrollmentContact();
}

export function validateKittyEnrollments(enrollments: KittyEnrollmentInput[]) {
  if (!Array.isArray(enrollments) || enrollments.length === 0) throw new Error("enrollment_required");
  const studentContactIds = new Set<string>();
  for (const enrollment of enrollments) {
    if (!enrollment || typeof enrollment !== "object" || !nonEmptyString(enrollment.studentContactId) || !Array.isArray(enrollment.contacts)) {
      throw new Error("invalid_enrollment");
    }
    if (studentContactIds.has(enrollment.studentContactId)) throw new Error("duplicate_student");
    studentContactIds.add(enrollment.studentContactId);

    const contactIds = new Set<string>();
    for (const contact of enrollment.contacts) {
      assertEnrollmentContact(contact);
      if (contactIds.has(contact.contactId)) throw new Error("duplicate_enrollment_contact");
      contactIds.add(contact.contactId);
    }
    const students = enrollment.contacts.filter((contact) => contact.role === "student");
    if (students.length !== 1 || students[0].contactId !== enrollment.studentContactId) throw new Error("student_contact_required");
    if (!enrollment.contacts.some((contact) => contact.confirmsReschedule)) throw new Error("reschedule_decision_maker_required");
  }
  return enrollments;
}

export function requiredEnrollmentApprovalIds(enrollments: KittyEnrollmentProjection[]) {
  validateKittyEnrollments(enrollments);
  const ids = new Set<string>();
  return enrollments.map((enrollment) => {
    if (!nonEmptyString(enrollment.id) || ids.has(enrollment.id)) throw new Error("invalid_enrollment_id");
    ids.add(enrollment.id);
    return enrollment.id;
  });
}

export function projectKittyClassRoster(enrollments: KittyEnrollmentProjection[], actor: KittyEnrollmentRosterActor) {
  validateKittyEnrollments(enrollments);
  if (actor.kind === "admin") return enrollments;
  if (!nonEmptyString(actor.contactId)) throw new Error("invalid_contact_actor");
  return enrollments
    .filter((enrollment) => enrollment.contacts.some((contact) => contact.contactId === actor.contactId))
    .map((enrollment) => ({
      contacts: enrollment.contacts.map((contact) => ({ role: contact.role })),
    }));
}

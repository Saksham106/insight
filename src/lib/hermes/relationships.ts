/**
 * Parent/guardian-to-student links, as the Contact Directory sees them.
 *
 * The database already owns the rules — public.upsert_academy_contact_relationship
 * validates roles, refuses a self-link, requires both contacts to be active and
 * not deleted, upserts idempotently on (source, target, type) so reactivation is
 * free, and never deletes. Nothing here re-implements any of that; this module
 * only validates the shape of a request before it is sent, turns the RPC's
 * exception codes into something safe to show an administrator, and projects
 * rows for display.
 */

export const RELATIONSHIP_TYPE = "parent_guardian";

/** The RPC's allowed channels; "admin" is the one the dashboard uses. */
export const RELATIONSHIP_SOURCE_CHANNEL = "admin";

export interface RelationshipMutation {
  parentContactId: string;
  studentContactId: string;
  active: boolean;
}

export type ParsedRelationshipMutation =
  | { ok: true; value: RelationshipMutation }
  | { ok: false; error: string; status: number };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

export function parseRelationshipMutation(body: unknown): ParsedRelationshipMutation {
  const input = (body ?? {}) as Record<string, unknown>;
  const parentContactId = input.parentContactId;
  const studentContactId = input.studentContactId;

  if (!isNonEmptyString(parentContactId) || !isNonEmptyString(studentContactId)) {
    return { ok: false, error: "Both a parent and a student must be chosen.", status: 400 };
  }
  if (parentContactId.trim() === studentContactId.trim()) {
    return { ok: false, error: "A contact cannot be linked to themselves.", status: 400 };
  }
  if (typeof input.active !== "boolean") {
    return { ok: false, error: "Specify whether the link is being added or removed.", status: 400 };
  }
  return {
    ok: true,
    value: {
      parentContactId: parentContactId.trim(),
      studentContactId: studentContactId.trim(),
      active: input.active,
    },
  };
}

/**
 * The RPC raises bare codes. Each maps to something an administrator can act
 * on; anything unrecognised stays generic so an internal detail never leaks.
 */
const RPC_ERRORS: Record<string, { message: string; status: number }> = {
  invalid_relationship_contacts: {
    message: "A contact cannot be linked to themselves.",
    status: 400,
  },
  relationship_contact_unavailable: {
    message: "One of those contacts is no longer in the directory. Refresh and try again.",
    status: 409,
  },
  relationship_student_required: {
    message: "Children can only be linked to a contact filed as a student.",
    status: 400,
  },
  relationship_source_role_invalid: {
    message: "Only a contact filed as a parent can be linked as a guardian.",
    status: 400,
  },
  invalid_relationship_type: { message: "That link type is not supported.", status: 400 },
  invalid_source_channel: { message: "That link source is not supported.", status: 400 },
};

export function relationshipErrorResponse(rpcMessage: string | null | undefined): {
  message: string;
  status: number;
} {
  for (const [code, response] of Object.entries(RPC_ERRORS)) {
    if (rpcMessage?.includes(code)) return response;
  }
  return { message: "Could not update the link.", status: 500 };
}

export interface RelationshipRow {
  id: string;
  source_contact_id: string;
  target_contact_id: string;
  relationship_type: string;
  is_active: boolean;
}

export interface RelationshipContact {
  id: string;
  display_name: string;
  role: string;
  is_active?: boolean;
  deleted_at?: string | null;
}

export interface LinkedPerson {
  relationshipId: string;
  contactId: string;
  displayName: string;
}

export interface RelationshipView {
  /** Students linked to this parent. */
  children: LinkedPerson[];
  /** Parents/guardians linked to this student. */
  guardians: LinkedPerson[];
}

function isSelectable(contact: RelationshipContact): boolean {
  return contact.is_active !== false && !contact.deleted_at;
}

/**
 * The active links for one contact, in both directions, so a parent card can
 * show children and a student card can show guardians.
 */
export function projectRelationshipsForContact({
  contactId,
  relationships,
  contacts,
}: {
  contactId: string;
  relationships: readonly RelationshipRow[];
  contacts: readonly RelationshipContact[];
}): RelationshipView {
  const byId = new Map(contacts.map((contact) => [contact.id, contact]));
  const children: LinkedPerson[] = [];
  const guardians: LinkedPerson[] = [];

  for (const relationship of relationships) {
    // Deactivated links are history, not current family structure.
    if (!relationship.is_active) continue;
    if (relationship.relationship_type !== RELATIONSHIP_TYPE) continue;

    if (relationship.source_contact_id === contactId) {
      const student = byId.get(relationship.target_contact_id);
      if (student && isSelectable(student)) {
        children.push({
          relationshipId: relationship.id,
          contactId: student.id,
          displayName: student.display_name,
        });
      }
    } else if (relationship.target_contact_id === contactId) {
      const parent = byId.get(relationship.source_contact_id);
      if (parent && isSelectable(parent)) {
        guardians.push({
          relationshipId: relationship.id,
          contactId: parent.id,
          displayName: parent.display_name,
        });
      }
    }
  }
  return { children, guardians };
}

/**
 * Who may be picked in the link selector. Only active, non-deleted contacts
 * with the compatible role, never the contact being edited, and never someone
 * already linked.
 */
export function selectableLinkTargets({
  contactId,
  wantedRole,
  contacts,
  alreadyLinkedIds,
}: {
  contactId: string;
  wantedRole: "student" | "parent";
  contacts: readonly RelationshipContact[];
  alreadyLinkedIds: readonly string[];
}): RelationshipContact[] {
  const linked = new Set(alreadyLinkedIds);
  return contacts.filter(
    (contact) =>
      contact.id !== contactId
      && contact.role === wantedRole
      && isSelectable(contact)
      && !linked.has(contact.id),
  );
}

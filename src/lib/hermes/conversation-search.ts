/**
 * Finding a person in the Conversations list.
 *
 * Swati knows the family, not the phone number, so the list is searched by the
 * names she would actually type — the directory label she saved on her phone,
 * the confirmed messaging name Kitty greets them by, and the WhatsApp number
 * itself for the cases where the name is ambiguous.
 *
 * This only narrows which people are listed. It deliberately does not search
 * message bodies, and it never reorders: the caller has already sorted by the
 * conversation-summary ordering and that ordering is what Swati expects to see.
 */

export interface ConversationSearchContact {
  display_name: string;
  /** Null when the messaging name is unconfirmed. */
  preferred_name: string | null;
  whatsapp_e164: string;
}

/** Digits only, so "+61 412 000 111" and "+61412000111" are the same query. */
function digits(value: string): string {
  return value.replace(/\D/g, "");
}

function matches(contact: ConversationSearchContact, needle: string, needleDigits: string): boolean {
  if (contact.display_name.toLowerCase().includes(needle)) return true;

  // Only a confirmed messaging name is searchable. An unconfirmed one resolves
  // to the neutral "there", which would match unrelated contacts.
  const preferred = contact.preferred_name?.trim().toLowerCase();
  if (preferred && preferred.includes(needle)) return true;

  if (contact.whatsapp_e164.toLowerCase().includes(needle)) return true;

  // Guarded: a query with no digits leaves an empty string, and every number
  // contains the empty string, so this path would match everyone.
  if (needleDigits && digits(contact.whatsapp_e164).includes(needleDigits)) return true;

  return false;
}

export function filterConversationContacts<T extends ConversationSearchContact>(
  contacts: T[],
  query: string,
): T[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return contacts;

  const needleDigits = digits(needle);
  return contacts.filter((contact) => matches(contact, needle, needleDigits));
}

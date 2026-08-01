/**
 * Swati saves contacts on her phone with notes to herself —
 * "Anjali Chemistry Teacher 12/15", "C.A. Ritesh Sir". That full string is the
 * name the admin UI shows, but it is not what a WhatsApp greeting should say.
 * This derives a sane default; an admin can override it per contact.
 */

/** Qualifications sitting in front of a given name. Dropped. */
const QUALIFICATION_PREFIXES = new Set(["ca", "er", "adv", "advocate", "eng", "engr", "cs", "cma"]);

/** Respectful suffixes. Dropped. */
const TRAILING_HONORIFICS = new Set(["sir", "madam", "maam", "mam", "ji"]);

/**
 * Forms of address. Kept, together with the word after them — dropping one
 * leaves a bare surname that reads wrong in a greeting ("Hi Sharma").
 */
const ADDRESS_TITLES = new Set(["dr", "mr", "mrs", "ms", "miss", "prof"]);

function normalize(token: string) {
  return token.toLowerCase().replaceAll(".", "").replaceAll("'", "").replaceAll("’", "");
}

export function deriveMessagingName(displayName: string): string {
  const tokens = displayName.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "";

  let start = 0;
  while (start < tokens.length && QUALIFICATION_PREFIXES.has(normalize(tokens[start]))) {
    start += 1;
  }

  let end = tokens.length;
  while (end > start && TRAILING_HONORIFICS.has(normalize(tokens[end - 1]))) {
    end -= 1;
  }

  // Nothing survived — the whole name was titles. Keep it rather than send "".
  if (start >= end) return tokens[0];

  const first = tokens[start];
  if (ADDRESS_TITLES.has(normalize(first)) && start + 1 < end) {
    return `${first} ${tokens[start + 1]}`;
  }
  return first;
}

export interface MessagingNameContact {
  display_name: string;
  preferred_name?: string | null;
}

/** The name Kitty says out loud. Never `display_name` directly. */
export function messagingName(contact: MessagingNameContact): string {
  const preferred = contact.preferred_name?.trim();
  return preferred ? preferred : deriveMessagingName(contact.display_name);
}

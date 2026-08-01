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

/** Labels that often mean the phone belongs to somebody other than token one. */
const FAMILY_ROLE_LABELS = new Set([
  "dad",
  "daddy",
  "father",
  "guardian",
  "mom",
  "mother",
  "mum",
  "mummy",
  "papa",
  "parent",
  "parents",
]);

/** Common abbreviated forms that are not useful when greeted on their own. */
const COMPOUND_GIVEN_NAME_PREFIXES = new Set(["md", "mohd"]);

function normalize(token: string) {
  return token.toLowerCase().replaceAll(".", "").replaceAll("'", "").replaceAll("’", "");
}

export function deriveMessagingName(displayName: string): string {
  const tokens = displayName.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "";

  let start = 0;
  while (start < tokens.length && !/\p{L}/u.test(tokens[start])) {
    start += 1;
  }
  while (start < tokens.length && QUALIFICATION_PREFIXES.has(normalize(tokens[start]))) {
    start += 1;
  }

  let end = tokens.length;
  while (end > start && TRAILING_HONORIFICS.has(normalize(tokens[end - 1]))) {
    end -= 1;
  }

  // Nothing survived — prefer the respectful suffix over a qualification.
  if (start >= end) return tokens[start] ?? tokens[0];

  const meaningful = tokens.slice(start, end);
  if (meaningful.some((token) => FAMILY_ROLE_LABELS.has(normalize(token)))) {
    return "there";
  }

  const first = tokens[start];
  const normalizedFirst = normalize(first);
  if (ADDRESS_TITLES.has(normalize(first)) && start + 1 < end) {
    if (normalize(tokens[start + 1]) === "and") return "there";
    return `${first} ${tokens[start + 1]}`;
  }
  if (COMPOUND_GIVEN_NAME_PREFIXES.has(normalizedFirst) && start + 1 < end) {
    return `${first} ${tokens[start + 1]}`;
  }
  if (normalizedFirst.length === 1 && meaningful.length > 1) {
    return meaningful.join(" ");
  }
  return first;
}

export interface MessagingNameContact {
  display_name: string;
  preferred_name?: string | null;
}

/** The confirmed name Kitty says out loud. An unreviewed label stays neutral. */
export function messagingName(contact: MessagingNameContact): string {
  const preferred = contact.preferred_name?.trim();
  return preferred || "there";
}

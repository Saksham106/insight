import type { ParsedVCardContact } from "./types";

function unfoldLines(input: string) {
  return input.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

function unescapeText(value: string) {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

function valueAfterColon(line: string) {
  const colon = line.indexOf(":");
  return colon === -1 ? "" : line.slice(colon + 1);
}

function structuredName(value: string) {
  const [family = "", given = ""] = value.split(";").map(unescapeText);
  return [given, family].filter(Boolean).join(" ").trim();
}

function phoneValue(value: string) {
  const trimmed = value.trim();
  return trimmed.toLowerCase().startsWith("tel:") ? trimmed.slice(4) : trimmed;
}

export function parseVCardContacts(input: string): ParsedVCardContact[] {
  const cards: string[][] = [];
  let current: string[] | null = null;

  for (const rawLine of unfoldLines(input)) {
    const line = rawLine.trimEnd();
    if (line.toUpperCase() === "BEGIN:VCARD") {
      current = [];
      continue;
    }
    if (line.toUpperCase() === "END:VCARD") {
      if (current) cards.push(current);
      current = null;
      continue;
    }
    if (current) current.push(line);
  }

  return cards.map((lines, sourceIndex) => {
    let displayName = "";
    let fallbackName = "";
    const phones: string[] = [];

    for (const line of lines) {
      const property = line.split(/[;:]/, 1)[0]?.toUpperCase();
      if (property === "FN") displayName = unescapeText(valueAfterColon(line));
      if (property === "N") fallbackName = structuredName(valueAfterColon(line));
      if (property === "TEL") {
        const phone = phoneValue(valueAfterColon(line));
        if (phone && !phones.includes(phone)) phones.push(phone);
      }
    }

    displayName ||= fallbackName;
    const contact: ParsedVCardContact = { sourceIndex, displayName, phones };
    if (!displayName) contact.error = "name_required";
    else if (phones.length === 0) contact.error = "phone_required";
    return contact;
  });
}

const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const phoneRegex = /(\+?\d[\d\s().-]{7,}\d)/;

export function containsContactInfo(text: string): boolean {
  return emailRegex.test(text) || phoneRegex.test(text);
}

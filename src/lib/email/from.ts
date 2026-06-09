const DEFAULT_FROM_EMAIL = "onboarding@resend.dev";
const DEFAULT_FROM_NAME = "Insight Academy";

export function getEmailFrom() {
  const from = process.env.EMAIL_FROM?.trim() || DEFAULT_FROM_EMAIL;

  if (from.includes("<") && from.includes(">")) {
    return from;
  }

  const name = process.env.EMAIL_FROM_NAME?.trim() || DEFAULT_FROM_NAME;
  return `${name} <${from}>`;
}

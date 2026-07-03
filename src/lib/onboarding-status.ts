import type { BadgeProps } from "@/components/ui/badge";

export interface OnboardingFields {
  password_set_at?: string | null;
  auth_last_sign_in_at?: string | null;
}

export interface OnboardingStatus {
  label: "Invite sent" | "Logged in (temp password)" | "Password changed";
  variant: BadgeProps["variant"];
}

export function getOnboardingStatus(user: OnboardingFields): OnboardingStatus {
  if (user.password_set_at) {
    return { label: "Password changed", variant: "default" };
  }

  if (user.auth_last_sign_in_at) {
    return { label: "Logged in (temp password)", variant: "gold" };
  }

  return { label: "Invite sent", variant: "gold" };
}

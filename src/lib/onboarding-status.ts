import type { BadgeProps } from "@/components/ui/badge";

export interface OnboardingFields {
  invite_sent_at?: string | null;
  invite_accepted_at?: string | null;
  password_set_at?: string | null;
  auth_invited_at?: string | null;
  auth_email_confirmed_at?: string | null;
  auth_last_sign_in_at?: string | null;
  auth_has_password?: boolean | null;
}

export interface OnboardingStatus {
  label: "Invite sent" | "Needs password" | "Ready";
  variant: BadgeProps["variant"];
}

export function getOnboardingStatus(user: OnboardingFields): OnboardingStatus {
  // auth_has_password comes straight from auth.users and covers users whose
  // password_set_at write was missed (e.g. the onboarding callback failed).
  if (user.password_set_at || user.auth_has_password) {
    return { label: "Ready", variant: "default" };
  }

  if (user.invite_accepted_at) {
    return { label: "Needs password", variant: "gold" };
  }

  if (user.invite_sent_at) {
    return { label: "Invite sent", variant: "gold" };
  }

  if (user.auth_invited_at && !user.auth_email_confirmed_at) {
    return { label: "Invite sent", variant: "gold" };
  }

  if (user.auth_invited_at && user.auth_email_confirmed_at && !user.auth_last_sign_in_at) {
    return { label: "Needs password", variant: "gold" };
  }

  return { label: "Ready", variant: "default" };
}

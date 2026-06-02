import { redirect } from "next/navigation";

import { getUserProfile, type UserProfile, type UserRole } from "./get-user-profile";
import { createAdminClient } from "@/lib/supabase/admin";

const roleRedirects: Record<UserRole, string> = {
  admin: "/admin",
  teacher: "/teacher",
  student: "/student",
};

export async function requireUser(): Promise<UserProfile> {
  const profile = await getUserProfile();

  const devBypass =
    process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === "true" &&
    process.env.NODE_ENV !== "production";
  const devRole = process.env.NEXT_PUBLIC_DEV_BYPASS_ROLE as UserRole | undefined;

  if (!profile && devBypass && devRole) {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, role, is_active")
      .eq("role", devRole)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    if (data) {
      return data as UserProfile;
    }
  }

  if (!profile || !profile.is_active) {
    redirect("/login");
  }

  return profile;
}

export async function requireRole(roles: UserRole[]): Promise<UserProfile> {
  const profile = await requireUser();

  const devBypass =
    process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === "true" &&
    process.env.NODE_ENV !== "production";
  const devRole = process.env.NEXT_PUBLIC_DEV_BYPASS_ROLE as UserRole | undefined;

  if (devBypass && devRole && roles.includes(devRole)) {
    return profile;
  }

  if (!roles.includes(profile.role)) {
    redirect(roleRedirects[profile.role]);
  }

  return profile;
}

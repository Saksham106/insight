import { cache } from "react";
import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";

export type UserRole = "admin" | "teacher" | "student" | "parent";

export interface UserProfile {
  id: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  avatar_url: string | null;
  primary_role: UserRole;
  available_roles: UserRole[];
}

// cache() dedupes within a render pass — the layout and page both call this,
// which previously cost two getUser() round trips plus two profiles queries.
export const getUserProfile = cache(async (): Promise<UserProfile | null> => {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    return null;
  }

  const [{ data, error }, { data: roleRows }] = await Promise.all([
    supabase
    .from("profiles")
    .select("id, full_name, role, is_active, avatar_url")
    .eq("id", userData.user.id)
    .single(),
    supabase
      .from("profile_roles")
      .select("role")
      .eq("profile_id", userData.user.id),
  ]);

  if (error && error.message.includes("avatar_url")) {
    const { data: fallbackData, error: fallbackError } = await supabase
      .from("profiles")
      .select("id, full_name, role, is_active")
      .eq("id", userData.user.id)
      .single();

    if (fallbackError || !fallbackData) {
      return null;
    }

    const primaryRole = fallbackData.role as UserRole;
    return { ...fallbackData, avatar_url: null, primary_role: primaryRole, available_roles: [primaryRole] } as UserProfile;
  }

  if (error || !data) {
    return null;
  }

  const primaryRole = data.role as UserRole;
  const availableRoles = Array.from(new Set([
    primaryRole,
    ...((roleRows ?? []).map((row) => row.role as UserRole)),
  ]));
  const requestedRole = (await cookies()).get("insight-active-role")?.value as UserRole | undefined;
  const activeRole = requestedRole && availableRoles.includes(requestedRole) ? requestedRole : primaryRole;

  return {
    ...data,
    role: activeRole,
    primary_role: primaryRole,
    available_roles: availableRoles,
  } as UserProfile;
});

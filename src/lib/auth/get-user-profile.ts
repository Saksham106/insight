import { createClient } from "@/lib/supabase/server";

export type UserRole = "admin" | "teacher" | "student" | "parent";

export interface UserProfile {
  id: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  avatar_url: string | null;
}

export async function getUserProfile(): Promise<UserProfile | null> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_active, avatar_url")
    .eq("id", userData.user.id)
    .single();

  if (error && error.message.includes("avatar_url")) {
    const { data: fallbackData, error: fallbackError } = await supabase
      .from("profiles")
      .select("id, full_name, role, is_active")
      .eq("id", userData.user.id)
      .single();

    if (fallbackError || !fallbackData) {
      return null;
    }

    return { ...fallbackData, avatar_url: null } as UserProfile;
  }

  if (error || !data) {
    return null;
  }

  return data as UserProfile;
}

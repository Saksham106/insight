import { createClient } from "@/lib/supabase/server";

export type UserRole = "admin" | "teacher" | "student";

export interface UserProfile {
  id: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
}

export async function getUserProfile(): Promise<UserProfile | null> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_active")
    .eq("id", userData.user.id)
    .single();

  if (error || !data) {
    return null;
  }

  return data as UserProfile;
}

import { SettingsPage } from "@/components/settings/settings-page";
import { requireUser } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsRoute() {
  const profile = await requireUser();
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const { data: settings } = await supabase
    .from("profiles")
    .select("full_name, role, is_active, avatar_url, reminder_24h, timezone, created_at")
    .eq("id", profile.id)
    .single();

  return (
    <SettingsPage
      email={userData.user?.email ?? ""}
      fullName={settings?.full_name ?? profile.full_name}
      role={settings?.role ?? profile.role}
      isActive={settings?.is_active ?? profile.is_active}
      avatarUrl={settings?.avatar_url ?? profile.avatar_url}
      reminder24h={settings?.reminder_24h ?? true}
      timezone={settings?.timezone ?? null}
      createdAt={settings?.created_at ?? null}
    />
  );
}

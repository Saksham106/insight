import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const type = searchParams.get("type");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return NextResponse.redirect(`${origin}/login?error=auth`);
    }

    // Supabase invite callbacks use this configured URL without a type marker.
    if (!type || type === "invite" || type === "recovery") {
      if (!type || type === "invite") {
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData.user?.id;

        if (userId) {
          try {
            const admin = createAdminClient();
            await admin
              .from("profiles")
              .update({ invite_accepted_at: new Date().toISOString() })
              .eq("id", userId)
              .is("invite_accepted_at", null);

            revalidateTag("admin-dashboard", "max");
            revalidateTag("dashboard", "max");
          } catch {
            // Do not block a valid invite from reaching the password page.
          }
        }
      }

      return NextResponse.redirect(`${origin}/set-password`);
    }

    return NextResponse.redirect(`${origin}/login`);
  }

  return NextResponse.redirect(`${origin}/login`);
}

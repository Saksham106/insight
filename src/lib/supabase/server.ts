import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { createAdminClient } from "@/lib/supabase/admin";

export const createClient = async () => {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach((cookie) => cookieStore.set(cookie));
          } catch {
            // Called from a Server Component — cookie writes aren't allowed here.
            // Middleware handles token refresh instead.
          }
        },
      },
    },
  );
};

export const createServerClientWithBypass = async () => {
  const devBypass =
    process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === "true" &&
    process.env.NODE_ENV !== "production";

  if (devBypass) {
    return createAdminClient();
  }

  return createClient();
};

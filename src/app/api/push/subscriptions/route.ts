import { NextResponse } from "next/server";

import { getUserProfile } from "@/lib/auth/get-user-profile";
import { isWebPushConfigured } from "@/lib/push-notifications";
import { createAdminClient } from "@/lib/supabase/admin";

interface SubscriptionBody {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
}

export async function GET() {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { count } = await admin
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", profile.id);

  return NextResponse.json({
    configured: isWebPushConfigured(),
    subscribed: (count ?? 0) > 0,
    publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null,
  });
}

export async function POST(request: Request) {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isWebPushConfigured()) {
    return NextResponse.json({ error: "Push notifications are not configured." }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as SubscriptionBody | null;
  if (
    typeof body?.endpoint !== "string" ||
    typeof body.keys?.p256dh !== "string" ||
    typeof body.keys.auth !== "string"
  ) {
    return NextResponse.json({ error: "Invalid push subscription." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("push_subscriptions").upsert(
    {
      user_id: profile.id,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      user_agent: request.headers.get("user-agent"),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );

  if (error) return NextResponse.json({ error: "Could not save this device." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { endpoint?: unknown } | null;
  if (typeof body?.endpoint !== "string") {
    return NextResponse.json({ error: "Invalid push subscription." }, { status: 400 });
  }

  const admin = createAdminClient();
  await admin
    .from("push_subscriptions")
    .delete()
    .eq("user_id", profile.id)
    .eq("endpoint", body.endpoint);

  return NextResponse.json({ ok: true });
}

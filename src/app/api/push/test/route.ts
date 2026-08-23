import { NextResponse } from "next/server";

import { getUserProfile } from "@/lib/auth/get-user-profile";
import { sendPushToUsers } from "@/lib/push-notifications";

export async function POST() {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await sendPushToUsers(
    [profile.id],
    {
      title: "Insight Academy",
      body: "Notifications are working on this device.",
      url: "/settings",
      tag: `push-test-${profile.id}`,
    },
  );

  if (result.skipped || result.sent === 0) {
    return NextResponse.json(
      { error: "No active notification subscription was found for this account." },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, sent: result.sent, failed: result.failed });
}

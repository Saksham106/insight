import webPush from "web-push";

import { createAdminClient } from "@/lib/supabase/admin";

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

function configureWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:support@myinsightacademy.com";

  if (!publicKey || !privateKey) return false;
  webPush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

export function isWebPushConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export async function sendPushToUsers(userIds: string[], payload: PushPayload) {
  if (!configureWebPush() || userIds.length === 0) {
    return { sent: 0, failed: 0, skipped: true };
  }

  const admin = createAdminClient();
  const uniqueUserIds = [...new Set(userIds)];
  const { data: subscriptions, error } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("user_id", uniqueUserIds);

  if (error || !subscriptions) {
    console.error("Could not load push subscriptions", error);
    return { sent: 0, failed: uniqueUserIds.length, skipped: false };
  }

  let sent = 0;
  let failed = 0;
  const expiredIds: string[] = [];

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webPush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 4, urgency: "high" },
        );
        sent += 1;
      } catch (error) {
        failed += 1;
        const statusCode = typeof error === "object" && error && "statusCode" in error
          ? Number(error.statusCode)
          : 0;
        if (statusCode === 404 || statusCode === 410) expiredIds.push(subscription.id);
        else console.error("Push delivery failed", error);
      }
    }),
  );

  if (expiredIds.length > 0) {
    await admin.from("push_subscriptions").delete().in("id", expiredIds);
  }

  return { sent, failed, skipped: false };
}

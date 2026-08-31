"use client";

import { Analytics } from "@vercel/analytics/next";

import { redactPrivateAnalyticsUrl } from "@/lib/hermes/analytics-privacy";

export function PrivacySafeAnalytics() {
  return (
    <Analytics
      beforeSend={(event) => ({ ...event, url: redactPrivateAnalyticsUrl(event.url) })}
    />
  );
}

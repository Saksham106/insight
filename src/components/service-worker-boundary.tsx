"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js without forcing a mid-session refresh. Updated workers take
 * control after the current app session closes, so an in-progress message or
 * form is never destroyed by background update plumbing.
 */
export function ServiceWorkerBoundary({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("Service worker registration failed:", error);
    });
  }, []);

  return <>{children}</>;
}

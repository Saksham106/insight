"use client";

import { useServiceWorker } from "@/hooks/use-service-worker";

/**
 * Thin client boundary for service-worker registration.
 * Keeps `src/app/layout.tsx` a server component while still
 * registering the service worker on mount.
 */
export function ServiceWorkerBoundary({ children }: { children: React.ReactNode }) {
  useServiceWorker();
  return <>{children}</>;
}

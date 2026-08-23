"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js on mount and applies a pending update on the next
 * navigation (no surprise reloads mid-session).
 */
export function ServiceWorkerBoundary({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            // A new worker took over while we have a controller: reload once,
            // on the next load, so users get updates without thinking about it.
            if (installing.state === "activated" && navigator.serviceWorker.controller) {
              window.location.reload();
            }
          });
        });
      } catch (error) {
        console.error("Service worker registration failed:", error);
      }
    };

    void register();
  }, []);

  return <>{children}</>;
}

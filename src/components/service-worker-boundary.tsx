"use client";

import { useEffect } from "react";

export interface InsightInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

declare global {
  interface Window {
    __insightInstallPrompt?: InsightInstallPromptEvent;
  }
}

/**
 * Registers the service worker, captures Chromium's one-shot PWA install prompt,
 * and asks the browser to check for updates whenever the app returns foreground.
 * Applying an update remains user-controlled in Settings so drafts are safe.
 */
export function ServiceWorkerBoundary({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      window.__insightInstallPrompt = event as InsightInstallPromptEvent;
      window.dispatchEvent(new Event("insight:install-ready"));
    };
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);

    if (!("serviceWorker" in navigator)) {
      return () => window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
    }

    let registration: ServiceWorkerRegistration | null = null;
    const checkForUpdate = () => {
      if (document.visibilityState === "visible") void registration?.update();
    };

    navigator.serviceWorker.register("/sw.js").then((value) => {
      registration = value;
      void registration.update();
    }).catch((error) => {
      console.error("Service worker registration failed:", error);
    });
    document.addEventListener("visibilitychange", checkForUpdate);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      document.removeEventListener("visibilitychange", checkForUpdate);
    };
  }, []);

  return <>{children}</>;
}

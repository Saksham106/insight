"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, RefreshCw, Smartphone } from "lucide-react";

import type { InsightInstallPromptEvent } from "@/components/service-worker-boundary";
import { MobileInstallGuide, type MobilePlatform } from "@/components/settings/mobile-install-guide";
import { Button } from "@/components/ui/button";

type Guide = MobilePlatform | null;
type UpdateState = "idle" | "checking" | "current" | "ready" | "error";

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
}

export function PwaAppSettings() {
  const [guide, setGuide] = useState<Guide>(null);
  const [installed, setInstalled] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InsightInstallPromptEvent | null>(null);
  const [installMessage, setInstallMessage] = useState<string | null>(null);
  const [updateState, setUpdateState] = useState<UpdateState>("idle");
  const [updateMessage, setUpdateMessage] = useState("Check whether a newer version is ready.");

  useEffect(() => {
    const sync = () => {
      setInstalled(isStandalone());
      setInstallPrompt(window.__insightInstallPrompt ?? null);
    };
    const timer = window.setTimeout(sync, 0);
    window.addEventListener("insight:install-ready", sync);
    window.addEventListener("appinstalled", sync);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("insight:install-ready", sync);
      window.removeEventListener("appinstalled", sync);
    };
  }, []);

  const installOnAndroid = async () => {
    const prompt = installPrompt ?? window.__insightInstallPrompt;
    if (!prompt) {
      setGuide("android");
      return;
    }

    setInstallMessage(null);
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      window.__insightInstallPrompt = undefined;
      setInstallPrompt(null);
      if (choice.outcome === "accepted") {
        setInstalled(true);
        setGuide(null);
        setInstallMessage("Insight Academy was added to your device.");
      } else {
        setInstallMessage("Installation was cancelled.");
      }
    } catch {
      // Chrome can retain an install event that is no longer promptable. The
      // manual walkthrough is the reliable fallback for that stale state.
      window.__insightInstallPrompt = undefined;
      setInstallPrompt(null);
      setGuide("android");
    }
  };

  const checkForUpdates = async () => {
    if (!("serviceWorker" in navigator)) {
      setUpdateState("error");
      setUpdateMessage("This browser does not support app updates.");
      return;
    }

    setUpdateState("checking");
    setUpdateMessage("Checking for an update…");

    try {
      const registration = await navigator.serviceWorker.getRegistration() ?? await navigator.serviceWorker.ready;
      const originalController = navigator.serviceWorker.controller;
      let updateFound = Boolean(registration.waiting);
      const onUpdateFound = () => { updateFound = true; };
      registration.addEventListener("updatefound", onUpdateFound);

      const controllerChanged = new Promise<boolean>((resolve) => {
        const timeout = window.setTimeout(() => resolve(false), 8000);
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          window.clearTimeout(timeout);
          resolve(true);
        }, { once: true });
      });

      await registration.update();
      registration.removeEventListener("updatefound", onUpdateFound);

      const installingWorker = registration.installing;
      if (installingWorker) {
        await Promise.race([
          new Promise<void>((resolve) => {
            const handleStateChange = () => {
              if (installingWorker.state === "installed" || installingWorker.state === "activated" || installingWorker.state === "redundant") {
                installingWorker.removeEventListener("statechange", handleStateChange);
                resolve();
              }
            };
            installingWorker.addEventListener("statechange", handleStateChange);
            handleStateChange();
          }),
          new Promise<void>((resolve) => window.setTimeout(resolve, 5000)),
        ]);
      }

      if (registration.waiting) {
        setUpdateState("ready");
        setUpdateMessage("Update found. Installing it now…");
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
      }

      const changed = await Promise.race([
        controllerChanged,
        new Promise<boolean>((resolve) => window.setTimeout(() => resolve(false), updateFound ? 3000 : 300)),
      ]);

      if (changed || navigator.serviceWorker.controller !== originalController) {
        window.location.reload();
        return;
      }

      setUpdateState("current");
      setUpdateMessage(updateFound ? "The update will finish when you reopen the app." : "You already have the latest version.");
    } catch {
      setUpdateState("error");
      setUpdateMessage("Could not check for updates. Try again in a moment.");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <section style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", padding: "16px", border: "1px solid var(--color-border)", borderRadius: "10px", background: "var(--color-soft)", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
          <span style={{ width: "40px", height: "40px", borderRadius: "10px", display: "grid", placeItems: "center", background: "var(--color-surface)", color: "var(--color-navy)", flexShrink: 0 }}>
            {installed ? <CheckCircle2 size={19} /> : <Smartphone size={19} />}
          </span>
          <div>
            <p className="text-sm font-semibold text-navy" style={{ margin: 0 }}>{installed ? "Installed on this device" : "Install the mobile app"}</p>
            <p className="text-sm text-muted" style={{ margin: "3px 0 0", lineHeight: 1.4 }}>{installed ? "Running as a Home Screen app." : "Add Insight Academy to your Home Screen."}</p>
          </div>
        </div>
        {!installed && (
          <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
            <Button type="button" variant="outline" onClick={() => setGuide("ios")}>iPhone</Button>
            <Button type="button" onClick={() => void installOnAndroid()}>Android</Button>
          </div>
        )}
      </section>

      <p className="text-xs text-muted" style={{ margin: "-2px 2px 0", lineHeight: 1.5 }}>
        After installing: open Insight Academy, then go to Settings → Notifications to enable phone alerts.
      </p>

      <section style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", padding: "16px", border: "1px solid var(--color-border)", borderRadius: "10px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
          <span style={{ width: "40px", height: "40px", borderRadius: "10px", display: "grid", placeItems: "center", background: "var(--color-soft)", color: "var(--color-navy)", flexShrink: 0 }}>
            <RefreshCw size={18} />
          </span>
          <div>
            <p className="text-sm font-semibold text-navy" style={{ margin: 0 }}>App updates</p>
            <p className="text-sm text-muted" style={{ margin: "3px 0 0", lineHeight: 1.4 }}>{updateMessage}</p>
          </div>
        </div>
        <Button type="button" variant="outline" disabled={updateState === "checking" || updateState === "ready"} onClick={() => void checkForUpdates()} style={{ flexShrink: 0 }}>
          <RefreshCw size={15} />
          {updateState === "checking" || updateState === "ready" ? "Updating…" : "Check now"}
        </Button>
      </section>

      {installMessage && <p className="text-sm text-muted" style={{ margin: 0 }}>{installMessage}</p>}

      {guide && <MobileInstallGuide platform={guide} onClose={() => setGuide(null)} />}
    </div>
  );
}

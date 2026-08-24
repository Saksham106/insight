"use client";

import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";

type PushState = "loading" | "unsupported" | "unconfigured" | "off" | "on" | "blocked" | "saving";

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

export function PushNotificationControl({ variant = "sheet" }: { variant?: "sheet" | "settings" }) {
  const [state, setState] = useState<PushState>("loading");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      queueMicrotask(() => setState("unsupported"));
      return;
    }

    let cancelled = false;
    Promise.all([
      fetch("/api/push/subscriptions", { cache: "no-store" }).then((response) => response.json()),
      navigator.serviceWorker.ready.then((registration) => registration.pushManager.getSubscription()),
    ]).then(([status, browserSubscription]) => {
      if (cancelled) return;
      if (!status.configured || !status.publicKey) {
        setState("unconfigured");
        return;
      }
      setPublicKey(status.publicKey);
      if (Notification.permission === "denied") setState("blocked");
      else setState(browserSubscription ? "on" : "off");
    }).catch(() => {
      if (!cancelled) setState("off");
    });

    return () => { cancelled = true; };
  }, []);

  const enable = async () => {
    setMessage(null);
    setState("saving");
    try {
      const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches ||
        ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
      if (isIos && !standalone) {
        setState("off");
        setMessage("Add Insight Academy to your Home Screen first, then enable notifications inside the app.");
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }

      if (!publicKey) throw new Error("Push is not configured.");
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const response = await fetch("/api/push/subscriptions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!response.ok) throw new Error("Could not save this device.");
      setState("on");
    } catch (error) {
      setState("off");
      setMessage(error instanceof Error ? error.message : "Could not enable notifications.");
    }
  };

  const disable = async () => {
    setMessage(null);
    setState("saving");
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await fetch("/api/push/subscriptions", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      await subscription.unsubscribe();
    }
    setState("off");
  };

  const testNotification = async () => {
    setMessage(null);
    setTesting(true);
    const response = await fetch("/api/push/test", { method: "POST" }).catch(() => null);
    const data = await response?.json().catch(() => ({})) as { error?: string } | undefined;
    setTesting(false);
    setMessage(response?.ok ? "Test sent. Check your notifications." : data?.error ?? "Could not send a test notification.");
  };

  if (state === "loading" || state === "unsupported" || state === "unconfigured") return null;

  return (
    <div
      style={variant === "settings"
        ? { padding: "16px", border: "1px solid var(--color-border)", borderRadius: "10px", background: "var(--color-surface)" }
        : { padding: "12px 16px", borderBottom: "1px solid var(--color-border)" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <div style={{ width: "36px", height: "36px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-accent-soft)", color: "var(--color-navy)", flexShrink: 0 }}>
          <BellRing size={17} />
        </div>
        <div style={{ minWidth: "140px", flex: 1 }}>
          <p className="text-sm font-semibold text-navy" style={{ margin: 0 }}>Phone notifications</p>
          <p className="text-xs text-muted" style={{ margin: "2px 0 0", lineHeight: 1.35 }}>
            {state === "on" ? "Enabled on this device" : state === "blocked" ? "Blocked in phone settings" : "Get chat alerts when the app is closed"}
          </p>
        </div>
        {state !== "blocked" && (
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            {state === "on" && (
              <button
                type="button"
                disabled={testing}
                onClick={() => void testNotification()}
                style={{ border: "1px solid var(--color-border)", borderRadius: "999px", padding: "8px 11px", background: "var(--color-surface)", color: "var(--color-navy)", fontSize: "12px", fontWeight: 700, cursor: testing ? "wait" : "pointer" }}
              >
                {testing ? "Sending…" : "Test"}
              </button>
            )}
            <button
              type="button"
              disabled={state === "saving"}
              onClick={() => void (state === "on" ? disable() : enable())}
              style={{ border: 0, borderRadius: "999px", padding: "8px 12px", background: state === "on" ? "var(--color-soft)" : "var(--color-navy)", color: state === "on" ? "var(--color-navy)" : "white", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}
            >
              {state === "saving" ? "…" : state === "on" ? "Turn off" : "Enable"}
            </button>
          </div>
        )}
      </div>
      {message && <p className="text-xs text-muted" style={{ margin: "8px 0 0 48px", lineHeight: 1.4 }}>{message}</p>}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

/**
 * Shows a banner while the browser reports no network connection.
 * Self-contained: listens to online/offline events itself instead of
 * trusting a server-rendered prop (which is always "online" on the server).
 */
export function OfflineIndicator() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 60,
        padding: "8px 16px",
        backgroundColor: "var(--color-error)",
        color: "white",
        fontSize: "13px",
        fontWeight: 500,
        textAlign: "center",
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
      }}
    >
      You&apos;re offline — some features may be limited
    </div>
  );
}

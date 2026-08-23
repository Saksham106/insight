"use client";

import { useEffect, useState } from "react";

export function OfflineIndicator({ online }: { online: boolean }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(!online);
  }, [online]);

  if (!visible) return null;

  return (
    <div
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

"use client";

import { useState, useEffect } from "react";

export function PageMain({ children }: { children: React.ReactNode }) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return (
    <main
      style={{
        marginLeft: "auto",
        marginRight: "auto",
        width: "100%",
        maxWidth: "72rem",
        paddingLeft: isMobile ? "16px" : "24px",
        paddingRight: isMobile ? "16px" : "24px",
        paddingTop: isMobile ? "20px" : "32px",
        paddingBottom: isMobile ? "20px" : "32px",
      }}
    >
      {children}
    </main>
  );
}

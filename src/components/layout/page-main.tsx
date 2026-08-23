"use client";

import { usePathname } from "next/navigation";

import { useMediaQuery } from "@/lib/use-media-query";

export function PageMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isMobile = useMediaQuery("(max-width: 768px)");
  const isMobileChats = isMobile && /\/(admin|teacher|student|parent)\/chats(?:\/|$)/.test(pathname);

  return (
    <main
      style={{
        marginLeft: "auto",
        marginRight: "auto",
        width: "100%",
        maxWidth: isMobileChats ? "none" : "72rem",
        paddingLeft: isMobileChats ? 0 : isMobile ? "16px" : "24px",
        paddingRight: isMobileChats ? 0 : isMobile ? "16px" : "24px",
        paddingTop: isMobileChats ? 0 : isMobile ? "20px" : "32px",
        paddingBottom: isMobileChats
          ? 0
          : isMobile
            ? "calc(84px + env(safe-area-inset-bottom, 0px))"
            : "32px",
        overflow: isMobileChats ? "hidden" : undefined,
      }}
    >
      {children}
    </main>
  );
}

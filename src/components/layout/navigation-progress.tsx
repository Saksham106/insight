"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

export function NavigationProgress() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const prevPathname = useRef(pathname);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fadeRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (prevPathname.current === pathname) return;
    prevPathname.current = pathname;

    // Navigation complete — fill to 100% then fade
    if (intervalRef.current) clearInterval(intervalRef.current);
    setProgress(100);
    fadeRef.current = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 350);
    return () => { if (fadeRef.current) clearTimeout(fadeRef.current); };
  }, [pathname]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const a = (e.target as Element).closest("a");
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("http") || href.startsWith("mailto:") || href === pathname || href.startsWith("#")) return;

      if (fadeRef.current) clearTimeout(fadeRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);

      setVisible(true);
      setProgress(20);

      intervalRef.current = setInterval(() => {
        setProgress((p) => {
          if (p >= 80) {
            clearInterval(intervalRef.current!);
            return p;
          }
          return p + Math.random() * 12;
        });
      }, 250);
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [pathname]);

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        height: "3px",
        pointerEvents: "none",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.25s ease",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${progress}%`,
          backgroundColor: "var(--color-navy)",
          transition: progress === 100 ? "width 0.15s ease" : "width 0.3s ease",
          boxShadow: "0 0 8px rgba(18, 48, 74, 0.6)",
        }}
      />
    </div>
  );
}

"use client";

import { useEffect, type RefObject } from "react";

/**
 * Owns the visual viewport while a phone thread is open. iOS otherwise lets a
 * fixed app shell scroll behind an inner message list, then paints the textarea
 * caret against the shifted page instead of the visible composer.
 */
export function useMobileThreadViewport(
  active: boolean,
  overlayRef: RefObject<HTMLDivElement | null>,
) {
  useEffect(() => {
    if (!active) return;
    const overlay = overlayRef.current;
    if (!overlay) return;

    const scrollY = window.scrollY;
    const body = document.body;
    const root = document.documentElement;
    const previousBody = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
      overscrollBehavior: body.style.overscrollBehavior,
    };
    const previousRoot = {
      overflow: root.style.overflow,
      overscrollBehavior: root.style.overscrollBehavior,
    };

    Object.assign(body.style, {
      position: "fixed",
      top: `-${scrollY}px`,
      left: "0",
      right: "0",
      width: "100%",
      overflow: "hidden",
      overscrollBehavior: "none",
    });
    root.style.overflow = "hidden";
    root.style.overscrollBehavior = "none";

    let frame = 0;
    const syncViewport = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const viewport = window.visualViewport;
        overlay.style.top = `${viewport?.offsetTop ?? 0}px`;
        overlay.style.height = `${viewport?.height ?? window.innerHeight}px`;
      });
    };

    syncViewport();
    window.visualViewport?.addEventListener("resize", syncViewport);
    window.visualViewport?.addEventListener("scroll", syncViewport);
    window.addEventListener("resize", syncViewport);

    return () => {
      window.cancelAnimationFrame(frame);
      window.visualViewport?.removeEventListener("resize", syncViewport);
      window.visualViewport?.removeEventListener("scroll", syncViewport);
      window.removeEventListener("resize", syncViewport);
      Object.assign(body.style, previousBody);
      Object.assign(root.style, previousRoot);
      window.scrollTo(0, scrollY);
    };
  }, [active, overlayRef]);
}

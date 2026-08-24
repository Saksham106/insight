"use client";

import Image from "next/image";
import { useState } from "react";
import { Check, ChevronLeft, ChevronRight, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

export type MobilePlatform = "ios" | "android";

interface GuideStep {
  title: string;
  detail: string;
  image: string;
  alt: string;

}

const IOS_STEPS: GuideStep[] = [
  {
    title: "Open Insight Academy in Safari",
    detail: "Open Safari and go to myinsightacademy.com. Apple only allows Home Screen installation from Safari.",
    image: "/onboarding/iphone-safari.webp",
    alt: "Real iPhone Safari screen open on Insight Academy with the website address visible at the bottom",

  },
  {
    title: "Tap the three dots",
    detail: "Tap the three dots beside myinsightacademy.com at the bottom of your screen.",
    image: "/onboarding/iphone-more-menu.webp",
    alt: "Real iPhone Safari toolbar with the three-dot menu beside myinsightacademy.com",

  },
  {
    title: "Tap Share",
    detail: "The Safari menu opens above the page. Tap Share at the top.",
    image: "/onboarding/iphone-share.webp",
    alt: "Real iPhone Safari menu with Share as the first action",

  },
  {
    title: "Add to Home Screen",
    detail: "Scroll down in the Share Sheet, tap Add to Home Screen, then tap Add.",
    image: "/onboarding/iphone-add-home-redacted.webp",
    alt: "Real redacted iPhone Share Sheet with Add to Home Screen at the bottom",

  },
];

const ANDROID_STEPS: GuideStep[] = [
  {
    title: "Open Insight Academy in Chrome",
    detail: "Go to myinsightacademy.com in Chrome, then tap the three dots beside the address bar.",
    image: "/onboarding/android-chrome.webp",
    alt: "Real Android Chrome screen open on the Insight Academy login page",

  },
  {
    title: "Add it to your Home screen",
    detail: "Tap Add to Home screen. Chrome may instead call this Install and create shortcut or Install app.",
    image: "/onboarding/android-menu.webp",
    alt: "Real Android Chrome menu with Add to Home screen visible",

  },
  {
    title: "Confirm the shortcut",
    detail: "Keep the name Insight Academy and tap Add.",
    image: "/onboarding/android-add.webp",
    alt: "Real Android Create shortcut dialog for Insight Academy with the Add action visible",

  },
];

export function MobileInstallGuide({ platform, onClose }: { platform: MobilePlatform; onClose: () => void }) {
  const steps = platform === "ios" ? IOS_STEPS : ANDROID_STEPS;
  const [step, setStep] = useState(0);
  const [copied, setCopied] = useState(false);
  const current = steps[step];

  const copyWebsite = async () => {
    const value = "https://myinsightacademy.com";
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const input = document.createElement("textarea");
      input.value = value;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
    setCopied(true);
  };

  const go = (next: number) => setStep(Math.min(Math.max(next, 0), steps.length - 1));

  return (
    <Modal
      title={platform === "ios" ? "Install on iPhone" : "Install on Android"}
      description={`Step ${step + 1} of ${steps.length}`}
      onClose={onClose}
    >
      <div
        onTouchStart={(event) => event.currentTarget.dataset.startX = String(event.touches[0]?.clientX ?? 0)}
        onTouchEnd={(event) => {
          const start = Number(event.currentTarget.dataset.startX ?? 0);
          const end = event.changedTouches[0]?.clientX ?? start;
          if (start - end > 44) go(step + 1);
          if (end - start > 44) go(step - 1);
        }}
        style={{ display: "flex", flexDirection: "column", gap: "14px", minWidth: 0 }}
      >
        <ScreenshotStep step={current} />

        <div aria-live="polite" style={{ minHeight: "74px" }}>
          <p className="text-base font-semibold text-navy" style={{ margin: 0 }}>{current.title}</p>
          <p className="text-sm text-muted" style={{ margin: "5px 0 0", lineHeight: 1.5 }}>{current.detail}</p>
        </div>

        {platform === "ios" && step === 0 && (
          <Button type="button" variant="outline" onClick={() => void copyWebsite()} style={{ width: "100%" }}>
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? "Website link copied" : "Copy website link"}
          </Button>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
          <button type="button" aria-label="Previous step" disabled={step === 0} onClick={() => go(step - 1)} style={navButtonStyle(step === 0)}>
            <ChevronLeft size={18} />
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            {steps.map((item, index) => (
              <button
                key={item.title}
                type="button"
                aria-label={`Go to step ${index + 1}`}
                onClick={() => go(index)}
                style={{ width: index === step ? "22px" : "7px", height: "7px", borderRadius: "999px", border: 0, padding: 0, background: index === step ? "var(--color-navy)" : "var(--color-border)", transition: "width 180ms ease", cursor: "pointer" }}
              />
            ))}
          </div>
          {step === steps.length - 1 ? (
            <button type="button" aria-label="Finish guide" onClick={onClose} style={{ ...navButtonStyle(false), width: "auto", padding: "0 14px", fontSize: "13px", fontWeight: 700 }}>Done</button>
          ) : (
            <button type="button" aria-label="Next step" onClick={() => go(step + 1)} style={navButtonStyle(false)}>
              <ChevronRight size={18} />
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

export function NotificationQuickGuide() {
  const steps = [
    ["1", "Install the app", "Add Insight Academy to your Home Screen first."],
    ["2", "Open Notifications", "In the installed app, open Settings and tap Notifications."],
    ["3", "Enable and allow", "Tap Enable, then approve the phone’s Allow prompt."],
  ];
  return (
    <section className="notification-quick-guide" aria-label="Notification setup guide">
      {steps.map(([number, title, detail]) => (
        <div key={number} style={{ minWidth: 0, padding: "12px", borderRadius: "10px", background: "var(--color-soft)", border: "1px solid var(--color-border)" }}>
          <span style={{ width: "24px", height: "24px", display: "grid", placeItems: "center", borderRadius: "7px", background: "var(--color-navy)", color: "white", fontSize: "11px", fontWeight: 800 }}>{number}</span>
          <p className="text-sm font-semibold text-navy" style={{ margin: "9px 0 0" }}>{title}</p>
          <p className="text-xs text-muted" style={{ margin: "3px 0 0", lineHeight: 1.4 }}>{detail}</p>
        </div>
      ))}
    </section>
  );
}

function ScreenshotStep({ step }: { step: GuideStep }) {
  return (
    <figure style={{ position: "relative", height: "clamp(280px, 46dvh, 430px)", margin: 0, borderRadius: "16px", overflow: "hidden", background: "#292b2d", border: "1px solid var(--color-border)" }}>
      <Image src={step.image} alt={step.alt} fill sizes="(max-width: 768px) 92vw, 560px" priority style={{ objectFit: "contain" }} />
    </figure>
  );
}

function navButtonStyle(disabled: boolean): React.CSSProperties {
  return { width: "40px", height: "40px", display: "grid", placeItems: "center", borderRadius: "10px", border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-navy)", opacity: disabled ? 0.35 : 1, cursor: disabled ? "default" : "pointer" };
}

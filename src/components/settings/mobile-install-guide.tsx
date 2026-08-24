"use client";

import { useState } from "react";
import { Bell, Check, ChevronLeft, ChevronRight, Copy, MoreHorizontal, Share2, Smartphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

export type MobilePlatform = "ios" | "android";
type Artwork = "safari" | "ios-menu" | "ios-share" | "ios-add" | "home" | "chrome" | "android-menu" | "android-install" | "notify";

interface GuideStep {
  title: string;
  detail: string;
  artwork: Artwork;
}

const IOS_STEPS: GuideStep[] = [
  {
    title: "Open Insight Academy in Safari",
    detail: "Open Safari and go to myinsightacademy.com. Apple only allows Home Screen installation from Safari.",
    artwork: "safari",
  },
  {
    title: "Tap the three dots",
    detail: "Tap the three dots beside myinsightacademy.com at the bottom of your screen.",
    artwork: "ios-menu",
  },
  {
    title: "Tap Share",
    detail: "In the menu that opens, tap Share.",
    artwork: "ios-share",
  },
  {
    title: "Add to Home Screen",
    detail: "Scroll down in the Share menu, then tap Add to Home Screen and tap Add.",
    artwork: "ios-add",
  },
  {
    title: "Turn on notifications",
    detail: "Open the new Insight Academy app, tap the bell, tap Enable, then tap Allow on the iPhone prompt.",
    artwork: "notify",
  },
];

const ANDROID_STEPS: GuideStep[] = [
  {
    title: "Open Insight Academy in Chrome",
    detail: "Open Chrome and go to myinsightacademy.com.",
    artwork: "chrome",
  },
  {
    title: "Open Chrome’s menu",
    detail: "Tap the three dots beside the address bar.",
    artwork: "android-menu",
  },
  {
    title: "Install the app",
    detail: "Tap Install and create shortcut. Some phones call this Install app or Add to Home screen.",
    artwork: "android-install",
  },
  {
    title: "Turn on notifications",
    detail: "Open Insight Academy, tap the bell, tap Enable, then approve Chrome’s notification prompt.",
    artwork: "notify",
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
        <GuideArtwork kind={current.artwork} platform={platform} />

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
          <button
            type="button"
            aria-label="Previous step"
            disabled={step === 0}
            onClick={() => go(step - 1)}
            style={navButtonStyle(step === 0)}
          >
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
    ["2", "Tap the bell", "Open the app and tap the bell in the top-right corner."],
    ["3", "Enable and allow", "Tap Enable, then approve the phone’s Allow prompt."],
  ];
  return (
    <section aria-label="Notification setup guide" style={{ display: "flex", width: "100%", maxWidth: "100%", minWidth: 0, gap: "8px", overflowX: "auto", paddingBottom: "4px", WebkitOverflowScrolling: "touch", scrollSnapType: "x proximity" }}>
      {steps.map(([number, title, detail]) => (
        <div key={number} style={{ flex: "1 0 160px", maxWidth: "210px", padding: "12px", borderRadius: "10px", background: "var(--color-soft)", border: "1px solid var(--color-border)", scrollSnapAlign: "start" }}>
          <span style={{ width: "24px", height: "24px", display: "grid", placeItems: "center", borderRadius: "7px", background: "var(--color-navy)", color: "white", fontSize: "11px", fontWeight: 800 }}>{number}</span>
          <p className="text-sm font-semibold text-navy" style={{ margin: "9px 0 0" }}>{title}</p>
          <p className="text-xs text-muted" style={{ margin: "3px 0 0", lineHeight: 1.4 }}>{detail}</p>
        </div>
      ))}
    </section>
  );
}

function GuideArtwork({ kind, platform }: { kind: Artwork; platform: MobilePlatform }) {
  const menuOpen = kind === "ios-share" || kind === "ios-add" || kind === "android-menu" || kind === "android-install";
  return (
    <div style={{ height: "250px", display: "grid", placeItems: "center", borderRadius: "16px", overflow: "hidden", background: "linear-gradient(145deg, var(--color-soft), var(--color-background))", border: "1px solid var(--color-border)" }}>
      {kind === "home" ? <HomeScreen /> : (
        <div style={{ width: "174px", height: "224px", borderRadius: "26px", border: "5px solid var(--color-navy)", background: "var(--color-background)", overflow: "hidden", position: "relative", boxShadow: "0 14px 28px rgba(36, 53, 65, 0.16)" }}>
          <div style={{ height: "18px", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 12px", fontSize: "7px", fontWeight: 800, background: "var(--color-surface)" }}><span>9:41</span><span>● ●</span></div>
          <MiniApp />
          {platform === "ios" ? <SafariBar highlight={kind === "ios-menu"} /> : <ChromeBar highlight={kind === "android-menu"} />}
          {menuOpen && <BrowserMenu kind={kind} />}
          {kind === "notify" && <NotificationMock />}
        </div>
      )}
    </div>
  );
}

function MiniApp() {
  return (
    <div style={{ position: "absolute", inset: "18px 0 42px", padding: "10px", background: "var(--color-background)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontFamily: "serif", fontSize: "10px", fontWeight: 800, color: "var(--color-navy)" }}>Insight Academy</span>
        <Bell size={11} color="var(--color-navy)" />
      </div>
      <div style={{ marginTop: "13px", height: "30px", borderRadius: "8px", background: "var(--color-accent-soft)" }} />
      <div style={{ marginTop: "7px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
        <div style={{ height: "50px", borderRadius: "8px", background: "var(--color-surface)", border: "1px solid var(--color-border)" }} />
        <div style={{ height: "50px", borderRadius: "8px", background: "var(--color-surface)", border: "1px solid var(--color-border)" }} />
      </div>
    </div>
  );
}

function SafariBar({ highlight }: { highlight: boolean }) {
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "42px", display: "flex", alignItems: "center", gap: "6px", padding: "5px 8px 8px", background: "rgba(248,248,248,.96)", borderTop: "1px solid var(--color-border)" }}>
      <span style={{ fontSize: "10px" }}>‹</span>
      <div style={{ flex: 1, height: "27px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "4px", padding: "0 8px", borderRadius: "10px", background: "white", fontSize: "7px", color: "var(--color-muted)", boxShadow: highlight ? "0 0 0 3px var(--color-accent-soft)" : undefined }}>
        <span>myinsightacademy.com</span><MoreHorizontal size={13} color="var(--color-navy)" />
      </div>
    </div>
  );
}

function ChromeBar({ highlight }: { highlight: boolean }) {
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: "18px", height: "35px", display: "flex", alignItems: "center", gap: "5px", padding: "5px 7px", background: "white", borderBottom: "1px solid var(--color-border)" }}>
      <div style={{ flex: 1, height: "24px", borderRadius: "12px", background: "var(--color-soft)", display: "flex", alignItems: "center", padding: "0 8px", fontSize: "7px" }}>myinsightacademy.com</div>
      <MoreHorizontal size={14} color="var(--color-navy)" style={{ boxShadow: highlight ? "0 0 0 4px var(--color-accent-soft)" : undefined, borderRadius: "50%" }} />
    </div>
  );
}

function BrowserMenu({ kind }: { kind: Artwork }) {
  const share = kind === "ios-share";
  const add = kind === "ios-add";
  const androidInstall = kind === "android-install";
  return (
    <div style={{ position: "absolute", left: "8px", right: "8px", bottom: kind.startsWith("ios") ? "44px" : "12px", padding: "8px", borderRadius: "13px", background: "rgba(255,255,255,.98)", border: "1px solid var(--color-border)", boxShadow: "0 10px 24px rgba(35,44,50,.2)" }}>
      {add ? (
        <>
          <MenuRow icon={<Share2 size={11} />} label="Share" />
          <MenuRow icon={<Smartphone size={11} />} label="Add to Home Screen" active />
          <MenuRow icon={<Copy size={11} />} label="Copy" />
        </>
      ) : androidInstall ? (
        <>
          <MenuRow icon={<Smartphone size={11} />} label="Install and create shortcut" active />
          <MenuRow icon={<Share2 size={11} />} label="Share" />
        </>
      ) : (
        <>
          <MenuRow icon={<Share2 size={11} />} label="Share" active={share} />
          <MenuRow icon={<Copy size={11} />} label="Copy" />
          <MenuRow icon={<Smartphone size={11} />} label={kind === "android-menu" ? "Install and create shortcut" : "Add to Home Screen"} />
        </>
      )}
    </div>
  );
}

function MenuRow({ icon, label, active = false }: { icon: React.ReactNode; label: string; active?: boolean }) {
  return <div style={{ height: "28px", display: "flex", alignItems: "center", gap: "8px", padding: "0 8px", borderRadius: "7px", background: active ? "var(--color-accent-soft)" : "transparent", color: "var(--color-navy)", fontSize: "8px", fontWeight: active ? 800 : 600 }}>{icon}{label}</div>;
}

function HomeScreen() {
  return (
    <div style={{ width: "174px", height: "224px", borderRadius: "26px", border: "5px solid var(--color-navy)", padding: "30px 17px", background: "linear-gradient(155deg, var(--color-accent-soft), var(--color-background))" }}>
      <div style={{ width: "46px", textAlign: "center" }}>
        <div style={{ width: "46px", height: "46px", borderRadius: "11px", display: "grid", placeItems: "center", background: "var(--color-navy)", color: "white", fontFamily: "serif", fontSize: "18px", fontWeight: 800 }}>IA</div>
        <p style={{ margin: "4px -8px 0", fontSize: "7px", fontWeight: 700 }}>Insight Academy</p>
      </div>
    </div>
  );
}

function NotificationMock() {
  return (
    <div style={{ position: "absolute", left: "8px", right: "8px", top: "55px", padding: "10px", borderRadius: "13px", background: "white", border: "1px solid var(--color-border)", boxShadow: "0 10px 22px rgba(35,44,50,.2)" }}>
      <p style={{ margin: 0, fontSize: "9px", fontWeight: 800, color: "var(--color-navy)" }}>Phone notifications</p>
      <p style={{ margin: "3px 0 8px", fontSize: "7px", color: "var(--color-muted)" }}>Get chat alerts when the app is closed</p>
      <div style={{ height: "24px", display: "grid", placeItems: "center", borderRadius: "8px", background: "var(--color-navy)", color: "white", fontSize: "8px", fontWeight: 800 }}>Enable</div>
      <div style={{ marginTop: "7px", padding: "7px", borderRadius: "8px", background: "var(--color-soft)", fontSize: "7px", textAlign: "center" }}>“Insight Academy” would like to send notifications<br/><strong>Don’t Allow &nbsp; Allow</strong></div>
    </div>
  );
}

function navButtonStyle(disabled: boolean): React.CSSProperties {
  return { width: "40px", height: "40px", display: "grid", placeItems: "center", borderRadius: "10px", border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-navy)", opacity: disabled ? 0.35 : 1, cursor: disabled ? "default" : "pointer" };
}

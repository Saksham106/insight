"use client";

import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";

import { useMediaQuery } from "@/lib/use-media-query";
import type { AvailabilityOverride, AvailabilityRule, BookingSettings } from "@/lib/availability/types";
import type { Session } from "@/components/sessions/session-card";

import { AvailabilityCalendar } from "./availability-calendar";
import { BookingSettingsForm } from "./booking-settings-form";

export function AvailabilityEditor({ sessions = [] }: { sessions?: Session[] }) {
  const [settings, setSettings] = useState<BookingSettings | null>(null);
  const [rules, setRules] = useState<AvailabilityRule[]>([]);
  const [overrides, setOverrides] = useState<AvailabilityOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMobile = useMediaQuery("(max-width: 768px)");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const res = await fetch("/api/availability/settings");
      const data = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (!res.ok) {
        setError(data.error ?? "Could not load availability settings.");
        setLoading(false);
        return;
      }
      setSettings(data.settings as BookingSettings);
      setRules(data.rules as AvailabilityRule[]);
      setOverrides(data.overrides as AvailabilityOverride[]);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const timezone = settings?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <div
        className="border border-border bg-surface"
        style={{
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          alignItems: isMobile ? "stretch" : "center",
          justifyContent: "space-between",
          gap: "14px",
          borderRadius: "12px",
          padding: isMobile ? "14px" : "16px 18px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
          <div
            style={{
              width: "38px",
              height: "38px",
              borderRadius: "10px",
              backgroundColor: "rgba(27,53,96,0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <CalendarClock size={18} color="var(--color-navy)" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: 0 }}>
            <p className="text-sm font-semibold text-navy">Availability</p>
            <p className="text-sm text-muted" style={{ lineHeight: 1.45 }}>
              Set your weekly hours, booking rules, and one-off date overrides so students can book directly.
            </p>
          </div>
        </div>
      </div>

      {loading && <p className="text-sm text-muted">Loading availability...</p>}

      {!loading && error && <p className="text-sm text-error">{error}</p>}

      {!loading && !error && settings && (
        <>
          <div className="border border-border bg-surface" style={{ borderRadius: "12px", padding: isMobile ? "14px" : "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
            <p className="text-sm font-semibold text-navy">Your availability</p>
            <AvailabilityCalendar
              settings={settings}
              rules={rules}
              overrides={overrides}
              sessions={sessions}
              timezone={timezone}
              onRulesChange={setRules}
              onOverridesChange={setOverrides}
            />
          </div>

          <details className="border border-border bg-surface" style={{ borderRadius: "12px", padding: isMobile ? "14px" : "20px" }}>
            <summary className="text-sm font-semibold text-navy" style={{ cursor: "pointer" }}>Booking rules</summary>
            <div style={{ marginTop: "16px" }}>
              <BookingSettingsForm
                settings={settings}
                rulesCount={rules.filter((r) => r.is_active && r.rule_type === "available").length}
                onSaved={setSettings}
              />
            </div>
          </details>
        </>
      )}
    </section>
  );
}

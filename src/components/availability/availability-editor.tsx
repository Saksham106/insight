"use client";

import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";

import { useMediaQuery } from "@/lib/use-media-query";
import type { BookingSettings, DateAvailabilityOverride, WeeklyAvailabilityRule } from "@/lib/availability/types";

import { BookingSettingsForm } from "./booking-settings-form";
import { WeeklyHoursEditor } from "./weekly-hours-editor";

export function AvailabilityEditor() {
  const [settings, setSettings] = useState<BookingSettings | null>(null);
  const [rules, setRules] = useState<WeeklyAvailabilityRule[]>([]);
  const [overrides, setOverrides] = useState<DateAvailabilityOverride[]>([]);
  const [resolvedTimezone, setResolvedTimezone] = useState<string | null>(null);
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
      setRules(data.rules as WeeklyAvailabilityRule[]);
      setOverrides(data.overrides as DateAvailabilityOverride[]);
      setResolvedTimezone((data.resolvedTimezone as string | undefined) ?? null);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // The zone the engine interprets availability in. Times dragged on the grid are
  // saved as wall-clock in this zone, so if the teacher's device is in a different
  // zone we warn them the grid isn't showing their local time.
  const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const timezone = resolvedTimezone ?? settings?.timezone ?? browserTimezone;
  const timezoneMismatch = timezone !== browserTimezone;

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
              backgroundColor: "var(--color-accent-soft)",
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
              Set the hours students can book you each week. Add specific-date changes or booking rules below.
            </p>
            {!loading && !error && settings && (
              <p className="text-xs text-muted" style={{ marginTop: "2px" }}>
                Times shown in <span className="font-semibold">{timezone}</span>
              </p>
            )}
          </div>
        </div>
      </div>

      {!loading && !error && settings && timezoneMismatch && (
        <p
          className="text-sm text-warning border border-border"
          style={{ borderRadius: "10px", padding: "10px 14px", backgroundColor: "rgba(216,162,74,0.10)", lineHeight: 1.45 }}
        >
          Your device is set to <span className="font-semibold">{browserTimezone}</span>, but your availability is managed
          in <span className="font-semibold">{timezone}</span>. Enter times as they should appear in {timezone}, not your local time.
        </p>
      )}

      {loading && <p className="text-sm text-muted">Loading availability...</p>}

      {!loading && error && <p className="text-sm text-error">{error}</p>}

      {!loading && !error && settings && (
        <>
          <details open className="border border-border bg-surface" style={{ borderRadius: "12px", padding: isMobile ? "14px" : "20px" }}>
            <summary className="text-sm font-semibold text-navy" style={{ cursor: "pointer" }}>Your weekly hours</summary>
            <div style={{ marginTop: "16px" }}>
              <WeeklyHoursEditor
                mode="restricted"
                rules={rules}
                overrides={overrides}
                timezone={timezone}
                onRulesChange={setRules}
                onOverridesChange={setOverrides}
              />
            </div>
          </details>

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

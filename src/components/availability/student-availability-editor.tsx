"use client";

import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";

import { useMediaQuery } from "@/lib/use-media-query";
import type { DateAvailabilityOverride, WeeklyAvailabilityRule } from "@/lib/availability/types";

import { WeeklyHoursEditor } from "./weekly-hours-editor";

// Lets a student publish the weekly hours they can meet. These intersect with
// each teacher's open times when the student books, so a student only ever sees
// slots that work for both of them. Setting nothing leaves booking unrestricted.
export function StudentAvailabilityEditor() {
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [rules, setRules] = useState<WeeklyAvailabilityRule[]>([]);
  const [overrides, setOverrides] = useState<DateAvailabilityOverride[]>([]);
  const [timezone, setTimezone] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/student-availability");
      const data = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (!res.ok) {
        setError(data.error ?? "Could not load your availability.");
        setLoading(false);
        return;
      }
      setRules((data.rules as WeeklyAvailabilityRule[]) ?? []);
      setOverrides((data.overrides as DateAvailabilityOverride[]) ?? []);
      setTimezone((data.timezone as string | undefined) ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const browserTimezone = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";
  const tz = timezone ?? browserTimezone;

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <div
        className="border border-border bg-surface"
        style={{ display: "flex", alignItems: "center", gap: "12px", borderRadius: "12px", padding: isMobile ? "14px" : "16px 18px" }}
      >
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
          <p className="text-sm font-semibold text-navy">Your availability</p>
          <p className="text-sm text-muted" style={{ lineHeight: 1.45 }}>
            Add the times you can meet. Booking will only show slots that also work for your teacher.
          </p>
          {!loading && !error && (
            <p className="text-xs text-muted" style={{ marginTop: "2px" }}>
              Times shown in <span className="font-semibold">{tz}</span>
            </p>
          )}
        </div>
      </div>

      {loading && <p className="text-sm text-muted">Loading your availability...</p>}
      {!loading && error && <p className="text-sm text-error">{error}</p>}

      {!loading && !error && (
        <div
          className="border border-border bg-surface"
          style={{ borderRadius: "12px", padding: isMobile ? "14px" : "20px" }}
        >
          <WeeklyHoursEditor
            mode="restricted"
            rules={rules}
            overrides={overrides}
            timezone={tz}
            onRulesChange={setRules}
            onOverridesChange={setOverrides}
            rulesEndpoint="/api/student-availability/rules"
            overridesEndpoint="/api/student-availability/overrides"
          />
        </div>
      )}
    </section>
  );
}

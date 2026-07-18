"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { BookingSettings } from "@/lib/availability/types";

interface BookingSettingsFormProps {
  settings: BookingSettings;
  rulesCount?: number;
  onSaved: (settings: BookingSettings) => void;
}

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];

function toNumber(value: string) {
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? 0 : n;
}

export function BookingSettingsForm({ settings, rulesCount = 0, onSaved }: BookingSettingsFormProps) {
  const [defaultDuration, setDefaultDuration] = useState(settings.default_duration_minutes);
  const [allowedDurations, setAllowedDurations] = useState<number[]>(settings.allowed_durations);
  const [bufferBefore, setBufferBefore] = useState(settings.buffer_before_minutes);
  const [bufferAfter, setBufferAfter] = useState(settings.buffer_after_minutes);
  const [minimumNotice, setMinimumNotice] = useState(settings.minimum_notice_hours);
  const [maxDaysAhead, setMaxDaysAhead] = useState(settings.max_days_ahead);
  const [autoConfirm, setAutoConfirm] = useState(settings.auto_confirm);
  // Open-hours envelope is no longer edited directly (single "available hours"
  // model), but we pass the stored values through so the API validation passes.
  const openDayStart = settings.open_day_start.slice(0, 5);
  const openDayEnd = settings.open_day_end.slice(0, 5);
  const [slotIncrement, setSlotIncrement] = useState(settings.slot_increment_minutes);
  const [timezone] = useState(settings.timezone);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const toggleDuration = (duration: number) => {
    setAllowedDurations((prev) =>
      prev.includes(duration) ? prev.filter((d) => d !== duration) : [...prev, duration].sort((a, b) => a - b),
    );
    setSuccess(false);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (allowedDurations.length === 0) {
      setError("Select at least one allowed session length.");
      return;
    }
    if (!allowedDurations.includes(defaultDuration)) {
      setError("Default duration must be one of the allowed durations.");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/availability/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        default_duration_minutes: defaultDuration,
        allowed_durations: allowedDurations,
        buffer_before_minutes: bufferBefore,
        buffer_after_minutes: bufferAfter,
        minimum_notice_hours: minimumNotice,
        max_days_ahead: maxDaysAhead,
        auto_confirm: autoConfirm,
        // Single availability model: teachers paint the hours students can book.
        availability_mode: "restricted",
        open_day_start: openDayStart,
        open_day_end: openDayEnd,
        timezone,
        slot_increment_minutes: slotIncrement,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }

    setSuccess(true);
    onSaved(data.settings as BookingSettings);
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    height: "40px",
    borderRadius: "6px",
    border: "1px solid var(--color-border)",
    backgroundColor: "var(--color-background)",
    color: "var(--color-foreground)",
    fontSize: "14px",
    padding: "0 10px",
  };

  return (
    <form style={{ display: "flex", flexDirection: "column", gap: "16px" }} onSubmit={handleSubmit}>
      {/* Essentials — the two settings most teachers actually care about. */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxWidth: "260px" }}>
        <Label htmlFor="default-duration">Session length</Label>
        <select
          id="default-duration"
          value={defaultDuration}
          onChange={(e) => {
            setDefaultDuration(toNumber(e.target.value));
            setSuccess(false);
          }}
          style={inputStyle}
        >
          {allowedDurations.length === 0 ? (
            <option value={defaultDuration}>{defaultDuration} min</option>
          ) : (
            allowedDurations.map((d) => (
              <option key={d} value={d}>
                {d} min
              </option>
            ))
          )}
        </select>
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={autoConfirm}
          onChange={(e) => {
            setAutoConfirm(e.target.checked);
            setSuccess(false);
          }}
        />
        Automatically confirm student bookings
      </label>

      {/* Advanced — sensible defaults; most teachers never open this. */}
      <details className="border border-border" style={{ borderRadius: "10px", padding: "12px 14px" }}>
        <summary className="text-sm font-semibold text-navy" style={{ cursor: "pointer" }}>Advanced options</summary>
        <div style={{ marginTop: "14px", display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <Label>Allowed session lengths</Label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
              {DURATION_OPTIONS.map((duration) => (
                <label
                  key={duration}
                  style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "14px", color: "var(--color-foreground)", cursor: "pointer" }}
                >
                  <input type="checkbox" checked={allowedDurations.includes(duration)} onChange={() => toggleDuration(duration)} />
                  {duration} min
                </label>
              ))}
            </div>
          </div>

          <div className="form-grid-2">
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <Label htmlFor="slot-increment">Slot spacing</Label>
              <select id="slot-increment" value={slotIncrement} onChange={(e) => { setSlotIncrement(toNumber(e.target.value)); setSuccess(false); }} style={inputStyle}>
                <option value={15}>Every 15 minutes</option>
                <option value={30}>Every 30 minutes</option>
                <option value={60}>Every hour</option>
              </select>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <Label htmlFor="minimum-notice">Minimum notice (hours)</Label>
              <input id="minimum-notice" type="number" min={0} value={minimumNotice} onChange={(e) => { setMinimumNotice(toNumber(e.target.value)); setSuccess(false); }} style={inputStyle} />
            </div>
          </div>

          <div className="form-grid-3">
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <Label htmlFor="max-days-ahead">Max days ahead</Label>
              <input id="max-days-ahead" type="number" min={1} max={180} value={maxDaysAhead} onChange={(e) => { setMaxDaysAhead(toNumber(e.target.value)); setSuccess(false); }} style={inputStyle} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <Label htmlFor="buffer-before">Buffer before (min)</Label>
              <input id="buffer-before" type="number" min={0} value={bufferBefore} onChange={(e) => { setBufferBefore(toNumber(e.target.value)); setSuccess(false); }} style={inputStyle} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <Label htmlFor="buffer-after">Buffer after (min)</Label>
              <input id="buffer-after" type="number" min={0} value={bufferAfter} onChange={(e) => { setBufferAfter(toNumber(e.target.value)); setSuccess(false); }} style={inputStyle} />
            </div>
          </div>
        </div>
      </details>

      {error && <p className="text-sm text-error">{error}</p>}
      {success && <p className="text-sm text-emerald-600">Settings saved.</p>}

      <Button type="submit" disabled={loading} style={{ width: "fit-content" }}>
        {loading ? "Saving..." : "Save settings"}
      </Button>
    </form>
  );
}

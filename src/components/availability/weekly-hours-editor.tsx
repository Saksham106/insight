"use client";

import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TimePicker } from "@/components/ui/time-picker";
import type { AvailabilityOverride, AvailabilityRule, BookingSettings } from "@/lib/availability/types";

interface Props {
  settings: BookingSettings;
  rules: AvailabilityRule[];
  overrides: AvailabilityOverride[];
  timezone: string;
  onRulesChange: (rules: AvailabilityRule[]) => void;
  onOverridesChange: (overrides: AvailabilityOverride[]) => void;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Times come back from the DB as HH:MM or HH:MM:SS; the pickers use HH:MM.
function hhmm(time: string): string {
  return time.slice(0, 5);
}

function todayDateString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatOverrideDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function WeeklyHoursEditor({ settings, rules, overrides, timezone, onRulesChange, onOverridesChange }: Props) {
  const [error, setError] = useState<string | null>(null);

  // In "open" mode a teacher is bookable by default and paints time OFF (blocked);
  // in "restricted" mode they paint the hours students CAN book (available).
  const isOpen = settings.availability_mode === "open";
  const ruleType: "available" | "blocked" = isOpen ? "blocked" : "available";
  const rangeNoun = isOpen ? "blocked" : "available";

  const weeklyRules = useMemo(
    () =>
      rules
        .filter((r) => r.is_active && r.rule_type === ruleType)
        .sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [rules, ruleType],
  );

  const rulesByDay = (weekday: number) => weeklyRules.filter((r) => r.weekday === weekday);

  async function addRange(weekday: number) {
    setError(null);
    const res = await fetch("/api/availability/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekday, start_time: "09:00", end_time: "17:00", timezone, rule_type: ruleType }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Could not add that time.");
      return;
    }
    onRulesChange([...rules, data.rule as AvailabilityRule]);
  }

  async function patchRule(id: string, patch: Partial<Pick<AvailabilityRule, "start_time" | "end_time">>) {
    const target = rules.find((r) => r.id === id);
    if (!target) return;
    const nextStart = hhmm(patch.start_time ?? target.start_time);
    const nextEnd = hhmm(patch.end_time ?? target.end_time);
    if (nextEnd <= nextStart) {
      setError("End time must be after the start time.");
      return;
    }
    setError(null);
    const prev = rules;
    onRulesChange(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const res = await fetch(`/api/availability/rules/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      onRulesChange(prev);
      setError("Could not update that time.");
    }
  }

  async function removeRange(id: string) {
    setError(null);
    const prev = rules;
    onRulesChange(rules.map((r) => (r.id === id ? { ...r, is_active: false } : r)));
    const res = await fetch(`/api/availability/rules/${id}`, { method: "DELETE" });
    if (!res.ok) {
      onRulesChange(prev);
      setError("Could not remove that time.");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      <p className="text-sm text-muted" style={{ lineHeight: 1.45 }}>
        {isOpen
          ? "You're bookable during your open hours. Add times below to block off part of a day."
          : "Add the times each day when students can book you. Days with no times are not bookable."}
      </p>

      {error && <p className="text-sm text-error">{error}</p>}

      {/* Weekly hours */}
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {WEEKDAYS.map((name, weekday) => {
          const dayRules = rulesByDay(weekday);
          return (
            <div
              key={weekday}
              className="border border-border"
              style={{ borderRadius: "12px", padding: "14px", display: "flex", flexDirection: "column", gap: "10px" }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                <p className="text-sm font-semibold text-navy">{name}</p>
                <Button type="button" size="sm" variant="outline" onClick={() => addRange(weekday)}>
                  <Plus style={{ height: "14px", width: "14px", marginRight: "4px" }} />
                  Add time
                </Button>
              </div>

              {dayRules.length === 0 ? (
                <p className="text-sm text-muted">{isOpen ? "Bookable all open hours" : "Unavailable"}</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {dayRules.map((r) => (
                    <div key={r.id} style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <TimePicker
                        value={hhmm(r.start_time)}
                        onChange={(v) => patchRule(r.id, { start_time: v })}
                      />
                      <span className="text-sm text-muted">to</span>
                      <TimePicker
                        value={hhmm(r.end_time)}
                        onChange={(v) => patchRule(r.id, { end_time: v })}
                      />
                      <button
                        type="button"
                        aria-label="Remove time"
                        onClick={() => removeRange(r.id)}
                        className="text-muted hover:text-error"
                        style={{ background: "none", border: "none", cursor: "pointer", padding: "6px", display: "flex", alignItems: "center" }}
                      >
                        <X style={{ height: "16px", width: "16px" }} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <DateOverrides
        overrides={overrides}
        timezone={timezone}
        rangeNoun={rangeNoun}
        onError={setError}
        onOverridesChange={onOverridesChange}
      />
    </div>
  );
}

interface DateOverridesProps {
  overrides: AvailabilityOverride[];
  timezone: string;
  rangeNoun: string;
  onError: (message: string | null) => void;
  onOverridesChange: (overrides: AvailabilityOverride[]) => void;
}

function DateOverrides({ overrides, timezone, rangeNoun, onError, onOverridesChange }: DateOverridesProps) {
  const [date, setDate] = useState("");
  const [isAvailable, setIsAvailable] = useState(false);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("17:00");
  const [saving, setSaving] = useState(false);

  const sorted = useMemo(() => [...overrides].sort((a, b) => a.date.localeCompare(b.date)), [overrides]);

  async function addOverride() {
    onError(null);
    if (!date) {
      onError("Choose a date for the override.");
      return;
    }
    // An available override needs a time window; a full-day block does not.
    const body = isAvailable
      ? { date, start_time: start, end_time: end, timezone, is_available: true, reason: null }
      : { date, start_time: null, end_time: null, timezone, is_available: false, reason: null };

    if (isAvailable && end <= start) {
      onError("End time must be after the start time.");
      return;
    }

    setSaving(true);
    const res = await fetch("/api/availability/overrides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      onError(data.error ?? "Could not add that override.");
      return;
    }
    onOverridesChange([...overrides, data.override as AvailabilityOverride]);
    setDate("");
  }

  async function removeOverride(id: string) {
    onError(null);
    const prev = overrides;
    onOverridesChange(overrides.filter((o) => o.id !== id));
    const res = await fetch(`/api/availability/overrides/${id}`, { method: "DELETE" });
    if (!res.ok) {
      onOverridesChange(prev);
      onError("Could not remove that override.");
    }
  }

  return (
    <details className="border border-border" style={{ borderRadius: "12px", padding: "14px" }}>
      <summary className="text-sm font-semibold text-navy" style={{ cursor: "pointer" }}>
        Specific dates ({overrides.length})
      </summary>
      <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <p className="text-sm text-muted" style={{ lineHeight: 1.45 }}>
          Override a single date — mark yourself away, or open extra hours for one day.
        </p>

        {sorted.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {sorted.map((o) => (
              <div
                key={o.id}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}
              >
                <p className="text-sm text-foreground">
                  <span className="font-medium">{formatOverrideDate(o.date)}</span>
                  {" — "}
                  {o.is_available
                    ? `Available ${hhmm(o.start_time ?? "")}–${hhmm(o.end_time ?? "")}`
                    : "Unavailable all day"}
                </p>
                <button
                  type="button"
                  aria-label="Remove override"
                  onClick={() => removeOverride(o.id)}
                  className="text-muted hover:text-error"
                  style={{ background: "none", border: "none", cursor: "pointer", padding: "6px", display: "flex", alignItems: "center" }}
                >
                  <X style={{ height: "16px", width: "16px" }} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <Label htmlFor="override-date">Date</Label>
            <Input
              id="override-date"
              type="date"
              value={date}
              min={todayDateString()}
              onChange={(e) => setDate(e.target.value)}
              suppressHydrationWarning
            />
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            <Button type="button" size="sm" variant={isAvailable ? "outline" : "default"} onClick={() => setIsAvailable(false)}>
              Unavailable
            </Button>
            <Button type="button" size="sm" variant={isAvailable ? "default" : "outline"} onClick={() => setIsAvailable(true)}>
              Extra hours
            </Button>
          </div>
          {isAvailable && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <TimePicker value={start} onChange={setStart} />
              <span className="text-sm text-muted">to</span>
              <TimePicker value={end} onChange={setEnd} />
            </div>
          )}
          <Button type="button" size="sm" onClick={addOverride} disabled={saving} style={{ width: "fit-content" }}>
            {saving ? "Adding..." : `Add ${isAvailable ? "extra hours" : "day off"}`}
          </Button>
        </div>
        <p className="text-xs text-muted">Overrides apply to {rangeNoun === "blocked" ? "your open hours" : "your weekly hours"} on that date only.</p>
      </div>
    </details>
  );
}

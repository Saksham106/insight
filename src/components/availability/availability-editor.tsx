"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Pencil, Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { TimePicker } from "@/components/ui/time-picker";
import { useMediaQuery } from "@/lib/use-media-query";
import type { AvailabilityOverride, AvailabilityRule, BookingSettings } from "@/lib/availability/types";

import { BookingSettingsForm } from "./booking-settings-form";
import { DateOverridesList } from "./date-overrides-list";

const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatTime(value: string) {
  const [h, m] = value.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
}

function getLocalTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

interface RuleRowProps {
  rule: AvailabilityRule;
  onUpdated: (rule: AvailabilityRule) => void;
  onDeleted: (id: string) => void;
}

function RuleRow({ rule, onUpdated, onDeleted }: RuleRowProps) {
  const [editing, setEditing] = useState(false);
  const [startTime, setStartTime] = useState(rule.start_time);
  const [endTime, setEndTime] = useState(rule.end_time);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    if (!(endTime > startTime)) {
      setError("End time must be after start time.");
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/availability/rules/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start_time: startTime, end_time: endTime }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    onUpdated(data.rule as AvailabilityRule);
    setEditing(false);
  };

  const handleDelete = async () => {
    setDeleting(true);
    const res = await fetch(`/api/availability/rules/${rule.id}`, { method: "DELETE" });
    setDeleting(false);
    if (res.ok) onDeleted(rule.id);
  };

  if (editing) {
    return (
      <div
        className="border border-border bg-surface"
        style={{ display: "flex", flexDirection: "column", gap: "10px", borderRadius: "10px", padding: "12px 14px" }}
      >
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
          <TimePicker value={startTime} onChange={setStartTime} required />
          <span className="text-sm text-muted">to</span>
          <TimePicker value={endTime} onChange={setEndTime} required />
        </div>
        {error && <p className="text-sm text-error">{error}</p>}
        <div style={{ display: "flex", gap: "8px" }}>
          <Button type="button" size="sm" disabled={saving} onClick={handleSave}>
            {saving ? "Saving..." : "Save"}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="border border-border bg-surface"
      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", borderRadius: "10px", padding: "10px 14px" }}
    >
      <p className="text-sm text-foreground">
        {formatTime(rule.start_time)} - {formatTime(rule.end_time)}
      </p>
      <div style={{ display: "flex", gap: "4px" }}>
        <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)} aria-label="Edit rule">
          <Pencil style={{ height: "14px", width: "14px" }} />
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={deleting} onClick={handleDelete} aria-label="Delete rule">
          <Trash2 style={{ height: "14px", width: "14px" }} />
        </Button>
      </div>
    </div>
  );
}

function AddRuleForm({ onCreated }: { onCreated: (rule: AvailabilityRule) => void }) {
  const [weekday, setWeekday] = useState(1);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (!(endTime > startTime)) {
      setError("End time must be after start time.");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/availability/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekday, start_time: startTime, end_time: endTime, timezone: getLocalTimezone() }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    onCreated(data.rule as AvailabilityRule);
    setStartTime("09:00");
    setEndTime("17:00");
    setShowForm(false);
  };

  if (!showForm) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(true)} style={{ display: "flex", alignItems: "center", gap: "6px", width: "fit-content" }}>
        <Plus style={{ height: "14px", width: "14px" }} />
        Add availability window
      </Button>
    );
  }

  return (
    <form
      className="border border-border bg-surface"
      style={{ display: "flex", flexDirection: "column", gap: "12px", borderRadius: "10px", padding: "14px" }}
      onSubmit={handleSubmit}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p className="text-sm font-semibold text-navy">New availability window</p>
        <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)} aria-label="Close">
          <X style={{ height: "14px", width: "14px" }} />
        </Button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <Label>Day of week</Label>
        <select
          value={weekday}
          onChange={(e) => setWeekday(parseInt(e.target.value, 10))}
          style={{
            width: "100%",
            height: "40px",
            borderRadius: "6px",
            border: "1px solid var(--color-border)",
            backgroundColor: "var(--color-background)",
            color: "var(--color-foreground)",
            fontSize: "14px",
            padding: "0 10px",
          }}
        >
          {WEEKDAY_LABELS.map((label, index) => (
            <option key={label} value={index}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
        <TimePicker value={startTime} onChange={setStartTime} required />
        <span className="text-sm text-muted">to</span>
        <TimePicker value={endTime} onChange={setEndTime} required />
      </div>
      {error && <p className="text-sm text-error">{error}</p>}
      <Button type="submit" disabled={loading} style={{ width: "fit-content" }}>
        {loading ? "Adding..." : "Add window"}
      </Button>
    </form>
  );
}

export function AvailabilityEditor() {
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

  const activeRules = rules.filter((r) => r.is_active);
  const timezone = activeRules[0]?.timezone ?? getLocalTimezone();

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
          {/* Weekly rules */}
          <div
            className="border border-border bg-surface"
            style={{ borderRadius: "12px", padding: isMobile ? "14px" : "20px", display: "flex", flexDirection: "column", gap: "14px" }}
          >
            <p className="text-sm font-semibold text-navy">Weekly hours</p>
            {activeRules.length === 0 ? (
              <EmptyState
                icon={CalendarClock}
                title="No availability yet"
                description="Add your first availability window so students can book from your schedule."
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {WEEKDAY_LABELS.map((label, weekday) => {
                  const dayRules = activeRules
                    .filter((r) => r.weekday === weekday)
                    .sort((a, b) => a.start_time.localeCompare(b.start_time));
                  if (dayRules.length === 0) return null;
                  return (
                    <div key={label} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
                      {dayRules.map((rule) => (
                        <RuleRow
                          key={rule.id}
                          rule={rule}
                          onUpdated={(updated) =>
                            setRules((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
                          }
                          onDeleted={(id) =>
                            setRules((prev) => prev.map((r) => (r.id === id ? { ...r, is_active: false } : r)))
                          }
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
            <AddRuleForm onCreated={(rule) => setRules((prev) => [...prev, rule])} />
          </div>

          {/* Booking settings */}
          <div
            className="border border-border bg-surface"
            style={{ borderRadius: "12px", padding: isMobile ? "14px" : "20px", display: "flex", flexDirection: "column", gap: "16px" }}
          >
            <p className="text-sm font-semibold text-navy">Booking rules</p>
            <BookingSettingsForm settings={settings} onSaved={setSettings} />
          </div>

          {/* Date overrides */}
          <div
            className="border border-border bg-surface"
            style={{ borderRadius: "12px", padding: isMobile ? "14px" : "20px", display: "flex", flexDirection: "column", gap: "16px" }}
          >
            <p className="text-sm font-semibold text-navy">Date overrides</p>
            <DateOverridesList
              overrides={overrides}
              timezone={timezone}
              onCreated={(override) => setOverrides((prev) => [...prev, override])}
              onDeleted={(id) => setOverrides((prev) => prev.filter((o) => o.id !== id))}
            />
          </div>
        </>
      )}
    </section>
  );
}

"use client";

import { useState } from "react";
import { CalendarOff, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TimePicker } from "@/components/ui/time-picker";
import type { AvailabilityOverride } from "@/lib/availability/types";

interface DateOverridesListProps {
  overrides: AvailabilityOverride[];
  timezone: string;
  onCreated: (override: AvailabilityOverride) => void;
  onDeleted: (id: string) => void;
}

function todayDateString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatOverrideDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(value: string) {
  const [h, m] = value.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function DateOverridesList({ overrides, timezone, onCreated, onDeleted }: DateOverridesListProps) {
  const [date, setDate] = useState("");
  const [status, setStatus] = useState<"available" | "unavailable">("unavailable");
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const isAvailable = status === "available";
  const showTimeFields = isAvailable || !allDay;

  const upcoming = overrides
    .filter((o) => o.date >= todayDateString())
    .sort((a, b) => a.date.localeCompare(b.date));

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!date) {
      setError("Choose a date.");
      return;
    }
    if (showTimeFields && !(endTime > startTime)) {
      setError("End time must be after start time.");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/availability/overrides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date,
        start_time: showTimeFields ? startTime : null,
        end_time: showTimeFields ? endTime : null,
        timezone,
        is_available: isAvailable,
        reason: reason.trim() || null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }

    onCreated(data.override as AvailabilityOverride);
    setDate("");
    setStatus("unavailable");
    setAllDay(true);
    setStartTime("09:00");
    setEndTime("17:00");
    setReason("");
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    const res = await fetch(`/api/availability/overrides/${id}`, { method: "DELETE" });
    setDeletingId(null);
    if (res.ok) {
      onDeleted(id);
    }
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
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <form style={{ display: "flex", flexDirection: "column", gap: "14px" }} onSubmit={handleSubmit}>
        <div className="form-grid-2">
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <Label htmlFor="override-date">Date</Label>
            <Input
              id="override-date"
              type="date"
              value={date}
              min={todayDateString()}
              onChange={(e) => setDate(e.target.value)}
              required
              suppressHydrationWarning
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <Label htmlFor="override-status">Status</Label>
            <select
              id="override-status"
              value={status}
              onChange={(e) => {
                const next = e.target.value as "available" | "unavailable";
                setStatus(next);
                if (next === "available") setAllDay(false);
              }}
              style={inputStyle}
            >
              <option value="unavailable">Unavailable</option>
              <option value="available">Available (extra window)</option>
            </select>
          </div>
        </div>

        {!isAvailable && (
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", cursor: "pointer" }}>
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            Whole day
          </label>
        )}

        {showTimeFields && (
          <div className="form-grid-2">
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <Label>Start time</Label>
              <TimePicker value={startTime} onChange={setStartTime} required={isAvailable} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <Label>End time</Label>
              <TimePicker value={endTime} onChange={setEndTime} required={isAvailable} />
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <Label htmlFor="override-reason">Reason (optional)</Label>
          <Input
            id="override-reason"
            placeholder="e.g. Holiday, doctor's appointment"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-error">{error}</p>}

        <Button type="submit" disabled={loading} style={{ width: "fit-content" }}>
          {loading ? "Saving..." : "Add date override"}
        </Button>
      </form>

      {upcoming.length === 0 ? (
        <EmptyState
          icon={CalendarOff}
          title="No date overrides"
          description="Mark specific dates as unavailable, or open an extra one-off window."
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {upcoming.map((o) => (
            <div
              key={o.id}
              className="border border-border bg-surface"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                borderRadius: "10px",
                padding: "12px 16px",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: 0 }}>
                <p className="text-sm font-semibold text-navy">{formatOverrideDate(o.date)}</p>
                <p className="text-sm text-muted">
                  {o.is_available ? "Available" : "Unavailable"}
                  {o.start_time && o.end_time
                    ? ` · ${formatTime(o.start_time)} - ${formatTime(o.end_time)}`
                    : " · All day"}
                  {o.reason ? ` · ${o.reason}` : ""}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={deletingId === o.id}
                onClick={() => handleDelete(o.id)}
                style={{ flexShrink: 0 }}
                aria-label="Delete override"
              >
                <Trash2 style={{ height: "16px", width: "16px" }} />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

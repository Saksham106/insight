"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { useMediaQuery } from "@/lib/use-media-query";
import type { AvailabilitySlot } from "@/lib/availability/types";

import { BookSessionModal } from "./book-session-modal";

interface SlotPickerProps {
  assignments: Array<{
    id: string;
    teacher: { id: string; full_name: string } | null;
  }>;
  singleAssignmentId?: string;
}

interface SlotsResponse {
  slots: AvailabilitySlot[];
  settings: {
    allowed_durations: number[];
    default_duration_minutes: number;
    auto_confirm: boolean;
    slot_increment_minutes: number;
  };
  timezone?: string;
}

function startOfWeek(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d;
}

function dayKey(date: Date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function formatWeekRange(start: Date) {
  const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
  const startLabel = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const endLabel = end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${startLabel} - ${endLabel}`;
}

function groupSlotsByDay(slots: AvailabilitySlot[]) {
  const groups = new Map<string, AvailabilitySlot[]>();
  for (const slot of slots) {
    const key = dayKey(new Date(slot.starts_at));
    const existing = groups.get(key);
    if (existing) existing.push(slot);
    else groups.set(key, [slot]);
  }
  return groups;
}

function formatSelectedDayLabel(key: string) {
  const date = new Date(`${key}T12:00:00`);
  const todayKey = dayKey(new Date());
  const label = date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  return key === todayKey ? `Today · ${label}` : label;
}

export function SlotPicker({ assignments, singleAssignmentId }: SlotPickerProps) {
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [assignmentId, setAssignmentId] = useState(singleAssignmentId ?? assignments[0]?.id ?? "");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [duration, setDuration] = useState<number | null>(null);
  const [allowedDurations, setAllowedDurations] = useState<number[]>([]);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const selectedAssignment = assignments.find((a) => a.id === assignmentId) ?? null;

  useEffect(() => {
    if (!assignmentId) return;

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      const from = weekStart;
      const to = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
      const params = new URLSearchParams({
        assignment_id: assignmentId,
        from: from.toISOString(),
        to: to.toISOString(),
      });
      if (duration) params.set("duration_minutes", String(duration));

      const res = await fetch(`/api/booking/slots?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (cancelled) return;

      if (!res.ok) {
        setError((data as { error?: string }).error ?? "Could not load available times.");
        setSlots([]);
        setLoading(false);
        return;
      }

      const response = data as SlotsResponse;
      setSlots(response.slots);
      setAllowedDurations(response.settings.allowed_durations);
      if (!duration) setDuration(response.settings.default_duration_minutes);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [assignmentId, weekStart, duration, refreshKey]);

  const dayGroups = useMemo(() => groupSlotsByDay(slots), [slots]);

  // The seven calendar days of the visible week, each annotated with whether it
  // has any bookable slots. Past days (before today) are never selectable.
  const days = useMemo(() => {
    const todayKey = dayKey(new Date());
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(weekStart.getTime() + i * 24 * 60 * 60 * 1000);
      const key = dayKey(date);
      const daySlots = dayGroups.get(key) ?? [];
      return {
        key,
        date,
        isPast: key < todayKey,
        hasSlots: daySlots.length > 0,
        count: daySlots.length,
      };
    });
  }, [weekStart, dayGroups]);

  // Keep a sensible day selected: prefer the current selection if it still has
  // slots, otherwise fall back to the first day of the week that does.
  useEffect(() => {
    if (loading) return;
    const stillValid = selectedDayKey && (dayGroups.get(selectedDayKey)?.length ?? 0) > 0;
    if (stillValid) return;
    const firstOpen = days.find((d) => d.hasSlots && !d.isPast);
    setSelectedDayKey(firstOpen?.key ?? null);
  }, [loading, days, dayGroups, selectedDayKey]);

  const selectedDaySlots = selectedDayKey ? dayGroups.get(selectedDayKey) ?? [] : [];

  if (assignments.length === 0) return null;

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <div
        className="border border-border bg-surface"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          borderRadius: "12px",
          padding: isMobile ? "14px" : "16px 18px",
        }}
      >
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
          <p className="text-sm font-semibold text-navy">Find a time</p>
          <p className="text-sm text-muted" style={{ lineHeight: 1.45 }}>
            Pick a day, then choose from your teacher&apos;s open times.
          </p>
        </div>
      </div>

      <div
        className="border border-border bg-surface"
        style={{ borderRadius: "12px", padding: isMobile ? "14px" : "20px", display: "flex", flexDirection: "column", gap: "18px" }}
      >
        {/* Controls: teacher + duration */}
        <div
          style={{
            display: "flex",
            flexDirection: isMobile ? "column" : "row",
            alignItems: isMobile ? "stretch" : "flex-end",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          {assignments.length > 1 && !singleAssignmentId && (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: "180px" }}>
              <Label>Teacher</Label>
              <select
                value={assignmentId}
                onChange={(e) => setAssignmentId(e.target.value)}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                style={{ width: "100%", height: "40px" }}
              >
                {assignments.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.teacher?.full_name ?? "Teacher"}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: "140px" }}>
            <Label>Duration</Label>
            <select
              value={duration ?? ""}
              onChange={(e) => setDuration(parseInt(e.target.value, 10))}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              style={{ width: "100%", height: "40px" }}
              disabled={allowedDurations.length === 0}
            >
              {allowedDurations.map((d) => (
                <option key={d} value={d}>
                  {d >= 120 && d % 60 === 0 ? `${d / 60} hours` : `${d} min`}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Week nav + day strip */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label="Previous week"
              onClick={() => setWeekStart((prev) => new Date(prev.getTime() - 7 * 24 * 60 * 60 * 1000))}
            >
              <ChevronLeft style={{ height: "16px", width: "16px" }} />
            </Button>
            <p className="text-sm font-medium text-foreground" style={{ whiteSpace: "nowrap" }}>
              {formatWeekRange(weekStart)}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label="Next week"
              onClick={() => setWeekStart((prev) => new Date(prev.getTime() + 7 * 24 * 60 * 60 * 1000))}
            >
              <ChevronRight style={{ height: "16px", width: "16px" }} />
            </Button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
              gap: "6px",
            }}
          >
            {days.map((d) => {
              const selectable = d.hasSlots && !d.isPast;
              const isSelected = d.key === selectedDayKey;
              return (
                <button
                  key={d.key}
                  type="button"
                  disabled={!selectable}
                  onClick={() => setSelectedDayKey(d.key)}
                  aria-pressed={isSelected}
                  className="border"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "2px",
                    padding: "8px 2px",
                    borderRadius: "10px",
                    cursor: selectable ? "pointer" : "default",
                    borderColor: isSelected ? "var(--color-navy)" : "var(--color-border)",
                    background: isSelected ? "var(--color-navy)" : "var(--color-background)",
                    color: isSelected ? "#ffffff" : selectable ? "var(--color-foreground)" : "var(--color-muted)",
                    opacity: selectable || isSelected ? 1 : 0.45,
                  }}
                  suppressHydrationWarning
                >
                  <span style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    {d.date.toLocaleDateString("en-US", { weekday: "short" })}
                  </span>
                  <span style={{ fontSize: "16px", fontWeight: 700, lineHeight: 1.1 }}>{d.date.getDate()}</span>
                  <span
                    aria-hidden
                    style={{
                      width: "5px",
                      height: "5px",
                      borderRadius: "9999px",
                      background: isSelected ? "#ffffff" : selectable ? "var(--color-navy)" : "transparent",
                    }}
                  />
                </button>
              );
            })}
          </div>
        </div>

        {/* Times for the selected day */}
        {loading && <p className="text-sm text-muted">Loading available times...</p>}

        {!loading && error && <p className="text-sm text-error">{error}</p>}

        {!loading && !error && selectedDaySlots.length === 0 && (
          <EmptyState
            icon={CalendarClock}
            title="No open times this week"
            description="This teacher has no open times this week. Try another week, or request another time below."
          />
        )}

        {!loading && !error && selectedDayKey && selectedDaySlots.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <p className="text-sm font-semibold text-navy">{formatSelectedDayLabel(selectedDayKey)}</p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(auto-fill, minmax(120px, 1fr))",
                gap: "8px",
              }}
            >
              {selectedDaySlots.map((slot) => {
                const start = new Date(slot.starts_at);
                const timeLabel = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
                return (
                  <button
                    key={slot.starts_at}
                    type="button"
                    onClick={() => setSelectedSlot(slot)}
                    className="border border-border bg-background hover:bg-soft"
                    style={{
                      borderRadius: "10px",
                      padding: "12px 10px",
                      fontSize: "15px",
                      fontWeight: 600,
                      color: "var(--color-navy)",
                      cursor: "pointer",
                      textAlign: "center",
                    }}
                    suppressHydrationWarning
                  >
                    {timeLabel}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {selectedSlot && selectedAssignment && (
        <BookSessionModal
          assignmentId={selectedAssignment.id}
          teacherName={selectedAssignment.teacher?.full_name ?? "your teacher"}
          slot={selectedSlot}
          onClose={() => setSelectedSlot(null)}
          onBooked={() => {
            setSelectedSlot(null);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}
    </section>
  );
}

"use client";

import { useEffect, useState } from "react";
import { CalendarClock, ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { useMediaQuery } from "@/lib/use-media-query";
import type { AvailabilitySlot } from "@/lib/availability/types";
import { WeekGrid, type WeekGridBlock } from "@/components/calendar/week-grid";

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

function formatWeekRange(start: Date) {
  const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
  const startLabel = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const endLabel = end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${startLabel} - ${endLabel}`;
}

function groupSlotsByDay(slots: AvailabilitySlot[]) {
  const groups = new Map<string, AvailabilitySlot[]>();
  for (const slot of slots) {
    const start = new Date(slot.starts_at);
    const key = [start.getFullYear(), String(start.getMonth() + 1).padStart(2, "0"), String(start.getDate()).padStart(2, "0")].join("-");
    const existing = groups.get(key);
    if (existing) {
      existing.push(slot);
    } else {
      groups.set(key, [slot]);
    }
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function formatDayLabel(key: string) {
  const date = new Date(`${key}T12:00:00`);
  const today = new Date();
  const todayKey = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, "0"), String(today.getDate()).padStart(2, "0")].join("-");
  const label = date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  return key === todayKey ? `Today, ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : label;
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
  const [refreshKey, setRefreshKey] = useState(0);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [slotIncrement, setSlotIncrement] = useState(30);
  const [teacherTimeZone, setTeacherTimeZone] = useState<string | null>(null);

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
        setError(data.error ?? "Could not load available times.");
        setSlots([]);
        setLoading(false);
        return;
      }

      const response = data as SlotsResponse;
      setSlots(response.slots);
      setAllowedDurations(response.settings.allowed_durations);
      if (!duration) setDuration(response.settings.default_duration_minutes);
      setSlotIncrement(response.settings.slot_increment_minutes);
      setTeacherTimeZone((data as { timezone?: string }).timezone ?? null);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [assignmentId, weekStart, duration, refreshKey]);

  const dayGroups = groupSlotsByDay(slots);

  const gridBlocks: WeekGridBlock[] = slots.map((s) => {
    const start = new Date(s.starts_at);
    return {
      id: s.starts_at,
      start,
      end: new Date(s.ends_at),
      variant: "slot",
      label: start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }),
    };
  });

  const slotHours = slots.flatMap((s) => {
    const st = new Date(s.starts_at); const en = new Date(s.ends_at);
    return [st.getHours(), en.getHours() + (en.getMinutes() > 0 ? 1 : 0)];
  });
  const gridDayStart = slotHours.length ? Math.max(0, Math.min(...slotHours, 8)) : 8;
  const gridDayEnd = slotHours.length ? Math.min(24, Math.max(...slotHours, 20)) : 20;

  if (assignments.length === 0) return null;

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
            <p className="text-sm font-semibold text-navy">Find a time</p>
            <p className="text-sm text-muted" style={{ lineHeight: 1.45 }}>
              Book directly from your teacher&apos;s open availability.
            </p>
          </div>
        </div>
      </div>

      <div
        className="border border-border bg-surface"
        style={{ borderRadius: "12px", padding: isMobile ? "14px" : "20px", display: "flex", flexDirection: "column", gap: "16px" }}
      >
        {/* Controls */}
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

          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginLeft: isMobile ? "0" : "auto" }}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label="Previous week"
              onClick={() => setWeekStart((prev) => new Date(prev.getTime() - 7 * 24 * 60 * 60 * 1000))}
            >
              <ChevronLeft style={{ height: "16px", width: "16px" }} />
            </Button>
            <p className="text-sm text-foreground" style={{ whiteSpace: "nowrap" }}>
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
            {!isMobile && (
              <Button type="button" variant="outline" size="sm" onClick={() => setViewMode((v) => (v === "grid" ? "list" : "grid"))}>
                {viewMode === "grid" ? "List" : "Grid"}
              </Button>
            )}
          </div>
        </div>

        {/* Slots */}
        {loading && <p className="text-sm text-muted">Loading available times...</p>}

        {!loading && error && <p className="text-sm text-error">{error}</p>}

        {!loading && !error && dayGroups.length === 0 && (
          <EmptyState
            icon={CalendarClock}
            title="No open times this week"
            description="This teacher has no open times this week. Try another week, or request another time below."
          />
        )}

        {!loading && !error && !isMobile && viewMode === "grid" && dayGroups.length > 0 && (
          <WeekGrid
            weekStart={weekStart}
            blocks={gridBlocks}
            dayStartHour={gridDayStart}
            dayEndHour={gridDayEnd}
            snapMinutes={slotIncrement}
            onBlockClick={(b) => {
              const slot = slots.find((s) => s.starts_at === b.id);
              if (slot) setSelectedSlot(slot);
            }}
          />
        )}

        {!loading && !error && (isMobile || viewMode === "list") && dayGroups.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {dayGroups.map(([dayKey, daySlots]) => (
              <div key={dayKey} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">{formatDayLabel(dayKey)}</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {daySlots.map((slot) => {
                    const start = new Date(slot.starts_at);
                    const timeLabel = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
                    return (
                      <button
                        key={slot.starts_at}
                        type="button"
                        onClick={() => setSelectedSlot(slot)}
                        className="border border-border bg-background hover:bg-soft"
                        style={{
                          borderRadius: "9999px",
                          padding: "8px 16px",
                          fontSize: "14px",
                          fontWeight: 500,
                          color: "var(--color-foreground)",
                          cursor: "pointer",
                        }}
                        suppressHydrationWarning
                      >
                        {timeLabel}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
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

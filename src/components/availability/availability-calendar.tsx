"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { WeekGrid, type WeekGridBlock } from "@/components/calendar/week-grid";
import type { AvailabilityOverride, AvailabilityRule, BookingSettings } from "@/lib/availability/types";
import type { Session } from "@/components/sessions/session-card";

interface Props {
  settings: BookingSettings;
  rules: AvailabilityRule[];
  overrides: AvailabilityOverride[];
  sessions: Session[];
  timezone: string;
  onRulesChange: (rules: AvailabilityRule[]) => void;
  onOverridesChange: (overrides: AvailabilityOverride[]) => void;
}

function startOfWeek(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - x.getDay());
  return x;
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
function toTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function AvailabilityCalendar({ settings, rules, overrides, sessions, timezone, onRulesChange, onOverridesChange }: Props) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [error, setError] = useState<string | null>(null);

  const paintVariant = settings.availability_mode === "open" ? "blocked" : "available";
  const paintRuleType = settings.availability_mode === "open" ? "blocked" : "available";
  const paintIsAvailable = settings.availability_mode !== "open";

  const blocks = useMemo<WeekGridBlock[]>(() => {
    const out: WeekGridBlock[] = [];
    // Weekly rules → a block on the matching day of the visible week.
    for (const r of rules.filter((r) => r.is_active)) {
      const dayDate = addDays(weekStart, r.weekday);
      const [sh, sm] = r.start_time.split(":").map(Number);
      const [eh, em] = r.end_time.split(":").map(Number);
      out.push({
        id: `rule:${r.id}`,
        start: new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), sh, sm),
        end: new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), eh, em),
        variant: r.rule_type === "blocked" ? "blocked" : "available",
        label: r.rule_type === "blocked" ? "Blocked" : "Available",
        subLabel: "Weekly",
      });
    }
    // One-off overrides in the visible week.
    const weekEnd = addDays(weekStart, 7);
    for (const o of overrides) {
      const [y, m, d] = o.date.split("-").map(Number);
      const day = new Date(y, m - 1, d);
      if (day < weekStart || day >= weekEnd || !o.start_time || !o.end_time) continue;
      const [sh, sm] = o.start_time.split(":").map(Number);
      const [eh, em] = o.end_time.split(":").map(Number);
      out.push({
        id: `override:${o.id}`,
        start: new Date(y, m - 1, d, sh, sm),
        end: new Date(y, m - 1, d, eh, em),
        variant: o.is_available ? "available" : "blocked",
        label: o.is_available ? "Available" : "Blocked",
        subLabel: "One-off",
      });
    }
    // Confirmed sessions as read-only context.
    for (const s of sessions.filter((s) => s.status !== "cancelled")) {
      const start = new Date(s.scheduled_at);
      if (start < weekStart || start >= weekEnd) continue;
      out.push({
        id: `session:${s.id}`,
        start,
        end: new Date(start.getTime() + s.duration_minutes * 60000),
        variant: "session",
        label: "Session",
        readOnly: true,
      });
    }
    return out;
  }, [rules, overrides, sessions, weekStart]);

  async function createRule(start: Date, end: Date) {
    const res = await fetch("/api/availability/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekday: start.getDay(), start_time: toTime(start), end_time: toTime(end), timezone, rule_type: paintRuleType }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error ?? "Could not save."); return; }
    onRulesChange([...rules, data.rule as AvailabilityRule]);
    setError(null);
  }

  function idParts(blockId: string): { kind: "rule" | "override" | "session"; id: string } {
    const [kind, id] = blockId.split(":");
    return { kind: kind as "rule" | "override" | "session", id };
  }

  async function updateBlock(blockId: string, start: Date, end: Date) {
    const { kind, id } = idParts(blockId);
    if (kind === "rule") {
      const prev = rules;
      onRulesChange(rules.map((r) => (r.id === id ? { ...r, weekday: start.getDay(), start_time: toTime(start), end_time: toTime(end) } : r)));
      const res = await fetch(`/api/availability/rules/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ weekday: start.getDay(), start_time: toTime(start), end_time: toTime(end) }) });
      if (!res.ok) { onRulesChange(prev); setError("Could not move that block."); }
    } else if (kind === "override") {
      const prev = overrides;
      onOverridesChange(overrides.map((o) => (o.id === id ? { ...o, date: toDateKey(start), start_time: toTime(start), end_time: toTime(end) } : o)));
      const res = await fetch(`/api/availability/overrides/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: toDateKey(start), start_time: toTime(start), end_time: toTime(end) }) });
      if (!res.ok) { onOverridesChange(prev); setError("Could not move that block."); }
    }
  }

  async function deleteBlock(blockId: string) {
    const { kind, id } = idParts(blockId);
    if (kind === "rule") {
      const prev = rules;
      onRulesChange(rules.map((r) => (r.id === id ? { ...r, is_active: false } : r)));
      const res = await fetch(`/api/availability/rules/${id}`, { method: "DELETE" });
      if (!res.ok) { onRulesChange(prev); setError("Could not delete."); }
    } else if (kind === "override") {
      const prev = overrides;
      onOverridesChange(overrides.filter((o) => o.id !== id));
      const res = await fetch(`/api/availability/overrides/${id}`, { method: "DELETE" });
      if (!res.ok) { onOverridesChange(prev); setError("Could not delete."); }
    }
  }

  const weekLabel = `${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${addDays(weekStart, 6).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p className="text-sm text-muted">
          {settings.availability_mode === "open"
            ? "Drag on the calendar to block time. Everything else is bookable."
            : "Drag on the calendar to mark hours students can book."}
        </p>
        <div style={{ display: "flex", gap: "4px" }}>
          <Button size="sm" variant="outline" onClick={() => setWeekStart((d) => addDays(d, -7))}><ChevronLeft className="h-4 w-4" /></Button>
          <Button size="sm" variant="outline" onClick={() => setWeekStart(startOfWeek(new Date()))}>This week</Button>
          <Button size="sm" variant="outline" onClick={() => setWeekStart((d) => addDays(d, 7))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
      <p className="text-xs text-muted">{weekLabel}</p>
      {error && <p className="text-sm text-error">{error}</p>}
      <WeekGrid
        weekStart={weekStart}
        blocks={blocks}
        editable
        onCreate={(start, end) => createRule(start, end)}
        onUpdate={(id, start, end) => updateBlock(id, start, end)}
        onBlockClick={(b) => {
          if (b.readOnly) return;
          if (window.confirm("Delete this block?")) deleteBlock(b.id);
        }}
      />
      <p className="text-xs text-muted">Painted blocks are {paintVariant === "blocked" ? "unavailable" : "bookable"}. Click a block to remove it.</p>
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import { minutesToY, yToMinutes, snap, clampMinutes, minutesOfDay, dayIndex } from "./grid-geometry";

export interface WeekGridBlock {
  id: string;
  start: Date;
  end: Date;
  variant: "blocked" | "available" | "session" | "slot";
  label?: string;
  subLabel?: string;
  readOnly?: boolean;
}

export interface WeekGridProps {
  weekStart: Date;
  blocks: WeekGridBlock[];
  dayStartHour?: number;
  dayEndHour?: number;
  snapMinutes?: number;
  editable?: boolean;
  onCreate?: (start: Date, end: Date) => void;
  onUpdate?: (id: string, start: Date, end: Date) => void;
  onDelete?: (id: string) => void;
  onBlockClick?: (block: WeekGridBlock) => void;
  onEmptyClick?: (start: Date, end: Date) => void;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PX_PER_MINUTE = 0.9;
const GUTTER_WIDTH = 52;

const VARIANT_STYLE: Record<WeekGridBlock["variant"], React.CSSProperties> = {
  blocked:   { backgroundColor: "rgba(217,72,72,0.14)", borderColor: "#d94848", color: "#9b2c2c" },
  available: { backgroundColor: "rgba(27,53,96,0.10)", borderColor: "var(--color-navy)", color: "var(--color-navy)" },
  session:   { backgroundColor: "#eaf2f8", borderColor: "#12304a", color: "#12304a" },
  slot:      { backgroundColor: "var(--color-surface)", borderColor: "var(--color-border)", color: "var(--color-foreground)" },
};

function addDays(date: Date, n: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
}

function combine(dayDate: Date, minutes: number): Date {
  return new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), Math.floor(minutes / 60), minutes % 60, 0, 0);
}

function fmt(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
}

type Draft =
  | { kind: "create"; dayIdx: number; startMin: number; endMin: number }
  | { kind: "move"; id: string; dayIdx: number; startMin: number; endMin: number }
  | { kind: "resize"; id: string; dayIdx: number; startMin: number; endMin: number; edge: "top" | "bottom" };

export function WeekGrid({
  weekStart,
  blocks,
  dayStartHour = 7,
  dayEndHour = 21,
  snapMinutes = 15,
  editable = false,
  onCreate,
  onUpdate,
  onDelete,
  onBlockClick,
  onEmptyClick,
}: WeekGridProps) {
  const dayStartMin = dayStartHour * 60;
  const dayEndMin = dayEndHour * 60;
  const gridHeight = (dayEndMin - dayStartMin) * PX_PER_MINUTE;
  const columnsRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dragMoved, setDragMoved] = useState(false);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const hourLines = Array.from({ length: dayEndHour - dayStartHour + 1 }, (_, i) => dayStartHour + i);

  function pointerMinutes(clientY: number, columnEl: HTMLElement): number {
    const rect = columnEl.getBoundingClientRect();
    const raw = yToMinutes(clientY - rect.top, dayStartMin, PX_PER_MINUTE);
    return clampMinutes(snap(raw, snapMinutes), dayStartMin, dayEndMin);
  }

  function beginCreate(e: React.PointerEvent<HTMLDivElement>, dayIdx: number) {
    if (!editable) return;
    if ((e.target as HTMLElement).dataset.block) return; // started on a block
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const startMin = pointerMinutes(e.clientY, e.currentTarget);
    setDragMoved(false);
    setDraft({ kind: "create", dayIdx, startMin, endMin: startMin + snapMinutes });
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!draft) return;
    const columnEl = columnsRef.current?.children[draft.dayIdx] as HTMLElement | undefined;
    if (!columnEl) return;
    const m = pointerMinutes(e.clientY, columnEl);
    setDragMoved(true);
    setDraft((prev) => {
      if (!prev) return prev;
      if (prev.kind === "resize") {
        return prev.edge === "top"
          ? { ...prev, startMin: Math.min(m, prev.endMin - snapMinutes) }
          : { ...prev, endMin: Math.max(m, prev.startMin + snapMinutes) };
      }
      if (prev.kind === "move") {
        const len = prev.endMin - prev.startMin;
        const start = clampMinutes(m, dayStartMin, dayEndMin - len);
        return { ...prev, startMin: start, endMin: start + len };
      }
      return { ...prev, endMin: Math.max(m, prev.startMin + snapMinutes) };
    });
  }

  function commit() {
    if (!draft) return;
    const dayDate = days[draft.dayIdx];
    const start = combine(dayDate, draft.startMin);
    const end = combine(dayDate, draft.endMin);
    if (draft.kind === "create") {
      if (dragMoved) onCreate?.(start, end);
      else onEmptyClick?.(start, combine(dayDate, Math.min(draft.startMin + 60, dayEndMin)));
    } else {
      onUpdate?.(draft.id, start, end);
    }
    setDraft(null);
    setDragMoved(false);
  }

  return (
    <div style={{ overflowX: "auto", border: "1px solid var(--color-border)", borderRadius: "12px", backgroundColor: "var(--color-surface)" }}>
      {/* Header row */}
      <div style={{ display: "grid", gridTemplateColumns: `${GUTTER_WIDTH}px repeat(7, minmax(90px, 1fr))`, borderBottom: "1px solid var(--color-border)" }}>
        <div />
        {days.map((d, i) => (
          <div key={i} style={{ padding: "8px 0", textAlign: "center", borderLeft: "1px solid var(--color-border)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">{DAY_LABELS[i]}</p>
            <p className="text-sm font-semibold text-foreground">{d.getDate()}</p>
          </div>
        ))}
      </div>

      {/* Body */}
      <div style={{ display: "grid", gridTemplateColumns: `${GUTTER_WIDTH}px repeat(7, minmax(90px, 1fr))`, position: "relative" }}>
        {/* Hour gutter */}
        <div style={{ position: "relative", height: `${gridHeight}px` }}>
          {hourLines.map((h) => (
            <div key={h} style={{ position: "absolute", top: `${minutesToY(h * 60, dayStartMin, PX_PER_MINUTE)}px`, right: "6px", transform: "translateY(-50%)" }}>
              <span className="text-[10px] text-muted">{fmt(h * 60).replace(":00", "")}</span>
            </div>
          ))}
        </div>

        {/* Day columns */}
        <div ref={columnsRef} style={{ display: "contents" }}>
          {days.map((dayDate, dayIdx) => {
            const dayBlocks = blocks.filter((b) => dayIndex(b.start, weekStart) === dayIdx);
            const draftHere = draft && draft.dayIdx === dayIdx && draft.kind === "create" ? draft : null;
            return (
              <div
                key={dayIdx}
                onPointerDown={(e) => beginCreate(e, dayIdx)}
                onPointerMove={onPointerMove}
                onPointerUp={commit}
                style={{ position: "relative", height: `${gridHeight}px`, borderLeft: "1px solid var(--color-border)", cursor: editable ? "crosshair" : "default", touchAction: "none" }}
              >
                {hourLines.map((h) => (
                  <div key={h} style={{ position: "absolute", top: `${minutesToY(h * 60, dayStartMin, PX_PER_MINUTE)}px`, left: 0, right: 0, borderTop: "1px solid var(--color-border)", opacity: 0.5 }} />
                ))}

                {dayBlocks.map((b) => {
                  const s = minutesOfDay(b.start);
                  const e = minutesOfDay(b.end);
                  const top = minutesToY(s, dayStartMin, PX_PER_MINUTE);
                  const height = Math.max(14, (e - s) * PX_PER_MINUTE);
                  const style = VARIANT_STYLE[b.variant];
                  const interactive = editable && !b.readOnly;
                  return (
                    <div
                      key={b.id}
                      data-block="1"
                      onPointerDown={(ev) => {
                        if (!interactive) return;
                        ev.stopPropagation();
                        (ev.target as HTMLElement).setPointerCapture(ev.pointerId);
                        setDragMoved(false);
                        setDraft({ kind: "move", id: b.id, dayIdx, startMin: s, endMin: e });
                      }}
                      onPointerMove={onPointerMove}
                      onPointerUp={(ev) => {
                        ev.stopPropagation();
                        if (!dragMoved) { onBlockClick?.(b); setDraft(null); }
                        else commit();
                      }}
                      onClick={() => { if (!interactive) onBlockClick?.(b); }}
                      style={{
                        position: "absolute", top: `${top}px`, height: `${height}px`, left: "3px", right: "3px",
                        borderRadius: "6px", borderWidth: "1px", borderStyle: "solid", padding: "3px 6px", overflow: "hidden",
                        cursor: interactive ? "grab" : (onBlockClick ? "pointer" : "default"),
                        ...style,
                      }}
                    >
                      <p className="text-[11px] font-semibold" style={{ lineHeight: 1.2 }}>{b.label ?? fmt(s)}</p>
                      {b.subLabel && <p className="text-[10px]" style={{ opacity: 0.8 }}>{b.subLabel}</p>}
                      {interactive && (
                        <>
                          <div
                            onPointerDown={(ev) => { ev.stopPropagation(); (ev.target as HTMLElement).setPointerCapture(ev.pointerId); setDragMoved(false); setDraft({ kind: "resize", id: b.id, dayIdx, startMin: s, endMin: e, edge: "top" }); }}
                            style={{ position: "absolute", top: 0, left: 0, right: 0, height: "7px", cursor: "ns-resize" }}
                          />
                          <div
                            onPointerDown={(ev) => { ev.stopPropagation(); (ev.target as HTMLElement).setPointerCapture(ev.pointerId); setDragMoved(false); setDraft({ kind: "resize", id: b.id, dayIdx, startMin: s, endMin: e, edge: "bottom" }); }}
                            style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "7px", cursor: "ns-resize" }}
                          />
                        </>
                      )}
                    </div>
                  );
                })}

                {draftHere && (
                  <div style={{
                    position: "absolute",
                    top: `${minutesToY(draftHere.startMin, dayStartMin, PX_PER_MINUTE)}px`,
                    height: `${(draftHere.endMin - draftHere.startMin) * PX_PER_MINUTE}px`,
                    left: "3px", right: "3px", borderRadius: "6px",
                    border: "1px dashed var(--color-navy)", backgroundColor: "rgba(27,53,96,0.08)", pointerEvents: "none",
                  }} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

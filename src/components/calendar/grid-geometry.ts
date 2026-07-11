export function minutesToY(minutes: number, dayStartMin: number, pxPerMinute: number): number {
  return (minutes - dayStartMin) * pxPerMinute;
}

export function yToMinutes(y: number, dayStartMin: number, pxPerMinute: number): number {
  return dayStartMin + y / pxPerMinute;
}

export function snap(minutes: number, snapMinutes: number): number {
  return Math.round(minutes / snapMinutes) * snapMinutes;
}

export function clampMinutes(minutes: number, dayStartMin: number, dayEndMin: number): number {
  return Math.max(dayStartMin, Math.min(dayEndMin, minutes));
}

export function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

export function dayIndex(date: Date, weekStart: Date): number {
  const a = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const b = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate());
  return Math.round((a.getTime() - b.getTime()) / (24 * 60 * 60 * 1000));
}

export interface Interval {
  start: Date;
  end: Date;
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function dateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function weekdaySundayZero(date: Date): number {
  return date.getDay();
}

export function parseTimeOnDate(date: Date, time: string): Date {
  const [hour, minute] = time.split(":").map(Number);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute, 0, 0);
}

export function intervalsOverlap(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

export function eachDate(from: Date, to: Date): Date[] {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  const dates: Date[] = [];
  for (let current = start; current <= end; current = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1)) {
    dates.push(current);
  }
  return dates;
}

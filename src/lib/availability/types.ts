export interface BookingSettings {
  teacher_id: string;
  default_duration_minutes: number;
  allowed_durations: number[];
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  minimum_notice_hours: number;
  max_days_ahead: number;
  auto_confirm: boolean;
  availability_mode: "open" | "restricted";
  open_day_start: string; // "HH:MM" or "HH:MM:SS"
  open_day_end: string;
  timezone: string | null;
  slot_increment_minutes: number;
}

// Owner-agnostic shapes used by the availability editor UI (works for both the
// teacher-owned and student-owned availability tables). The concrete row types
// below extend these with their owner id column.
export interface WeeklyAvailabilityRule {
  id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  timezone: string;
  is_active: boolean;
  rule_type: "available" | "blocked";
}

export interface DateAvailabilityOverride {
  id: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  timezone: string;
  is_available: boolean;
  reason: string | null;
}

export interface AvailabilityRule extends WeeklyAvailabilityRule {
  teacher_id: string;
}

export interface AvailabilityOverride extends DateAvailabilityOverride {
  teacher_id: string;
}

export interface BusySession {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
}

export interface AvailabilitySlot {
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
}

export interface GenerateSlotsInput {
  settings: BookingSettings;
  rules: AvailabilityRule[];
  overrides: AvailabilityOverride[];
  busySessions: BusySession[];
  durationMinutes: number;
  from: Date;
  to: Date;
  now: Date;
  teacherTimeZone: string;
}

"use client";

interface TimePickerProps {
  value: string; // "HH:MM" in 24h
  onChange: (value: string) => void;
  required?: boolean;
  id?: string;
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = ["00", "15", "30", "45"];

function to24h(hour: number, minute: string, ampm: "AM" | "PM") {
  let h = hour;
  if (ampm === "AM" && hour === 12) h = 0;
  if (ampm === "PM" && hour !== 12) h = hour + 12;
  return `${String(h).padStart(2, "0")}:${minute}`;
}

function from24h(value: string): { hour: number; minute: string; ampm: "AM" | "PM" } {
  if (!value) return { hour: 12, minute: "00", ampm: "AM" };
  const [hStr, mStr] = value.split(":");
  const h = parseInt(hStr, 10);
  const ampm: "AM" | "PM" = h < 12 ? "AM" : "PM";
  const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const minute = MINUTES.includes(mStr) ? mStr : "00";
  return { hour, minute, ampm };
}

export function TimePicker({ value, onChange, required, id }: TimePickerProps) {
  const { hour, minute, ampm } = from24h(value);

  const selectStyle = {
    height: "40px",
    borderRadius: "6px",
    border: "1px solid var(--color-border)",
    backgroundColor: "var(--color-background)",
    color: "var(--color-foreground)",
    fontSize: "14px",
    padding: "0 8px",
    cursor: "pointer",
  };

  const update = (newHour: number, newMinute: string, newAmpm: "AM" | "PM") => {
    onChange(to24h(newHour, newMinute, newAmpm));
  };

  return (
    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
      <select
        id={id}
        required={required}
        value={hour}
        onChange={(e) => update(parseInt(e.target.value, 10), minute, ampm)}
        style={{ ...selectStyle, width: "64px" }}
        aria-label="Hour"
      >
        {HOURS.map((h) => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
      <span style={{ color: "var(--color-muted)", fontWeight: 600, fontSize: "16px", lineHeight: 1 }}>:</span>
      <select
        value={minute}
        onChange={(e) => update(hour, e.target.value, ampm)}
        style={{ ...selectStyle, width: "64px" }}
        aria-label="Minute"
      >
        {MINUTES.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
      <select
        value={ampm}
        onChange={(e) => update(hour, minute, e.target.value as "AM" | "PM")}
        style={{ ...selectStyle, width: "68px" }}
        aria-label="AM or PM"
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}

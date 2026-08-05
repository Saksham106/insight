"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Plus } from "lucide-react";

import { Empty, formatMessageTime, PanelCard } from "@/components/admin/hermes-dashboard-shared";

type ClassOccurrence = {
  id: string;
  series_id: string | null;
  title: string;
  subject: string | null;
  starts_at: string;
  ends_at: string;
  timezone: string;
  status: string;
  version: number;
};

type ClassSeries = { id: string; title: string; weekdays: number[]; local_time: string; timezone: string; status: string };
type Contact = { id: string; display_name: string; role: string };
type View = "upcoming" | "attention" | "recurring" | "history";

const VIEW_LABELS: Array<[View, string]> = [
  ["upcoming", "Upcoming"],
  ["attention", "Needs attention"],
  ["recurring", "Recurring"],
  ["history", "History"],
];

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function HermesClassesPanel({ classes, series, contacts, enabled }: {
  classes: ClassOccurrence[];
  series: ClassSeries[];
  contacts: Contact[];
  enabled: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState<View>("upcoming");
  const [kind, setKind] = useState<"one_off" | "weekly">("weekly");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const visible = useMemo(() => {
    if (view === "attention") return classes.filter((item) => item.status === "change_requested");
    if (view === "history") return classes.filter((item) => ["completed", "cancelled", "rescheduled"].includes(item.status));
    return classes.filter((item) => ["scheduled", "change_requested"].includes(item.status));
  }, [classes, view]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    const teacherId = String(form.get("teacherId") ?? "");
    const studentId = String(form.get("studentId") ?? "");
    const parentId = String(form.get("parentId") ?? "");
    if (!studentId && !parentId) {
      setPending(false);
      setMessage("Choose a student, a parent, or both.");
      return;
    }
    const participants = [
      { contactId: teacherId, role: "teacher", decisionSide: "teacher", receivesNotifications: true, confirmsCancellation: true, confirmsReschedule: true },
      ...(studentId ? [{
        contactId: studentId, role: "student", decisionSide: "student",
        receivesNotifications: form.get("studentReceivesUpdates") === "on",
        confirmsCancellation: form.get("studentConfirmsCancellation") === "on",
        confirmsReschedule: form.get("studentConfirmsReschedule") === "on",
      }] : []),
      ...(parentId ? [{
        contactId: parentId, role: "parent_guardian", decisionSide: "student",
        receivesNotifications: form.get("parentReceivesUpdates") === "on",
        confirmsCancellation: form.get("parentConfirmsCancellation") === "on",
        confirmsReschedule: form.get("parentConfirmsReschedule") === "on",
      }] : []),
    ];
    const startsAt = String(form.get("startsAt") ?? "");
    const durationMinutes = Number(form.get("durationMinutes") ?? 60);
    const payload = kind === "weekly"
      ? {
          kind, title: form.get("title"), subject: form.get("subject"), timezone: form.get("timezone"), durationMinutes,
          effectiveStart: form.get("effectiveStart"),
          recurrence: { frequency: "weekly", weekdays: [Number(form.get("weekday"))], localTime: form.get("localTime"), intervalWeeks: 1 },
          participants,
        }
      : {
          kind, title: form.get("title"), subject: form.get("subject"), timezone: form.get("timezone"),
          localStartsAt: startsAt,
          durationMinutes,
          localDate: startsAt.slice(0, 10), participants,
        };
    const response = await fetch("/api/admin/hermes/classes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json();
    setPending(false);
    if (!response.ok) return setMessage(result.error ?? "Could not create class.");
    setMessage("Class saved in Kitty Classes.");
    event.currentTarget.reset();
    router.refresh();
  }

  return (
    <PanelCard icon={<CalendarDays size={18} />} title="Kitty Classes" description="A separate Kitty-owned class calendar. It does not change Academy sessions or availability.">
      {!enabled ? <p className="text-sm text-muted" style={{ marginBottom: 16 }}>The class calendar is in safe rollout mode. Set KITTY_CLASS_CALENDAR_ENABLED=true when its migration and WhatsApp templates are ready.</p> : null}
      <div role="tablist" aria-label="Class views" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
        {VIEW_LABELS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)} className="btn btn-secondary" style={{ opacity: view === id ? 1 : .65 }}>{label}</button>
        ))}
      </div>

      {view === "recurring" ? (
        series.length ? <div style={{ display: "grid", gap: 10 }}>{series.map((item) => (
          <article key={item.id} className="border border-border" style={{ borderRadius: 10, padding: 14 }}>
            <strong>{item.title}</strong>
            <p className="text-sm text-muted">{item.weekdays.map((day) => DAY_NAMES[day]).join(", ")} at {item.local_time.slice(0, 5)} · {item.timezone} · {item.status}</p>
          </article>
        ))}</div> : <Empty>No recurring classes yet.</Empty>
      ) : visible.length ? (
        <div style={{ display: "grid", gap: 10 }}>{visible.map((item) => (
          <article key={item.id} className="border border-border" style={{ borderRadius: 10, padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div><strong>{item.title}</strong>{item.subject ? <p className="text-sm text-muted">{item.subject}</p> : null}</div>
              <span className="text-xs text-muted">{item.status.replaceAll("_", " ")}</span>
            </div>
            <p className="text-sm" style={{ marginTop: 8 }}>{formatMessageTime(item.starts_at)}–{new Date(item.ends_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · {item.timezone}</p>
          </article>
        ))}</div>
      ) : <Empty>No classes in this view.</Empty>}

      <details style={{ marginTop: 20 }}>
        <summary className="text-sm font-semibold text-navy" style={{ cursor: "pointer" }}><Plus size={15} style={{ display: "inline", marginRight: 6 }} />Add a class</summary>
        <form onSubmit={submit} style={{ display: "grid", gap: 12, marginTop: 14, maxWidth: 680 }}>
          <fieldset disabled={!enabled || pending} style={{ display: "grid", gap: 12, border: 0 }}>
            <div style={{ display: "flex", gap: 12 }}>
              <label><input type="radio" name="kind" checked={kind === "weekly"} onChange={() => setKind("weekly")} /> Weekly class</label>
              <label><input type="radio" name="kind" checked={kind === "one_off"} onChange={() => setKind("one_off")} /> One-off class</label>
            </div>
            <label className="text-sm">Class title<input className="input" name="title" required placeholder="Maths — Asha and Minh" /></label>
            <label className="text-sm">Subject<input className="input" name="subject" placeholder="Maths" /></label>
            <label className="text-sm">Timezone<input className="input" name="timezone" required defaultValue="Asia/Ho_Chi_Minh" /></label>
            {kind === "weekly" ? <>
              <label className="text-sm">First date<input className="input" type="date" name="effectiveStart" required /></label>
              <label className="text-sm">Weekday<select className="input" name="weekday">{DAY_NAMES.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label>
              <label className="text-sm">Local time<input className="input" type="time" name="localTime" required /></label>
            </> : <label className="text-sm">Date and time<input className="input" type="datetime-local" name="startsAt" required /></label>}
            <label className="text-sm">Duration (minutes)<input className="input" type="number" min="5" max="1440" name="durationMinutes" defaultValue="60" required /></label>
            <label className="text-sm">Teacher<select className="input" name="teacherId" required><option value="">Select teacher</option>{contacts.filter((c) => c.role === "teacher").map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}</select></label>
            <fieldset className="border border-border" style={{ borderRadius: 10, padding: 12 }}>
              <legend className="text-sm font-semibold">Student contact (optional when a parent is selected)</legend>
              <label className="text-sm">Student<select className="input" name="studentId"><option value="">No student contact</option>{contacts.filter((c) => c.role === "student").map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}</select></label>
              <label><input type="checkbox" name="studentReceivesUpdates" defaultChecked /> Receives updates</label>
              <label><input type="checkbox" name="studentConfirmsCancellation" defaultChecked /> Confirms cancellations</label>
              <label><input type="checkbox" name="studentConfirmsReschedule" defaultChecked /> Confirms reschedules</label>
            </fieldset>
            <fieldset className="border border-border" style={{ borderRadius: 10, padding: 12 }}>
              <legend className="text-sm font-semibold">Parent contact (optional when a student is selected)</legend>
              <label className="text-sm">Parent<select className="input" name="parentId"><option value="">No parent contact</option>{contacts.filter((c) => c.role === "parent").map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}</select></label>
              <label><input type="checkbox" name="parentReceivesUpdates" defaultChecked /> Receives updates</label>
              <label><input type="checkbox" name="parentConfirmsCancellation" defaultChecked /> Confirms cancellations</label>
              <label><input type="checkbox" name="parentConfirmsReschedule" defaultChecked /> Confirms reschedules</label>
            </fieldset>
            <button className="btn btn-primary" type="submit">{pending ? "Saving…" : "Save class"}</button>
          </fieldset>
          {message ? <p className="text-sm" role="status">{message}</p> : null}
        </form>
      </details>
    </PanelCard>
  );
}

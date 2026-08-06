"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Plus } from "lucide-react";

import { Empty, formatMessageTime, PanelCard } from "@/components/admin/hermes-dashboard-shared";
import {
  canRetryKittyNotification,
  filterKittyAttentionClasses,
  filterKittyClassesForView,
  kittyClassAttentionReasons,
  normalizeKittyEnrollmentMutationTiming,
  reduceKittyEnrollmentDrafts,
  shouldLoadKittyOccurrenceDetail,
  type KittyAdminAttentionIssue,
  type KittyEnrollmentDraft,
} from "@/lib/hermes/kitty-class-admin";
import { createKittyClassDashboardSubmitter } from "@/lib/hermes/kitty-class-dashboard-submit";

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
type Contact = { id: string; display_name: string; role: string; deleted_at?: string | null; is_active?: boolean };
type NotificationIssue = { id: string; occurrence_id: string; status: string; last_error_code: string | null; updated_at: string };
type EnrollmentContact = {
  contactId: string;
  role: "student" | "parent_guardian";
  receivesNotifications: boolean;
  confirmsCancellation: boolean;
  confirmsReschedule: boolean;
};
type Enrollment = { id: string; studentContactId: string; contacts: EnrollmentContact[] };
type Attendance = {
  id: string; enrollmentId: string; status: string; estimatedAt: string | null; note: string | null;
  version: number; isCorrection: boolean; reportedByContactId: string; createdAt: string;
};
type ApprovalProgress = {
  enrollmentId: string; status: string; decidedAt: string | null;
};
type ChangeRequest = {
  id: string; changeType: string; scope: string; status: string; version: number;
  requiredEnrollmentApprovals: number; receivedEnrollmentApprovals: number;
  teacherApprovalStatus: string; enrollmentApprovals: ApprovalProgress[];
};
type OccurrenceDetail = {
  id: string; seriesId: string | null; version: number; localDate: string; teacherContactId: string;
  enrollmentCount: number; enrollments: Enrollment[]; attendance: Attendance[];
  currentChangeRequest: ChangeRequest | null;
  auditEvents: Array<{ id: string; actorType: string; eventType: string; entityType: string; createdAt: string }>;
  notificationFailures: Array<{
    id: string; contactId: string; intent: string; status: string; attemptCount: number;
    errorCode: string | null; messageId: string | null; updatedAt: string;
  }>;
};
type View = "upcoming" | "attention" | "recurring" | "history";

const VIEW_LABELS: Array<[View, string]> = [
  ["upcoming", "Upcoming"],
  ["attention", "Needs attention"],
  ["recurring", "Recurring"],
  ["history", "History"],
];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const INITIAL_ENROLLMENTS: KittyEnrollmentDraft[] = [{ id: 0, parentIds: [] }];

function normalizedEventName(value: string) {
  return value.replaceAll("_", " ");
}

function formChecked(form: FormData, name: string) {
  return form.get(name) === "on";
}

function enrollmentFromForm(form: FormData, prefix: string, draft: KittyEnrollmentDraft) {
  const studentContactId = String(form.get(`${prefix}.${draft.id}.studentId`) ?? "");
  const contacts: EnrollmentContact[] = [{
    contactId: studentContactId,
    role: "student",
    receivesNotifications: formChecked(form, `${prefix}.${draft.id}.studentReceivesUpdates`),
    confirmsCancellation: formChecked(form, `${prefix}.${draft.id}.studentConfirmsCancellation`),
    confirmsReschedule: formChecked(form, `${prefix}.${draft.id}.studentConfirmsReschedule`),
  }];
  for (const parentId of draft.parentIds) {
    const contactId = String(form.get(`${prefix}.${draft.id}.parent.${parentId}.contactId`) ?? "");
    if (!contactId) continue;
    contacts.push({
      contactId,
      role: "parent_guardian",
      receivesNotifications: formChecked(form, `${prefix}.${draft.id}.parent.${parentId}.receivesUpdates`),
      confirmsCancellation: formChecked(form, `${prefix}.${draft.id}.parent.${parentId}.confirmsCancellation`),
      confirmsReschedule: formChecked(form, `${prefix}.${draft.id}.parent.${parentId}.confirmsReschedule`),
    });
  }
  return { studentContactId, contacts };
}

function ContactControls({ prefix, defaultReschedule = false }: { prefix: string; defaultReschedule?: boolean }) {
  const name = (suffix: string) => prefix.endsWith(".")
    ? `${prefix}${suffix[0].toLowerCase()}${suffix.slice(1)}`
    : `${prefix}${suffix}`;
  return (
    <div className="text-sm" style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px", marginTop: 8 }}>
      <label><input type="checkbox" name={name("ReceivesUpdates")} defaultChecked /> Receives updates</label>
      <label><input type="checkbox" name={name("ConfirmsCancellation")} /> Confirms cancellations</label>
      <label><input type="checkbox" name={name("ConfirmsReschedule")} defaultChecked={defaultReschedule} /> Confirms reschedules</label>
    </div>
  );
}

function EnrollmentFields({
  draft, ordinal, prefix, contacts, canRemove, onAddParent, onRemoveParent, onRemoveEnrollment,
}: {
  draft: KittyEnrollmentDraft;
  ordinal: number;
  prefix: string;
  contacts: Contact[];
  canRemove: boolean;
  onAddParent: () => void;
  onRemoveParent: (parentId: number) => void;
  onRemoveEnrollment: () => void;
}) {
  const studentPrefix = `${prefix}.${draft.id}.student`;
  const students = contacts.filter((contact) => contact.role === "student" && contact.is_active !== false && !contact.deleted_at);
  const parents = contacts.filter((contact) => ["parent", "guardian", "parent_guardian"].includes(contact.role) && contact.is_active !== false && !contact.deleted_at);
  return (
    <fieldset className="border border-border" style={{ borderRadius: 10, padding: 12, display: "grid", gap: 10 }}>
      <legend className="text-sm font-semibold">Student {ordinal}</legend>
      <label className="text-sm">
        Student
        <select className="input" name={`${prefix}.${draft.id}.studentId`} required>
          <option value="">Select student</option>
          {students.map((contact) => <option key={contact.id} value={contact.id}>{contact.display_name}</option>)}
        </select>
      </label>
      <ContactControls prefix={studentPrefix} defaultReschedule />
      {draft.parentIds.map((parentId, index) => {
        const parentPrefix = `${prefix}.${draft.id}.parent.${parentId}.`;
        return (
          <fieldset key={parentId} className="border border-border" style={{ borderRadius: 8, padding: 10 }}>
            <legend className="text-sm font-semibold">Parent contact {index + 1} (optional)</legend>
            <label className="text-sm">
              Parent
              <select className="input" name={`${parentPrefix}contactId`} required>
                <option value="">Select parent or guardian</option>
                {parents.map((contact) => <option key={contact.id} value={contact.id}>{contact.display_name}</option>)}
              </select>
            </label>
            <ContactControls prefix={parentPrefix} defaultReschedule />
            <button type="button" className="btn btn-secondary" onClick={() => onRemoveParent(parentId)} style={{ marginTop: 8 }}>Remove parent</button>
          </fieldset>
        );
      })}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button type="button" className="btn btn-secondary" onClick={onAddParent}>Add parent contact</button>
        {canRemove ? <button type="button" className="btn btn-secondary" onClick={onRemoveEnrollment}>Remove student</button> : null}
      </div>
    </fieldset>
  );
}

function ConfigurationSummary({ contact }: { contact: EnrollmentContact }) {
  const labels = [
    contact.receivesNotifications ? "receives updates" : null,
    contact.confirmsCancellation ? "confirms cancellations" : null,
    contact.confirmsReschedule ? "confirms reschedules" : null,
  ].filter(Boolean);
  return <span className="text-xs text-muted">{labels.length ? labels.join(" · ") : "no notifications or confirmations"}</span>;
}

function AddEnrollmentForm({ detail, activeStudents, activeParents, enabled, pending, onSubmit }: {
  detail: OccurrenceDetail;
  activeStudents: Contact[];
  activeParents: Contact[];
  enabled: boolean;
  pending: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  const [scope, setScope] = useState<"occurrence" | "this_and_future">(
    detail.seriesId ? "this_and_future" : "occurrence",
  );
  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 8, marginTop: 10 }}>
      <label className="text-sm">Add scope<select className="input" name="scope" required value={scope} onChange={(event) => setScope(event.currentTarget.value as "occurrence" | "this_and_future")}>
        <option value="occurrence">Occurrence only</option>
        {detail.seriesId ? <option value="this_and_future">This and future occurrences</option> : null}
      </select></label>
      <p className="text-xs text-muted">{scope === "occurrence"
        ? "This student is added only to this occurrence; its date is fixed."
        : "This student joins the recurring roster from the selected date onward."}</p>
      <label className="text-sm">Student<select className="input" name="studentContactId" required><option value="">Select student</option>{activeStudents.map((contact) => <option key={contact.id} value={contact.id}>{contact.display_name}</option>)}</select></label>
      <ContactControls prefix="student" defaultReschedule />
      <label className="text-sm">Parent contact (optional)<select className="input" name="parentContactId"><option value="">No parent contact</option>{activeParents.map((contact) => <option key={contact.id} value={contact.id}>{contact.display_name}</option>)}</select></label>
      <ContactControls prefix="parent" defaultReschedule />
      {scope === "occurrence" ? (
        <label className="text-sm">Occurrence date<input className="input" type="date" name="effectiveDate" value={detail.localDate} min={detail.localDate} max={detail.localDate} readOnly required /></label>
      ) : (
        <label className="text-sm">Effective date<input className="input" type="date" name="effectiveDate" min={detail.localDate} defaultValue={detail.localDate} required /></label>
      )}
      <button type="submit" className="btn btn-secondary" disabled={!enabled || pending}>Add student</button>
    </form>
  );
}

export function HermesClassesPanel({ classes, series, contacts, notificationIssues, attentionIssues, enabled }: {
  classes: ClassOccurrence[];
  series: ClassSeries[];
  contacts: Contact[];
  notificationIssues: NotificationIssue[];
  attentionIssues: KittyAdminAttentionIssue[];
  enabled: boolean;
}) {
  const router = useRouter();
  const nextDraftId = useRef(1);
  const [view, setView] = useState<View>("upcoming");
  const [kind, setKind] = useState<"one_off" | "weekly">("weekly");
  const [enrollments, setEnrollments] = useState<KittyEnrollmentDraft[]>(INITIAL_ENROLLMENTS);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageIsError, setMessageIsError] = useState(false);
  const [details, setDetails] = useState<Record<string, OccurrenceDetail>>({});
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});
  const [loadingDetails, setLoadingDetails] = useState<Record<string, boolean>>({});
  const submitClass = useMemo(() => createKittyClassDashboardSubmitter(), []);
  const contactsById = useMemo(() => new Map(contacts.map((contact) => [contact.id, contact])), [contacts]);
  const teachers = useMemo(
    () => contacts.filter((contact) => contact.role === "teacher" && contact.is_active !== false && !contact.deleted_at),
    [contacts],
  );
  const visible = useMemo(() => {
    if (view === "attention") return filterKittyAttentionClasses(classes, notificationIssues, attentionIssues);
    return filterKittyClassesForView(classes, view);
  }, [attentionIssues, classes, notificationIssues, view]);

  function showMessage(value: string, isError = false) {
    setMessage(value);
    setMessageIsError(isError);
  }

  function addEnrollment() {
    const id = nextDraftId.current++;
    setEnrollments((current) => reduceKittyEnrollmentDrafts(current, { type: "add_enrollment", id }));
  }

  function addParent(enrollmentId: number) {
    const parentId = nextDraftId.current++;
    setEnrollments((current) => reduceKittyEnrollmentDrafts(current, { type: "add_parent", enrollmentId, parentId }));
  }

  function removeParent(enrollmentId: number, parentId: number) {
    setEnrollments((current) => reduceKittyEnrollmentDrafts(current, { type: "remove_parent", enrollmentId, parentId }));
  }

  async function loadOccurrenceDetails(occurrenceId: string, force = false) {
    if (!shouldLoadKittyOccurrenceDetail({ open: true, hasDetail: Boolean(details[occurrenceId]), isLoading: Boolean(loadingDetails[occurrenceId]), force })) return;
    setLoadingDetails((current) => ({ ...current, [occurrenceId]: true }));
    setDetailErrors((current) => ({ ...current, [occurrenceId]: "" }));
    try {
      const response = await fetch(`/api/admin/hermes/classes/${occurrenceId}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not load class details.");
      setDetails((current) => ({ ...current, [occurrenceId]: result.class }));
    } catch (error) {
      setDetailErrors((current) => ({
        ...current,
        [occurrenceId]: error instanceof Error ? error.message : "Could not load class details.",
      }));
    } finally {
      setLoadingDetails((current) => ({ ...current, [occurrenceId]: false }));
    }
  }

  async function retryNotification(notificationId: string, occurrenceId?: string) {
    setPending(true);
    showMessage("");
    try {
      const response = await fetch("/api/admin/hermes/classes", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "retry_notification", notificationId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not retry notification.");
      showMessage("Notification queued for a safe retry.");
      if (occurrenceId) await loadOccurrenceDetails(occurrenceId, true);
      router.refresh();
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Could not retry notification.", true);
    } finally {
      setPending(false);
    }
  }

  async function mutateEnrollment(event: React.FormEvent<HTMLFormElement>, occurrenceId: string, action: "add_enrollment" | "end_enrollment", enrollmentId?: string) {
    event.preventDefault();
    setPending(true);
    showMessage("");
    const form = new FormData(event.currentTarget);
    const detail = details[occurrenceId];
    const effectiveDate = String(form.get("effectiveDate") ?? "");
    const scope = String(form.get("scope") ?? "");
    let timing;
    try {
      timing = normalizeKittyEnrollmentMutationTiming({ action, seriesId: detail.seriesId, localDate: detail.localDate, scope, effectiveDate });
    } catch {
      setPending(false);
      showMessage("Choose a valid enrollment scope and date.", true);
      return;
    }
    const body: Record<string, unknown> = { action, version: detail.version, ...timing };
    if (action === "add_enrollment") {
      if (scope !== "occurrence" && scope !== "this_and_future") {
        setPending(false);
        showMessage("Choose when this student joins the roster.", true);
        return;
      }
      const studentContactId = String(form.get("studentContactId") ?? "");
      const parentContactId = String(form.get("parentContactId") ?? "");
      body.enrollment = {
        studentContactId,
        contacts: [
          {
            contactId: studentContactId, role: "student",
            receivesNotifications: formChecked(form, "studentReceivesUpdates"),
            confirmsCancellation: formChecked(form, "studentConfirmsCancellation"),
            confirmsReschedule: formChecked(form, "studentConfirmsReschedule"),
          },
          ...(parentContactId ? [{
            contactId: parentContactId, role: "parent_guardian",
            receivesNotifications: formChecked(form, "parentReceivesUpdates"),
            confirmsCancellation: formChecked(form, "parentConfirmsCancellation"),
            confirmsReschedule: formChecked(form, "parentConfirmsReschedule"),
          }] : []),
        ],
      };
    } else {
      if (scope !== "occurrence" && scope !== "this_and_future") {
        setPending(false);
        showMessage("Choose the enrollment change scope.", true);
        return;
      }
      body.enrollmentId = enrollmentId;
    }
    try {
      const response = await fetch(`/api/admin/hermes/classes/${occurrenceId}`, {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not update the enrollment.");
      showMessage(action === "add_enrollment" ? "Student enrollment added." : "Enrollment end date saved.");
      setDetails((current) => {
        const next = { ...current };
        delete next[occurrenceId];
        return next;
      });
      await loadOccurrenceDetails(occurrenceId, true);
      router.refresh();
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Could not update the enrollment.", true);
    } finally {
      setPending(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setPending(true);
    showMessage("");
    const form = new FormData(formElement);
    const roster = enrollments.map((draft) => enrollmentFromForm(form, "enrollment", draft));
    if (roster.some((enrollment) => !enrollment.studentContactId)) {
      setPending(false);
      showMessage("Choose the student for this class. You can still make a parent the only contact who receives or confirms updates.", true);
      return;
    }
    if (roster.some((enrollment) => !enrollment.contacts.some((contact) => contact.confirmsReschedule))) {
      setPending(false);
      showMessage("Choose at least one reschedule decision-maker for every student enrollment.", true);
      return;
    }
    const startsAt = String(form.get("startsAt") ?? "");
    const durationMinutes = Number(form.get("durationMinutes") ?? 60);
    const common = {
      kind, title: form.get("title"), subject: form.get("subject"), timezone: form.get("timezone"),
      durationMinutes, teacherContactId: form.get("teacherContactId"), enrollments: roster,
    };
    const payload = kind === "weekly"
      ? {
          ...common, effectiveStart: form.get("effectiveStart"),
          recurrence: { frequency: "weekly", weekdays: [Number(form.get("weekday"))], localTime: form.get("localTime"), intervalWeeks: 1 },
        }
      : { ...common, localStartsAt: startsAt, localDate: startsAt.slice(0, 10) };
    try {
      const response = await submitClass(payload);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not create class.");
      showMessage("Class saved in Kitty Classes.");
      formElement.reset();
      setEnrollments(INITIAL_ENROLLMENTS);
      router.refresh();
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Could not create class.", true);
    } finally {
      setPending(false);
    }
  }

  const activeStudents = contacts.filter((contact) => contact.role === "student" && contact.is_active !== false && !contact.deleted_at);
  const activeParents = contacts.filter((contact) => ["parent", "guardian", "parent_guardian"].includes(contact.role) && contact.is_active !== false && !contact.deleted_at);

  return (
    <PanelCard icon={<CalendarDays size={18} />} title="Kitty Classes" description="A separate Kitty-owned class calendar. It does not change Academy sessions or availability.">
      {!enabled ? <p className="text-sm text-muted" style={{ marginBottom: 16 }}>The class calendar is in safe rollout mode. Set KITTY_CLASS_CALENDAR_ENABLED=true when its migration and WhatsApp templates are ready.</p> : null}
      <nav aria-label="Class views" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
        {VIEW_LABELS.map(([id, label]) => (
          <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)} className="btn btn-secondary" style={{ opacity: view === id ? 1 : .65 }}>{label}</button>
        ))}
      </nav>

      {view === "attention" && notificationIssues.length ? (
        <section aria-labelledby="class-delivery-issues" style={{ display: "grid", gap: 10, marginBottom: 14 }}>
          <h3 id="class-delivery-issues" className="text-sm font-semibold">Delivery issues</h3>
          {notificationIssues.map((issue) => {
            const occurrence = classes.find((item) => item.id === issue.occurrence_id);
            return <article key={issue.id} className="border border-border" style={{ borderRadius: 10, padding: 14 }}>
              <strong>{occurrence?.title ?? "Class notification"}</strong>
              <p className="text-sm text-muted">Delivery {issue.status}: {issue.last_error_code ?? "unknown error"}</p>
              {canRetryKittyNotification(issue.status)
                ? <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => retryNotification(issue.id)}>Retry notification</button>
                : <p className="text-xs text-muted">Reconciliation required before another send.</p>}
            </article>;
          })}
        </section>
      ) : null}

      {view === "recurring" ? (
        series.length ? <div style={{ display: "grid", gap: 10 }}>{series.map((item) => (
          <article key={item.id} className="border border-border" style={{ borderRadius: 10, padding: 14 }}>
            <strong>{item.title}</strong>
            <p className="text-sm text-muted">{item.weekdays.map((day) => DAY_NAMES[day]).join(", ")} at {item.local_time.slice(0, 5)} · {item.timezone} · {item.status}</p>
          </article>
        ))}</div> : <Empty>No recurring classes yet.</Empty>
      ) : visible.length ? (
        <div style={{ display: "grid", gap: 10 }}>{visible.map((item) => {
          const detail = details[item.id];
          return (
            <article key={item.id} className="border border-border" style={{ borderRadius: 10, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div><strong>{item.title}</strong>{item.subject ? <p className="text-sm text-muted">{item.subject}</p> : null}</div>
                <span className="text-xs text-muted">{normalizedEventName(item.status)}</span>
              </div>
              <p className="text-sm" style={{ marginTop: 8 }}>{formatMessageTime(item.starts_at)}–{new Date(item.ends_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · {item.timezone}</p>
              {view === "attention" ? (
                <p className="text-sm text-muted" aria-label="Needs attention reasons">
                  {kittyClassAttentionReasons(item, notificationIssues, attentionIssues).join(" · ")}
                </p>
              ) : null}
              <details onToggle={(event) => { if (shouldLoadKittyOccurrenceDetail({ open: event.currentTarget.open, hasDetail: Boolean(details[item.id]), isLoading: Boolean(loadingDetails[item.id]) })) void loadOccurrenceDetails(item.id); }} style={{ marginTop: 10 }}>
                <summary className="text-sm font-semibold text-navy" style={{ cursor: "pointer" }}>Roster and occurrence details</summary>
                {loadingDetails[item.id] ? <p className="text-sm text-muted" role="status">Loading class details…</p> : null}
                {detailErrors[item.id] ? <p className="text-sm text-error" role="alert">{detailErrors[item.id]}</p> : null}
                {detail ? (
                  <div style={{ display: "grid", gap: 14, marginTop: 12 }}>
                    <p className="text-sm"><strong>Teacher:</strong> {contactsById.get(detail.teacherContactId)?.display_name ?? "Unavailable contact"} · <strong>{detail.enrollmentCount}</strong> student enrollment{detail.enrollmentCount === 1 ? "" : "s"}</p>
                    <section aria-labelledby={`roster-${item.id}`} style={{ display: "grid", gap: 10 }}>
                      <h4 id={`roster-${item.id}`} className="text-sm font-semibold">Group roster</h4>
                      {detail.enrollments.map((enrollment) => {
                        const attendance = detail.attendance.find((row) => row.enrollmentId === enrollment.id);
                        const approval = detail.currentChangeRequest?.enrollmentApprovals.find((row) => row.enrollmentId === enrollment.id);
                        return (
                          <article key={enrollment.id} className="border border-border" style={{ borderRadius: 8, padding: 12 }}>
                            <strong>{contactsById.get(enrollment.studentContactId)?.display_name ?? "Unavailable student"}</strong>
                            <p className="text-sm" style={{ marginTop: 6 }}><strong>Attendance:</strong> {attendance ? normalizedEventName(attendance.status) : "expected"}{attendance?.estimatedAt ? ` · estimated ${formatMessageTime(attendance.estimatedAt)}` : ""}{attendance?.isCorrection ? " · corrected" : ""}</p>
                            {attendance?.note ? <p className="text-sm text-muted">Private admin note: {attendance.note}</p> : null}
                            {approval ? <p className="text-sm"><strong>Current approval:</strong> {approval.status}</p> : null}
                            <ul className="text-sm" style={{ display: "grid", gap: 6, marginTop: 8, paddingLeft: 18 }}>
                              {enrollment.contacts.map((contact) => (
                                <li key={contact.contactId}>
                                  {contactsById.get(contact.contactId)?.display_name ?? "Unavailable contact"} ({contact.role === "student" ? "student" : "parent or guardian"})<br />
                                  <ConfigurationSummary contact={contact} />
                                </li>
                              ))}
                            </ul>
                            <form onSubmit={(event) => mutateEnrollment(event, item.id, "end_enrollment", enrollment.id)} style={{ display: "grid", gap: 8, marginTop: 12 }}>
                              <label className="text-sm">Change scope<select className="input" name="scope" required defaultValue={detail.seriesId ? "this_and_future" : "occurrence"}>
                                {detail.seriesId ? <option value="this_and_future">This and future occurrences</option> : <option value="occurrence">Occurrence only</option>}
                              </select></label>
                              {detail.seriesId ? <p className="text-xs text-muted">Use Attendance for a single missed class. Ending membership applies after the selected last active date.</p> : null}
                              <label className="text-sm">{detail.seriesId ? "Last active date" : "Occurrence date"}<input className="input" type="date" name="effectiveDate" min={detail.localDate} defaultValue={detail.seriesId ? undefined : detail.localDate} max={detail.seriesId ? undefined : detail.localDate} required /></label>
                              <button type="submit" className="btn btn-secondary" disabled={!enabled || pending}>End enrollment</button>
                            </form>
                          </article>
                        );
                      })}
                    </section>

                    <details>
                      <summary className="text-sm font-semibold text-navy">Add student</summary>
                      <AddEnrollmentForm detail={detail} activeStudents={activeStudents} activeParents={activeParents} enabled={enabled} pending={pending} onSubmit={(event) => mutateEnrollment(event, item.id, "add_enrollment")} />
                    </details>

                    <section aria-labelledby={`approvals-${item.id}`}>
                      <h4 id={`approvals-${item.id}`} className="text-sm font-semibold">Approval progress</h4>
                      {detail.currentChangeRequest ? (
                        <p className="text-sm">{detail.currentChangeRequest.receivedEnrollmentApprovals} approvals received · {detail.currentChangeRequest.requiredEnrollmentApprovals} approvals required · teacher {detail.currentChangeRequest.teacherApprovalStatus}</p>
                      ) : <p className="text-sm text-muted">No current class change.</p>}
                    </section>

                    <section aria-labelledby={`audit-${item.id}`}>
                      <h4 id={`audit-${item.id}`} className="text-sm font-semibold">Audit history</h4>
                      {detail.auditEvents.length ? <ul className="text-sm" style={{ paddingLeft: 18 }}>{detail.auditEvents.map((event) => <li key={event.id}>{normalizedEventName(event.eventType)} · {event.actorType} · {formatMessageTime(event.createdAt)}</li>)}</ul> : <p className="text-sm text-muted">No occurrence audit events.</p>}
                    </section>

                    <section aria-labelledby={`failures-${item.id}`}>
                      <h4 id={`failures-${item.id}`} className="text-sm font-semibold">Failed notifications</h4>
                      {detail.notificationFailures.length ? <div style={{ display: "grid", gap: 8 }}>{detail.notificationFailures.map((failure) => (
                        <article key={failure.id} className="border border-border" style={{ borderRadius: 8, padding: 10 }}>
                          <p className="text-sm">{normalizedEventName(failure.intent)} to {contactsById.get(failure.contactId)?.display_name ?? "Unavailable contact"} · {failure.status} · attempt {failure.attemptCount}</p>
                          <p className="text-xs text-muted">Error: {failure.errorCode ?? "unknown"} · message record: {failure.messageId ?? "not created"}</p>
                          {canRetryKittyNotification(failure.status)
                            ? <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => retryNotification(failure.id, item.id)}>Retry notification</button>
                            : <p className="text-xs text-muted">Reconciliation required before another send.</p>}
                        </article>
                      ))}</div> : <p className="text-sm text-muted">No failed or blocked notifications.</p>}
                    </section>
                  </div>
                ) : null}
              </details>
            </article>
          );
        })}</div>
      ) : <Empty>No classes in this view.</Empty>}

      <details style={{ marginTop: 20 }}>
        <summary className="text-sm font-semibold text-navy" style={{ cursor: "pointer" }}><Plus size={15} style={{ display: "inline", marginRight: 6 }} />Add a class</summary>
        <form onSubmit={submit} style={{ display: "grid", gap: 12, marginTop: 14, maxWidth: 680 }}>
          <fieldset disabled={!enabled || pending} style={{ display: "grid", gap: 12, border: 0 }}>
            <div style={{ display: "flex", gap: 12 }}>
              <label><input type="radio" name="kind" checked={kind === "weekly"} onChange={() => setKind("weekly")} /> Weekly class</label>
              <label><input type="radio" name="kind" checked={kind === "one_off"} onChange={() => setKind("one_off")} /> One-off class</label>
            </div>
            <label className="text-sm">Class title<input className="input" name="title" required placeholder="Group maths" /></label>
            <label className="text-sm">Subject<input className="input" name="subject" placeholder="Maths" /></label>
            <label className="text-sm">Timezone<input className="input" name="timezone" required defaultValue="Asia/Ho_Chi_Minh" /></label>
            {kind === "weekly" ? <>
              <label className="text-sm">First date<input className="input" type="date" name="effectiveStart" required /></label>
              <label className="text-sm">Weekday<select className="input" name="weekday">{DAY_NAMES.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label>
              <label className="text-sm">Local time<input className="input" type="time" name="localTime" required /></label>
            </> : <label className="text-sm">Date and time<input className="input" type="datetime-local" name="startsAt" required /></label>}
            <label className="text-sm">Duration (minutes)<input className="input" type="number" min="5" max="1440" name="durationMinutes" defaultValue="60" required /></label>
            <label className="text-sm">Teacher<select className="input" name="teacherContactId" required><option value="">Select teacher</option>{teachers.map((contact) => <option key={contact.id} value={contact.id}>{contact.display_name}</option>)}</select></label>
            {enrollments.map((draft, index) => (
              <EnrollmentFields
                key={draft.id}
                draft={draft}
                ordinal={index + 1}
                prefix="enrollment"
                contacts={contacts}
                canRemove={enrollments.length > 1}
                onAddParent={() => addParent(draft.id)}
                onRemoveParent={(parentId) => removeParent(draft.id, parentId)}
                onRemoveEnrollment={() => setEnrollments((current) => reduceKittyEnrollmentDrafts(current, { type: "remove_enrollment", id: draft.id }))}
              />
            ))}
            <button type="button" className="btn btn-secondary" onClick={addEnrollment}>Add student</button>
            <button className="btn btn-primary" type="submit">{pending ? "Saving…" : "Save class"}</button>
          </fieldset>
        </form>
      </details>
      <div aria-live="polite" aria-atomic="true">
        {message ? <p className={messageIsError ? "text-sm text-error" : "text-sm"} role={messageIsError ? "alert" : "status"}>{message}</p> : null}
      </div>
    </PanelCard>
  );
}

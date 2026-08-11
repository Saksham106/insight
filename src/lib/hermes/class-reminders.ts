export type ClassReminderPerson = {
  id: string;
  name: string;
};

export type ClassReminderRecipient = ClassReminderPerson & {
  role: "teacher" | "student" | "parent";
};

export type ClassReminderDelivery = {
  contactId: string;
  recipientName: string;
  classDescription: string;
  scheduledDateTime: string;
};

function requiredText(value: unknown, code: string) {
  if (typeof value !== "string" || !value.trim() || /[\r\n]/.test(value)) throw new Error(code);
  return value.trim();
}

function assertValidTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date(0));
  } catch {
    throw new Error("invalid_class_timezone");
  }
}

export function validateClassDescription(value: string) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (
    !normalized
    || normalized.length > 160
    || /[.!?](?:\s|$)/.test(normalized)
    || /\brelevant person\b/i.test(normalized)
    || /[\r\n]/.test(normalized)
  ) throw new Error("invalid_class_description");
  return normalized;
}

function formatScheduledDateTime(startsAt: string, timezone: string) {
  const instant = new Date(startsAt);
  if (!Number.isFinite(instant.getTime())) throw new Error("invalid_class_start");
  assertValidTimezone(timezone);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(instant);
}

export function buildClassReminderDeliveries(input: {
  occurrence: {
    id: string;
    subject: string | null;
    title: string;
    startsAt: string;
    timezone: string;
  };
  teacher: ClassReminderPerson;
  students: ClassReminderPerson[];
  recipients: ClassReminderRecipient[];
}): ClassReminderDelivery[] {
  const subject = validateClassDescription(requiredText(input.occurrence.subject || input.occurrence.title, "invalid_class_description"));
  const teacher = {
    id: requiredText(input.teacher.id, "invalid_teacher"),
    name: requiredText(input.teacher.name, "invalid_teacher"),
  };
  const students = input.students.map((student) => ({
    id: requiredText(student.id, "invalid_student"),
    name: requiredText(student.name, "invalid_student"),
  }));
  const scheduledDateTime = formatScheduledDateTime(input.occurrence.startsAt, input.occurrence.timezone);

  return input.recipients.map((recipient) => {
    const recipientName = requiredText(recipient.name, "invalid_recipient");
    const counterparts = recipient.role === "teacher"
      ? students.filter((student) => student.id !== recipient.id).map((student) => student.name)
      : teacher.id === recipient.id ? [] : [teacher.name];
    if (counterparts.length === 0) throw new Error("reminder_counterpart_required");
    const counterpartNames = new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(counterparts);
    return {
      contactId: requiredText(recipient.id, "invalid_recipient"),
      recipientName,
      classDescription: validateClassDescription(`${subject} with ${counterpartNames}`),
      scheduledDateTime,
    };
  });
}

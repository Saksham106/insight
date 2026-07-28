const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type JsonObject = Record<string, unknown>;

function objectValue(input: unknown, error: string): JsonObject {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error(error);
  return input as JsonObject;
}

function uuidValue(input: unknown, error: string): string {
  if (typeof input !== "string" || !UUID_PATTERN.test(input)) throw new Error(error);
  return input.toLowerCase();
}

function normalizedText(input: unknown, minimum: number, maximum: number, error: string): string {
  if (typeof input !== "string") throw new Error(error);
  const value = input.trim().replace(/\s+/g, " ");
  if (value.length < minimum || value.length > maximum) throw new Error(error);
  return value;
}

function optionalText(input: unknown, maximum: number, error: string): string | undefined {
  if (input === undefined || input === null) return undefined;
  return normalizedText(input, 1, maximum, error);
}

function isoDate(input: unknown, error = "invalid_lesson_date"): string {
  if (typeof input !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input)) throw new Error(error);
  const parsed = new Date(`${input}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== input) throw new Error(error);
  return input;
}

function isoTimestamp(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  if (typeof input !== "string") throw new Error("invalid_lesson_cycle_projection");
  const parsed = new Date(input);
  if (!Number.isFinite(parsed.getTime())) throw new Error("invalid_lesson_cycle_projection");
  return parsed.toISOString();
}

export interface LessonInput {
  reportedStudentName: string;
  studentContactId?: string;
  lessonDate: string;
  durationMinutes: number;
  subject?: string;
  note?: string;
}

export function sanitizeLessonReport(input: unknown): { lessons: LessonInput[] } {
  const report = objectValue(input, "invalid_lesson_report");
  if (!Array.isArray(report.lessons) || report.lessons.length > 500) throw new Error("invalid_lessons");
  const seen = new Set<string>();
  const lessons = report.lessons.map((raw): LessonInput => {
    const value = objectValue(raw, "invalid_lesson");
    const reportedStudentName = normalizedText(value.reportedStudentName, 1, 160, "invalid_reported_student_name");
    const studentContactId = value.studentContactId === undefined ? undefined : uuidValue(value.studentContactId, "invalid_student_contact_id");
    const lessonDate = isoDate(value.lessonDate);
    if (typeof value.durationMinutes !== "number" || !Number.isSafeInteger(value.durationMinutes) || value.durationMinutes < 1 || value.durationMinutes > 1440) {
      throw new Error("invalid_duration_minutes");
    }
    const durationMinutes = value.durationMinutes;
    const subject = optionalText(value.subject, 120, "invalid_subject");
    const note = optionalText(value.note, 500, "invalid_note");
    const identity = studentContactId ?? reportedStudentName.toLocaleLowerCase("en-US");
    const key = JSON.stringify([identity, lessonDate, durationMinutes, subject?.toLocaleLowerCase("en-US") ?? null]);
    if (seen.has(key)) throw new Error("duplicate_lesson");
    seen.add(key);
    return {
      reportedStudentName,
      ...(studentContactId ? { studentContactId } : {}),
      lessonDate,
      durationMinutes,
      ...(subject ? { subject } : {}),
      ...(note ? { note } : {}),
    };
  });
  lessons.sort((left, right) => left.lessonDate.localeCompare(right.lessonDate)
    || left.reportedStudentName.localeCompare(right.reportedStudentName)
    || left.durationMinutes - right.durationMinutes
    || (left.subject ?? "").localeCompare(right.subject ?? ""));
  return { lessons };
}

export function sanitizeTutorContactIds(input: unknown): string[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 100) throw new Error("invalid_tutor_contact_ids");
  const values = input.map((value) => uuidValue(value, "invalid_tutor_contact_id"));
  if (new Set(values).size !== values.length) throw new Error("duplicate_tutor_contact");
  return values.sort();
}

interface ProjectionInput {
  cycle: JsonObject;
  collections: JsonObject[];
  reports: JsonObject[];
  lessons: JsonObject[];
}

export interface LessonCycleProjection {
  id: string;
  periodStart: string;
  status: string;
  version: number;
  confirmedAt: string | null;
  unresolvedCount: number;
  collections: Array<{
    id: string;
    tutorContactId: string;
    status: string;
    report: null | {
      id: string;
      revision: number;
      status: string;
      sourceChannel: string;
      submittedAt: string;
      confirmedAt: string | null;
      lessons: Array<{
        id: string;
        reportedStudentName: string;
        studentContactId: string | null;
        lessonDate: string;
        durationMinutes: number;
        subject: string | null;
      }>;
    };
  }>;
}

export function projectLessonCycle(input: ProjectionInput): LessonCycleProjection {
  const cycle = objectValue(input.cycle, "invalid_lesson_cycle_projection");
  if (!Array.isArray(input.collections) || !Array.isArray(input.reports) || !Array.isArray(input.lessons)) throw new Error("invalid_lesson_cycle_projection");
  const activeReports = input.reports.filter((raw) => raw.status !== "superseded");
  let unresolvedCount = 0;
  const collections = input.collections.map((raw) => {
    const collection = objectValue(raw, "invalid_lesson_cycle_projection");
    const report = activeReports
      .filter((candidate) => candidate.teacher_collection_id === collection.id)
      .sort((left, right) => Number(right.revision) - Number(left.revision))[0];
    const reportLessons = report ? input.lessons.filter((lesson) => lesson.report_revision_id === report.id) : [];
    unresolvedCount += reportLessons.filter((lesson) => lesson.student_contact_id === null).length;
    return {
      id: uuidValue(collection.id, "invalid_lesson_cycle_projection"),
      tutorContactId: uuidValue(collection.tutor_contact_id, "invalid_lesson_cycle_projection"),
      status: normalizedText(collection.status, 1, 80, "invalid_lesson_cycle_projection"),
      report: report ? {
        id: uuidValue(report.id, "invalid_lesson_cycle_projection"),
        revision: Number(report.revision),
        status: normalizedText(report.status, 1, 80, "invalid_lesson_cycle_projection"),
        sourceChannel: normalizedText(report.source_channel, 1, 80, "invalid_lesson_cycle_projection"),
        submittedAt: isoTimestamp(report.submitted_at) as string,
        confirmedAt: isoTimestamp(report.confirmed_at),
        lessons: reportLessons.map((lesson) => ({
          id: uuidValue(lesson.id, "invalid_lesson_cycle_projection"),
          reportedStudentName: normalizedText(lesson.reported_student_name, 1, 160, "invalid_lesson_cycle_projection"),
          studentContactId: lesson.student_contact_id === null ? null : uuidValue(lesson.student_contact_id, "invalid_lesson_cycle_projection"),
          lessonDate: isoDate(lesson.lesson_date, "invalid_lesson_cycle_projection"),
          durationMinutes: Number(lesson.duration_minutes),
          subject: lesson.subject === null ? null : normalizedText(lesson.subject, 1, 120, "invalid_lesson_cycle_projection"),
        })).sort((left, right) => left.lessonDate.localeCompare(right.lessonDate) || left.reportedStudentName.localeCompare(right.reportedStudentName)),
      } : null,
    };
  }).sort((left, right) => left.tutorContactId.localeCompare(right.tutorContactId));
  return {
    id: uuidValue(cycle.id, "invalid_lesson_cycle_projection"),
    periodStart: isoDate(cycle.period_start, "invalid_lesson_cycle_projection"),
    status: normalizedText(cycle.status, 1, 80, "invalid_lesson_cycle_projection"),
    version: Number(cycle.version),
    confirmedAt: isoTimestamp(cycle.confirmed_at),
    unresolvedCount,
    collections,
  };
}

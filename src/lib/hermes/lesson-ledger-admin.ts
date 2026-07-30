import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export interface AdminLesson {
  id: string;
  reportedStudentName: string;
  studentName: string | null;
  lessonDate: string;
  durationMinutes: number;
  subject: string | null;
}

export interface AdminLessonReport {
  id: string;
  revision: number;
  status: string;
  sourceChannel: string;
  submittedAt: string;
  confirmedAt: string | null;
  lessons: AdminLesson[];
}

export interface AdminTeacherCollection {
  id: string;
  tutorContactId: string;
  tutorName: string;
  status: string;
  requestDeliveryStatus: string | null;
  requestFailure: string | null;
  report: AdminLessonReport | null;
}

export interface AdminLessonCycle {
  id: string;
  periodStart: string;
  status: string;
  version: number;
  confirmedAt: string | null;
  updatedAt: string;
  selectedTutorCount: number;
  confirmedReportCount: number;
  lessonCount: number;
  unresolvedCount: number;
  collections: AdminTeacherCollection[];
}

interface CycleRow {
  id: string;
  period_start: string;
  status: string;
  version: number;
  confirmed_at: string | null;
  updated_at: string;
}

interface NamedContactRow {
  display_name: string;
}

interface CollectionRow {
  id: string;
  lesson_cycle_id: string;
  tutor_contact_id: string;
  status: string;
  tutor: NamedContactRow | NamedContactRow[] | null;
}

interface ReportRow {
  id: string;
  teacher_collection_id: string;
  revision: number;
  status: string;
  source_channel: string;
  submitted_at: string;
  confirmed_at: string | null;
}

interface LessonRow {
  id: string;
  report_revision_id: string;
  reported_student_name: string;
  student_contact_id: string | null;
  lesson_date: string;
  duration_minutes: number;
  subject: string | null;
  student: NamedContactRow | NamedContactRow[] | null;
}

interface DeliveryMessageRow {
  id: string;
  lesson_cycle_id: string | null;
  contact_id: string;
  status: string;
  error_detail: string | null;
  occurred_at: string;
}

interface AdminLessonProjectionInput {
  cycles: CycleRow[];
  collections: CollectionRow[];
  reports: ReportRow[];
  lessons: LessonRow[];
  deliveryMessages: DeliveryMessageRow[];
}

function contactName(
  relation: NamedContactRow | NamedContactRow[] | null,
): string | null {
  if (Array.isArray(relation)) return relation[0]?.display_name ?? null;
  return relation?.display_name ?? null;
}

function deliveryKey(cycleId: string, contactId: string): string {
  return `${cycleId}:${contactId}`;
}

export function projectAdminLessonCycles({
  cycles,
  collections,
  reports,
  lessons,
  deliveryMessages,
}: AdminLessonProjectionInput): AdminLessonCycle[] {
  const activeReports = new Map<string, ReportRow>();
  for (const report of reports) {
    if (report.status === "superseded") continue;
    const current = activeReports.get(report.teacher_collection_id);
    if (
      !current ||
      report.revision > current.revision ||
      (report.revision === current.revision && report.id > current.id)
    ) {
      activeReports.set(report.teacher_collection_id, report);
    }
  }

  const lessonsByReport = new Map<string, LessonRow[]>();
  for (const lesson of lessons) {
    const reportLessons = lessonsByReport.get(lesson.report_revision_id) ?? [];
    reportLessons.push(lesson);
    lessonsByReport.set(lesson.report_revision_id, reportLessons);
  }

  const latestDelivery = new Map<string, DeliveryMessageRow>();
  for (const message of deliveryMessages) {
    if (!message.lesson_cycle_id) continue;
    const key = deliveryKey(message.lesson_cycle_id, message.contact_id);
    const current = latestDelivery.get(key);
    if (
      !current ||
      message.occurred_at > current.occurred_at ||
      (message.occurred_at === current.occurred_at && message.id > current.id)
    ) {
      latestDelivery.set(key, message);
    }
  }

  return [...cycles]
    .sort(
      (left, right) =>
        right.period_start.localeCompare(left.period_start) ||
        right.id.localeCompare(left.id),
    )
    .map((cycle) => {
      const cycleCollections = collections
        .filter((collection) => collection.lesson_cycle_id === cycle.id)
        .map((collection): AdminTeacherCollection => {
          const report = activeReports.get(collection.id);
          const delivery = latestDelivery.get(
            deliveryKey(cycle.id, collection.tutor_contact_id),
          );
          const projectedReport = report
            ? {
                id: report.id,
                revision: report.revision,
                status: report.status,
                sourceChannel: report.source_channel,
                submittedAt: report.submitted_at,
                confirmedAt: report.confirmed_at,
                lessons: (lessonsByReport.get(report.id) ?? [])
                  .map(
                    (lesson): AdminLesson => ({
                      id: lesson.id,
                      reportedStudentName: lesson.reported_student_name,
                      studentName: contactName(lesson.student),
                      lessonDate: lesson.lesson_date,
                      durationMinutes: lesson.duration_minutes,
                      subject: lesson.subject,
                    }),
                  )
                  .sort(
                    (left, right) =>
                      left.lessonDate.localeCompare(right.lessonDate) ||
                      left.reportedStudentName.localeCompare(
                        right.reportedStudentName,
                      ) ||
                      left.id.localeCompare(right.id),
                  ),
              }
            : null;

          return {
            id: collection.id,
            tutorContactId: collection.tutor_contact_id,
            tutorName: contactName(collection.tutor) ?? "Tutor unavailable",
            status: collection.status,
            requestDeliveryStatus: delivery?.status ?? null,
            requestFailure:
              delivery?.status === "failed" ? delivery.error_detail : null,
            report: projectedReport,
          };
        })
        .sort(
          (left, right) =>
            left.tutorName.localeCompare(right.tutorName) ||
            left.id.localeCompare(right.id),
        );

      const activeLessons = cycleCollections.flatMap(
        (collection) => collection.report?.lessons ?? [],
      );
      return {
        id: cycle.id,
        periodStart: cycle.period_start,
        status: cycle.status,
        version: cycle.version,
        confirmedAt: cycle.confirmed_at,
        updatedAt: cycle.updated_at,
        selectedTutorCount: cycleCollections.length,
        confirmedReportCount: cycleCollections.filter(
          (collection) => collection.status === "confirmed",
        ).length,
        lessonCount: activeLessons.length,
        unresolvedCount: activeLessons.filter(
          (lesson) => lesson.studentName === null,
        ).length,
        collections: cycleCollections,
      };
    });
}

export async function loadAdminLessonCycles(
  supabase: AdminClient,
): Promise<AdminLessonCycle[]> {
  const { data: cycleData, error: cycleError } = await supabase
    .from("academy_lesson_cycles")
    .select("id, period_start, status, version, confirmed_at, updated_at")
    .order("period_start", { ascending: false })
    .limit(12);
  if (cycleError) throw new Error("lesson_ledger_unavailable");

  const cycles = (cycleData ?? []) as CycleRow[];
  if (cycles.length === 0) return [];
  const cycleIds = cycles.map((cycle) => cycle.id);

  const { data: collectionData, error: collectionError } = await supabase
    .from("academy_teacher_collections")
    .select(
      "id, lesson_cycle_id, tutor_contact_id, status, tutor:hermes_contacts!academy_teacher_collections_tutor_contact_id_fkey(display_name)",
    )
    .in("lesson_cycle_id", cycleIds);
  if (collectionError) throw new Error("lesson_ledger_unavailable");

  const collections = (collectionData ?? []) as unknown as CollectionRow[];
  const collectionIds = collections.map((collection) => collection.id);
  let reports: ReportRow[] = [];
  if (collectionIds.length > 0) {
    const { data, error } = await supabase
      .from("academy_lesson_report_revisions")
      .select(
        "id, teacher_collection_id, revision, status, source_channel, submitted_at, confirmed_at",
      )
      .in("teacher_collection_id", collectionIds)
      .neq("status", "superseded");
    if (error) throw new Error("lesson_ledger_unavailable");
    reports = (data ?? []) as ReportRow[];
  }

  const reportIds = reports.map((report) => report.id);
  let lessons: LessonRow[] = [];
  if (reportIds.length > 0) {
    const { data, error } = await supabase
      .from("academy_lessons")
      .select(
        "id, report_revision_id, reported_student_name, student_contact_id, lesson_date, duration_minutes, subject, student:hermes_contacts!academy_lessons_student_contact_id_fkey(display_name)",
      )
      .in("report_revision_id", reportIds);
    if (error) throw new Error("lesson_ledger_unavailable");
    lessons = (data ?? []) as unknown as LessonRow[];
  }

  const { data: deliveryData, error: deliveryError } = await supabase
    .from("hermes_messages")
    .select(
      "id, lesson_cycle_id, contact_id, status, error_detail, occurred_at",
    )
    .in("lesson_cycle_id", cycleIds)
    .eq("intent", "lesson_report_request");
  if (deliveryError) throw new Error("lesson_ledger_unavailable");

  return projectAdminLessonCycles({
    cycles,
    collections,
    reports,
    lessons,
    deliveryMessages: (deliveryData ?? []) as DeliveryMessageRow[],
  });
}

import { Banknote, BookOpen } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Empty,
  PanelCard,
  type HermesSettlementCycle,
} from "@/components/admin/hermes-dashboard-shared";
import type { AdminLessonCycle } from "@/lib/hermes/lesson-ledger-admin";

function formatCycleMonth(periodStart: string) {
  return new Date(`${periodStart}T00:00:00`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function ProgressRow({ label, done, total }: { label: string; done: number; total: number }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
      <span className="text-sm text-muted">{label}</span>
      <span className="text-sm font-semibold">{done}/{total}</span>
    </div>
  );
}

function humanize(value: string) {
  return value.replaceAll("_", " ");
}

function formatLessonDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function HermesSettlementsPanel({
  lessonCycles,
  lessonLedgerError,
  settlements,
}: {
  lessonCycles: AdminLessonCycle[];
  lessonLedgerError: string | null;
  settlements: HermesSettlementCycle[];
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <PanelCard
        icon={<BookOpen size={18} />}
        title="Lesson collection"
        description="Tutor lesson evidence collected by Kitty for each month"
      >
        {lessonLedgerError ? (
          <p className="text-sm text-error">{lessonLedgerError}</p>
        ) : lessonCycles.length === 0 ? (
          <Empty>No lesson collection cycles yet.</Empty>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {lessonCycles.map((cycle, cycleIndex) => (
              <details
                key={cycle.id}
                open={cycleIndex === 0}
                className="border border-border bg-surface"
                style={{ borderRadius: "10px", padding: "12px 14px" }}
              >
                <summary style={{ cursor: "pointer" }}>
                  <span
                    style={{
                      display: "inline-flex",
                      width: "calc(100% - 24px)",
                      justifyContent: "space-between",
                      gap: "8px",
                      alignItems: "center",
                      verticalAlign: "middle",
                    }}
                  >
                    <span className="text-sm font-semibold text-navy">
                      {formatCycleMonth(cycle.periodStart)}
                    </span>
                    <Badge>{humanize(cycle.status)}</Badge>
                  </span>
                </summary>

                <div
                  style={{
                    marginTop: "14px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "14px",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(150px, 1fr))",
                      gap: "8px 20px",
                    }}
                  >
                    <ProgressRow
                      label="Tutors confirmed"
                      done={cycle.confirmedReportCount}
                      total={cycle.selectedTutorCount}
                    />
                    <span className="text-sm text-muted">
                      Lessons recorded{" "}
                      <strong className="text-navy">
                        {cycle.lessonCount}
                      </strong>
                    </span>
                    <span className="text-sm text-muted">
                      Students unresolved{" "}
                      <strong className="text-navy">
                        {cycle.unresolvedCount}
                      </strong>
                    </span>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px",
                    }}
                  >
                    {cycle.collections.map((collection) => {
                      const report = collection.report;
                      return (
                        <section
                          key={collection.id}
                          className="border border-border"
                          style={{
                            borderRadius: "8px",
                            padding: "12px",
                            background: "var(--color-background)",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: "8px",
                            }}
                          >
                            <h3 className="text-sm font-semibold text-navy">
                              {collection.tutorName || "Tutor unavailable"}
                            </h3>
                            <Badge>{humanize(collection.status)}</Badge>
                          </div>
                          <p
                            className="text-xs text-muted"
                            style={{ marginTop: "6px" }}
                          >
                            Request delivery:{" "}
                            {collection.requestDeliveryStatus
                              ? humanize(collection.requestDeliveryStatus)
                              : "not sent"}
                          </p>
                          {collection.requestDeliveryStatus === "failed" ? (
                            <p
                              className="text-xs text-error"
                              style={{ marginTop: "4px" }}
                            >
                              Delivery failed
                              {collection.requestFailure
                                ? `: ${collection.requestFailure}`
                                : "."}
                            </p>
                          ) : null}

                          {report === null ? (
                            <p
                              className="text-sm text-muted"
                              style={{ marginTop: "10px" }}
                            >
                              Awaiting lesson report
                            </p>
                          ) : (
                            <div style={{ marginTop: "10px" }}>
                              <p className="text-xs text-muted">
                                Revision {report.revision} ·{" "}
                                {humanize(report.sourceChannel)} ·{" "}
                                {humanize(report.status)}
                              </p>
                              {report.status === "confirmed" &&
                              report.lessons.length === 0 ? (
                                <p
                                  className="text-sm text-muted"
                                  style={{ marginTop: "8px" }}
                                >
                                  Confirmed with no lessons
                                </p>
                              ) : (
                                <ul
                                  style={{
                                    marginTop: "8px",
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "8px",
                                  }}
                                >
                                  {report.lessons.map((lesson) => {
                                    const resolvedName = lesson.studentName;
                                    const reportedName =
                                      lesson.reportedStudentName;
                                    const namesDiffer =
                                      resolvedName !== null &&
                                      resolvedName.localeCompare(
                                        reportedName,
                                        undefined,
                                        { sensitivity: "base" },
                                      ) !== 0;
                                    return (
                                      <li
                                        key={lesson.id}
                                        className="text-sm"
                                        style={{ listStyle: "none" }}
                                      >
                                        <time dateTime={lesson.lessonDate}>
                                          {formatLessonDate(lesson.lessonDate)}
                                        </time>
                                        {" · "}
                                        {lesson.durationMinutes} min
                                        {lesson.subject
                                          ? ` · ${lesson.subject}`
                                          : ""}
                                        {" · "}
                                        {resolvedName ?? (
                                          <span className="text-error">
                                            Unresolved student: {reportedName}
                                          </span>
                                        )}
                                        {namesDiffer ? (
                                          <span className="text-muted">
                                            {" "}
                                            (Reported as {reportedName})
                                          </span>
                                        ) : null}
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                            </div>
                          )}
                        </section>
                      );
                    })}
                  </div>

                  <p className="text-xs text-muted">
                    Corrections remain available in audit history.
                  </p>
                </div>
              </details>
            ))}
          </div>
        )}
      </PanelCard>

      <PanelCard
        icon={<Banknote size={18} />}
        title="Financial settlements"
        description="Tutor-reported work and payment tracking"
      >
        {settlements.length === 0 ? (
          <Empty>No monthly settlement cycles yet.</Empty>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {settlements.map((cycle, index) => {
              const readyReports = cycle.tutor_reports.filter((item) => ["ready", "approved"].includes(item.status)).length;
              const paidInvoices = cycle.family_invoices.filter((item) => item.status === "paid").length;
              const paidPayouts = cycle.tutor_payouts.filter((item) => item.status === "paid").length;
              return (
                <details
                  key={cycle.id}
                  open={index === 0}
                  className="border border-border bg-surface"
                  style={{ borderRadius: "10px", padding: "12px 14px" }}
                >
                  <summary style={{ cursor: "pointer" }}>
                    <span
                      style={{ display: "inline-flex", width: "calc(100% - 24px)", justifyContent: "space-between", gap: "8px", alignItems: "center", verticalAlign: "middle" }}
                    >
                      <span className="text-sm font-semibold text-navy">{formatCycleMonth(cycle.period_start)}</span>
                      <Badge>{cycle.status.replaceAll("_", " ")}</Badge>
                    </span>
                  </summary>
                  <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
                    <ProgressRow label="Tutor reports ready" done={readyReports} total={cycle.tutor_reports.length} />
                    <ProgressRow label="Family invoices paid" done={paidInvoices} total={cycle.family_invoices.length} />
                    <ProgressRow label="Tutor payouts paid" done={paidPayouts} total={cycle.tutor_payouts.length} />
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </PanelCard>
    </div>
  );
}

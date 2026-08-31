import type { PublicFeeStatement } from "@/lib/hermes/fee-statements";

import styles from "./fee-statement-receipt.module.css";

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

function day(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function month(value: string) {
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function hours(minutes: number) {
  const value = minutes / 60;
  return `${Number.isInteger(value) ? value : value.toFixed(1)} hr${value === 1 ? "" : "s"}`;
}

export function FeeStatementReceipt({ statement }: { statement: PublicFeeStatement }) {
  const paid = statement.status === "paid";
  return (
    <main className={styles.page}>
      <div className={styles.printer} aria-hidden="true">
        <span className={styles.printerLight} />
        <span className={styles.slot} />
      </div>
      <section className={styles.receipt} aria-labelledby="statement-title">
        <div className={styles.brandRow}>
          <div>
            <p className={styles.eyebrow}>MyInsightAcademy</p>
            <h1 id="statement-title">Fee statement</h1>
          </div>
          <span className={`${styles.status} ${paid ? styles.paid : ""}`}>{paid ? "Paid" : "Payment due"}</span>
        </div>

        <div className={styles.intro}>
          <p className={styles.label}>Prepared for</p>
          <h2>{statement.billedToName ?? statement.studentName}</h2>
          {statement.billedToName ? <p>Classes for {statement.studentName}</p> : null}
        </div>

        <dl className={styles.meta}>
          <div><dt>Statement</dt><dd>{statement.statementReference}</dd></div>
          <div><dt>Billing period</dt><dd>{day(statement.periodStart)} – {day(statement.periodEnd)}</dd></div>
          <div><dt>Issued</dt><dd>{day(statement.issuedAt.slice(0, 10))}</dd></div>
          {statement.dueDate ? <div><dt>Due</dt><dd>{day(statement.dueDate)}</dd></div> : null}
        </dl>

        <div className={styles.rule} aria-hidden="true" />
        <div className={styles.items}>
          <div className={styles.itemHead} aria-hidden="true"><span>Class</span><span>Time</span><span>Amount</span></div>
          {statement.lineItems.map((item, index) => (
            <article className={styles.item} key={`${item.lessonDate ?? "aggregate"}-${item.teacherName}-${index}`}>
              <div>
                {item.lessonDate ? <time dateTime={item.lessonDate}>{day(item.lessonDate)}</time> : <time>{month(statement.periodStart)} total</time>}
                <div className={styles.classLine}>
                  <strong>{item.subject ?? "Tutoring"}</strong>
                  <small>with {item.teacherName}</small>
                </div>
                {item.note ? <small className={styles.note}>{item.note}</small> : null}
              </div>
              <span className={styles.duration}>{hours(item.durationMinutes)}</span>
              <span className={styles.amount}>{money(item.amountMinor, statement.currency)}</span>
            </article>
          ))}
        </div>

        <div className={styles.totalRow}>
          <span>Total due</span>
          <strong>{money(statement.totalMinor, statement.currency)}</strong>
        </div>

        <footer>
          <p>{paid ? "Thank you — this statement is marked as paid." : "Please use the usual payment method agreed with MyInsightAcademy."}</p>
          <span>Questions? Reply to the message that brought you here.</span>
        </footer>
      </section>
    </main>
  );
}

import type { PublicFeeStatement } from "@/lib/hermes/fee-statements";
import { formatMinorCurrency } from "@/lib/format-minor-currency";

import { BankQrPayment } from "./bank-qr-payment";
import { buildFeeStatementRows, canOfferBankQr, parentVisibleNote } from "./fee-statement-presentation";
import styles from "./fee-statement-receipt.module.css";

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

type LineItem = PublicFeeStatement["lineItems"][number];

function LineItemRow({ item, periodStart, currency, nested = false }: { item: LineItem; periodStart: string; currency: string; nested?: boolean }) {
  const note = parentVisibleNote(item.note);
  return (
    <article className={`${styles.item} ${nested ? styles.nestedItem : ""}`}>
      <div>
        {item.lessonDate ? <time dateTime={item.lessonDate}>{day(item.lessonDate)}</time> : <time>{month(periodStart)} total</time>}
        <div className={styles.classLine}>
          <strong>{item.subject ?? "Tutoring"}</strong>
          <small>with {item.teacherName}</small>
        </div>
        <small className={styles.calculation}>
          {hours(item.durationMinutes)} × {formatMinorCurrency(item.rateMinor, currency)} per hour = {formatMinorCurrency(item.amountMinor, currency)}
        </small>
        {note ? <small className={styles.note}>{note}</small> : null}
      </div>
      <span className={styles.duration}>{hours(item.durationMinutes)}</span>
      <span className={styles.amount}>{formatMinorCurrency(item.amountMinor, currency)}</span>
    </article>
  );
}

export function FeeStatementReceipt({ statement }: { statement: PublicFeeStatement }) {
  const paid = statement.status === "paid";
  const offerBankQr = canOfferBankQr(statement.status, statement.currency);
  const rows = buildFeeStatementRows(statement.lineItems);

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

        {offerBankQr ? <BankQrPayment amountMinor={statement.totalMinor} currency={statement.currency} placement="top" /> : null}

        <div className={styles.rule} aria-hidden="true" />
        <div className={styles.items}>
          <div className={styles.itemHead} aria-hidden="true"><span>Class</span><span>Time</span><span>Amount</span></div>
          {rows.map((row) => row.kind === "item" ? (
            <LineItemRow
              currency={statement.currency}
              item={row.item}
              key={`${row.item.lessonDate ?? "aggregate"}-${row.item.teacherName}-${row.sourceIndex}`}
              periodStart={statement.periodStart}
            />
          ) : (
            <details className={styles.itemGroup} key={`group-${row.teacherName}`}>
              <summary className={styles.groupSummary}>
                <div>
                  <strong>{row.items.length} classes with {row.teacherName}</strong>
                  <small className={styles.calculation}>
                    {row.rateMinor === null
                      ? "Rates shown per class"
                      : `${hours(row.durationMinutes)} × ${formatMinorCurrency(row.rateMinor, statement.currency)} per hour = ${formatMinorCurrency(row.amountMinor, statement.currency)}`}
                  </small>
                  <small>Tap to see individual classes</small>
                </div>
                <span className={styles.duration}>{hours(row.durationMinutes)}</span>
                <span className={styles.amount}>{formatMinorCurrency(row.amountMinor, statement.currency)}</span>
              </summary>
              <div className={styles.groupItems}>
                {row.items.map(({ item, sourceIndex }) => (
                  <LineItemRow
                    currency={statement.currency}
                    item={item}
                    key={`${item.lessonDate}-${item.teacherName}-${sourceIndex}`}
                    nested
                    periodStart={statement.periodStart}
                  />
                ))}
              </div>
            </details>
          ))}
        </div>

        <div className={styles.totalRow}>
          <span>{paid ? "Total paid" : "Total due"}</span>
          <strong>{formatMinorCurrency(statement.totalMinor, statement.currency)}</strong>
        </div>

        {offerBankQr ? <BankQrPayment amountMinor={statement.totalMinor} currency={statement.currency} placement="bottom" /> : null}

        <footer>
          <p>{paid ? "Thank you — this statement is marked as paid." : "Please use the usual payment method agreed with MyInsightAcademy."}</p>
          <span>Questions? Reply to the message that brought you here.</span>
        </footer>
      </section>
    </main>
  );
}

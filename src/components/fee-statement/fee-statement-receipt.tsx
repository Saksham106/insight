import { Fragment } from "react";
import type { PublicFeeStatement } from "@/lib/hermes/fee-statements";
import { formatMinorCurrency } from "@/lib/format-minor-currency";

import { BankQrPayment } from "./bank-qr-payment";
import { buildFeeStatementRows, canOfferBankQr, formatDurationHours, parentVisibleNote } from "./fee-statement-presentation";
import styles from "./fee-statement-receipt.module.css";

function day(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function month(value: string) {
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

type LineItem = PublicFeeStatement["lineItems"][number];

function LineItemRow({ item, periodStart, currency, nested = false }: { item: LineItem; periodStart: string; currency: string; nested?: boolean }) {
  if (item.kind === "fee") return (
    <article className={`${styles.item} ${nested ? styles.nestedItem : ""}`}>
      <div><strong>{item.label}</strong></div>
      <span className={styles.duration}>—</span>
      <span className={styles.amount}>{formatMinorCurrency(item.amountMinor, currency)}</span>
    </article>
  );
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
          {formatDurationHours(item.durationMinutes)} × {formatMinorCurrency(item.rateMinor, currency)} per hour = {formatMinorCurrency(item.amountMinor, currency)}
        </small>
        {note ? <small className={styles.note}>{note}</small> : null}
      </div>
      <span className={styles.duration}>{formatDurationHours(item.durationMinutes)}</span>
      <span className={styles.amount}>{formatMinorCurrency(item.amountMinor, currency)}</span>
    </article>
  );
}

export function FeeStatementReceipt({ statement }: { statement: PublicFeeStatement }) {
  const paid = statement.status === "paid";
  const balance = statement.balance;
  const nothingToPay = !paid && balance?.amountDueMinor === 0;
  const offerBankQr = !nothingToPay && canOfferBankQr(statement.status, statement.currency);
  const rows = buildFeeStatementRows(statement.lineItems, statement.periodStart);

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
          <span className={`${styles.status} ${paid ? styles.paid : nothingToPay ? styles.paid : ""}`}>{paid ? "Paid" : nothingToPay ? "Covered by advance" : "Payment due"}</span>
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

        {offerBankQr ? <BankQrPayment amountMinor={balance?.amountDueMinor ?? statement.totalMinor} currency={statement.currency} placement="top" /> : null}

        <div className={styles.rule} aria-hidden="true" />
        {balance ? <h2 className={styles.chargeHeading}>Classes and original charges</h2> : null}
        <div className={styles.items}>
          <div className={styles.itemHead} aria-hidden="true"><span>Class</span><span>Time</span><span>Amount</span></div>
          {rows.map((row) => row.kind === "item" ? (
            <Fragment key={`item-${row.sourceIndex}`}>
              {row.item.kind !== "fee" && row.classDates?.length ? (
                <details className={`${styles.itemGroup} ${styles.aggregateDetails}`}>
                  <summary className={styles.groupSummary}>
                    <div>
                      <strong>{row.classDates.length} class dates with {row.item.teacherName}</strong>
                      <small>{row.item.subject ?? "Tutoring"} · {month(statement.periodStart)}</small>
                      <small className={styles.calculation}>
                        {formatDurationHours(row.item.durationMinutes)} × {formatMinorCurrency(row.item.rateMinor, statement.currency)} per hour = {formatMinorCurrency(row.item.amountMinor, statement.currency)}
                      </small>
                      <small>Dates included — tap to see individual classes</small>
                    </div>
                    <span className={styles.duration}>{formatDurationHours(row.item.durationMinutes)}</span>
                    <span className={styles.amount}>{formatMinorCurrency(row.item.amountMinor, statement.currency)}</span>
                  </summary>
                  <div className={styles.groupItems}>
                    {row.classDates.map((date) => (
                      <article className={`${styles.item} ${styles.nestedItem}`} key={date}>
                        <div>
                          <time dateTime={date}>{day(date)}</time>
                          <div className={styles.classLine}>
                            <strong>{row.item.kind === "fee" ? "" : row.item.subject ?? "Tutoring"}</strong>
                            <small>with {row.item.kind === "fee" ? "" : row.item.teacherName}</small>
                          </div>
                        </div>
                      </article>
                    ))}
                    <small className={styles.note}>Hours and fees above are the combined total; a per-class breakdown was not recorded on this statement.</small>
                    {parentVisibleNote(row.item.note) ? <small className={styles.note}>{parentVisibleNote(row.item.note)}</small> : null}
                  </div>
                </details>
              ) : (
                <LineItemRow currency={statement.currency} item={row.item} periodStart={statement.periodStart} />
              )}
            </Fragment>
          ) : (
            <details className={styles.itemGroup} key={`group-${row.teacherName}`}>
              <summary className={styles.groupSummary}>
                <div>
                  <strong>{row.items.length} classes with {row.teacherName}</strong>
                  <small className={styles.calculation}>
                    {row.rateMinor === null
                      ? "Rates shown per class"
                      : `${formatDurationHours(row.durationMinutes)} × ${formatMinorCurrency(row.rateMinor, statement.currency)} per hour = ${formatMinorCurrency(row.amountMinor, statement.currency)}`}
                  </small>
                  <small>Tap to see individual classes</small>
                </div>
                <span className={styles.duration}>{formatDurationHours(row.durationMinutes)}</span>
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

        {balance ? <>
          <div className={styles.balanceRow}><span>Classes and original charges</span><strong>{formatMinorCurrency(balance.baseMinor, statement.currency)}</strong></div>
          <div className={styles.balanceBlock}><p><span>Extra fees</span><strong>{formatMinorCurrency(balance.extraFeesMinor, statement.currency)}</strong></p>{statement.adjustments?.filter((item) => item.kind === "extra_fee").map((item) => <p className={styles.adjustmentLine} key={item.id}><span>{item.label}</span><span>{formatMinorCurrency(item.amountMinor, statement.currency)}</span></p>)}</div>
          <div className={styles.balanceRow}><span>Total charges</span><strong>{formatMinorCurrency(balance.grossMinor, statement.currency)}</strong></div>
          <div className={styles.balanceBlock}><p><span>Advance already received</span><strong>−{formatMinorCurrency(balance.advancesMinor, statement.currency)}</strong></p>{statement.adjustments?.filter((item) => item.kind === "advance").map((item) => <p className={styles.adjustmentLine} key={item.id}><span>{item.label}</span><span>−{formatMinorCurrency(item.amountMinor, statement.currency)}</span></p>)}</div>
          <div className={styles.totalRow}><span>{paid ? "Total paid" : nothingToPay ? "Nothing to pay" : "Amount due"}</span><strong>{formatMinorCurrency(balance.amountDueMinor, statement.currency)}</strong></div>
          {nothingToPay ? <p className={styles.coveredNote}>Covered by advance — no further payment is needed.</p> : null}
        </> : <div className={styles.totalRow}>
          <span>{paid ? "Total paid" : "Total due"}</span>
          <strong>{formatMinorCurrency(statement.totalMinor, statement.currency)}</strong>
        </div>}

        {offerBankQr ? <BankQrPayment amountMinor={balance?.amountDueMinor ?? statement.totalMinor} currency={statement.currency} placement="bottom" /> : null}

        <footer>
          <p>{paid ? "Thank you — this statement is marked as paid." : nothingToPay ? "No further payment is needed." : "Please use the usual payment method agreed with MyInsightAcademy."}</p>
          <span>Questions? Reply to the message that brought you here.</span>
        </footer>
      </section>
    </main>
  );
}

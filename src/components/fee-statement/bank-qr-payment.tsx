"use client";

import Image from "next/image";
import { QrCode } from "lucide-react";
import { useEffect, useId, useRef } from "react";

import bankQrCode from "@/assets/bank-qr-code.png";
import { formatMinorCurrency } from "@/lib/format-minor-currency";

import styles from "./fee-statement-receipt.module.css";

export function BankQrPayment({
  amountMinor,
  currency,
  placement,
}: {
  amountMinor: number;
  currency: string;
  placement: "top" | "bottom";
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const amount = formatMinorCurrency(amountMinor, currency);

  function unlockPage() {
    document.documentElement.style.overflow = "";
  }

  function openDialog() {
    dialogRef.current?.showModal();
    document.documentElement.style.overflow = "hidden";
  }

  function closeDialog() {
    dialogRef.current?.close();
    unlockPage();
  }

  useEffect(() => () => {
    document.documentElement.style.overflow = "";
  }, []);

  return (
    <div className={`${styles.paymentAction} ${placement === "bottom" ? styles.paymentActionBottom : ""}`}>
      <button
        className={`${styles.paymentButton} ${placement === "bottom" ? styles.paymentButtonBottom : ""}`}
        type="button"
        onClick={openDialog}
      >
        <QrCode aria-hidden="true" size={18} strokeWidth={2.2} />
        <span>{placement === "top" ? "Pay by QR" : "Bank details & QR"}</span>
        {placement === "top" ? <small>{amount}</small> : null}
      </button>
      <dialog
        aria-labelledby={titleId}
        className={styles.paymentDialog}
        ref={dialogRef}
        onClose={unlockPage}
        onClick={(event) => {
          if (event.currentTarget === event.target) closeDialog();
        }}
      >
        <div className={styles.paymentDialogCard}>
          <div className={styles.paymentDialogHead}>
            <div>
              <p className={styles.eyebrow}>Bank transfer</p>
              <h2 id={titleId}>Scan to pay</h2>
            </div>
            <button aria-label="Close payment QR" className={styles.dialogClose} type="button" onClick={closeDialog}>
              ×
            </button>
          </div>
          <div className={styles.paymentAmount}>
            <span>Amount to send</span>
            <strong>{amount}</strong>
          </div>
          <Image
            alt="VietinBank payment QR for GOEL SWATI"
            className={styles.qrImage}
            priority={placement === "top"}
            src={bankQrCode}
          />
          <dl className={styles.bankDetails}>
            <div><dt>Recipient</dt><dd>GOEL SWATI</dd></div>
            <div><dt>Account</dt><dd>106882732486</dd></div>
            <div><dt>Bank</dt><dd>VietinBank</dd></div>
          </dl>
          <p className={styles.paymentHelp}>Scan with your banking app, enter the amount shown above, and check the recipient before confirming.</p>
        </div>
      </dialog>
    </div>
  );
}

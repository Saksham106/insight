"use client";

import { useMemo, useState } from "react";
import {
  Copy,
  ExternalLink,
  MessageCircle,
  ReceiptText,
  Search,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMinorCurrency } from "@/lib/format-minor-currency";

import {
  Empty,
  PanelCard,
  type HermesFeeStatementSummary,
} from "./hermes-dashboard-shared";

type LinkAction = "copy" | "open" | "whatsapp";

function monthLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 7)}-01T00:00:00Z`));
}

function issuedLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

async function retrieveStatementLink(statementId: string) {
  const response = await fetch(
    `/api/admin/hermes/fee-statements/${statementId}/link`,
    { method: "POST", cache: "no-store" },
  );
  const body = await response.json() as { url?: string; error?: string };
  if (!response.ok || !body.url) {
    throw new Error(body.error ?? "Could not retrieve this statement link.");
  }
  return body.url;
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // Safari can expire clipboard user activation while the private-link
    // request is in flight. Keep a local fallback so the button still works.
  }
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  if (!copied) throw new Error("Your browser could not copy this. Use Open statement instead.");
}

export function HermesFeeStatementsPanel({
  statements,
}: {
  statements: HermesFeeStatementSummary[];
}) {
  const [query, setQuery] = useState("");
  const [month, setMonth] = useState("all");
  const [status, setStatus] = useState("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const months = useMemo(
    () => [...new Set(statements.map((item) => item.period_start.slice(0, 7)))].sort().reverse(),
    [statements],
  );
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return statements.filter((statement) => {
      const matchesQuery = !needle || [
        statement.student_name,
        statement.billed_to_name ?? "",
        statement.statement_reference,
      ].some((value) => value.toLocaleLowerCase().includes(needle));
      return matchesQuery
        && (month === "all" || statement.period_start.startsWith(month))
        && (status === "all" || statement.status === status);
    });
  }, [month, query, statements, status]);

  async function perform(statement: HermesFeeStatementSummary, action: LinkAction) {
    const actionKey = `${statement.id}:${action}`;
    const opened = action === "open" ? window.open("about:blank", "_blank") : null;
    if (action === "open" && !opened) {
      setError("Your browser blocked the new tab. Use Copy link instead.");
      return;
    }
    if (opened) opened.opener = null;
    setBusy(actionKey);
    setError(null);
    setNotice(null);
    try {
      const url = await retrieveStatementLink(statement.id);
      if (action === "open") {
        opened?.location.replace(url);
        setNotice(`Opened ${statement.student_name}'s statement.`);
      } else {
        const text = action === "whatsapp"
          ? `Hi, here is ${statement.student_name}'s fee statement for ${monthLabel(statement.period_start)}. The total due is ${formatMinorCurrency(statement.total_minor, statement.currency)}: ${url}`
          : url;
        await copyToClipboard(text);
        setNotice(action === "whatsapp"
          ? `WhatsApp message copied for ${statement.student_name}.`
          : `Payment link copied for ${statement.student_name}.`);
      }
    } catch (caught) {
      opened?.close();
      setError(caught instanceof Error ? caught.message : "Could not retrieve this statement link.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <PanelCard
      icon={<ReceiptText size={18} />}
      title="Fee statements"
      description="Find a published statement, open it, or copy a ready-to-send payment message. Private links are recovered only after admin authentication."
    >
      {statements.length === 0 ? <Empty>No fee statements have been published yet.</Empty> : (
        <div style={{ display: "grid", gap: "16px" }}>
          <div
            className="border border-border bg-surface"
            style={{
              borderRadius: "10px",
              display: "grid",
              gap: "12px",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))",
              padding: "14px",
            }}
          >
            <label className="text-xs font-semibold text-navy" htmlFor="fee-statement-search">
              Search students or references
              <div style={{ marginTop: "6px", position: "relative" }}>
                <Search aria-hidden="true" size={16} style={{ left: "10px", position: "absolute", top: "50%", transform: "translateY(-50%)" }} />
                <Input
                  id="fee-statement-search"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Student, recipient, or MIA reference"
                  style={{ paddingLeft: "34px" }}
                  value={query}
                />
              </div>
            </label>
            <label className="text-xs font-semibold text-navy" htmlFor="fee-statement-month">
              Month
              <select
                className="border border-border bg-background text-sm text-navy"
                id="fee-statement-month"
                onChange={(event) => setMonth(event.target.value)}
                style={{ borderRadius: "8px", display: "block", height: "40px", marginTop: "6px", padding: "0 10px", width: "100%" }}
                value={month}
              >
                <option value="all">All months</option>
                {months.map((value) => <option key={value} value={value}>{monthLabel(value)}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-navy" htmlFor="fee-statement-status">
              Status
              <select
                className="border border-border bg-background text-sm text-navy"
                id="fee-statement-status"
                onChange={(event) => setStatus(event.target.value)}
                style={{ borderRadius: "8px", display: "block", height: "40px", marginTop: "6px", padding: "0 10px", width: "100%" }}
                value={status}
              >
                <option value="all">All statuses</option>
                <option value="published">Published</option>
                <option value="paid">Paid</option>
                <option value="void">Void</option>
              </select>
            </label>
          </div>

          <div aria-live="polite" className="text-sm">
            {error ? <p style={{ color: "var(--color-error)" }}>{error}</p> : null}
            {notice ? <p style={{ color: "var(--color-success)" }}>{notice}</p> : null}
            {!error && !notice ? <p className="text-muted">Showing {visible.length} of {statements.length} statements</p> : null}
          </div>

          {visible.length === 0 ? <Empty>No fee statements match those filters.</Empty> : (
            <div style={{ display: "grid", gap: "10px" }}>
              {visible.map((statement) => {
                const inactive = statement.status === "void";
                return (
                  <article
                    key={statement.id}
                    className="border border-border bg-surface"
                    style={{ borderRadius: "10px", display: "grid", gap: "12px", padding: "14px" }}
                  >
                    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "8px 16px" }}>
                      <div>
                        <strong className="text-navy">{statement.student_name}</strong>
                        {statement.billed_to_name ? <p className="text-xs text-muted" style={{ marginTop: "3px" }}>Billed to {statement.billed_to_name}</p> : null}
                        <p className="text-xs text-muted" style={{ marginTop: "3px" }}>
                          {statement.statement_reference} · {monthLabel(statement.period_start)} · Issued {issuedLabel(statement.issued_at)}
                        </p>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <strong className="text-navy">{formatMinorCurrency(statement.total_minor, statement.currency)}</strong>
                        <p className="text-xs text-muted" style={{ marginTop: "3px", textTransform: "capitalize" }}>{statement.status}</p>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                      <Button
                        disabled={inactive || busy !== null}
                        onClick={() => void perform(statement, "copy")}
                        size="sm"
                        type="button"
                        variant="secondary"
                      >
                        <Copy size={15} /> {busy === `${statement.id}:copy` ? "Copying…" : "Copy link"}
                      </Button>
                      <Button
                        disabled={inactive || busy !== null}
                        onClick={() => void perform(statement, "open")}
                        size="sm"
                        type="button"
                        variant="secondary"
                      >
                        <ExternalLink size={15} /> {busy === `${statement.id}:open` ? "Opening…" : "Open statement"}
                      </Button>
                      <Button
                        disabled={inactive || busy !== null}
                        onClick={() => void perform(statement, "whatsapp")}
                        size="sm"
                        type="button"
                      >
                        <MessageCircle size={15} /> {busy === `${statement.id}:whatsapp` ? "Copying…" : "Copy WhatsApp message"}
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}
    </PanelCard>
  );
}

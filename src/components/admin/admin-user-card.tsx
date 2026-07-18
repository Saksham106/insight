import type { ReactNode } from "react";

// Mobile presentation for a user row (teacher / student / parent). The admin
// tables are too wide for a phone, so on small screens each row renders as a
// stacked card instead: name + status on top, optional meta (labels/children),
// then the action buttons wrapping below.
export function AdminUserCard({
  name,
  active,
  status,
  meta,
  actions,
}: {
  name: string;
  active: boolean;
  status: ReactNode;
  meta?: ReactNode;
  actions: ReactNode;
}) {
  return (
    <div
      className="border border-border bg-surface"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        padding: "14px",
        borderRadius: "12px",
        opacity: active ? 1 : 0.55,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px" }}>
        <p className="text-sm font-semibold text-navy" style={{ minWidth: 0, wordBreak: "break-word" }}>{name}</p>
        <div style={{ flexShrink: 0 }}>{status}</div>
      </div>
      {meta ? <div>{meta}</div> : null}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>{actions}</div>
    </div>
  );
}

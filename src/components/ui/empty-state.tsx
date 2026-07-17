import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
}

export function EmptyState({ icon: Icon, title, description }: EmptyStateProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 24px",
        textAlign: "center",
        gap: "12px",
        borderRadius: "12px",
        border: "1px dashed var(--color-border)",
      }}
    >
      <div
        style={{
          width: "48px",
          height: "48px",
          borderRadius: "12px",
          backgroundColor: "var(--color-accent-soft)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon size={22} color="var(--color-navy)" strokeWidth={1.5} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <p className="text-sm font-semibold text-navy">{title}</p>
        {description && <p className="text-sm text-muted">{description}</p>}
      </div>
    </div>
  );
}

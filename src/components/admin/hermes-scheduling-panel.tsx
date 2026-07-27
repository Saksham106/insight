import { Clock3 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Empty,
  PanelCard,
  formatMessageTime,
  type HermesCase,
} from "@/components/admin/hermes-dashboard-shared";

export function HermesSchedulingPanel({ cases }: { cases: HermesCase[] }) {
  return (
    <PanelCard
      icon={<Clock3 size={18} />}
      title="Active scheduling"
      description="Who is waiting on whom"
    >
      {cases.length === 0 ? (
        <Empty>No active scheduling cases.</Empty>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "10px" }}>
          {cases.map((item) => (
            <li
              key={item.id}
              className="border border-border"
              style={{ borderRadius: "10px", padding: "12px 14px", display: "flex", gap: "10px", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}
            >
              <div style={{ minWidth: 0 }}>
                <p className="text-sm font-semibold">{item.title}</p>
                <p className="text-sm text-muted">
                  {item.status.replaceAll("_", " ")}{item.human_takeover ? " · Swati takeover" : ""}
                </p>
              </div>
              <time className="text-xs text-muted" dateTime={item.updated_at}>
                {formatMessageTime(item.updated_at)}
              </time>
              {item.human_takeover ? <Badge>takeover</Badge> : null}
            </li>
          ))}
        </ul>
      )}
    </PanelCard>
  );
}

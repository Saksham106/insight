"use client";

import { useState, useEffect } from "react";

import { Card, CardContent } from "@/components/ui/card";

interface Stat {
  label: string;
  value: number;
}

export function AdminStats({ stats }: { stats: Stat[] }) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  if (isMobile) {
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          borderRadius: "12px",
          border: "1px solid var(--color-border)",
          overflow: "hidden",
          backgroundColor: "var(--color-surface)",
        }}
      >
        {stats.map((stat, i) => (
          <div
            key={stat.label}
            style={{
              padding: "14px 8px",
              textAlign: "center",
              borderRight: i < stats.length - 1 ? "1px solid var(--color-border)" : undefined,
            }}
          >
            <p style={{ fontSize: "26px", fontWeight: 700, color: "var(--color-navy)", lineHeight: 1 }}>
              {stat.value}
            </p>
            <p style={{ fontSize: "11px", color: "var(--color-muted)", marginTop: "5px", lineHeight: 1.3 }}>
              {stat.label}
            </p>
          </div>
        ))}
      </div>
    );
  }

  return (
    <section style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "16px" }}>
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardContent style={{ padding: "28px 24px", textAlign: "center" }}>
            <p style={{ fontSize: "34px", fontWeight: 700, color: "var(--color-navy)", lineHeight: 1 }}>
              {stat.value}
            </p>
            <p className="text-sm text-muted" style={{ marginTop: "8px" }}>
              {stat.label}
            </p>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

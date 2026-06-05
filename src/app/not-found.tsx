import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div
      className="bg-background"
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        textAlign: "center",
        gap: "16px",
      }}
    >
      <p style={{ fontSize: "80px", fontWeight: 800, color: "var(--color-navy)", lineHeight: 1, margin: 0 }}>
        404
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <h1 className="text-xl font-semibold text-navy">Page not found</h1>
        <p className="text-sm text-muted">
          The page you're looking for doesn't exist or has been moved.
        </p>
      </div>
      <Button asChild>
        <Link href="/">Go home</Link>
      </Button>
    </div>
  );
}

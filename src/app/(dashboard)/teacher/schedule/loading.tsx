export default function Loading() {
  return (
    <div style={{ padding: "24px", maxWidth: "72rem", margin: "0 auto" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div className="skeleton" style={{ height: "48px", borderRadius: "10px", maxWidth: "200px" }} />
        <div className="skeleton" style={{ height: "320px", borderRadius: "12px" }} />
      </div>
    </div>
  );
}

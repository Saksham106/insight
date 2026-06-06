export default function Loading() {
  return (
    <div style={{ padding: "24px", maxWidth: "72rem", margin: "0 auto" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="skeleton" style={{ height: "64px", borderRadius: "10px" }} />
        ))}
      </div>
    </div>
  );
}

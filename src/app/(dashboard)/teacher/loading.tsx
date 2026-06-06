export default function Loading() {
  return (
    <div style={{ padding: "24px", maxWidth: "72rem", margin: "0 auto" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="skeleton"
            style={{ height: "120px", borderRadius: "12px" }}
          />
        ))}
      </div>
    </div>
  );
}

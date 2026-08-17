// Monochrome chart primitives — no categorical color, so identity comes from the row label
// itself rather than hue. Magnitude is the only thing these need to carry.

interface BarRowItem {
  label: string;
  value: number;
  displayValue?: string;
}

// One bar per category, each its own labeled row — sidesteps needing color to tell segments
// apart (there's only ever one black bar per row, so nothing to disambiguate).
export function BarRows({ items }: { items: BarRowItem[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map((item) => (
        <div key={item.label}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3 }}>
            <span>{item.label}</span>
            <strong>{item.displayValue ?? item.value}</strong>
          </div>
          <div style={{ background: "var(--fill-soft)", height: 10 }}>
            <div style={{ background: "var(--fill)", height: 10, width: `${(item.value / max) * 100}%`, transition: "width 0.2s ease" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

interface ColumnItem {
  label: string;
  value: number;
}

// Small discrete-period column chart (e.g. cost per month) — columns rather than a line since
// the points are discrete monthly runs, not a continuous quantity worth interpolating between.
export function ColumnChart({ items, formatValue }: { items: ColumnItem[]; formatValue?: (v: number) => string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const fmt = formatValue ?? ((v: number) => v.toLocaleString("en-IN"));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 140, paddingTop: 20 }}>
      {items.map((item) => (
        <div key={item.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end" }}>
          <div style={{ fontSize: 11, marginBottom: 4, fontWeight: 600 }}>{item.value > 0 ? fmt(item.value) : ""}</div>
          <div
            style={{
              width: "100%",
              maxWidth: 40,
              height: `${Math.max(2, (item.value / max) * 100)}%`,
              background: "var(--fill)",
            }}
          />
          <div style={{ borderTop: "1px solid var(--border)", width: "100%", marginTop: 4, paddingTop: 4, fontSize: 11, color: "var(--muted)", textAlign: "center" }}>
            {item.label}
          </div>
        </div>
      ))}
    </div>
  );
}

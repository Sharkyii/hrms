// Chart primitives using the app's accent color, with gridlines for scale context
// and hover states so magnitude and identity are both easy to read at a glance.

interface BarRowItem {
  label: string;
  value: number;
  displayValue?: string;
}

// One bar per category, each its own labeled row.
export function BarRows({ items }: { items: BarRowItem[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {items.map((item) => (
        <div key={item.label}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 5 }}>
            <span style={{ color: "var(--text-soft)" }}>{item.label}</span>
            <strong style={{ fontVariantNumeric: "tabular-nums" }}>{item.displayValue ?? item.value}</strong>
          </div>
          <div style={{ background: "var(--panel-2)", height: 8, borderRadius: 999, overflow: "hidden" }}>
            <div
              style={{
                background: "var(--fill)",
                height: 8,
                borderRadius: 999,
                width: `${(item.value / max) * 100}%`,
                transition: "width 0.3s ease",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// Compact inline progress meter for table cells / scorecards — a percentage with
// a colored track so magnitude reads before the number does.
export function ProgressBar({ pct, tone = "auto", width = 72 }: { pct: number; tone?: "auto" | "accent"; width?: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const color =
    tone === "accent" ? "var(--fill)" : clamped >= 75 ? "var(--success)" : clamped >= 40 ? "var(--warning)" : "var(--critical)";
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <div style={{ width, background: "var(--panel-2)", height: 6, borderRadius: 999, overflow: "hidden", flexShrink: 0 }}>
        <div style={{ background: color, height: 6, borderRadius: 999, width: `${clamped}%`, transition: "width 0.3s ease" }} />
      </div>
      <span style={{ fontSize: 12.5, fontWeight: 700, color, fontVariantNumeric: "tabular-nums", minWidth: 34 }}>{Math.round(clamped)}%</span>
    </div>
  );
}

interface ColumnItem {
  label: string;
  value: number;
}

// Small discrete-period column chart (e.g. cost per month) with gridlines for scale context.
export function ColumnChart({ items, formatValue }: { items: ColumnItem[]; formatValue?: (v: number) => string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const fmt = formatValue ?? ((v: number) => v.toLocaleString("en-IN"));
  const gridLines = [0, 0.25, 0.5, 0.75, 1];
  return (
    <div style={{ position: "relative", height: 160, paddingTop: 20 }}>
      <div style={{ position: "absolute", inset: "20px 0 24px 0" }}>
        {gridLines.map((g) => (
          <div
            key={g}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: `${g * 100}%`,
              borderTop: "1px dashed var(--border)",
            }}
          />
        ))}
      </div>
      <div style={{ position: "relative", display: "flex", alignItems: "flex-end", gap: 10, height: "100%" }}>
        {items.map((item) => (
          <div
            key={item.label}
            className="col-chart-bar"
            style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end" }}
          >
            <div style={{ fontSize: 11, marginBottom: 4, fontWeight: 700, color: "var(--fill-ink)", fontVariantNumeric: "tabular-nums" }}>
              {item.value > 0 ? fmt(item.value) : ""}
            </div>
            <div
              style={{
                width: "100%",
                maxWidth: 40,
                height: `calc(${Math.max(2, (item.value / max) * 100)}% - 24px)`,
                background: "var(--fill)",
                borderRadius: "4px 4px 0 0",
                transition: "opacity 0.15s ease",
              }}
            />
            <div style={{ borderTop: "1px solid var(--border-strong)", width: "100%", marginTop: 4, paddingTop: 4, fontSize: 11, color: "var(--muted)", textAlign: "center", fontWeight: 500 }}>
              {item.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

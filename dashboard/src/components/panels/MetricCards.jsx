import { memo, useMemo } from "react";

function TrendLine({ pct }) {
  if (pct == null || Number.isNaN(pct)) {
    return <div style={{ fontSize: 12, fontWeight: 500, marginTop: 6, color: "var(--text-tertiary)" }}>No comparison</div>;
  }
  const n = Number(pct);
  if (Math.abs(n) < 0.05) {
    return <div style={{ fontSize: 12, fontWeight: 500, marginTop: 6, color: "var(--text-tertiary)" }}>Flat vs last period</div>;
  }
  const improving = n < 0;
  const color = improving ? "var(--color-success)" : "var(--color-danger)";
  const arrow = improving ? "↓" : "↑";
  return (
    <div style={{ fontSize: 12, fontWeight: 500, marginTop: 6, color }}>
      {arrow} {Math.abs(n).toFixed(1)}% vs last period
    </div>
  );
}

function MetricCards({ summary }) {
  const yoy = summary?.yoy_change_pct;
  const cards = useMemo(
    () => [
      {
        label: "Total CO₂ (YTD)",
        value: summary?.total_co2_ytd_kg ?? 0,
        unit: "kg",
        trend: yoy,
        accent: "var(--green-500)",
      },
      {
        label: "Suppliers at risk",
        value: summary?.active_suppliers ?? 0,
        unit: "",
        trend: null,
        accent: "var(--risk-high)",
      },
      {
        label: "Avg intensity",
        value: summary?.avg_carbon_intensity ?? 0,
        unit: "kg/kg",
        trend: null,
        accent: "var(--teal-400)",
      },
      {
        label: "Month to date",
        value: summary?.total_co2_mtd_kg ?? 0,
        unit: "kg",
        trend: null,
        accent: "var(--color-warning)",
      },
    ],
    [summary, yoy],
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
      {cards.map((c) => (
        <div
          key={c.label}
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            borderLeft: `3px solid ${c.accent}`,
            borderRadius: "var(--radius-lg)",
            padding: "20px 24px",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: "var(--text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: 8,
            }}
          >
            {c.label}
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1 }}>
            {typeof c.value === "number" ? c.value.toFixed(1) : c.value}{" "}
            {c.unit ? (
              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-secondary)" }}>{c.unit}</span>
            ) : null}
          </div>
          {c.trend != null ? (
            <TrendLine pct={c.trend} />
          ) : (
            <div style={{ fontSize: 12, fontWeight: 500, marginTop: 6, color: "var(--text-tertiary)" }}>—</div>
          )}
        </div>
      ))}
    </div>
  );
}

export default memo(MetricCards);

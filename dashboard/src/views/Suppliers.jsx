import { useEffect, useMemo, useState } from "react";
import { useSuppliers } from "../hooks/useSuppliers.js";
import RiskBadge from "../components/shared/RiskBadge.jsx";

function flagEmoji(country) {
  const c = (country || "").trim();
  if (c.length === 2 && /^[A-Za-z]{2}$/.test(c)) {
    const A = 0x1f1e6;
    const pts = c.toUpperCase().split("").map((ch) => A + (ch.charCodeAt(0) - 65));
    return String.fromCodePoint(...pts);
  }
  return "🌍";
}

function tierBarColor(tier) {
  const t = (tier || "LOW").toUpperCase();
  if (t === "MEDIUM") return "var(--risk-medium)";
  if (t === "HIGH") return "var(--risk-high)";
  if (t === "CRITICAL") return "var(--risk-critical)";
  return "var(--risk-low)";
}

export default function Suppliers() {
  const [page, setPage] = useState(0);
  const [compareIds, setCompareIds] = useState([]);
  const [showBenchmarks, setShowBenchmarks] = useState(false);
  const [benchmarks, setBenchmarks] = useState([]);
  const { data, isLoading } = useSuppliers({ limit: 25, offset: page * 25, sort_by: "risk_score", order: "desc" });
  const maxE = useMemo(() => {
    const rows = data?.items || [];
    return Math.max(1, ...rows.map((s) => s.emissions_30d_kg || 0));
  }, [data?.items]);
  const items = data?.items || [];
  const total = data?.total ?? "—";
  const allSuppliers = data?.items || [];

  useEffect(() => {
    if (!showBenchmarks) return;
    fetch(`${import.meta.env.VITE_API_BASE_URL || ""}/api/v1/suppliers/benchmarks`)
      .then((r) => r.json())
      .then((d) => setBenchmarks(d?.benchmarks || []))
      .catch(() => setBenchmarks([]));
  }, [showBenchmarks]);

  const toggleCompare = (id) => {
    setCompareIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 2 ? [...prev, id] : [prev[1], id]));
  };

  return (
    <div
      style={{
        padding: "28px 24px 32px",
        minHeight: "100%",
        background: "color-mix(in srgb, var(--bg-base) 88%, #b8c5d8 12%)",
      }}
    >
      <div style={{ position: "relative", marginBottom: 20, minHeight: 72 }}>
        <div
          aria-hidden
          style={{
            float: "right",
            fontSize: 64,
            fontWeight: 800,
            lineHeight: 0.9,
            color: "var(--green-100)",
            fontFamily: "var(--font-display)",
            letterSpacing: "-0.03em",
            userSelect: "none",
          }}
        >
          {typeof total === "number" ? total : "—"}
        </div>
        <div
          style={{
            position: "relative",
            zIndex: 1,
            fontFamily: "var(--font-display)",
            fontSize: 24,
            fontWeight: 600,
            color: "var(--text-primary)",
            paddingTop: 8,
          }}
        >
          Suppliers
        </div>
        <div style={{ clear: "both" }} />
      </div>

      <div className="panel" style={{ overflow: "hidden", boxShadow: "var(--shadow-card)", border: "1px solid var(--border-default)" }}>
        <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border-subtle)", display: "flex", gap: 8 }}>
          <button type="button" onClick={() => setShowBenchmarks(false)} style={{ ...btn, background: !showBenchmarks ? "var(--bg-selected)" : "var(--bg-surface)" }}>
            Table
          </button>
          <button type="button" onClick={() => setShowBenchmarks(true)} style={{ ...btn, background: showBenchmarks ? "var(--bg-selected)" : "var(--bg-surface)" }}>
            Benchmarks
          </button>
        </div>
        {showBenchmarks ? (
          <div style={{ padding: 16 }}>
            {(benchmarks || []).slice(0, 30).map((b) => {
              const ratio = Number(b.intensity_ratio || 0);
              const pct = Math.min(100, Math.max(0, ratio * 50));
              const color = ratio >= 1.5 ? "var(--risk-critical)" : ratio > 1.1 ? "var(--risk-medium)" : "var(--green-500)";
              return (
                <div key={`${b.supplier_id}-${b.product_category}`} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                    <span>{b.supplier_name}</span>
                    <span style={{ color }}>{ratio.toFixed(2)}x industry avg</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 999, background: "var(--gray-200)", overflow: "hidden", marginTop: 4 }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: color }} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
        <div style={{ overflow: "auto" }}>
          <table className="cp-suppliers-table" style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-sans)", fontSize: 13 }}>
            <thead>
              <tr>
                <th
                  style={{
                    textAlign: "left",
                    padding: "12px 16px",
                    background: "var(--gray-800)",
                    color: "var(--gray-100)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    fontWeight: 600,
                  }}
                >
                  Supplier
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "12px 16px",
                    background: "var(--gray-800)",
                    color: "var(--gray-100)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    fontWeight: 600,
                  }}
                >
                  Country
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "12px 16px",
                    background: "var(--gray-800)",
                    color: "var(--gray-100)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    fontWeight: 600,
                  }}
                >
                  Risk
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "12px 16px",
                    background: "var(--gray-800)",
                    color: "var(--gray-100)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    fontWeight: 600,
                  }}
                >
                  30d emissions
                </th>
                <th
                  style={{
                    textAlign: "right",
                    padding: "12px 16px",
                    background: "var(--gray-800)",
                    color: "var(--gray-100)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    fontWeight: 600,
                  }}
                >
                  Risk score
                </th>
                <th
                  style={{
                    textAlign: "right",
                    padding: "12px 16px",
                    background: "var(--gray-800)",
                    color: "var(--gray-100)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    fontWeight: 600,
                  }}
                >
                  {" "}
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((s, idx) => {
                const pct = Math.min(100, Math.round(((s.emissions_30d_kg || 0) / maxE) * 100));
                const score = Number(s.risk_score ?? 0);
                const scorePct = Math.min(100, Math.max(0, score * 100));
                const rowBg = idx % 2 === 0 ? "var(--bg-surface)" : "var(--bg-subtle)";
                return (
                  <tr key={s.supplier_id} style={{ background: rowBg }}>
                    <td style={{ padding: "12px 16px", color: "var(--text-primary)", fontWeight: 500 }}>{s.name}</td>
                    <td
                      style={{
                        padding: "12px 16px",
                        color: "var(--text-primary)",
                        fontFamily: "var(--font-mono)",
                        fontSize: 12,
                      }}
                    >
                      <span aria-hidden>{flagEmoji(s.country)}</span> {(s.country || "").toUpperCase()}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <RiskBadge tier={s.risk_tier} />
                    </td>
                    <td style={{ padding: "12px 16px", minWidth: 200 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ flex: 1, height: 4, background: "var(--gray-200)", borderRadius: "var(--radius-full)", overflow: "hidden" }}>
                          <div style={{ width: `${pct}%`, height: "100%", background: tierBarColor(s.risk_tier), borderRadius: "var(--radius-full)" }} />
                        </div>
                        <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>{pct}%</span>
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10 }}>
                        <div style={{ flex: 1, maxWidth: 120, height: 6, background: "var(--gray-200)", borderRadius: "var(--radius-full)", overflow: "hidden" }}>
                          <div
                            style={{
                              width: `${scorePct}%`,
                              height: "100%",
                              background: tierBarColor(s.risk_tier),
                              borderRadius: "var(--radius-full)",
                            }}
                          />
                        </div>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-primary)", minWidth: 40, textAlign: "right" }}>
                          {score.toFixed(2)}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: 6 }}>
                        <button type="button" onClick={() => {}} style={miniBtn}>
                          Inspect
                        </button>
                        <button type="button" onClick={() => toggleCompare(s.supplier_id)} style={miniBtn}>
                          Compare
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        )}
        {isLoading ? <div style={{ padding: 16, color: "var(--text-tertiary)", fontSize: 13 }}>Loading…</div> : null}
        <div style={{ display: "flex", gap: 10, padding: "12px 16px", borderTop: "1px solid var(--border-subtle)", background: "var(--bg-surface)" }}>
          <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} style={btn}>
            Previous
          </button>
          <button type="button" onClick={() => setPage((p) => p + 1)} style={btn}>
            Next
          </button>
        </div>
      </div>

      {compareIds.length === 2 ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0", marginTop: "24px", border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", overflow: "hidden", background: "var(--bg-surface)" }}>
          {compareIds.map((id, idx) => {
            const sup = allSuppliers.find((s) => s.supplier_id === id);
            if (!sup) return null;
            return (
              <div key={id} style={{ padding: "24px", borderRight: idx === 0 ? "1px solid var(--border-default)" : "none" }}>
                <h3 style={{ margin: "0 0 16px", fontSize: "15px", fontWeight: "600" }}>{sup.name}</h3>
                {[
                  ["Country", sup.country],
                  ["Risk tier", sup.risk_tier],
                  ["Risk score", sup.risk_score?.toFixed(2)],
                  ["30d emissions", `${(sup.emissions_30d_kg || 0).toFixed(0)} kg`],
                  ["Trend", sup.emissions_trend],
                  ["Industry", sup.industry],
                  ["Tier", sup.tier],
                ].map(([label, value]) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border-subtle)", fontSize: "13px" }}>
                    <span style={{ color: "var(--text-tertiary)" }}>{label}</span>
                    <span style={{ color: "var(--text-primary)", fontWeight: "500" }}>{value || "—"}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

const btn = {
  fontFamily: "var(--font-sans)",
  fontSize: 12,
  fontWeight: 500,
  padding: "6px 12px",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-default)",
  background: "var(--bg-surface)",
  color: "var(--text-secondary)",
  cursor: "pointer",
};

const miniBtn = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-md)",
  padding: "5px 10px",
  fontSize: 12,
  fontWeight: 500,
  color: "var(--text-secondary)",
  cursor: "pointer",
  fontFamily: "var(--font-sans)",
};

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
  const [inspectedSupplier, setInspectedSupplier] = useState(null);
  const [showBenchmarks, setShowBenchmarks] = useState(false);
  const [benchmarks, setBenchmarks] = useState([]);
  const { data, isLoading } = useSuppliers({ limit: 25, offset: page * 25, sort_by: "risk_score", order: "desc" });
  const maxE = useMemo(() => {
    const rows = data?.items || [];
    return Math.max(1, ...rows.map((s) => s.emissions_30d_kg || 0));
  }, [data?.items]);
  const items = data?.items || [];
  const suppliers = items;
  const total = data?.total ?? "—";

  useEffect(() => {
    if (!showBenchmarks) return;
    fetch(`${import.meta.env.VITE_API_BASE_URL || ""}/api/v1/suppliers/benchmarks`)
      .then((r) => r.json())
      .then((d) => setBenchmarks(d?.benchmarks || []))
      .catch(() => setBenchmarks([]));
  }, [showBenchmarks]);

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
        <>
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
              {items.map((supplier, idx) => {
                const pct = Math.min(100, Math.round(((supplier.emissions_30d_kg || 0) / maxE) * 100));
                const score = Number(supplier.risk_score ?? 0);
                const scorePct = Math.min(100, Math.max(0, score * 100));
                const rowBg = idx % 2 === 0 ? "var(--bg-surface)" : "var(--bg-subtle)";
                const isCompared = compareIds.includes(supplier.supplier_id);
                return (
                  <tr key={supplier.supplier_id} style={{ background: rowBg }}>
                    <td style={{ padding: "12px 16px", color: "var(--text-primary)", fontWeight: 500 }}>{supplier.name}</td>
                    <td
                      style={{
                        padding: "12px 16px",
                        color: "var(--text-primary)",
                        fontFamily: "var(--font-mono)",
                        fontSize: 12,
                      }}
                    >
                      <span aria-hidden>{flagEmoji(supplier.country)}</span> {(supplier.country || "").toUpperCase()}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <RiskBadge tier={supplier.risk_tier} />
                    </td>
                    <td style={{ padding: "12px 16px", minWidth: 200 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ flex: 1, height: 4, background: "var(--gray-200)", borderRadius: "var(--radius-full)", overflow: "hidden" }}>
                          <div style={{ width: `${pct}%`, height: "100%", background: tierBarColor(supplier.risk_tier), borderRadius: "var(--radius-full)" }} />
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
                              background: tierBarColor(supplier.risk_tier),
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
                        <button type="button" onClick={() => setInspectedSupplier(supplier)} style={miniBtn}>
                          Inspect
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCompareIds((prev) => {
                              if (prev.includes(supplier.supplier_id)) {
                                // Deselect if already selected
                                return prev.filter((id) => id !== supplier.supplier_id);
                              }
                              if (prev.length >= 2) {
                                // Replace oldest selection with new one
                                return [prev[1], supplier.supplier_id];
                              }
                              return [...prev, supplier.supplier_id];
                            });
                          }}
                          style={{
                            padding: "5px 12px",
                            background: isCompared ? "var(--green-500)" : "var(--bg-surface)",
                            color: isCompared ? "white" : "var(--text-secondary)",
                            border: "1px solid var(--border-default)",
                            borderRadius: "var(--radius-md)",
                            fontSize: "12px",
                            cursor: "pointer",
                            fontFamily: "var(--font-sans)",
                            transition: "all 0.15s",
                          }}
                        >
                          {isCompared ? "✓ Selected" : "Compare"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {compareIds.length === 2 &&
          (() => {
            const s1 = suppliers.find((s) => s.supplier_id === compareIds[0]);
            const s2 = suppliers.find((s) => s.supplier_id === compareIds[1]);
            if (!s1 || !s2)
              return (
                <div
                  style={{
                    marginTop: "16px",
                    padding: "16px",
                    background: "var(--risk-high-bg)",
                    border: "1px solid var(--risk-high-border)",
                    borderRadius: "var(--radius-md)",
                    fontSize: "13px",
                    color: "var(--risk-high-text)",
                  }}
                >
                  Could not find supplier data for comparison. The suppliers list may still be loading.
                </div>
              );

            const fields = [
              ["Supplier", (s) => s.name || s.supplier_id],
              ["Country", (s) => s.country],
              ["Industry", (s) => s.industry || "—"],
              ["Risk Tier", (s) => s.risk_tier || "—"],
              ["Risk Score", (s) => s.risk_score?.toFixed(3) ?? "—"],
              ["30d Emissions", (s) => `${(s.emissions_30d_kg || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} kg CO₂e`],
              ["90d Emissions", (s) => `${(s.emissions_90d_kg || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} kg CO₂e`],
              ["Trend", (s) => s.emissions_trend || "—"],
              ["Tier", (s) => (s.tier ? `Tier ${s.tier}` : "—")],
            ];

            return (
              <div
                style={{
                  marginTop: "24px",
                  border: "1px solid var(--border-default)",
                  borderRadius: "var(--radius-lg)",
                  overflow: "hidden",
                  background: "var(--bg-surface)",
                  boxShadow: "var(--shadow-card)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "14px 20px",
                    background: "var(--bg-subtle)",
                    borderBottom: "1px solid var(--border-default)",
                  }}
                >
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: "600",
                      color: "var(--text-primary)",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    Comparing {s1.name || s1.supplier_id} vs {s2.name || s2.supplier_id}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCompareIds([])}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--text-tertiary)",
                      cursor: "pointer",
                      fontSize: "13px",
                      fontFamily: "var(--font-sans)",
                    }}
                  >
                    ✕ Clear comparison
                  </button>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "180px 1fr 1fr",
                  }}
                >
                  <div
                    style={{
                      borderRight: "1px solid var(--border-subtle)",
                      background: "var(--bg-subtle)",
                    }}
                  >
                    <div
                      style={{
                        padding: "12px 16px",
                        fontSize: "11px",
                        fontWeight: "700",
                        color: "var(--text-tertiary)",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        borderBottom: "1px solid var(--border-default)",
                        height: "44px",
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      Field
                    </div>
                    {fields.map(([label]) => (
                      <div
                        key={label}
                        style={{
                          padding: "12px 16px",
                          fontSize: "11px",
                          fontWeight: "600",
                          color: "var(--text-tertiary)",
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                          borderBottom: "1px solid var(--border-subtle)",
                        }}
                      >
                        {label}
                      </div>
                    ))}
                  </div>

                  {[s1, s2].map((sup, idx) => (
                    <div
                      key={sup.supplier_id}
                      style={{
                        borderRight: idx === 0 ? "1px solid var(--border-subtle)" : "none",
                      }}
                    >
                      <div
                        style={{
                          padding: "12px 16px",
                          fontSize: "13px",
                          fontWeight: "700",
                          color: "var(--text-primary)",
                          borderBottom: "1px solid var(--border-default)",
                          height: "44px",
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                        }}
                      >
                        <span>{sup.name || sup.supplier_id}</span>
                        {sup.risk_tier && (
                          <span
                            style={{
                              fontSize: "10px",
                              fontWeight: "600",
                              padding: "2px 7px",
                              borderRadius: "var(--radius-full)",
                              background:
                                sup.risk_tier === "CRITICAL"
                                  ? "var(--risk-critical-bg)"
                                  : sup.risk_tier === "HIGH"
                                  ? "var(--risk-high-bg)"
                                  : sup.risk_tier === "MEDIUM"
                                  ? "var(--risk-medium-bg)"
                                  : "var(--risk-low-bg)",
                              color:
                                sup.risk_tier === "CRITICAL"
                                  ? "var(--risk-critical-text)"
                                  : sup.risk_tier === "HIGH"
                                  ? "var(--risk-high-text)"
                                  : sup.risk_tier === "MEDIUM"
                                  ? "var(--risk-medium-text)"
                                  : "var(--risk-low-text)",
                            }}
                          >
                            {sup.risk_tier}
                          </span>
                        )}
                      </div>

                      {fields.map(([label, getter]) => {
                        const val = getter(sup);
                        const otherVal = getter(idx === 0 ? s2 : s1);
                        const isEmissionsRow = label.includes("Emissions");
                        const thisNum = parseFloat(String(val).replace(/[^0-9.]/g, ""));
                        const otherNum = parseFloat(String(otherVal).replace(/[^0-9.]/g, ""));
                        const isWorse = isEmissionsRow && !Number.isNaN(thisNum) && !Number.isNaN(otherNum) && thisNum > otherNum;
                        const isBetter = isEmissionsRow && !Number.isNaN(thisNum) && !Number.isNaN(otherNum) && thisNum < otherNum;

                        return (
                          <div
                            key={label}
                            style={{
                              padding: "12px 16px",
                              fontSize: "13px",
                              color: isWorse ? "var(--risk-high-text)" : isBetter ? "var(--risk-low-text)" : "var(--text-primary)",
                              fontWeight: label === "Supplier" ? "600" : "400",
                              fontFamily: label.includes("Score") || label.includes("Emissions") ? "var(--font-mono)" : "var(--font-sans)",
                              borderBottom: "1px solid var(--border-subtle)",
                              background: isWorse ? "var(--risk-high-bg)" : isBetter ? "var(--risk-low-bg)" : "transparent",
                            }}
                          >
                            {val}
                            {isWorse && <span style={{ marginLeft: "6px", fontSize: "11px" }}>↑</span>}
                            {isBetter && <span style={{ marginLeft: "6px", fontSize: "11px" }}>↓</span>}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>

                <div
                  style={{
                    padding: "10px 20px",
                    borderTop: "1px solid var(--border-subtle)",
                    fontSize: "11px",
                    color: "var(--text-tertiary)",
                    background: "var(--bg-subtle)",
                  }}
                >
                  Red values indicate higher emissions. Green values indicate lower emissions. Click Compare on another supplier to swap the oldest
                  selection.
                </div>
              </div>
            );
          })()}
        </>
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

      {inspectedSupplier && (
        <div
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            width: "380px",
            height: "100vh",
            background: "var(--bg-surface)",
            borderLeft: "1px solid var(--border-default)",
            boxShadow: "var(--shadow-lg)",
            zIndex: 100,
            overflowY: "auto",
            padding: "24px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: "20px",
            }}
          >
            <div>
              <h2
                style={{
                  fontSize: "18px",
                  fontWeight: "700",
                  color: "var(--text-primary)",
                  fontFamily: "var(--font-display)",
                  margin: "0 0 4px",
                }}
              >
                {inspectedSupplier.name}
              </h2>
              <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                {inspectedSupplier.country} · Tier {inspectedSupplier.tier}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setInspectedSupplier(null)}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-tertiary)",
                cursor: "pointer",
                fontSize: "18px",
                padding: "4px",
              }}
            >
              ✕
            </button>
          </div>

          <div style={{ padding: "2px 0", borderTop: "1px solid var(--border-subtle)" }}>
            {[
              ["Industry", inspectedSupplier.industry],
              ["Risk Tier", inspectedSupplier.risk_tier],
              ["Risk Score", inspectedSupplier.risk_score != null ? inspectedSupplier.risk_score.toFixed(3) : null],
              [
                "30d Emissions",
                `${(inspectedSupplier.emissions_30d_kg || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} kg CO₂e`,
              ],
              [
                "90d Emissions",
                `${(inspectedSupplier.emissions_90d_kg || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} kg CO₂e`,
              ],
              ["Emissions Trend", inspectedSupplier.emissions_trend],
              ["Country", inspectedSupplier.country],
              ["Supplier ID", inspectedSupplier.supplier_id],
            ].map(([label, value]) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "12px 0",
                  borderBottom: "1px solid var(--border-subtle)",
                  fontSize: "13px",
                }}
              >
                <span style={{ color: "var(--text-tertiary)" }}>{label}</span>
                <span
                  style={{
                    color: "var(--text-primary)",
                    fontWeight: "500",
                    fontFamily: typeof value === "number" ? "var(--font-mono)" : "var(--font-sans)",
                  }}
                >
                  {value || "—"}
                </span>
              </div>
            ))}
          </div>

          {["HIGH", "CRITICAL"].includes((inspectedSupplier.risk_tier || "").toUpperCase()) ? (
            <div
              style={{
                marginTop: "20px",
                padding: "14px 16px",
                background: "var(--green-50)",
                border: "1px solid var(--green-200)",
                borderRadius: "var(--radius-md)",
                borderLeft: "3px solid var(--green-500)",
              }}
            >
              <p
                style={{
                  fontSize: "12px",
                  fontWeight: "600",
                  color: "var(--green-700)",
                  margin: "0 0 4px",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Recommended Action
              </p>
              <p style={{ fontSize: "13px", color: "var(--green-800)", margin: 0, lineHeight: "1.5" }}>
                Consider switching this supplier to ocean freight where possible — air to ocean switches typically reduce emissions by up to 95%.
              </p>
            </div>
          ) : null}
        </div>
      )}
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

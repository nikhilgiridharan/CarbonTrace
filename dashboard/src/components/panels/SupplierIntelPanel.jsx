import { memo, useCallback, useMemo, useState } from "react";
import RiskBadge from "../shared/RiskBadge.jsx";
import { formatKg } from "../../utils/formatters.js";

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

export default function SupplierIntelPanel({ suppliers, selectedId, onSelect }) {
  const [q, setQ] = useState("");
  const [sortBy, setSortBy] = useState("risk");

  const filtered = useMemo(() => {
    const list = suppliers || [];
    const qf = q ? list.filter((s) => `${s.name} ${s.country} ${s.supplier_id}`.toLowerCase().includes(q.toLowerCase())) : list;
    const tierRank = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
    const sorted = [...qf];
    if (sortBy === "risk") {
      sorted.sort((a, b) => (tierRank[(b.risk_tier || "LOW").toUpperCase()] ?? 0) - (tierRank[(a.risk_tier || "LOW").toUpperCase()] ?? 0));
    } else if (sortBy === "emissions") {
      sorted.sort((a, b) => (b.emissions_30d_kg || 0) - (a.emissions_30d_kg || 0));
    } else {
      sorted.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    }
    return sorted;
  }, [suppliers, q, sortBy]);

  const maxE = useMemo(() => Math.max(1, ...filtered.map((s) => s.emissions_30d_kg || 0)), [filtered]);

  const handleSearchChange = useCallback((e) => setQ(e.target.value), []);
  const handleSelect = useCallback((id) => onSelect?.(id), [onSelect]);

  const tab = (id, label) => (
    <button
      key={id}
      type="button"
      onClick={() => setSortBy(id)}
      style={{
        border: "none",
        background: sortBy === id ? "var(--green-100)" : "transparent",
        color: sortBy === id ? "var(--green-600)" : "var(--text-tertiary)",
        fontSize: 11,
        fontWeight: 500,
        padding: "3px 8px",
        borderRadius: "var(--radius-full)",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      style={{
        padding: 0,
        height: "100%",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        borderRadius: "var(--radius-lg)",
        background: "var(--bg-surface)",
        borderRight: "1px solid var(--border-default)",
        boxShadow: "none",
      }}
    >
      <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid var(--border-subtle)" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--text-primary)",
            fontFamily: "var(--font-display)",
            marginBottom: 12,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              background: "var(--green-500)",
              display: "inline-block",
              flexShrink: 0,
            }}
          />
          Supplier intelligence
        </div>
        <div style={{ position: "relative" }}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
            style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)" }}
          >
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.5" />
            <path d="M16 16l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            value={q}
            onChange={handleSearchChange}
            placeholder="Search suppliers…"
            style={{
              width: "100%",
              padding: "7px 12px 7px 34px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-default)",
              background: "var(--bg-subtle)",
              color: "var(--text-primary)",
              outline: "none",
              fontFamily: "var(--font-sans)",
              fontSize: 13,
            }}
          />
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          {tab("risk", "Risk")}
          {tab("emissions", "Emissions")}
          {tab("name", "A–Z")}
        </div>
      </div>
      <div style={{ marginTop: 4, overflow: "auto", flex: 1, paddingBottom: 8 }}>
        {filtered.slice(0, 200).map((s) => {
          const pct = Math.min(100, Math.round(((s.emissions_30d_kg || 0) / maxE) * 100));
          const active = selectedId === s.supplier_id;
          return (
            <SupplierCard
              key={s.supplier_id}
              supplier={s}
              pct={pct}
              active={active}
              onSelect={handleSelect}
            />
          );
        })}
      </div>
    </div>
  );
}

const SupplierCard = memo(function SupplierCard({ supplier, pct, active, onSelect }) {
  const handleClick = useCallback(() => onSelect?.(supplier.supplier_id), [onSelect, supplier.supplier_id]);
  return (
    <button
      type="button"
      className={`cp-supplier-card${active ? " cp-supplier-card--active" : ""}`}
      onClick={handleClick}
      style={{
        width: "calc(100% - 16px)",
        margin: "2px 8px",
        textAlign: "left",
        padding: "10px 12px",
        borderRadius: "var(--radius-md)",
        border: `1px solid ${active ? "var(--border-default)" : "transparent"}`,
        background: active ? "var(--bg-selected)" : "transparent",
        color: "var(--text-primary)",
        cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", lineHeight: 1.3 }}>
          {(supplier.name || "").slice(0, 34)}
        </div>
        <RiskBadge tier={supplier.risk_tier} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          <span aria-hidden>{flagEmoji(supplier.country)}</span> {supplier.country}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{(supplier.risk_tier || "LOW").toUpperCase()}</div>
      </div>
      <div
        style={{
          marginTop: 8,
          height: 3,
          borderRadius: "var(--radius-full)",
          background: "var(--gray-200)",
          overflow: "hidden",
        }}
      >
        <div style={{ width: `${pct}%`, height: "100%", background: tierBarColor(supplier.risk_tier), borderRadius: "var(--radius-full)" }} />
      </div>
      <div style={{ marginTop: 6, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)" }}>
        30d: {formatKg(supplier.emissions_30d_kg || 0)} CO₂e
      </div>
    </button>
  );
});

import { useCallback, useEffect, useMemo, useState } from "react";
import DataFreshBadge from "../shared/DataFreshBadge.jsx";
import { formatKg } from "../../utils/formatters.js";
import { apiBaseUrl } from "../../utils/constants.js";
import { cachedFetch } from "../../utils/apiCache.js";

export default function Topbar({ title, summary, pipelineMessage }) {
  const [anomalyCount, setAnomalyCount] = useState(0);
  const [syncStatus, setSyncStatus] = useState("syncing");
  const [lastSync, setLastSync] = useState(null);

  const fetchSummary = useCallback(async () => {
    try {
      await cachedFetch(`${apiBaseUrl()}/emissions/summary`, 5_000);
      setSyncStatus("fresh");
      setLastSync(new Date());
    } catch (err) {
      setSyncStatus("stale");
      console.error(err);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const data = await cachedFetch(`${apiBaseUrl()}/pipeline/alerts?severity=HIGH&limit=100`, 10_000);
        const count = Array.isArray(data) ? data.length : data?.alerts?.length ?? data?.total ?? 0;
        setAnomalyCount(Number(count) || 0);
      } catch {
        setAnomalyCount(0);
      }
    })();
  }, []);

  useEffect(() => {
    if (summary) {
      setSyncStatus("fresh");
      setLastSync(new Date());
    }
  }, [summary]);

  useEffect(() => {
    fetchSummary();
    const interval = setInterval(() => {
      setSyncStatus("syncing");
      fetchSummary();
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchSummary]);

  const ticker = useMemo(() => {
    const ytd = summary?.total_co2_ytd_kg ?? 0;
    const sup = summary?.active_suppliers ?? 0;
    const ship = summary?.total_shipments ?? 0;
    return [
      { k: "Total CO₂ YTD", v: formatKg(ytd) },
      { k: "Suppliers", v: String(sup) },
      { k: "Shipments", v: String(ship) },
      { k: "Anomalies", v: String(anomalyCount), danger: anomalyCount > 0 },
    ];
  }, [summary, anomalyCount]);

  return (
    <header
      style={{
        height: 52,
        display: "flex",
        alignItems: "center",
        padding: "0 24px",
        gap: 24,
        background: "var(--bg-surface)",
        borderBottom: "1px solid var(--border-default)",
        boxShadow: "var(--shadow-xs)",
      }}
    >
      <div
        style={{
          flex: "0 0 auto",
          fontFamily: "var(--font-display)",
          fontSize: 16,
          fontWeight: 600,
          color: "var(--text-primary)",
        }}
      >
        {title}
      </div>
      <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center" }}>
        {ticker.map((t, i) => (
          <div key={t.k} style={{ display: "flex", alignItems: "center" }}>
            {i > 0 ? (
              <div
                style={{
                  width: 1,
                  height: 16,
                  background: "var(--border-subtle)",
                  margin: "0 16px",
                }}
              />
            ) : null}
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-tertiary)",
                  fontWeight: 500,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                {t.k}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 13,
                  fontWeight: 600,
                  color: t.danger ? "var(--color-danger)" : "var(--text-primary)",
                  marginTop: 2,
                }}
              >
                {t.v}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
        <DataFreshBadge pipelineMessage={pipelineMessage} syncStatus={syncStatus} lastSync={lastSync} />
        <span style={{ fontSize: 12, color: "var(--text-tertiary)", marginLeft: 12 }}>
          {new Date().toLocaleTimeString()}
        </span>
      </div>
    </header>
  );
}

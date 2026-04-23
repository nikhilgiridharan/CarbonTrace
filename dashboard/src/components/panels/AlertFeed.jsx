import { useCallback, useEffect, useMemo, useState } from "react";
import { relTime } from "../../utils/formatters.js";
import axios from "axios";
import { apiBaseUrl } from "../../utils/constants.js";
import { cachedFetch, invalidateCache } from "../../utils/apiCache.js";

const client = axios.create({ baseURL: apiBaseUrl() });

function severityBorder(sev) {
  const s = (sev || "LOW").toUpperCase();
  if (s === "MEDIUM") return "var(--risk-medium)";
  if (s === "HIGH") return "var(--risk-high)";
  if (s === "CRITICAL") return "var(--risk-critical)";
  return "var(--risk-low)";
}

function severityPillStyle(sev) {
  const s = (sev || "LOW").toUpperCase();
  if (s === "MEDIUM") {
    return {
      background: "var(--risk-medium-bg)",
      color: "var(--risk-medium-text)",
      borderColor: "var(--risk-medium-border)",
    };
  }
  if (s === "HIGH") {
    return {
      background: "var(--risk-high-bg)",
      color: "var(--risk-high-text)",
      borderColor: "var(--risk-high-border)",
    };
  }
  if (s === "CRITICAL") {
    return {
      background: "var(--risk-critical-bg)",
      color: "var(--risk-critical-text)",
      borderColor: "var(--risk-critical-border)",
    };
  }
  return {
    background: "var(--risk-low-bg)",
    color: "var(--risk-low-text)",
    borderColor: "var(--risk-low-border)",
  };
}

export default function AlertFeed({ liveAlerts }) {
  const [acked, setAcked] = useState(() => new Set());
  const [items, setItems] = useState([]);

  useEffect(() => {
    cachedFetch(`${apiBaseUrl()}/pipeline/alerts?limit=30`, 10_000)
      .then((data) => setItems(data))
      .catch(() => {
        /* ignore failed request */
      });
    return undefined;
  }, []);

  useEffect(() => {
    if (liveAlerts?.type === "alert") {
      setItems((prev) => [liveAlerts.data, ...prev].slice(0, 50));
    }
  }, [liveAlerts]);

  const activeCount = useMemo(
    () => items.filter((a) => !acked.has(a.alert_id) && !a.acknowledged).length,
    [items, acked],
  );

  const acknowledge = useCallback(async (id) => {
    await client.post(`/pipeline/alerts/${id}/acknowledge`);
    setAcked((s) => new Set(s).add(id));
    invalidateCache("/pipeline/alerts");
  }, []);

  return (
    <div
      style={{
        padding: 0,
        height: "100%",
        overflow: "auto",
        background: "var(--bg-surface)",
        borderLeft: "1px solid var(--border-default)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "none",
      }}
    >
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--border-subtle)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
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
          Live anomalies
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            minWidth: 22,
            height: 22,
            padding: "0 8px",
            borderRadius: "var(--radius-full)",
            background: "var(--color-danger-bg)",
            color: "var(--color-danger)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {activeCount}
        </span>
      </div>
      {items.length === 0 ? (
        <div style={{ textAlign: "center", padding: "32px 20px", color: "var(--text-tertiary)" }}>
          <div style={{ fontSize: 22, marginBottom: 8, color: "var(--green-200)" }} aria-hidden>
            🌿
          </div>
          <div style={{ fontSize: 13 }}>No active anomalies</div>
        </div>
      ) : (
        items.map((a) => {
          const done = acked.has(a.alert_id) || a.acknowledged;
          const sev = a.severity;
          const pill = severityPillStyle(sev);
          const crit = (sev || "").toUpperCase() === "CRITICAL";
          return (
            <div
              key={a.alert_id}
              style={{
                padding: "10px 14px",
                borderBottom: "1px solid var(--border-subtle)",
                background: done ? "var(--bg-subtle)" : crit ? "var(--risk-critical-bg)" : "var(--bg-surface)",
                opacity: done ? 0.5 : 1,
                borderLeft: `3px solid ${done ? "var(--gray-300)" : severityBorder(sev)}`,
              }}
            >
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    padding: "2px 6px",
                    borderRadius: "var(--radius-full)",
                    border: "1px solid",
                    ...pill,
                  }}
                >
                  {a.alert_type}
                </span>
                <div style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)" }}>
                  {relTime(a.created_at)}
                </div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", marginTop: 8 }}>
                {a.supplier_id || "Portfolio"}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.4, marginTop: 4 }}>{a.message}</div>
              <button
                type="button"
                onClick={() => acknowledge(a.alert_id)}
                style={{
                  marginTop: 10,
                  fontFamily: "var(--font-sans)",
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--text-link)",
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                Acknowledge
              </button>
            </div>
          );
        })
      )}
    </div>
  );
}

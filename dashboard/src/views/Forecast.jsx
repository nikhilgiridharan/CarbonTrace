import { useEffect, useState } from "react";
import axios from "axios";
import ForecastChart from "../components/charts/ForecastChart.jsx";
import { apiBaseUrl } from "../utils/constants.js";

const client = axios.create({ baseURL: apiBaseUrl() });

export default function Forecast() {
  const [supplier, setSupplier] = useState("SUP-00001");
  const [fc, setFc] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    client
      .get(`/forecasts/supplier/${encodeURIComponent(supplier)}`, {
        params: { horizon: 30 },
        signal: controller.signal,
      })
      .then((r) => setFc(r.data))
      .catch(() => {
        /* ignore cancelled/failed request */
      });
    return () => controller.abort();
  }, [supplier]);

  const hist = (fc?.forecast || []).slice(0, 10).map((p) => ({
    date: p.date,
    emissions_kg: p.predicted_kg * 0.95,
    predicted_kg: null,
    lower_bound: null,
    upper_bound: null,
  }));
  const fut = (fc?.forecast || []).map((p) => ({
    date: p.date,
    emissions_kg: null,
    predicted_kg: p.predicted_kg,
    lower_bound: p.lower_bound,
    upper_bound: p.upper_bound,
  }));

  return (
    <div
      style={{
        minHeight: "100%",
        padding: "32px 28px 40px",
        backgroundColor: "var(--bg-surface)",
        backgroundImage: `
          linear-gradient(90deg, color-mix(in srgb, var(--color-warning) 12%, transparent) 1px, transparent 1px),
          linear-gradient(color-mix(in srgb, var(--gray-300) 35%, transparent) 1px, transparent 1px)
        `,
        backgroundSize: "28px 100%, 100% 28px",
        backgroundPosition: "0 0, 0 0",
      }}
    >
      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        <p
          style={{
            fontFamily: "var(--font-reading)",
            fontSize: 14,
            fontStyle: "italic",
            color: "var(--text-tertiary)",
            margin: "0 0 8px",
            borderBottom: "1px solid var(--border-subtle)",
            paddingBottom: 8,
            display: "inline-block",
          }}
        >
          Analyst notebook · 30-day horizon
        </p>
        <h1
          style={{
            fontFamily: "var(--font-reading)",
            fontSize: 32,
            fontWeight: 600,
            color: "var(--text-primary)",
            margin: "0 0 20px",
            lineHeight: 1.15,
          }}
        >
          Emissions forecast
        </h1>
        <label
          htmlFor="forecast-supplier"
          style={{
            display: "block",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--text-tertiary)",
            marginBottom: 6,
          }}
        >
          Supplier ID
        </label>
        <input
          id="forecast-supplier"
          value={supplier}
          onChange={(e) => setSupplier(e.target.value)}
          style={{
            width: "min(100%, 360px)",
            padding: "10px 14px",
            marginBottom: 24,
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-strong)",
            borderLeft: "4px solid var(--color-warning)",
            background: "rgba(255,255,255,0.92)",
            color: "var(--text-primary)",
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8)",
          }}
        />
        <div
          className="panel"
          style={{
            padding: "24px 20px 20px",
            border: "1px solid var(--border-default)",
            borderTop: "3px double color-mix(in srgb, var(--color-warning) 55%, var(--border-default))",
            background: "rgba(255,255,255,0.88)",
            boxShadow: "var(--shadow-md)",
          }}
        >
          <ForecastChart history={hist} forecast={fut} />
        </div>
      </div>
    </div>
  );
}

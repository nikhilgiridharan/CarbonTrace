import { useCallback, useMemo, useState } from "react";
import GlobalEmissionsMap from "../components/map/GlobalEmissionsMap.jsx";
import SupplierIntelPanel from "../components/panels/SupplierIntelPanel.jsx";
import AlertFeed from "../components/panels/AlertFeed.jsx";
import MetricCards from "../components/panels/MetricCards.jsx";
import { useEmissionsSummary, useMapData } from "../hooks/useEmissionsData.js";

export default function Dashboard({ liveAlerts }) {
  const { data: summary } = useEmissionsSummary();
  const { data: mapData } = useMapData();
  const [selected, setSelected] = useState(null);
  const handleSelectSupplier = useCallback((id) => setSelected(id), []);
  const API = import.meta.env.VITE_API_BASE_URL || "";

  const suppliers = useMemo(() => mapData || [], [mapData]);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "280px 1fr 320px",
        gridTemplateRows: "auto 1fr",
        height: "calc(100vh - 52px - 22px)",
        gap: 16,
        padding: 16,
        background: "var(--bg-base)",
      }}
    >
      <div style={{ gridColumn: "1 / 2", gridRow: "1 / 3", minHeight: 0 }}>
        <SupplierIntelPanel suppliers={suppliers} selectedId={selected} onSelect={handleSelectSupplier} />
      </div>
      <div style={{ gridColumn: "2 / 3", gridRow: "1 / 2" }}>
        <div style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "center", justifyContent: "flex-end" }}>
          <a
            href={`${API}/api/v1/report/generate`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 16px",
              background: "var(--green-500)",
              color: "white",
              borderRadius: "var(--radius-md)",
              fontSize: "12px",
              fontWeight: "500",
              textDecoration: "none",
            }}
          >
            Download ESG Report (PDF)
          </a>
        </div>
        <MetricCards summary={summary} />
      </div>
      <div
        className="panel cp-dashboard-map-shell"
        style={{
          gridColumn: "2 / 3",
          gridRow: "2 / 3",
          overflow: "hidden",
          padding: 0,
          minHeight: 0,
          backgroundColor: "var(--bg-surface)",
          backgroundImage: "radial-gradient(circle, var(--gray-200) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
      >
        <GlobalEmissionsMap suppliers={suppliers} selectedId={selected} onSelect={handleSelectSupplier} />
      </div>
      <div style={{ gridColumn: "3 / 4", gridRow: "1 / 3", minHeight: 0 }}>
        <AlertFeed liveAlerts={liveAlerts} />
      </div>
    </div>
  );
}

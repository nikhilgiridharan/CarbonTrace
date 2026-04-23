import { useCallback, useEffect, useMemo, useState } from "react";
import Map, { Layer, Source } from "react-map-gl";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import RiskBadge from "../shared/RiskBadge.jsx";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

function riskColor(tier) {
  const t = (tier || "LOW").toUpperCase();
  if (t === "MEDIUM") return "#D97706";
  if (t === "HIGH") return "#C2410C";
  if (t === "CRITICAL") return "#B91C1C";
  return "#3D8C21";
}

function sizeForEmissions(kg) {
  const v = Math.max(0, Math.log10((kg || 1) + 1));
  return Math.min(24, Math.max(6, v * 6));
}

export default function GlobalEmissionsMap({ suppliers, selectedId, onSelect }) {
  const [viewState, setViewState] = useState({
    longitude: 10,
    latitude: 25,
    zoom: 1.6,
    pitch: 0,
  });
  const [mode, setMode] = useState("globe");
  const [countryStats, setCountryStats] = useState([]);
  const [hoverCountry, setHoverCountry] = useState(null);

  useEffect(() => {
    if (mode !== "heatmap") return;
    fetch(`${import.meta.env.VITE_API_BASE_URL || ""}/api/v1/emissions/by-country-detailed`)
      .then((r) => r.json())
      .then((d) => setCountryStats(d?.countries || []))
      .catch(() => setCountryStats([]));
  }, [mode]);

  const geojson = useMemo(() => {
    return {
      type: "FeatureCollection",
      features: (suppliers || []).map((s) => ({
        type: "Feature",
        properties: {
          id: s.supplier_id,
          name: s.name,
          country: s.country,
          risk: s.risk_tier,
          emissions: s.emissions_30d_kg,
          r: sizeForEmissions(s.emissions_30d_kg),
          color: riskColor(s.risk_tier),
        },
        geometry: { type: "Point", coordinates: [s.lng, s.lat] },
      })),
    };
  }, [suppliers]);

  const selected = useMemo(() => (suppliers || []).find((s) => s.supplier_id === selectedId), [suppliers, selectedId]);

  const onClick = useCallback(
    (e) => {
      if (mode === "heatmap") return;
      const f = e.features?.[0];
      if (f?.properties?.id) onSelect?.(f.properties.id);
    },
    [onSelect, mode],
  );
  const onMove = useCallback((evt) => setViewState(evt.viewState), []);
  const resetView = useCallback(() => {
    setViewState((vs) => ({ ...vs, longitude: 10, latitude: 25, zoom: 1.6 }));
  }, []);
  const countryLookup = useMemo(() => {
    const m = {};
    for (const c of countryStats) m[c.country] = c;
    return m;
  }, [countryStats]);
  const countryEmissionExpr = useMemo(() => {
    const expr = ["match", ["get", "iso_3166_1_alpha_2"]];
    for (const c of countryStats) {
      expr.push(c.country, Number(c.total_emissions_kg || 0));
    }
    expr.push(0);
    return expr;
  }, [countryStats]);
  const onMapMove = useCallback(
    (evt) => {
      setViewState(evt.viewState);
      if (mode !== "heatmap") return;
      const f = evt.target.queryRenderedFeatures(evt.point, { layers: ["countries-fill"] })?.[0];
      if (!f) {
        setHoverCountry(null);
        return;
      }
      const iso = f.properties?.iso_3166_1_alpha_2;
      const stats = countryLookup[iso];
      if (stats) setHoverCountry({ iso, ...stats });
      else setHoverCountry(null);
    },
    [mode, countryLookup],
  );

  if (!MAPBOX_TOKEN) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          gap: "8px",
          color: "#6B7566",
          fontSize: "13px",
        }}
      >
        <span>Map unavailable — VITE_MAPBOX_TOKEN not set</span>
      </div>
    );
  }

  mapboxgl.accessToken = MAPBOX_TOKEN;

  return (
    <div style={{ height: "100%", position: "relative" }}>
      <Map
        mapboxAccessToken={MAPBOX_TOKEN}
        {...viewState}
        onMove={onMapMove}
        style={{ width: "100%", height: "100%" }}
        mapStyle="mapbox://styles/mapbox/light-v11"
        interactiveLayerIds={mode === "heatmap" ? ["countries-fill"] : ["suppliers-circle"]}
        onClick={onClick}
        renderWorldCopies={false}
        maxTileCacheSize={50}
        trackResize={false}
      >
        {mode === "globe" ? (
          <Source id="suppliers" type="geojson" data={geojson}>
            <Layer
              id="suppliers-circle"
              type="circle"
              paint={{
                "circle-radius": ["get", "r"],
                "circle-color": ["get", "color"],
                "circle-opacity": 0.85,
                "circle-stroke-width": 1.5,
                "circle-stroke-color": "#FFFFFF",
              }}
            />
          </Source>
        ) : (
          <Source id="countries" type="vector" url="mapbox://mapbox.country-boundaries-v1">
            <Layer
              id="countries-fill"
              type="fill"
              source-layer="country_boundaries"
              paint={{
                "fill-color": [
                  "interpolate",
                  ["linear"],
                  countryEmissionExpr,
                  0,
                  "#dcf0d1",
                  10000,
                  "#fbbf24",
                  50000,
                  "#f97316",
                  100000,
                  "#b91c1c",
                ],
                "fill-opacity": 0.55,
              }}
            />
          </Source>
        )}
      </Map>
      {mode === "globe" && selected ? (
        <div
          style={{
            position: "absolute",
            left: 16,
            bottom: 16,
            maxWidth: 280,
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-md)",
            padding: "10px 14px",
            fontFamily: "var(--font-sans)",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{selected.name}</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>{selected.country}</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
            {(selected.emissions_30d_kg || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} kg CO₂e (30d)
          </div>
          <div style={{ marginTop: 8 }}>
            <RiskBadge tier={selected.risk_tier} />
          </div>
        </div>
      ) : null}
      {mode === "heatmap" && hoverCountry ? (
        <div
          style={{
            position: "absolute",
            left: 16,
            bottom: 16,
            maxWidth: 280,
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-md)",
            padding: "10px 14px",
            fontFamily: "var(--font-sans)",
            fontSize: 12,
          }}
        >
          <div style={{ fontWeight: 600 }}>{hoverCountry.iso}</div>
          <div style={{ marginTop: 4 }}>Emissions: {(hoverCountry.total_emissions_kg || 0).toLocaleString()} kg</div>
          <div>Suppliers: {(hoverCountry.supplier_count || 0).toLocaleString()}</div>
        </div>
      ) : null}
      <div
        style={{
          position: "absolute",
          right: 12,
          top: 12,
          display: "flex",
          gap: 8,
        }}
      >
        <button
          type="button"
          onClick={() => setMode("globe")}
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 12,
            fontWeight: 500,
            color: mode === "globe" ? "var(--text-inverse)" : "var(--text-secondary)",
            padding: "6px 10px",
            cursor: "pointer",
            background: mode === "globe" ? "var(--green-500)" : "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          Globe
        </button>
        <button
          type="button"
          onClick={() => setMode("heatmap")}
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 12,
            fontWeight: 500,
            color: mode === "heatmap" ? "var(--text-inverse)" : "var(--text-secondary)",
            padding: "6px 10px",
            cursor: "pointer",
            background: mode === "heatmap" ? "var(--green-500)" : "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          Heatmap
        </button>
        <button
          type="button"
          onClick={resetView}
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 12,
            fontWeight: 500,
            color: "var(--text-secondary)",
            padding: "6px 12px",
            cursor: "pointer",
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          Reset view
        </button>
      </div>
    </div>
  );
}

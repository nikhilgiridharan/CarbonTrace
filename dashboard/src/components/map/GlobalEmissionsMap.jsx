import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, { Layer, Source } from "react-map-gl";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import RiskBadge from "../shared/RiskBadge.jsx";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

export default function GlobalEmissionsMap({ suppliers, selectedId, onSelect }) {
  const mapRef = useRef(null);
  const [zoom, setZoom] = useState(2);
  const [viewState, setViewState] = useState({
    longitude: 10,
    latitude: 25,
    zoom: 2,
    pitch: 0,
  });
  const [mode, setMode] = useState("globe");
  const [countryStats, setCountryStats] = useState([]);
  const [hoverCountry, setHoverCountry] = useState(null);
  const [supplierNodes, setSupplierNodes] = useState([]);

  useEffect(() => {
    if (mode !== "heatmap") return;
    fetch(`${import.meta.env.VITE_API_BASE_URL || ""}/api/v1/emissions/by-country-detailed`)
      .then((r) => r.json())
      .then((d) => setCountryStats(d?.countries || []))
      .catch(() => setCountryStats([]));
  }, [mode]);

  const selected = useMemo(
    () => (supplierNodes || suppliers || []).find((s) => s.supplier_id === selectedId),
    [supplierNodes, suppliers, selectedId],
  );

  const loadSuppliers = useCallback(
    async (map) => {
      const API = import.meta.env.VITE_API_BASE_URL || "";
      try {
        const res = await fetch(`${API}/api/v1/suppliers/map-data?limit=500`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const list = Array.isArray(data) ? data : data.suppliers || [];
        setSupplierNodes(list);
        console.log(`Fetched ${list.length} suppliers for map`);

        ["supplier-nodes", "supplier-critical-ring", "supplier-labels"].forEach((id) => {
          try {
            if (map.getLayer(id)) map.removeLayer(id);
          } catch {
            /* ignore */
          }
        });
        try {
          if (map.getSource("suppliers")) map.removeSource("suppliers");
        } catch {
          /* ignore */
        }

        const features = list
          .filter(
            (s) =>
              s.lat != null &&
              s.lng != null &&
              !Number.isNaN(parseFloat(s.lat)) &&
              !Number.isNaN(parseFloat(s.lng)) &&
              parseFloat(s.lat) !== 0 &&
              parseFloat(s.lng) !== 0,
          )
          .map((s) => ({
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: [parseFloat(s.lng), parseFloat(s.lat)],
            },
            properties: {
              supplier_id: s.supplier_id || "",
              name: s.name || s.supplier_id || "",
              country: s.country || "",
              risk_tier: s.risk_tier || "LOW",
              risk_score: parseFloat(s.risk_score) || 0,
              emissions_30d: parseFloat(s.emissions_30d_kg) || 0,
              trend: s.emissions_trend || "STABLE",
            },
          }));
        console.log(`Adding ${features.length} valid supplier features`);
        if (!features.length) {
          console.warn("No valid supplier coordinates to display");
          return;
        }

        map.addSource("suppliers", {
          type: "geojson",
          data: { type: "FeatureCollection", features },
        });
        map.addLayer({
          id: "supplier-nodes",
          type: "circle",
          source: "suppliers",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["get", "emissions_30d"], 0, 5, 100, 7, 500, 9, 2000, 13, 5000, 17, 10000, 22],
            "circle-color": ["match", ["get", "risk_tier"], "LOW", "#3D8C21", "MEDIUM", "#D97706", "HIGH", "#C2410C", "CRITICAL", "#B91C1C", "#6B7566"],
            "circle-opacity": 0.85,
            "circle-stroke-width": 1.5,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-opacity": 0.7,
          },
        });
        map.addLayer({
          id: "supplier-critical-ring",
          type: "circle",
          source: "suppliers",
          filter: ["==", ["get", "risk_tier"], "CRITICAL"],
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["get", "emissions_30d"], 0, 12, 10000, 32],
            "circle-color": "transparent",
            "circle-stroke-width": 1.5,
            "circle-stroke-color": "#B91C1C",
            "circle-stroke-opacity": 0.35,
            "circle-opacity": 0,
          },
        });

        map.on("click", "supplier-nodes", (e) => {
          const props = e.features?.[0]?.properties;
          if (!props) return;
          onSelect?.(props.supplier_id);
        });
        map.on("mouseenter", "supplier-nodes", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "supplier-nodes", () => {
          map.getCanvas().style.cursor = "";
        });
      } catch (err) {
        console.error("Failed to load supplier map data:", err);
      }
    },
    [onSelect],
  );

  useEffect(() => {
    const map = mapRef.current?.getMap ? mapRef.current.getMap() : mapRef.current;
    if (!map) return undefined;
    const onLoad = () => {
      loadSuppliers(map);
    };
    const onStyleLoad = () => {
      if (mode !== "heatmap") {
        loadSuppliers(map);
      }
    };
    map.on("load", onLoad);
    map.on("style.load", onStyleLoad);
    return () => {
      map.off("load", onLoad);
      map.off("style.load", onStyleLoad);
    };
  }, [loadSuppliers, mode]);
  const resetView = useCallback(() => {
    setZoom(2);
    setViewState((vs) => ({ ...vs, longitude: 10, latitude: 25, zoom: 2 }));
  }, []);
  const countryLookup = useMemo(() => {
    const m = {};
    for (const c of countryStats) m[c.country] = c;
    return m;
  }, [countryStats]);
  const countryEmissionExpr = useMemo(() => {
    // `match` requires label/output pairs before the default. An empty stats
    // array produced `["match", [get], 0]` which is invalid and can blank the map.
    if (!countryStats.length) {
      return ["literal", 0];
    }
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
      setZoom(evt.viewState.zoom);
      if (mode !== "heatmap") return;
      const map = evt.target;
      if (!map.getLayer?.("countries-fill")) return;
      let f;
      try {
        f = map.queryRenderedFeatures(evt.point, { layers: ["countries-fill"] })?.[0];
      } catch {
        return;
      }
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

  const getMapInstance = useCallback(() => {
    const r = mapRef.current;
    if (!r) return undefined;
    return typeof r.getMap === "function" ? r.getMap() : r;
  }, []);
  const handleViewModeToggle = useCallback(
    (nextMode) => {
      try {
        setMode(nextMode);

        const map = getMapInstance();
        if (!map) {
          console.warn("Map ref not available");
          return;
        }

        const layersToRemove = ["heatmap-layer", "heatmap-labels", "supplier-nodes", "supplier-clusters", "supplier-count"];
        const sourcesToRemove = ["heatmap-source", "suppliers", "supplier-source"];

        layersToRemove.forEach((id) => {
          try {
            if (map.getLayer?.(id)) map.removeLayer(id);
          } catch {
            /* ignore cleanup error */
          }
        });
        sourcesToRemove.forEach((id) => {
          try {
            if (map.getSource?.(id)) map.removeSource(id);
          } catch {
            /* ignore cleanup error */
          }
        });

        if (nextMode === "heatmap") {
          setHoverCountry(null);
          if (!map.isStyleLoaded?.()) {
            map.once?.("style.load", () => setMode("heatmap"));
            map.once?.("load", () => setMode("heatmap"));
          }
        } else {
          setMode("globe");
          setHoverCountry(null);
        }
      } catch (topLevelError) {
        console.error("Heatmap toggle failed:", topLevelError);
        setMode("globe");
      }
    },
    [getMapInstance],
  );

  return (
    <div style={{ height: "100%", position: "relative" }}>
      <Map
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        {...viewState}
        onMove={onMapMove}
        onZoomEnd={(e) => {
          const z = e.viewState?.zoom ?? e.target?.getZoom?.();
          if (typeof z === "number" && !Number.isNaN(z)) setZoom(z);
        }}
        style={{ width: "100%", height: "100%" }}
        mapStyle="mapbox://styles/mapbox/light-v11"
        interactiveLayerIds={mode === "heatmap" ? ["countries-fill"] : ["supplier-nodes"]}
        renderWorldCopies={false}
        maxTileCacheSize={50}
        trackResize={false}
      >
        {mode === "globe" ? null : (
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
      <div
        style={{
          position: "absolute",
          left: "14px",
          top: "50%",
          transform: "translateY(-50%)",
          zIndex: 10,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "8px",
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-lg)",
          padding: "10px 8px",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <button
          type="button"
          onClick={() => {
            const newZoom = Math.min(zoom + 0.5, 18);
            setZoom(newZoom);
            setViewState((vs) => ({ ...vs, zoom: newZoom }));
            const map = getMapInstance();
            map?.zoomTo?.(newZoom, { duration: 300 });
          }}
          style={{
            width: "24px",
            height: "24px",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "16px",
            color: "var(--text-secondary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: 1,
            borderRadius: "var(--radius-sm)",
            padding: 0,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--bg-hover)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "none";
          }}
        >
          +
        </button>
        <input
          type="range"
          min="1"
          max="18"
          step="0.5"
          value={zoom}
          onChange={(e) => {
            const newZoom = parseFloat(e.target.value);
            setZoom(newZoom);
            setViewState((vs) => ({ ...vs, zoom: newZoom }));
            const map = getMapInstance();
            map?.zoomTo?.(newZoom, { duration: 200 });
          }}
          style={{
            appearance: "slider-vertical",
            WebkitAppearance: "slider-vertical",
            writingMode: "vertical-lr",
            direction: "rtl",
            width: "4px",
            height: "100px",
            cursor: "pointer",
            accentColor: "var(--green-500)",
          }}
        />
        <button
          type="button"
          onClick={() => {
            const newZoom = Math.max(zoom - 0.5, 1);
            setZoom(newZoom);
            setViewState((vs) => ({ ...vs, zoom: newZoom }));
            const map = getMapInstance();
            map?.zoomTo?.(newZoom, { duration: 300 });
          }}
          style={{
            width: "24px",
            height: "24px",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "18px",
            color: "var(--text-secondary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: 1,
            borderRadius: "var(--radius-sm)",
            padding: 0,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--bg-hover)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "none";
          }}
        >
          −
        </button>
      </div>
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
          onClick={() => handleViewModeToggle("globe")}
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

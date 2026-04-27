import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map from "react-map-gl";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import RiskBadge from "../shared/RiskBadge.jsx";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const API = import.meta.env.VITE_API_BASE_URL || "";

export default function GlobalEmissionsMap({ suppliers, selectedId, onSelect }) {
  const mapRef = useRef(null);
  const [zoom, setZoom] = useState(2);
  const [viewState, setViewState] = useState({
    longitude: 10,
    latitude: 25,
    zoom: 2,
    pitch: 0,
  });
  const [supplierNodes, setSupplierNodes] = useState([]);

  const selected = useMemo(
    () => (supplierNodes || suppliers || []).find((s) => s.supplier_id === selectedId),
    [supplierNodes, suppliers, selectedId],
  );

  const loadSupplierNodes = useCallback(
    async (map) => {
      try {
        console.log("Loading supplier nodes...");
        ["supplier-nodes", "supplier-critical-ring", "supplier-labels", "heatmap-layer", "heatmap-labels"].forEach((id) => {
          try {
            if (map.getLayer && map.getLayer(id)) {
              map.removeLayer(id);
            }
          } catch {
            /* ignore */
          }
        });
        ["suppliers", "heatmap-source"].forEach((id) => {
          try {
            if (map.getSource && map.getSource(id)) {
              map.removeSource(id);
            }
          } catch {
            /* ignore */
          }
        });

        const res = await fetch(`${API}/api/v1/suppliers/map-data?limit=500`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const list = Array.isArray(data) ? data : data.suppliers || [];
        setSupplierNodes(list);
        console.log(`Fetched ${list.length} suppliers`);

        const features = list
          .filter((s) => {
            const lat = parseFloat(s.lat);
            const lng = parseFloat(s.lng);
            return (
              s.lat != null &&
              s.lng != null &&
              !Number.isNaN(lat) &&
              !Number.isNaN(lng) &&
              lat !== 0 &&
              lng !== 0 &&
              lat >= -90 &&
              lat <= 90 &&
              lng >= -180 &&
              lng <= 180
            );
          })
          .map((s) => ({
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: [parseFloat(s.lng), parseFloat(s.lat)],
            },
            properties: {
              supplier_id: String(s.supplier_id || ""),
              name: String(s.name || s.supplier_id || ""),
              country: String(s.country || ""),
              risk_tier: String(s.risk_tier || "LOW"),
              risk_score: Number(s.risk_score) || 0,
              emissions_30d: Number(s.emissions_30d_kg) || 0,
              trend: String(s.emissions_trend || "STABLE"),
            },
          }));
        console.log(`Valid features: ${features.length}`);
        if (!features.length) {
          console.warn("No valid supplier coordinates");
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
            "circle-opacity": 0.88,
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
            "circle-radius": ["interpolate", ["linear"], ["get", "emissions_30d"], 0, 12, 10000, 30],
            "circle-color": "transparent",
            "circle-stroke-width": 1.5,
            "circle-stroke-color": "#B91C1C",
            "circle-stroke-opacity": 0.3,
            "circle-opacity": 0,
          },
        });

        map.on("click", "supplier-nodes", (e) => {
          if (!e.features?.length) return;
          const props = e.features[0].properties;
          if (!props) return;
          onSelect?.(props.supplier_id || props.name);
          console.log("Clicked supplier:", props.name, props.risk_tier, props.emissions_30d);
        });
        map.on("mouseenter", "supplier-nodes", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "supplier-nodes", () => {
          map.getCanvas().style.cursor = "";
        });
        console.log("✓ Supplier nodes added to map");
      } catch (err) {
        console.error("loadSupplierNodes failed:", err);
      }
    },
    [onSelect],
  );

  const handleMapLoad = useCallback(
    (evt) => {
      const map = evt.target || mapRef.current?.getMap?.();
      if (!map) return;
      loadSupplierNodes(map);
    },
    [loadSupplierNodes],
  );

  useEffect(() => {
    const map = mapRef.current?.getMap?.();
    if (!map) return;
    if (map.isStyleLoaded()) {
      loadSupplierNodes(map);
    } else {
      map.once("style.load", () => loadSupplierNodes(map));
    }
  }, [loadSupplierNodes]);

  const resetView = useCallback(() => {
    setZoom(2);
    setViewState((vs) => ({ ...vs, longitude: 10, latitude: 25, zoom: 2 }));
  }, []);

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
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        {...viewState}
        onMove={(evt) => {
          setViewState(evt.viewState);
          setZoom(evt.viewState.zoom);
        }}
        onLoad={handleMapLoad}
        onZoomEnd={(e) => {
          const z = e.viewState?.zoom ?? e.target?.getZoom?.();
          if (typeof z === "number" && !Number.isNaN(z)) setZoom(z);
        }}
        style={{ width: "100%", height: "100%" }}
        mapStyle="mapbox://styles/mapbox/light-v11"
        interactiveLayerIds={["supplier-nodes"]}
        renderWorldCopies={false}
        maxTileCacheSize={50}
        trackResize={false}
      />
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
      {selected ? (
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
          onClick={() => {
            const map = mapRef.current?.getMap?.();
            if (map) loadSupplierNodes(map);
          }}
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 12,
            fontWeight: 500,
            color: "var(--text-inverse)",
            padding: "6px 10px",
            cursor: "pointer",
            background: "var(--green-500)",
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

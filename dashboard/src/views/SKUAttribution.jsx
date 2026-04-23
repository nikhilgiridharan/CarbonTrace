import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import SankeyDiagram from "../components/charts/SankeyDiagram.jsx";
import { apiBaseUrl } from "../utils/constants.js";

const client = axios.create({ baseURL: apiBaseUrl() });

/** Keep only top N suppliers by total emissions; rebuild supplier→mode→SKU paths. */
function sankeyTopSuppliers(raw, topN = 10) {
  const links = raw?.links || [];
  if (!links.length) return { nodes: raw?.nodes || [], links: [] };

  const supToMode = links.filter((l) => typeof l.source === "string" && l.source.startsWith("supplier:"));
  const modeToSku = links.filter(
    (l) => typeof l.source === "string" && l.source.startsWith("mode:") && typeof l.target === "string" && l.target.startsWith("sku:")
  );

  const bySup = new Map();
  for (const l of supToMode) {
    const id = l.source;
    bySup.set(id, (bySup.get(id) || 0) + Number(l.value || 0));
  }
  const topIds = new Set(
    [...bySup.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([id]) => id)
  );

  const usedModeSku = new Set();
  const filtered = [];
  for (const l1 of supToMode) {
    if (!topIds.has(l1.source)) continue;
    const v = Number(l1.value || 0);
    const mode = l1.target;
    const l2 = modeToSku.find(
      (l) =>
        l.source === mode &&
        !usedModeSku.has(l) &&
        Math.abs(Number(l.value || 0) - v) <= Math.max(1e-6 * Math.max(v, 1), 1e-9)
    );
    if (!l2) continue;
    usedModeSku.add(l2);
    filtered.push(l1, l2);
  }

  const ids = new Set();
  for (const l of filtered) {
    ids.add(l.source);
    ids.add(l.target);
  }
  const nodes = (raw?.nodes || []).filter((n) => ids.has(n.id));
  return { nodes, links: filtered };
}

export default function SKUAttribution() {
  const [sku, setSku] = useState("SKU-00001");
  const [data, setData] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    client
      .get(`/skus/${encodeURIComponent(sku)}/sankey`, { signal: controller.signal })
      .then((r) => setData(r.data))
      .catch(() => {
        /* ignore cancelled/failed request */
      });
    return () => controller.abort();
  }, [sku]);

  const { nodes, links } = useMemo(() => sankeyTopSuppliers(data, 10), [data]);

  return (
    <div
      style={{
        minHeight: "100%",
        padding: "20px 24px 32px",
        background: "linear-gradient(165deg, color-mix(in srgb, var(--teal-50) 55%, var(--bg-base)) 0%, var(--bg-base) 42%, var(--bg-subtle) 100%)",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr)",
          gap: 0,
          maxWidth: 1100,
          margin: "0 auto",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginBottom: 20 }}>
          <div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "var(--teal-600)",
                marginBottom: 6,
              }}
            >
              SKU trace · flow attribution
            </div>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 700, color: "var(--text-primary)", margin: 0, letterSpacing: "-0.02em" }}>
              Emissions Sankey
            </h1>
          </div>
          <input
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            aria-label="SKU identifier"
            style={{
              minWidth: 220,
              maxWidth: 420,
              flex: "1 1 280px",
              padding: "10px 14px",
              borderRadius: "var(--radius-md)",
              border: "1px solid color-mix(in srgb, var(--teal-400) 45%, var(--border-default))",
              background: "var(--bg-surface)",
              color: "var(--text-primary)",
              fontFamily: "var(--font-mono)",
              fontSize: 13,
              letterSpacing: "0.04em",
            }}
          />
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "row",
            gap: 0,
            alignItems: "stretch",
            borderRadius: "var(--radius-lg)",
            overflow: "hidden",
            border: "1px solid color-mix(in srgb, var(--teal-400) 35%, var(--border-default))",
            background: "var(--bg-surface)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <div
            className="cp-sku-trace-rail"
            aria-hidden
            style={{
              width: 36,
              flexShrink: 0,
              background: "color-mix(in srgb, var(--teal-100) 70%, var(--bg-subtle))",
              borderRight: "1px solid color-mix(in srgb, var(--teal-400) 25%, var(--border-default))",
              display: "none",
            }}
          >
            ATTRIBUTION
          </div>
          <style>{`
            @media (min-width: 760px) {
              .cp-sku-trace-rail {
                display: flex !important;
                align-items: center;
                justify-content: center;
                writing-mode: vertical-rl;
                transform: rotate(180deg);
                font-family: var(--font-mono);
                font-size: 10px;
                letter-spacing: 0.22em;
                text-transform: uppercase;
                color: var(--teal-600);
              }
            }
          `}</style>
          <div style={{ flex: 1, minWidth: 0, borderLeft: "3px solid var(--teal-400)", padding: "16px 18px 20px" }}>
            <div
              style={{
                fontSize: 12,
                color: "var(--text-tertiary)",
                fontFamily: "var(--font-mono)",
                marginBottom: 12,
                paddingBottom: 10,
                borderBottom: "1px dashed var(--border-default)",
              }}
            >
              Showing top 10 suppliers by emissions for this SKU
            </div>
            <SankeyDiagram nodes={nodes} links={links} />
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { useSuppliers } from "../hooks/useSuppliers.js";

const RISK_COLORS = { LOW: "#3D8C21", MEDIUM: "#D97706", HIGH: "#C2410C", CRITICAL: "#B91C1C" };

export default function SupplierNetwork() {
  const svgRef = useRef(null);
  const { data, isLoading } = useSuppliers({ limit: 500, offset: 0, sort_by: "risk_score", order: "desc" });
  const suppliers = data?.items || [];
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState("ALL");

  useEffect(() => {
    if (!suppliers.length || !svgRef.current) return undefined;
    const width = svgRef.current.clientWidth || 800;
    const height = 520;
    d3.select(svgRef.current).selectAll("*").remove();
    const filtered = filter === "ALL" ? suppliers : suppliers.filter((s) => s.risk_tier === filter);
    const nodes = filtered.slice(0, 120).map((s) => ({
      id: s.supplier_id,
      name: s.name || s.supplier_id,
      risk_tier: s.risk_tier || "LOW",
      emissions: s.emissions_30d_kg || 10,
      country: s.country,
      industry: s.industry,
    }));
    const links = [];
    const groups = {};
    nodes.forEach((n) => {
      if (!groups[n.industry]) groups[n.industry] = [];
      groups[n.industry].push(n.id);
    });
    Object.values(groups).forEach((group) => {
      for (let i = 0; i < Math.min(group.length, 4); i += 1) {
        for (let j = i + 1; j < Math.min(group.length, 4); j += 1) {
          links.push({ source: group[i], target: group[j] });
        }
      }
    });
    const radiusScale = d3
      .scaleSqrt()
      .domain([0, d3.max(nodes, (d) => d.emissions) || 1])
      .range([4, 18]);
    const svg = d3.select(svgRef.current).attr("width", width).attr("height", height);
    const sim = d3
      .forceSimulation(nodes)
      .force("link", d3.forceLink(links).id((d) => d.id).distance(50).strength(0.2))
      .force("charge", d3.forceManyBody().strength(-60))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius((d) => radiusScale(d.emissions) + 3));
    const link = svg
      .append("g")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", "#E5E7E2")
      .attr("stroke-width", 0.8)
      .attr("opacity", 0.6);
    const node = svg
      .append("g")
      .selectAll("circle")
      .data(nodes)
      .join("circle")
      .attr("r", (d) => radiusScale(d.emissions))
      .attr("fill", (d) => RISK_COLORS[d.risk_tier] || "#6B7566")
      .attr("opacity", 0.85)
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 1.5)
      .style("cursor", "pointer")
      .on("click", (_, d) => setSelected(d))
      .call(
        d3
          .drag()
          .on("start", (event, d) => {
            if (!event.active) sim.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", (event, d) => {
            if (!event.active) sim.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      );
    node.append("title").text((d) => `${d.name}\n${d.risk_tier} risk\n${d.country}\n${d.emissions.toFixed(0)} kg CO₂e`);
    sim.on("tick", () => {
      link.attr("x1", (d) => d.source.x).attr("y1", (d) => d.source.y).attr("x2", (d) => d.target.x).attr("y2", (d) => d.target.y);
      node.attr("cx", (d) => d.x).attr("cy", (d) => d.y);
    });
    return () => sim.stop();
  }, [suppliers, filter]);

  return (
    <div style={{ padding: "32px 40px" }}>
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: "700", color: "var(--text-primary)", fontFamily: "var(--font-display)", margin: 0 }}>
          Supplier Network
        </h1>
        <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginTop: "6px" }}>
          Suppliers connected by shared product categories.
        </p>
      </div>
      <div style={{ display: "flex", gap: "6px", marginBottom: "16px" }}>
        {["ALL", "LOW", "MEDIUM", "HIGH", "CRITICAL"].map((tier) => (
          <button key={tier} onClick={() => setFilter(tier)} style={{ padding: "4px 12px", background: filter === tier ? "var(--green-500)" : "var(--bg-subtle)", color: filter === tier ? "white" : "var(--text-secondary)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-full)", fontSize: "11px", cursor: "pointer" }}>{tier}</button>
        ))}
      </div>
      {isLoading ? (
        <div style={{ color: "var(--text-tertiary)", fontSize: "13px" }}>Loading network...</div>
      ) : (
        <div className="panel" style={{ overflow: "hidden", position: "relative" }}>
          <svg ref={svgRef} style={{ width: "100%", height: "520px" }} />
          {selected ? (
            <div style={{ position: "absolute", top: "16px", right: "16px", background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", padding: "14px 16px", minWidth: "180px", boxShadow: "var(--shadow-md)" }}>
              <button onClick={() => setSelected(null)} style={{ position: "absolute", top: "8px", right: "8px", background: "none", border: "none", color: "var(--text-tertiary)", cursor: "pointer", fontSize: "14px" }}>✕</button>
              <p style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-primary)", margin: "0 0 8px" }}>{selected.name}</p>
              {[
                ["Country", selected.country],
                ["Industry", selected.industry],
                ["Risk", selected.risk_tier],
                ["30d emissions", `${(selected.emissions || 0).toFixed(0)} kg`],
              ].map(([label, value]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "4px" }}>
                  <span style={{ color: "var(--text-tertiary)" }}>{label}</span>
                  <span style={{ color: "var(--text-primary)", fontWeight: "500" }}>{value}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

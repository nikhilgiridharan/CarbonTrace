const sections = [
  {
    tab: "Overview",
    what: "Your mission control page. It summarizes portfolio emissions, supplier risk, and live alerts at a glance.",
    how: [
      "Start here first to check total emissions and active alerts.",
      "Click suppliers on the left panel to focus map and risk details.",
      "Use the map toggles (Globe/Heatmap) to switch between supplier nodes and country-level intensity.",
    ],
  },
  {
    tab: "Ask Verdant",
    what: "A natural-language query tool. Ask questions in plain English and Verdant runs a SQL query for you.",
    how: [
      "Type a question like 'Which suppliers are critical risk?' and press Ask.",
      "Use the example chips to learn what kinds of questions work best.",
      "Expand 'View generated SQL' if you want to see how the answer was produced.",
    ],
  },
  {
    tab: "Suppliers",
    what: "A detailed supplier table with risk, emissions, and benchmarking context.",
    how: [
      "Use pagination to move through suppliers sorted by risk.",
      "Use Compare to place two suppliers side-by-side.",
      "Switch to Benchmarks to see who is above or below category averages.",
    ],
  },
  {
    tab: "SKU Trace",
    what: "A Sankey flow showing which suppliers and transport modes drive emissions for a SKU.",
    how: [
      "Enter a SKU ID in the input (example: SKU-00001).",
      "Read left-to-right: supplier → transport mode → SKU.",
      "Use this to identify highest-impact suppliers for a product.",
    ],
  },
  {
    tab: "Network",
    what: "An interactive supplier relationship graph. Node size shows emissions; color shows risk tier.",
    how: [
      "Filter by risk tier to isolate hotspots.",
      "Click a node to inspect supplier details.",
      "Drag nodes to visually separate clusters and explore groups.",
    ],
  },
  {
    tab: "Scenarios",
    what: "A what-if planner for transport-mode changes and potential savings.",
    how: [
      "Set a reduction target with the slider.",
      "Add scenarios with supplier, current mode, and proposed mode.",
      "Use Pathway to generate a prioritized decarbonization action list.",
    ],
  },
  {
    tab: "Forecast",
    what: "A forward-looking emissions trend chart for a supplier.",
    how: [
      "Type a supplier ID (example: SUP-00001).",
      "Review projected emissions and confidence bands.",
      "Use this to prepare mitigation actions before spikes happen.",
    ],
  },
];

export default function Wiki() {
  return (
    <div style={{ padding: "28px 32px", maxWidth: 980 }}>
      <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 24, color: "var(--text-primary)" }}>Verdant Wiki</h1>
      <p style={{ marginTop: 8, color: "var(--text-secondary)", fontSize: 14 }}>
        Beginner guide to each tab and how to use it.
      </p>

      <div style={{ display: "grid", gap: 12, marginTop: 20 }}>
        {sections.map((s) => (
          <div key={s.tab} className="panel" style={{ padding: "14px 16px" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>{s.tab}</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>{s.what}</div>
            <ul style={{ margin: 0, paddingLeft: 18, color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.6 }}>
              {s.how.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

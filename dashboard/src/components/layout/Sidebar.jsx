import { NavLink, useNavigate } from "react-router-dom";

const nav = [
  { to: "/dashboard", label: "Overview" },
  { to: "/ask", label: "Ask Verdant" },
  { to: "/suppliers", label: "Suppliers" },
  { to: "/skus", label: "SKU Trace" },
  { to: "/network", label: "Network" },
  { to: "/scenarios", label: "Scenarios" },
  { to: "/forecast", label: "Forecast" },
];

const navLabel = {
  fontSize: 11,
  fontWeight: 600,
  color: "var(--text-tertiary)",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  padding: "16px 16px 4px",
};

export default function Sidebar({ pipelineOk }) {
  const navigate = useNavigate();

  return (
    <aside
      style={{
        width: 220,
        minHeight: "100vh",
        background: "var(--bg-surface)",
        borderRight: "1px solid var(--border-default)",
        display: "flex",
        flexDirection: "column",
        boxShadow: "none",
      }}
    >
      <div
        style={{
          padding: 20,
          borderBottom: "1px solid var(--border-default)",
          background: "var(--bg-surface)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            role="button"
            tabIndex={0}
            aria-label="Verdant, go to introduction"
            onClick={() => navigate("/introduction")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                navigate("/introduction");
              }
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              cursor: "pointer",
            }}
          >
            <img
              src="/verdant-dove.png"
              alt=""
              width={28}
              height={28}
              style={{ borderRadius: 6, flexShrink: 0, display: "block", objectFit: "cover" }}
            />
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 600,
                fontSize: 15,
                color: "var(--text-primary)",
              }}
            >
              Verdant
            </span>
          </div>
        </div>
      </div>
      <nav style={{ flex: 1, paddingTop: 4 }}>
        <div style={navLabel}>Navigate</div>
        {nav.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === "/dashboard"}
            className={({ isActive }) => `cp-nav-link${isActive ? " cp-nav-link--active" : ""}`}
          >
            <span>{n.label}</span>
          </NavLink>
        ))}
        <div style={{ borderTop: "1px solid var(--border-subtle)", margin: "12px 8px" }} />
        <NavLink to="/wiki" className={({ isActive }) => `cp-nav-link${isActive ? " cp-nav-link--active" : ""}`}>
          <span>Wiki</span>
        </NavLink>
        <a
          href="https://github.com/nikhilgiridharan/Verdant"
          target="_blank"
          rel="noopener noreferrer"
          className="cp-nav-link"
        >
          <span>GitHub</span>
        </a>
        <a href="https://medium.com/@nikhilgiridharan/building-verdant-019e8e44b7b3" target="_blank" rel="noopener noreferrer" className="cp-nav-link">
          <span>Medium</span>
        </a>
      </nav>
      <div
        style={{
          padding: "12px 16px",
          borderTop: "1px solid var(--border-subtle)",
          background: "var(--bg-surface)",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
        }}
      >
        <div style={{ color: "var(--text-tertiary)", marginBottom: 6 }}>Pipeline</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              flexShrink: 0,
              background: pipelineOk ? "var(--color-success)" : "var(--color-danger)",
            }}
          />
          <span style={{ color: "var(--text-secondary)" }}>{pipelineOk ? "Healthy" : "Down"}</span>
        </div>
        <div style={{ marginTop: 8 }}>
          <span style={{ color: "var(--text-tertiary)" }}>Last sync </span>
          <span style={{ color: "var(--text-secondary)" }}>live</span>
        </div>
      </div>
    </aside>
  );
}

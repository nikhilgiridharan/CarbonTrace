import { NavLink, useNavigate } from "react-router-dom";

const nav = [
  { to: "/dashboard", label: "Overview" },
  { to: "/ask", label: "Ask Verdant", icon: "✦" },
  { to: "/suppliers", label: "Suppliers" },
  { to: "/skus", label: "SKU Trace" },
  { to: "/network", label: "Network", icon: "◉" },
  { to: "/scenarios", label: "Scenarios", icon: "≡" },
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
          <div>
            <div
              role="button"
              tabIndex={0}
              onClick={() => navigate("/introduction")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  navigate("/introduction");
                }
              }}
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 600,
                fontSize: 15,
                color: "var(--text-primary)",
                cursor: "pointer",
              }}
            >
              Verdant
            </div>
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
            {n.icon ? <span aria-hidden>{n.icon}</span> : null}
            <span>{n.label}</span>
          </NavLink>
        ))}
        <div style={{ borderTop: "1px solid var(--border-subtle)", margin: "12px 8px" }} />
        <NavLink to="/settings" className={({ isActive }) => `cp-nav-link${isActive ? " cp-nav-link--active" : ""}`}>
          <span aria-hidden>⚙</span>
          <span>Settings</span>
        </NavLink>
        <a
          href="https://github.com/nikhilgiridharan"
          target="_blank"
          rel="noopener noreferrer"
          className="cp-nav-link"
        >
          <svg width={15} height={15} viewBox="0 0 24 24" fill="currentColor" aria-hidden style={{ flexShrink: 0 }}>
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.341-3.369-1.341-.454-1.155-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z"
            />
          </svg>
          <span>GitHub</span>
        </a>
        <a href="https://medium.com/@nickgiridharan" target="_blank" rel="noopener noreferrer" className="cp-nav-link">
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

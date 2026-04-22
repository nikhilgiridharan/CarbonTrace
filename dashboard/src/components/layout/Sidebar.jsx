import { NavLink } from "react-router-dom";
import { playGoFundMeAudio } from "../../utils/goFundMeAudio.js";

const nav = [
  { to: "/", label: "Overview" },
  { to: "/suppliers", label: "Suppliers" },
  { to: "/skus", label: "SKU trace" },
  { to: "/forecast", label: "Forecast" },
  { to: "/quality", label: "Data quality" },
  { to: "/api", label: "API console" },
  { to: "/go-fund-me", label: "Conclusion" },
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
            style={{
              width: 36,
              height: 36,
              borderRadius: "var(--radius-md)",
              background: "var(--green-500)",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 3C8 7 5 10 5 14a7 7 0 0 0 14 0c0-4-3-7-7-11z"
                stroke="var(--text-inverse)"
                strokeWidth="1.4"
                fill="none"
              />
            </svg>
          </div>
          <div>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 600,
                fontSize: 15,
                color: "var(--text-primary)",
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
            end={n.to === "/"}
            onPointerDown={() => {
              if (n.to === "/go-fund-me") {
                playGoFundMeAudio().catch(() => {
                  /* keep in same gesture stack as touch (mobile Safari) */
                });
              }
            }}
            onClick={() => {
              if (n.to === "/go-fund-me") {
                playGoFundMeAudio().catch(() => {
                  /* autoplay may still be browser-gated */
                });
              }
            }}
            className={({ isActive }) => `cp-nav-link${isActive ? " cp-nav-link--active" : ""}`}
          >
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" aria-hidden style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" fill="none" />
              <path d="M12 5v2M12 17v2M5 12h2M17 12h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            <span>{n.label}</span>
          </NavLink>
        ))}
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

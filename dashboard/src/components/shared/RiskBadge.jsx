import { memo } from "react";

const styles = {
  LOW: {
    background: "var(--risk-low-bg)",
    color: "var(--risk-low-text)",
    borderColor: "var(--risk-low-border)",
    dot: "var(--risk-low)",
  },
  MEDIUM: {
    background: "var(--risk-medium-bg)",
    color: "var(--risk-medium-text)",
    borderColor: "var(--risk-medium-border)",
    dot: "var(--risk-medium)",
  },
  HIGH: {
    background: "var(--risk-high-bg)",
    color: "var(--risk-high-text)",
    borderColor: "var(--risk-high-border)",
    dot: "var(--risk-high)",
  },
  CRITICAL: {
    background: "var(--risk-critical-bg)",
    color: "var(--risk-critical-text)",
    borderColor: "var(--risk-critical-border)",
    dot: "var(--risk-critical)",
  },
};

const base = {
  fontFamily: "var(--font-sans)",
  fontSize: 11,
  fontWeight: 600,
  padding: "2px 8px",
  borderRadius: "var(--radius-full)",
  border: "1px solid",
  letterSpacing: "0.03em",
  textTransform: "uppercase",
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
};

function RiskBadge({ tier }) {
  const t = (tier || "LOW").toUpperCase();
  const s = styles[t] || styles.LOW;
  return (
    <span style={{ ...base, background: s.background, color: s.color, borderColor: s.borderColor }}>
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: s.dot,
          flexShrink: 0,
        }}
      />
      {t === "CRITICAL" ? (
        <>
          <span style={{ fontSize: 10, lineHeight: 1 }} aria-hidden>
            ⚠
          </span>
          {t}
        </>
      ) : (
        t
      )}
    </span>
  );
}

export default memo(RiskBadge);

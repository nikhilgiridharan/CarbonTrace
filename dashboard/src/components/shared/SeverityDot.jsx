import { memo } from "react";

const map = {
  LOW: "var(--risk-low)",
  MEDIUM: "var(--risk-medium)",
  HIGH: "var(--risk-high)",
  CRITICAL: "var(--risk-critical)",
};

function SeverityDot({ severity }) {
  const s = (severity || "LOW").toUpperCase();
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: map[s] || map.LOW,
      }}
    />
  );
}

export default memo(SeverityDot);

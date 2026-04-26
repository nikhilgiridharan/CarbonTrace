import { memo, useMemo } from "react";

function stateFromPipeline(data) {
  const hb = data?.components?.find?.((c) => c.name === "api")?.last_heartbeat;
  if (!hb) {
    return {
      key: "syncing",
      label: "Syncing",
      dot: "var(--color-warning)",
      pillBg: "var(--color-warning-bg)",
      pillColor: "var(--color-warning)",
      pillBorder: "var(--color-warning-border)",
    };
  }
  const diff = Date.now() - new Date(hb).getTime();
  const mins = diff / 60000;
  if (mins < 2) {
    return {
      key: "fresh",
      label: "Fresh",
      dot: "var(--color-success)",
      pillBg: "var(--color-success-bg)",
      pillColor: "var(--color-success)",
      pillBorder: "var(--color-success-border)",
    };
  }
  if (mins < 5) {
    return {
      key: "syncing",
      label: "Syncing",
      dot: "var(--color-warning)",
      pillBg: "var(--color-warning-bg)",
      pillColor: "var(--color-warning)",
      pillBorder: "var(--color-warning-border)",
    };
  }
  return {
    key: "stale",
    label: "Stale",
    dot: "var(--color-danger)",
    pillBg: "var(--color-danger-bg)",
    pillColor: "var(--color-danger)",
    pillBorder: "var(--color-danger-border)",
  };
}

const STATUS_CONFIG = {
  fresh: {
    label: "Fresh",
    color: "#16a34a",
    bg: "#f0fdf4",
    border: "#bbf7d0",
    dot: "#22c55e",
  },
  syncing: {
    label: "Syncing",
    color: "#b45309",
    bg: "#fffbeb",
    border: "#fde68a",
    dot: "#f59e0b",
  },
  stale: {
    label: "Stale",
    color: "#dc2626",
    bg: "#fef2f2",
    border: "#fecaca",
    dot: "#ef4444",
  },
};

function DataFreshBadge({ pipelineMessage, syncStatus }) {
  const statusFromPipeline = useMemo(() => {
    if (pipelineMessage?.type === "pipeline_status") {
      return stateFromPipeline({ components: pipelineMessage.data })?.key;
    }
    return null;
  }, [pipelineMessage]);
  const resolvedStatus = syncStatus || statusFromPipeline || "fresh";
  const config = STATUS_CONFIG[resolvedStatus] || STATUS_CONFIG.fresh;

  return (
    <>
      <style>{`
        @keyframes verdant-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .syncing-dot {
          animation: verdant-pulse 1.5s infinite;
        }
      `}</style>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "4px 10px",
          background: config.bg,
          border: `1px solid ${config.border}`,
          borderRadius: "999px",
          fontSize: "11px",
          fontWeight: "600",
          color: config.color,
        }}
      >
        <span
          className={resolvedStatus === "syncing" ? "syncing-dot" : ""}
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: config.dot,
            display: "inline-block",
          }}
        />
        {config.label}
      </div>
    </>
  );
}

export default memo(DataFreshBadge);

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

const pillBase = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: 11,
  fontWeight: 500,
  padding: "3px 8px",
  borderRadius: "var(--radius-full)",
  border: "1px solid",
};

function DataFreshBadge({ pipelineMessage }) {
  const st = useMemo(() => {
    if (pipelineMessage?.type === "pipeline_status") {
      return stateFromPipeline({ components: pipelineMessage.data });
    }
    return {
      key: "fresh",
      label: "Fresh",
      dot: "var(--color-success)",
      pillBg: "var(--color-success-bg)",
      pillColor: "var(--color-success)",
      pillBorder: "var(--color-success-border)",
    };
  }, [pipelineMessage]);

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span
        style={{
          ...pillBase,
          background: st.pillBg,
          color: st.pillColor,
          borderColor: st.pillBorder,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: st.dot,
            flexShrink: 0,
          }}
        />
        {st.label}
      </span>
    </div>
  );
}

export default memo(DataFreshBadge);

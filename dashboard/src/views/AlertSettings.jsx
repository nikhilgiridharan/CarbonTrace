import { useState } from "react";

const DEFAULTS = {
  spike_zscore_threshold: 2.5,
  spike_multiplier: 3.0,
  intensity_multiplier: 2.0,
  min_window_size: 10,
  alert_on_critical_only: false,
};

export default function AlertSettings() {
  const [settings, setSettings] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("verdant_alert_settings")) || DEFAULTS;
    } catch {
      return DEFAULTS;
    }
  });
  const [saved, setSaved] = useState(false);
  const save = () => {
    localStorage.setItem("verdant_alert_settings", JSON.stringify(settings));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };
  const reset = () => setSettings(DEFAULTS);

  return (
    <div style={{ padding: "32px 40px", maxWidth: "600px" }}>
      <h1 style={{ fontSize: "24px", fontWeight: "700", color: "var(--text-primary)", fontFamily: "var(--font-display)", margin: "0 0 8px" }}>
        Alert Settings
      </h1>
      <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "32px" }}>
        Configure thresholds for real-time emissions anomaly detection.
      </p>
      {[
        ["spike_zscore_threshold", "Z-score spike threshold", 1.0, 5.0, 0.1],
        ["spike_multiplier", "Simple spike multiplier", 1.5, 10.0, 0.5],
        ["intensity_multiplier", "Intensity anomaly multiplier", 1.0, 5.0, 0.5],
        ["min_window_size", "Minimum window size", 5, 50, 1],
      ].map(([key, label, min, max, step]) => (
        <div key={key} className="panel" style={{ marginBottom: "24px", padding: "16px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
            <label style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-primary)" }}>{label}</label>
            <span style={{ fontSize: "14px", fontWeight: "700", color: "var(--green-600)", fontFamily: "var(--font-mono)" }}>{settings[key]}</span>
          </div>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={settings[key]}
            onChange={(e) => setSettings((prev) => ({ ...prev, [key]: parseFloat(e.target.value) }))}
            style={{ width: "100%" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "var(--text-tertiary)", marginTop: "2px" }}>
            <span>{min} (sensitive)</span>
            <span>{max} (strict)</span>
          </div>
        </div>
      ))}
      <div style={{ display: "flex", gap: "12px" }}>
        <button onClick={save} style={{ padding: "10px 24px", background: saved ? "var(--green-400)" : "var(--green-500)", color: "white", border: "none", borderRadius: "var(--radius-md)", fontSize: "13px", cursor: "pointer" }}>
          {saved ? "✓ Saved" : "Save settings"}
        </button>
        <button onClick={reset} style={{ padding: "10px 24px", background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", fontSize: "13px", cursor: "pointer" }}>
          Reset to defaults
        </button>
      </div>
    </div>
  );
}

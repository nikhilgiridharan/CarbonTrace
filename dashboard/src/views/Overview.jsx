import { useNavigate } from "react-router-dom";

export default function Overview() {
  const navigate = useNavigate();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        textAlign: "center",
        padding: 40,
        animation: "fadeUp 0.5s ease forwards",
      }}
    >
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M12 3C8 7 5 10 5 14a7 7 0 0 0 14 0c0-4-3-7-7-11Z"
          stroke="var(--green-500)"
          strokeWidth="1.8"
          fill="none"
        />
      </svg>

      <h1
        style={{
          fontSize: 48,
          fontWeight: 700,
          fontFamily: "var(--font-display)",
          color: "var(--text-primary)",
          marginTop: 16,
          marginBottom: 0,
          lineHeight: 1.1,
        }}
      >
        Carbon Intelligence.
      </h1>

      <p
        style={{
          fontSize: 16,
          color: "var(--text-secondary)",
          marginTop: 12,
          marginBottom: 0,
        }}
      >
        Track Scope 3 emissions across your supply chain.
      </p>

      <button
        type="button"
        onClick={() => navigate("/dashboard")}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--green-600)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "var(--green-500)";
        }}
        style={{
          background: "var(--green-500)",
          color: "#fff",
          padding: "12px 28px",
          borderRadius: "var(--radius-md)",
          fontSize: 14,
          fontWeight: 500,
          marginTop: 32,
          border: "none",
          cursor: "pointer",
        }}
      >
        Open dashboard →
      </button>
    </div>
  );
}

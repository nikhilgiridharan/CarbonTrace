import { useState, useRef } from "react";

const API = import.meta.env.VITE_API_BASE_URL || "";

const EXAMPLES = [
  "Which suppliers in China are getting worse this month?",
  "What are my top 5 highest-emission transport routes?",
  "Which product categories have the highest carbon intensity?",
  "Show me all CRITICAL risk suppliers and their 30-day emissions",
  "Which country has the most suppliers shipping by air?",
];

export default function AskVerdant() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const ask = async (q) => {
    const query = q || question;
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`${API}/api/v1/nl/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: query }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Query failed");
      }
      const data = await res.json();
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExampleClick = (ex) => {
    setQuestion(ex);
    ask(ex);
  };

  return (
    <div style={{ padding: "32px 40px", maxWidth: "860px" }}>
      <div style={{ marginBottom: "32px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: "700", color: "var(--text-primary)", fontFamily: "var(--font-display)", margin: 0 }}>
          Ask Verdant
        </h1>
        <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginTop: "6px" }}>
          Ask any question about your supply chain emissions in plain English.
        </p>
      </div>

      <div style={{ position: "relative", marginBottom: "16px" }}>
        <input
          ref={inputRef}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask()}
          placeholder="Which suppliers are getting worse this month?"
          style={{
            width: "100%",
            padding: "14px 120px 14px 16px",
            fontSize: "14px",
            border: "1.5px solid var(--border-default)",
            borderRadius: "var(--radius-md)",
            background: "var(--bg-surface)",
            color: "var(--text-primary)",
            outline: "none",
            fontFamily: "var(--font-sans)",
          }}
          onFocus={(e) => {
            e.target.style.borderColor = "var(--green-500)";
          }}
          onBlur={(e) => {
            e.target.style.borderColor = "var(--border-default)";
          }}
        />
        <button
          onClick={() => ask()}
          disabled={loading || !question.trim()}
          style={{
            position: "absolute",
            right: "8px",
            top: "50%",
            transform: "translateY(-50%)",
            padding: "7px 16px",
            background: loading ? "var(--gray-300)" : "var(--green-500)",
            color: "white",
            border: "none",
            borderRadius: "var(--radius-md)",
            fontSize: "13px",
            fontWeight: "500",
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Running..." : "Ask"}
        </button>
      </div>

      <div style={{ marginBottom: "28px" }}>
        <p
          style={{
            fontSize: "11px",
            fontWeight: "600",
            color: "var(--text-tertiary)",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            marginBottom: "8px",
          }}
        >
          Try asking
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => handleExampleClick(ex)}
              style={{
                padding: "5px 12px",
                background: "var(--bg-subtle)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-full)",
                fontSize: "12px",
                color: "var(--text-secondary)",
                cursor: "pointer",
                fontFamily: "var(--font-sans)",
              }}
              onMouseEnter={(e) => {
                e.target.style.background = "var(--bg-hover)";
                e.target.style.color = "var(--text-primary)";
              }}
              onMouseLeave={(e) => {
                e.target.style.background = "var(--bg-subtle)";
                e.target.style.color = "var(--text-secondary)";
              }}
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div
          style={{
            padding: "12px 16px",
            background: "var(--risk-critical-bg)",
            border: "1px solid var(--risk-critical-border)",
            borderRadius: "var(--radius-md)",
            fontSize: "13px",
            color: "var(--risk-critical-text)",
            marginBottom: "20px",
          }}
        >
          {error}
        </div>
      ) : null}

      {result ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div
            style={{
              padding: "14px 18px",
              background: "var(--green-50)",
              border: "1px solid var(--green-200)",
              borderRadius: "var(--radius-md)",
              borderLeft: "3px solid var(--green-500)",
            }}
          >
            <p style={{ fontSize: "13px", color: "var(--green-700)", margin: 0, lineHeight: "1.5" }}>{result.insight}</p>
          </div>

          <details style={{ cursor: "pointer" }}>
            <summary
              style={{
                fontSize: "11px",
                fontWeight: "600",
                color: "var(--text-tertiary)",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                listStyle: "none",
                userSelect: "none",
              }}
            >
              View generated SQL ({result.row_count} rows)
            </summary>
            <pre
              style={{
                marginTop: "8px",
                padding: "12px 14px",
                background: "var(--gray-800)",
                color: "#e2e8f0",
                borderRadius: "var(--radius-md)",
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
                overflowX: "auto",
                whiteSpace: "pre-wrap",
              }}
            >
              {result.sql}
            </pre>
          </details>

          {result.rows.length > 0 ? (
            <div
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-lg)",
                overflow: "hidden",
              }}
            >
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ background: "var(--bg-subtle)" }}>
                      {result.columns.map((col) => (
                        <th
                          key={col}
                          style={{
                            padding: "10px 16px",
                            textAlign: "left",
                            fontSize: "11px",
                            fontWeight: "600",
                            color: "var(--text-tertiary)",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            fontFamily: "var(--font-mono)",
                            borderBottom: "1px solid var(--border-default)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, i) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? "var(--bg-surface)" : "var(--bg-subtle)" }}>
                        {result.columns.map((col) => (
                          <td
                            key={col}
                            style={{
                              padding: "10px 16px",
                              color: "var(--text-primary)",
                              fontFamily: typeof row[col] === "number" ? "var(--font-mono)" : "var(--font-sans)",
                              borderBottom: "1px solid var(--border-subtle)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {row[col] === null ? "—" : typeof row[col] === "number" ? row[col].toLocaleString() : String(row[col])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p style={{ fontSize: "13px", color: "var(--text-tertiary)", textAlign: "center", padding: "24px" }}>
              No results found for this query.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

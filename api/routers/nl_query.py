"""
nl_query.py
Verdant — Natural Language Query Engine
"""

from __future__ import annotations

import json
import logging
import os
import re

import psycopg2
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from psycopg2.extras import RealDictCursor

from db.connection import get_conn

try:
    import anthropic
except Exception:  # pragma: no cover
    anthropic = None

logger = logging.getLogger(__name__)
router = APIRouter()
ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

DB_SCHEMA = """
You are a SQL expert for the Verdant Scope 3 carbon emissions platform.
Convert the user's natural language question into a PostgreSQL query.

DATABASE SCHEMA:
Table: shipment_silver_summary
  - shipment_id VARCHAR
  - supplier_id VARCHAR
  - sku_id VARCHAR
  - transport_mode VARCHAR
  - weight_kg FLOAT
  - distance_km FLOAT
  - cost_usd FLOAT
  - emissions_kg_co2e FLOAT
  - carbon_intensity FLOAT
  - route_key VARCHAR
  - is_anomaly BOOLEAN
  - event_at TIMESTAMP
  - supplier_country VARCHAR

Table: suppliers
  - supplier_id VARCHAR
  - name VARCHAR
  - country VARCHAR
  - lat FLOAT
  - lng FLOAT
  - tier INT
  - industry VARCHAR

Table: supplier_risk_scores
  - supplier_id VARCHAR
  - risk_score FLOAT
  - risk_tier VARCHAR
  - emissions_30d_kg FLOAT
  - emissions_90d_kg FLOAT
  - emissions_trend VARCHAR
  - model_version VARCHAR

Table: emissions_alerts
  - alert_id UUID
  - alert_type VARCHAR
  - severity VARCHAR
  - supplier_id VARCHAR
  - emissions_kg FLOAT
  - message TEXT
  - created_at TIMESTAMP
  - acknowledged BOOLEAN

RULES:
1. Only generate SELECT queries — never INSERT, UPDATE, DELETE, DROP
2. Always LIMIT results to 50 rows maximum unless user asks for totals/counts
3. Format numbers with 2 decimal places in the query using ROUND()
4. Use NOW() for current time comparisons
5. Return ONLY the SQL query, nothing else
6. If the question cannot be answered with this schema, return:
   SELECT 'I cannot answer that question with the available data' as message
"""


class NLQueryRequest(BaseModel):
    question: str


class NLQueryResponse(BaseModel):
    question: str
    sql: str
    columns: list[str]
    rows: list[dict]
    row_count: int
    insight: str


RELEVANCE_TERMS = {
    "emission",
    "emissions",
    "carbon",
    "co2",
    "co2e",
    "scope 3",
    "supplier",
    "suppliers",
    "shipment",
    "shipments",
    "sku",
    "skus",
    "transport",
    "route",
    "routes",
    "anomaly",
    "anomalies",
    "risk",
    "intensity",
    "country",
    "countries",
    "trend",
    "forecast",
    "mode",
}


def is_relevant_question(question: str) -> bool:
    q = (question or "").lower()
    compact = re.sub(r"[^a-z0-9\s]+", " ", q)
    # Treat obvious in-domain entities as relevant.
    if re.search(r"\bsup-\d+\b|\bsku-\d+\b", q):
        return True
    # Match by key domain terms.
    return any(term in compact for term in RELEVANCE_TERMS)


def generate_sql(question: str) -> str:
    if not ANTHROPIC_KEY or anthropic is None:
        q = question.lower()
        if "worst" in q or "highest" in q or "top" in q:
            return """
                SELECT s.name, r.risk_tier,
                       ROUND(r.emissions_30d_kg::numeric, 0) as emissions_30d_kg,
                       r.emissions_trend
                FROM supplier_risk_scores r
                JOIN suppliers s ON r.supplier_id = s.supplier_id
                ORDER BY r.emissions_30d_kg DESC NULLS LAST
                LIMIT 10
            """
        return """
            SELECT transport_mode,
                   COUNT(*) as shipments,
                   ROUND(SUM(emissions_kg_co2e)::numeric, 0) as total_emissions_kg
            FROM shipment_silver_summary
            GROUP BY transport_mode
            ORDER BY total_emissions_kg DESC
            LIMIT 50
        """

    client = anthropic.Anthropic(api_key=ANTHROPIC_KEY)
    message = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=500,
        messages=[{"role": "user", "content": f"{DB_SCHEMA}\n\nQuestion: {question}"}],
    )
    sql = message.content[0].text.strip()
    return sql.replace("```sql", "").replace("```", "").strip()


def generate_insight(question: str, rows: list[dict]) -> str:
    if not ANTHROPIC_KEY or anthropic is None or not rows:
        return f"Found {len(rows)} results for your query."
    client = anthropic.Anthropic(api_key=ANTHROPIC_KEY)
    summary = json.dumps(rows[:5], default=str)
    message = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=150,
        messages=[
            {
                "role": "user",
                "content": (
                    f"Question: {question}\nData (first 5 rows): {summary}\nTotal rows: {len(rows)}\n\n"
                    "Write ONE sentence summarizing the key insight from this data."
                ),
            }
        ],
    )
    return message.content[0].text.strip()


@router.post("/query", response_model=NLQueryResponse)
async def natural_language_query(request: NLQueryRequest):
    if not request.question or len(request.question.strip()) < 5:
        raise HTTPException(status_code=400, detail="Question too short")
    if len(request.question) > 500:
        raise HTTPException(status_code=400, detail="Question too long (max 500 chars)")
    if not is_relevant_question(request.question):
        return NLQueryResponse(
            question=request.question,
            sql="SELECT 'not relevant question' as message",
            columns=[],
            rows=[],
            row_count=0,
            insight="not relevant question",
        )

    try:
        sql = generate_sql(request.question)
        logger.info("NL query generated SQL")
    except Exception as e:
        logger.error("SQL generation failed: %s", e)
        raise HTTPException(status_code=500, detail="Failed to generate query") from e

    sql_upper = sql.upper().strip()
    if not sql_upper.startswith("SELECT"):
        raise HTTPException(status_code=400, detail="Only SELECT queries are allowed")

    try:
        with get_conn() as conn, conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(sql)
            rows = [dict(row) for row in cur.fetchall()]
            columns = [d[0] for d in cur.description] if cur.description else []
    except psycopg2.Error as e:
        raise HTTPException(status_code=400, detail=f"Query failed: {str(e)[:200]}") from e

    try:
        insight = generate_insight(request.question, rows)
    except Exception:
        insight = f"Found {len(rows)} results."

    return NLQueryResponse(
        question=request.question,
        sql=sql,
        columns=columns,
        rows=rows,
        row_count=len(rows),
        insight=insight,
    )


@router.get("/query/examples")
async def get_example_queries():
    return {
        "examples": [
            "Which suppliers in China are getting worse this month?",
            "What are my top 5 highest-emission transport routes?",
            "Which product categories have the highest carbon intensity?",
            "Show me all CRITICAL risk suppliers and their 30-day emissions",
            "How many anomalies were detected in the last 7 days?",
            "Which country has the most suppliers shipping by air?",
            "What is the average emission per shipment by transport mode?",
            "Which suppliers improved their emissions trend this quarter?",
        ]
    }

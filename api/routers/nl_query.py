"""
nl_query.py
Verdant — Natural Language Query Engine
"""

import os
import json
import logging
import psycopg2
from psycopg2.extras import RealDictCursor
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter()

DB_SCHEMA = """
You are a SQL expert for the Verdant Scope 3 carbon emissions platform.
Convert the user's natural language question into a PostgreSQL query.

DATABASE SCHEMA:

Table: shipment_silver_summary
  - shipment_id, supplier_id, sku_id
  - transport_mode VARCHAR (AIR, OCEAN, TRUCK, RAIL)
  - weight_kg FLOAT, distance_km FLOAT, cost_usd FLOAT
  - emissions_kg_co2e FLOAT, carbon_intensity FLOAT
  - event_at TIMESTAMP, supplier_country VARCHAR
  - supplier_name VARCHAR, product_category VARCHAR

Table: suppliers
  - supplier_id, name, country, lat, lng, tier, industry

Table: supplier_risk_scores
  - supplier_id, risk_score FLOAT (0-1)
  - risk_tier VARCHAR (LOW, MEDIUM, HIGH, CRITICAL)
  - emissions_30d_kg FLOAT, emissions_90d_kg FLOAT
  - emissions_trend VARCHAR (IMPROVING, STABLE, WORSENING)

Table: emissions_alerts
  - alert_type, severity, supplier_id
  - emissions_kg, message, created_at, acknowledged BOOLEAN

RULES:
1. Only generate SELECT queries
2. Always LIMIT to 50 rows max
3. Use ROUND() for numbers
4. Return ONLY the SQL query, nothing else
5. No markdown, no explanation, just SQL
"""


class NLQueryRequest(BaseModel):
    question: str


class NLQueryResponse(BaseModel):
    question: str
    sql: str
    columns: list
    rows: list
    row_count: int
    insight: str


def get_db_conn():
    url = os.environ.get("DATABASE_URL", "")
    if not url:
        raise ValueError("DATABASE_URL not set")
    return psycopg2.connect(url)


def call_claude(prompt: str, max_tokens: int = 500) -> str:
    """
    Call Claude API. Reads key fresh from environment each time.
    Returns empty string if key not set or call fails.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()

    if not api_key:
        logger.warning("ANTHROPIC_API_KEY not set")
        return ""

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)
        message = client.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}]
        )
        result = message.content[0].text.strip()
        logger.info(f"Claude response: {result[:80]}...")
        return result
    except Exception as e:
        logger.error(f"Claude API call failed: {e}")
        return ""


def generate_sql(question: str) -> str:
    """Convert natural language to SQL using Claude."""

    result = call_claude(
        f"{DB_SCHEMA}

Question: {question}",
        max_tokens=500
    )

    if result:
        # Strip any markdown Claude might have added
        sql = result.replace("```sql", "").replace("```", "").strip()
        if sql.upper().startswith("SELECT"):
            return sql

    # Fallback SQL based on keywords
    logger.info("Using fallback SQL")
    q = question.lower()

    if "critical" in q and ("country" in q or "where" in q):
        return """
            SELECT s.country,
                   COUNT(*) as critical_suppliers,
                   ROUND(AVG(r.risk_score)::numeric, 3) as avg_risk_score
            FROM supplier_risk_scores r
            JOIN suppliers s ON r.supplier_id = s.supplier_id
            WHERE r.risk_tier = 'CRITICAL'
            GROUP BY s.country
            ORDER BY critical_suppliers DESC
            LIMIT 15
        """
    if "worst" in q or "highest" in q or "top" in q:
        return """
            SELECT s.name, s.country, r.risk_tier,
                   ROUND(r.emissions_30d_kg::numeric, 0) as emissions_30d_kg,
                   r.emissions_trend
            FROM supplier_risk_scores r
            JOIN suppliers s ON r.supplier_id = s.supplier_id
            ORDER BY r.emissions_30d_kg DESC NULLS LAST
            LIMIT 10
        """
    if "china" in q or "cn" in q:
        return """
            SELECT s.name, r.risk_tier,
                   ROUND(r.emissions_30d_kg::numeric, 0) as emissions_30d_kg,
                   r.emissions_trend
            FROM supplier_risk_scores r
            JOIN suppliers s ON r.supplier_id = s.supplier_id
            WHERE s.country = 'CN'
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
    """


def generate_insight(question: str, rows: list) -> str:
    """Generate a one-sentence insight using Claude."""

    if not rows:
        return "No results found for this query."

    summary = json.dumps(rows[:5], default=str)

    prompt = (
        f"Question asked: {question}
"
        f"Query returned {len(rows)} rows. First 5: {summary}

"
        f"Write exactly ONE sentence summarizing the most important "
        f"insight from this data. Be specific with the actual numbers "
        f"from the data. Do not start with 'The data shows' or "
        f"'Based on'. Start directly with the insight."
    )

    result = call_claude(prompt, max_tokens=120)

    if result:
        return result

    # Fallback
    return f"Found {len(rows)} results matching your query."


@router.post("/query", response_model=NLQueryResponse)
async def natural_language_query(request: NLQueryRequest):
    if not request.question or len(request.question.strip()) < 3:
        raise HTTPException(status_code=400, detail="Question too short")
    if len(request.question) > 500:
        raise HTTPException(status_code=400, detail="Question too long")

    # Generate SQL
    try:
        sql = generate_sql(request.question)
        logger.info(f"SQL: {sql[:100]}")
    except Exception as e:
        raise HTTPException(status_code=500,
            detail=f"SQL generation failed: {e}")

    # Safety check
    if not sql.strip().upper().startswith("SELECT"):
        raise HTTPException(status_code=400,
            detail="Only SELECT queries allowed")

    # Execute
    try:
        conn = get_db_conn()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(sql)
        rows = [dict(r) for r in cur.fetchall()]
        columns = [d[0] for d in cur.description] if cur.description else []
        conn.close()
    except Exception as e:
        raise HTTPException(status_code=400,
            detail=f"Query failed: {str(e)[:200]}")

    # Generate insight
    insight = generate_insight(request.question, rows)

    return NLQueryResponse(
        question=request.question,
        sql=sql,
        columns=columns,
        rows=rows,
        row_count=len(rows),
        insight=insight,
    )


@router.get("/query/examples")
async def get_examples():
    return {"examples": [
        "Which suppliers in China are getting worse this month?",
        "What are my top 5 highest-emission transport routes?",
        "Which product categories have the highest carbon intensity?",
        "Show me all CRITICAL risk suppliers and their 30-day emissions",
        "Which country has the most suppliers shipping by air?",
        "Which suppliers improved their emissions trend this quarter?",
        "What is the average emission per shipment by transport mode?",
        "How many anomalies were detected in the last 7 days?",
    ]}


@router.get("/debug/key-status")
async def key_status():
    key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    return {
        "key_set": bool(key),
        "key_prefix": key[:15] + "..." if key else "not set",
        "key_length": len(key),
    }

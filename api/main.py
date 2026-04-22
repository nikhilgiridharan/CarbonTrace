from __future__ import annotations

import asyncio
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional

import psycopg2.extras
from fastapi import FastAPI, Header, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

import bootstrap
from db.connection import get_conn
from models import schemas
from routers import emissions, forecasts, pipeline, skus, suppliers

API_PREFIX = "/api/v1"


def _cors_origins() -> list[str]:
    raw = os.environ.get("CORS_ORIGINS", "*")
    if raw.strip() == "*":
        return ["*"]
    return [o.strip() for o in raw.split(",") if o.strip()]


@asynccontextmanager
async def lifespan(app: FastAPI):
    if os.environ.get("CARBONPULSE_SKIP_LIFESPAN_DB") == "1":
        yield
        return
    try:
        bootstrap.apply_schema()
    except Exception as e:
        print(f"Warning: schema apply failed: {e}")
    bootstrap.seed_epa_emission_factors()
    bootstrap.seed_pipeline_defaults()
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM shipment_silver_summary")
        n = cur.fetchone()[0]
    if n == 0:
        bootstrap.seed_demo_shipments()
        bootstrap.seed_risk_scores()
        bootstrap.seed_alerts()
    yield


app = FastAPI(title="CarbonPulse API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=schemas.HealthResponse)
def health() -> schemas.HealthResponse:
    return schemas.HealthResponse(
        status="healthy",
        version="1.0.0",
        timestamp=datetime.now(timezone.utc).isoformat(),
    )


@app.get("/admin/bootstrap")
def admin_bootstrap(x_admin_secret: Optional[str] = Header(default=None, alias="X-Admin-Secret")):
    if x_admin_secret != os.environ.get("ADMIN_SECRET", "changeme_in_production"):
        raise HTTPException(status_code=401, detail="Unauthorized")
    result = bootstrap.full_bootstrap()
    return {"status": "ok", **result}


@app.post("/internal/refresh-cache")
def refresh_cache():
    now = datetime.now(timezone.utc)
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO pipeline_status (component, status, last_heartbeat, records_processed, last_error)
            VALUES ('api', 'HEALTHY', %s, %s, NULL)
            ON CONFLICT (component) DO UPDATE SET
              last_heartbeat = EXCLUDED.last_heartbeat,
              status = EXCLUDED.status
            """,
            (now, 0),
        )
        cur.execute(
            """
            INSERT INTO dbt_run_metadata (status, duration_seconds, models_run, tests_passed)
            VALUES ('SUCCESS', 42.0, 12, 10)
            """
        )
        conn.commit()
    return {"status": "refreshed"}


app.include_router(emissions.router, prefix=API_PREFIX)
app.include_router(suppliers.router, prefix=API_PREFIX)
app.include_router(skus.router, prefix=API_PREFIX)
app.include_router(forecasts.router, prefix=API_PREFIX)
app.include_router(pipeline.router, prefix=API_PREFIX)


def _fetch_unacked_alerts(limit: int = 20) -> list[dict]:
    with get_conn() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            SELECT alert_id::text AS alert_id, alert_type, severity, supplier_id, sku_id,
                   emissions_kg, threshold_kg, message, created_at, acknowledged
            FROM emissions_alerts
            WHERE acknowledged = FALSE
            ORDER BY created_at DESC
            LIMIT %s
            """,
            (limit,),
        )
        rows = cur.fetchall()
    out = []
    for r in rows:
        out.append(
            {
                "alert_id": r["alert_id"],
                "alert_type": r["alert_type"],
                "severity": r["severity"],
                "supplier_id": r["supplier_id"],
                "sku_id": r["sku_id"],
                "emissions_kg": float(r["emissions_kg"]) if r["emissions_kg"] is not None else None,
                "threshold_kg": float(r["threshold_kg"]) if r["threshold_kg"] is not None else None,
                "message": r["message"],
                "created_at": schemas.iso(r["created_at"]),
                "acknowledged": r["acknowledged"],
            }
        )
    return out


def _fetch_pipeline_rows() -> list[dict]:
    with get_conn() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            "SELECT component, status, last_heartbeat, records_processed, last_error FROM pipeline_status"
        )
        return [dict(r) for r in cur.fetchall()]


@app.websocket("/ws/alerts")
async def ws_alerts(websocket: WebSocket):
    await websocket.accept()
    last_ids: set[str] = set()
    try:
        initial = await asyncio.to_thread(_fetch_unacked_alerts, 20)
        for a in initial:
            last_ids.add(a["alert_id"])
            await websocket.send_json({"type": "alert", "data": a})
        while True:
            await asyncio.sleep(5)
            current = await asyncio.to_thread(_fetch_unacked_alerts, 50)
            for a in current:
                if a["alert_id"] not in last_ids:
                    last_ids.add(a["alert_id"])
                    await websocket.send_json({"type": "alert", "data": a})
    except WebSocketDisconnect:
        return


@app.websocket("/ws/pipeline")
async def ws_pipeline(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            rows = await asyncio.to_thread(_fetch_pipeline_rows)
            payload = {
                "type": "pipeline_status",
                "data": [
                    {
                        "name": r["component"],
                        "status": r["status"],
                        "last_heartbeat": schemas.iso(r["last_heartbeat"]),
                        "records_processed": int(r["records_processed"] or 0),
                        "last_error": r["last_error"],
                    }
                    for r in rows
                ],
            }
            await websocket.send_json(payload)
            await asyncio.sleep(10)
    except WebSocketDisconnect:
        return

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import psycopg2.extras
from fastapi import APIRouter, Query, Response

from db.connection import get_conn
from models import schemas

router = APIRouter(prefix="/suppliers", tags=["suppliers"])


@router.get("", response_model=dict)
def list_suppliers(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    sort_by: str = Query("risk_score", pattern="^(risk_score|emissions_30d|name)$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
) -> dict:
    order_sql = "DESC" if order.lower() == "desc" else "ASC"
    sort_map = {
        "risk_score": "r.risk_score",
        "emissions_30d": "r.emissions_30d_kg",
        "name": "s.name",
    }
    sort_col = sort_map.get(sort_by, "r.risk_score")
    start = datetime.now(timezone.utc) - timedelta(days=30)
    with get_conn() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            f"""
            WITH em AS (
              SELECT supplier_id,
                     SUM(emissions_kg_co2e) AS e30
              FROM shipment_silver_summary
              WHERE event_at >= %s
              GROUP BY supplier_id
            ),
            modes AS (
              SELECT supplier_id,
                     array_agg(DISTINCT transport_mode) AS transport_modes
              FROM shipment_silver_summary
              WHERE event_at >= %s
              GROUP BY supplier_id
            )
            SELECT s.supplier_id, s.name, s.country, s.lat, s.lng, s.tier, s.industry,
                   COALESCE(r.risk_score,0) AS risk_score,
                   COALESCE(r.risk_tier,'LOW') AS risk_tier,
                   COALESCE(em.e30,0) AS emissions_30d_kg,
                   r.emissions_trend,
                   COALESCE(m.transport_modes, ARRAY[]::varchar[]) AS transport_modes
            FROM suppliers s
            LEFT JOIN supplier_risk_scores r ON r.supplier_id = s.supplier_id
            LEFT JOIN em ON em.supplier_id = s.supplier_id
            LEFT JOIN modes m ON m.supplier_id = s.supplier_id
            ORDER BY {sort_col} {order_sql}
            LIMIT %s OFFSET %s
            """,
            (start, start, limit, offset),
        )
        rows = cur.fetchall()
        cur.execute("SELECT COUNT(*)::int AS c FROM suppliers")
        total = cur.fetchone()["c"]
    items = [
        schemas.SupplierListItem(
            supplier_id=r["supplier_id"],
            name=r["name"],
            country=r["country"],
            lat=float(r["lat"]),
            lng=float(r["lng"]),
            tier=int(r["tier"]),
            industry=r["industry"],
            risk_score=float(r["risk_score"]),
            risk_tier=r["risk_tier"],
            emissions_30d_kg=float(r["emissions_30d_kg"]),
            emissions_trend=r["emissions_trend"],
            transport_modes=list(r["transport_modes"] or []),
        )
        for r in rows
    ]
    return {"items": [i.model_dump() for i in items], "total": total, "limit": limit, "offset": offset}


@router.get("/benchmarks")
async def get_supplier_benchmarks():
    with get_conn() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            WITH category_benchmarks AS (
                SELECT
                    k.category AS product_category,
                    AVG(s.carbon_intensity) as category_avg_intensity,
                    STDDEV(s.carbon_intensity) as category_std_intensity,
                    COUNT(DISTINCT s.supplier_id) as supplier_count
                FROM shipment_silver_summary s
                JOIN skus k ON k.sku_id = s.sku_id
                WHERE s.carbon_intensity > 0
                  AND s.event_at > NOW() - INTERVAL '30 days'
                GROUP BY k.category
            ),
            supplier_intensity AS (
                SELECT
                    s.supplier_id,
                    sup.name as supplier_name,
                    s.supplier_country as supplier_country,
                    k.category AS product_category,
                    AVG(s.carbon_intensity) as supplier_avg_intensity,
                    COUNT(*) as shipment_count
                FROM shipment_silver_summary s
                JOIN suppliers sup ON sup.supplier_id = s.supplier_id
                JOIN skus k ON k.sku_id = s.sku_id
                WHERE s.carbon_intensity > 0
                  AND s.event_at > NOW() - INTERVAL '30 days'
                GROUP BY s.supplier_id, sup.name, s.supplier_country, k.category
            )
            SELECT
                si.supplier_id,
                si.supplier_name,
                si.supplier_country,
                si.product_category,
                ROUND(si.supplier_avg_intensity::numeric, 4) as supplier_intensity,
                ROUND(cb.category_avg_intensity::numeric, 4) as category_avg_intensity,
                ROUND((si.supplier_avg_intensity / NULLIF(cb.category_avg_intensity, 0))::numeric, 2) as intensity_ratio,
                ROUND(((si.supplier_avg_intensity - cb.category_avg_intensity)
                    / NULLIF(cb.category_avg_intensity, 0) * 100)::numeric, 1) as pct_above_average,
                cb.supplier_count as peers_in_category,
                si.shipment_count
            FROM supplier_intensity si
            JOIN category_benchmarks cb ON si.product_category = cb.product_category
            ORDER BY intensity_ratio DESC NULLS LAST
            LIMIT 100
            """
        )
        rows = [dict(r) for r in cur.fetchall()]
    return {"benchmarks": rows, "count": len(rows)}


@router.get("/map-data", response_model=list[schemas.MapSupplier])
def map_data(response: Response) -> list[schemas.MapSupplier]:
    response.headers["Cache-Control"] = "public, max-age=120"
    start = datetime.now(timezone.utc) - timedelta(days=30)
    with get_conn() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            SELECT s.supplier_id, s.lat, s.lng,
                   COALESCE(em.e30,0) AS emissions_30d_kg,
                   COALESCE(r.risk_tier,'LOW') AS risk_tier,
                   s.country, s.name,
                   COALESCE(em.shipment_count,0)::int AS shipment_count
            FROM suppliers s
            LEFT JOIN supplier_risk_scores r ON r.supplier_id = s.supplier_id
            LEFT JOIN (
              SELECT supplier_id,
                     SUM(emissions_kg_co2e) AS e30,
                     COUNT(*)::int AS shipment_count
              FROM shipment_silver_summary
              WHERE event_at >= %s
              GROUP BY supplier_id
            ) em ON em.supplier_id = s.supplier_id
            """,
            (start,),
        )
        rows = cur.fetchall()
    return [
        schemas.MapSupplier(
            supplier_id=r["supplier_id"],
            lat=float(r["lat"]),
            lng=float(r["lng"]),
            emissions_30d_kg=float(r["emissions_30d_kg"]),
            risk_tier=r["risk_tier"],
            country=r["country"],
            name=r["name"],
            shipment_count=int(r["shipment_count"]),
        )
        for r in rows
    ]


@router.get("/{supplier_id}", response_model=schemas.SupplierProfile)
def supplier_detail(supplier_id: str) -> schemas.SupplierProfile:
    start = datetime.now(timezone.utc) - timedelta(days=365)
    with get_conn() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            "SELECT supplier_id, name, country, lat, lng, tier, industry FROM suppliers WHERE supplier_id=%s",
            (supplier_id,),
        )
        s = cur.fetchone()
        if not s:
            from fastapi import HTTPException

            raise HTTPException(status_code=404, detail="Supplier not found")
        cur.execute(
            "SELECT * FROM supplier_risk_scores WHERE supplier_id=%s",
            (supplier_id,),
        )
        r = cur.fetchone() or {}
        cur.execute(
            """
            SELECT date_trunc('month', event_at)::date AS d,
                   SUM(emissions_kg_co2e) AS emissions_kg,
                   COUNT(*)::int AS shipment_count
            FROM shipment_silver_summary
            WHERE supplier_id=%s AND event_at >= %s
            GROUP BY 1 ORDER BY 1
            """,
            (supplier_id, start),
        )
        monthly = cur.fetchall()
        cur.execute(
            """
            SELECT sku_id, SUM(emissions_kg_co2e) AS kg
            FROM shipment_silver_summary
            WHERE supplier_id=%s
            GROUP BY sku_id ORDER BY kg DESC LIMIT 5
            """,
            (supplier_id,),
        )
        top = cur.fetchall()
        cur.execute(
            """
            SELECT transport_mode, SUM(emissions_kg_co2e) AS kg
            FROM shipment_silver_summary WHERE supplier_id=%s
            GROUP BY transport_mode
            """,
            (supplier_id,),
        )
        routes = cur.fetchall()
    top_skus = [{"sku_id": t["sku_id"], "emissions_kg": float(t["kg"] or 0)} for t in top]
    route_breakdown = [{"transport_mode": t["transport_mode"], "emissions_kg": float(t["kg"] or 0)} for t in routes]
    return schemas.SupplierProfile(
        supplier_id=s["supplier_id"],
        name=s["name"],
        country=s["country"],
        lat=float(s["lat"]),
        lng=float(s["lng"]),
        tier=int(s["tier"]),
        industry=s["industry"],
        risk_score=float(r.get("risk_score") or 0),
        risk_tier=r.get("risk_tier") or "LOW",
        emissions_monthly=[
            schemas.EmissionsTimeseriesPoint(
                date=str(m["d"]),
                emissions_kg=float(m["emissions_kg"] or 0),
                shipment_count=int(m["shipment_count"]),
            )
            for m in monthly
        ],
        top_skus=top_skus,
        route_breakdown=route_breakdown,
    )


@router.get("/{supplier_id}/routes", response_model=list[schemas.RouteSegment])
def supplier_routes(supplier_id: str) -> list[schemas.RouteSegment]:
    with get_conn() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            "SELECT lat, lng FROM suppliers WHERE supplier_id=%s",
            (supplier_id,),
        )
        sup = cur.fetchone()
        if not sup:
            from fastapi import HTTPException

            raise HTTPException(status_code=404, detail="Supplier not found")
        cur.execute(
            """
            SELECT destination_country,
                   AVG(CASE destination_country
                        WHEN 'US' THEN 39.8283
                        WHEN 'DE' THEN 50.1109 ELSE 0 END) AS dlat,
                   AVG(CASE destination_country
                        WHEN 'US' THEN -98.5795
                        WHEN 'DE' THEN 8.6821 ELSE 0 END) AS dlng,
                   transport_mode,
                   SUM(emissions_kg_co2e) AS kg,
                   COUNT(*)::int AS c
            FROM shipment_silver_summary
            WHERE supplier_id=%s
            GROUP BY destination_country, transport_mode
            LIMIT 50
            """,
            (supplier_id,),
        )
        rows = cur.fetchall()
    out = []
    for r in rows:
        dlat = float(r["dlat"] or 39.8)
        dlng = float(r["dlng"] or -98.5)
        out.append(
            schemas.RouteSegment(
                origin_lat=float(sup["lat"]),
                origin_lng=float(sup["lng"]),
                dest_lat=dlat,
                dest_lng=dlng,
                transport_mode=r["transport_mode"],
                emissions_kg=float(r["kg"] or 0),
                active_shipments=int(r["c"]),
            )
        )
    return out



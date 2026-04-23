from __future__ import annotations

from datetime import datetime, timedelta, timezone

import psycopg2.extras
from fastapi import APIRouter, HTTPException, Query, Response

from db.connection import get_conn
from db.queries import granularity_sql, window_start
from models import schemas

router = APIRouter(prefix="/emissions", tags=["emissions"])


@router.get("/summary", response_model=schemas.EmissionsSummary)
def emissions_summary(response: Response) -> schemas.EmissionsSummary:
    response.headers["Cache-Control"] = "public, max-age=60"
    now = datetime.now(timezone.utc)
    y_start = datetime(now.year, 1, 1, tzinfo=timezone.utc)
    m_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    yoy_start = y_start - timedelta(days=365)
    yoy_end = m_start - timedelta(days=365)
    with get_conn() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            SELECT
              COALESCE(SUM(emissions_kg_co2e) FILTER (WHERE event_at >= %(y_start)s), 0) AS ytd_kg,
              COALESCE(SUM(emissions_kg_co2e) FILTER (WHERE event_at >= %(m_start)s), 0) AS mtd_kg,
              COUNT(*) FILTER (WHERE event_at >= %(d90)s)::int AS shipments_90d,
              COUNT(DISTINCT supplier_id) FILTER (WHERE event_at >= %(d90)s)::int AS suppliers_90d,
              COALESCE(AVG(NULLIF(carbon_intensity, 0)) FILTER (WHERE event_at >= %(d90)s), 0) AS avg_intensity_90d,
              COALESCE(
                SUM(emissions_kg_co2e) FILTER (WHERE event_at >= %(yoy_start)s AND event_at < %(yoy_end)s),
                0
              ) AS yoy_prev_kg,
              COALESCE(
                SUM(emissions_kg_co2e) FILTER (WHERE event_at >= %(y_start)s AND event_at < %(m_start)s),
                0
              ) AS yoy_curr_window_kg
            FROM shipment_silver_summary
            """,
            {
                "y_start": y_start,
                "m_start": m_start,
                "d90": now - timedelta(days=90),
                "yoy_start": yoy_start,
                "yoy_end": yoy_end,
            },
        )
        row = cur.fetchone()
        ytd = float(row["ytd_kg"] or 0)
        mtd = float(row["mtd_kg"] or 0)
        yoy_prev = float(row["yoy_prev_kg"] or 0)
        yoy_curr_window = float(row["yoy_curr_window_kg"] or 0)
    yoy_change = 0.0
    if yoy_prev > 0:
        yoy_change = (yoy_curr_window - yoy_prev) / yoy_prev * 100.0
    return schemas.EmissionsSummary(
        total_co2_ytd_kg=ytd,
        total_co2_mtd_kg=mtd,
        total_shipments=int(row["shipments_90d"] or 0),
        active_suppliers=int(row["suppliers_90d"] or 0),
        avg_carbon_intensity=float(row["avg_intensity_90d"] or 0),
        yoy_change_pct=yoy_change,
    )


@router.get("/timeseries", response_model=list[schemas.EmissionsTimeseriesPoint])
def emissions_timeseries(
    granularity: str = Query("day", pattern="^(day|week|month)$"),
    days: int = Query(90, ge=1, le=730),
) -> list[schemas.EmissionsTimeseriesPoint]:
    start = window_start(days)
    trunc = granularity_sql(granularity)
    with get_conn() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            SELECT date_trunc(%s, event_at AT TIME ZONE 'UTC')::date AS d,
                   SUM(emissions_kg_co2e) AS emissions_kg,
                   COUNT(*)::int AS shipment_count
            FROM shipment_silver_summary
            WHERE event_at >= %s
            GROUP BY 1 ORDER BY 1
            """,
            (trunc, start),
        )
        rows = cur.fetchall()
    return [
        schemas.EmissionsTimeseriesPoint(
            date=str(r["d"]),
            emissions_kg=float(r["emissions_kg"] or 0),
            shipment_count=int(r["shipment_count"]),
        )
        for r in rows
    ]


@router.get("/by-transport-mode", response_model=list[schemas.TransportModeSlice])
def by_transport_mode(days: int = Query(90, ge=1, le=365)) -> list[schemas.TransportModeSlice]:
    start = window_start(days)
    with get_conn() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            SELECT transport_mode, SUM(emissions_kg_co2e) AS kg
            FROM shipment_silver_summary WHERE event_at >= %s
            GROUP BY transport_mode
            """,
            (start,),
        )
        rows = cur.fetchall()
    total = sum(float(r["kg"] or 0) for r in rows) or 1.0
    return [
        schemas.TransportModeSlice(
            mode=r["transport_mode"],
            emissions_kg=float(r["kg"] or 0),
            pct_of_total=float(r["kg"] or 0) / total * 100.0,
        )
        for r in rows
    ]


@router.get("/by-country", response_model=list[schemas.CountryEmissions])
def by_country(days: int = Query(90, ge=1, le=365)) -> list[schemas.CountryEmissions]:
    start = window_start(days)
    with get_conn() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            SELECT s.supplier_country AS country,
                   AVG(sup.lat)::float AS lat,
                   AVG(sup.lng)::float AS lng,
                   SUM(s.emissions_kg_co2e) AS emissions_kg,
                   COUNT(DISTINCT s.supplier_id)::int AS supplier_count
            FROM shipment_silver_summary s
            JOIN suppliers sup ON sup.supplier_id = s.supplier_id
            WHERE s.event_at >= %s AND s.supplier_country IS NOT NULL
            GROUP BY s.supplier_country
            ORDER BY emissions_kg DESC
            """,
            (start,),
        )
        rows = cur.fetchall()
    return [
        schemas.CountryEmissions(
            country=r["country"],
            lat=float(r["lat"] or 0),
            lng=float(r["lng"] or 0),
            emissions_kg=float(r["emissions_kg"] or 0),
            supplier_count=int(r["supplier_count"]),
        )
        for r in rows
    ]


@router.get("/supplier/{supplier_id}", response_model=schemas.SupplierEmissionsDetail)
def supplier_emissions(supplier_id: str, days: int = 30) -> schemas.SupplierEmissionsDetail:
    start = window_start(days)
    with get_conn() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            SELECT COALESCE(SUM(emissions_kg_co2e),0) AS total, COUNT(*)::int AS c
            FROM shipment_silver_summary WHERE supplier_id=%s AND event_at >= %s
            """,
            (supplier_id, start),
        )
        agg = cur.fetchone()
        cur.execute(
            """
            SELECT transport_mode, SUM(emissions_kg_co2e) AS kg
            FROM shipment_silver_summary WHERE supplier_id=%s AND event_at >= %s
            GROUP BY transport_mode
            """,
            (supplier_id, start),
        )
        modes = cur.fetchall()
        total_m = sum(float(r["kg"] or 0) for r in modes) or 1.0
        cur.execute(
            """
            SELECT date_trunc('day', event_at)::date AS d,
                   SUM(emissions_kg_co2e) AS emissions_kg,
                   COUNT(*)::int AS shipment_count
            FROM shipment_silver_summary
            WHERE supplier_id=%s AND event_at >= %s
            GROUP BY 1 ORDER BY 1
            """,
            (supplier_id, start),
        )
        ts = cur.fetchall()
    return schemas.SupplierEmissionsDetail(
        supplier_id=supplier_id,
        days=days,
        total_emissions_kg=float(agg["total"]),
        shipment_count=int(agg["c"]),
        by_mode=[
            schemas.TransportModeSlice(
                mode=r["transport_mode"],
                emissions_kg=float(r["kg"] or 0),
                pct_of_total=float(r["kg"] or 0) / total_m * 100.0,
            )
            for r in modes
        ],
        timeseries=[
            schemas.EmissionsTimeseriesPoint(
                date=str(r["d"]),
                emissions_kg=float(r["emissions_kg"] or 0),
                shipment_count=int(r["shipment_count"]),
            )
            for r in ts
        ],
    )


@router.get("/sku/{sku_id}", response_model=schemas.SkuEmissionsDetail)
def sku_emissions(sku_id: str) -> schemas.SkuEmissionsDetail:
    with get_conn() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT name, category FROM skus WHERE sku_id=%s", (sku_id,))
        meta = cur.fetchone()
        cur.execute(
            """
            SELECT supplier_id, SUM(emissions_kg_co2e) AS kg
            FROM shipment_silver_summary WHERE sku_id=%s
            GROUP BY supplier_id ORDER BY kg DESC LIMIT 10
            """,
            (sku_id,),
        )
        sups = cur.fetchall()
        cur.execute(
            "SELECT COALESCE(SUM(emissions_kg_co2e),0) FROM shipment_silver_summary WHERE sku_id=%s",
            (sku_id,),
        )
        total = float(cur.fetchone()["coalesce"])
    suppliers = [{"supplier_id": r["supplier_id"], "emissions_kg": float(r["kg"] or 0)} for r in sups]
    return schemas.SkuEmissionsDetail(
        sku_id=sku_id,
        sku_name=meta["name"] if meta else None,
        product_category=meta["category"] if meta else None,
        total_emissions_kg=total,
        suppliers=suppliers,
    )


@router.get("/decarbonization-pathway")
async def get_decarbonization_pathway(target_reduction_pct: float = 30.0):
    if not (1 <= target_reduction_pct <= 90):
        raise HTTPException(status_code=400, detail="target_reduction_pct must be between 1 and 90")

    EPA_FACTORS = {"AIR": 0.5474, "OCEAN": 0.0233, "TRUCK": 0.0920, "RAIL": 0.0077}
    with get_conn() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            SELECT SUM(emissions_kg_co2e) as total_emissions
            FROM shipment_silver_summary
            WHERE event_at > NOW() - INTERVAL '30 days'
            """
        )
        baseline = float((cur.fetchone() or {}).get("total_emissions") or 0)
        target_savings = baseline * (target_reduction_pct / 100)
        cur.execute(
            """
            SELECT
                s.supplier_id,
                s.name as supplier_name,
                s.country,
                ss.transport_mode,
                SUM(ss.emissions_kg_co2e) as mode_emissions,
                AVG(ss.weight_kg) as avg_weight_kg,
                AVG(ss.distance_km) as avg_distance_km,
                COUNT(*) as shipment_count
            FROM shipment_silver_summary ss
            JOIN suppliers s ON ss.supplier_id = s.supplier_id
            WHERE ss.event_at > NOW() - INTERVAL '30 days'
              AND ss.transport_mode = 'AIR'
            GROUP BY s.supplier_id, s.name, s.country, ss.transport_mode
            ORDER BY mode_emissions DESC
            LIMIT 50
            """
        )
        air_suppliers = [dict(r) for r in cur.fetchall()]

    recommendations = []
    for sup in air_suppliers:
        air_emissions = float(sup["mode_emissions"] or 0)
        avg_w = float(sup["avg_weight_kg"] or 1000)
        avg_d = float(sup["avg_distance_km"] or 10000)
        ocean_emissions = (avg_w / 1000) * avg_d * EPA_FACTORS["OCEAN"] * int(sup["shipment_count"])
        savings = air_emissions - ocean_emissions
        savings_pct = (savings / air_emissions * 100) if air_emissions > 0 else 0
        if savings > 0:
            recommendations.append(
                {
                    "rank": 0,
                    "supplier_id": sup["supplier_id"],
                    "supplier_name": sup["supplier_name"],
                    "country": sup["country"],
                    "action": "Switch AIR to OCEAN",
                    "current_mode": "AIR",
                    "recommended_mode": "OCEAN",
                    "current_emissions_kg": round(air_emissions, 1),
                    "projected_emissions_kg": round(ocean_emissions, 1),
                    "savings_kg": round(savings, 1),
                    "savings_pct": round(savings_pct, 1),
                    "shipment_count": sup["shipment_count"],
                    "difficulty": "LOW" if sup["country"] in ["CN", "VN", "JP", "KR"] else "MEDIUM",
                }
            )

    recommendations.sort(key=lambda x: x["savings_kg"], reverse=True)
    cumulative = 0.0
    selected = []
    for i, rec in enumerate(recommendations):
        rec["rank"] = i + 1
        rec["cumulative_savings_kg"] = round(cumulative + rec["savings_kg"], 1)
        rec["cumulative_pct"] = round(((cumulative + rec["savings_kg"]) / baseline) * 100, 1) if baseline > 0 else 0
        rec["target_met"] = (cumulative + rec["savings_kg"]) >= target_savings
        cumulative += rec["savings_kg"]
        selected.append(rec)
        if cumulative >= target_savings:
            break

    return {
        "baseline_emissions_kg": round(baseline, 1),
        "target_reduction_pct": target_reduction_pct,
        "target_savings_kg": round(target_savings, 1),
        "achievable": cumulative >= target_savings,
        "total_achievable_savings_kg": round(cumulative, 1),
        "actions_required": len(selected),
        "pathway": selected,
    }


@router.get("/by-country-detailed")
async def get_emissions_by_country_detailed():
    with get_conn() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            SELECT
                supplier_country as country,
                COUNT(DISTINCT supplier_id) as supplier_count,
                COUNT(*) as shipment_count,
                ROUND(SUM(emissions_kg_co2e)::numeric, 0) as total_emissions_kg,
                ROUND(AVG(carbon_intensity)::numeric, 4) as avg_carbon_intensity,
                ROUND(
                    SUM(emissions_kg_co2e)::numeric /
                    NULLIF(COUNT(DISTINCT supplier_id), 0), 0
                ) as emissions_per_supplier
            FROM shipment_silver_summary
            WHERE event_at > NOW() - INTERVAL '30 days'
              AND supplier_country IS NOT NULL
            GROUP BY supplier_country
            ORDER BY total_emissions_kg DESC
            """
        )
        rows = [dict(r) for r in cur.fetchall()]
    return {"countries": rows}

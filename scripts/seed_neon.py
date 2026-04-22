#!/usr/bin/env python3
"""
Neon PostgreSQL full demo seed.

Applies api/db/schema.sql, loads CSV seeds, generates synthetic shipments,
computes risk scores and SKU summaries, inserts sample alerts and pipeline rows.
"""

from __future__ import annotations

import csv
import hashlib
import os
import random
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import psycopg2
import psycopg2.extras

REPO_ROOT = Path(__file__).resolve().parents[1]
SCHEMA_SQL = REPO_ROOT / "api" / "db" / "schema.sql"
SUPPLIERS_CSV = REPO_ROOT / "warehouse" / "dbt_project" / "seeds" / "suppliers.csv"
EPA_CSV = REPO_ROOT / "warehouse" / "dbt_project" / "seeds" / "epa_emission_factors.csv"

SHIPMENT_TARGET = 50_000
SKU_COUNT = 2000
ALERT_COUNT = 15

# EPA v1.4.0 derived kg CO2e per tonne-km (primary NAICS per mode)
FACTOR_KG_PER_TONNE_KM = {"AIR": 0.5474, "OCEAN": 0.0233, "TRUCK": 0.0920, "RAIL": 0.0077}

PIPELINE_COMPONENTS = [
    "kafka-producer",
    "spark-bronze",
    "spark-silver",
    "dbt-staging",
    "dbt-marts",
    "dbt-tests",
    "ge-checks",
    "api",
]

CATEGORIES = [
    "Electronics",
    "Apparel",
    "Auto Parts",
    "Food & Beverage",
    "Chemicals",
    "Machinery",
    "Packaging",
    "Metals",
]


def get_conn():
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL is not set")
    return psycopg2.connect(url)


def risk_from_id(supplier_id: str) -> tuple[float, str]:
    score = int(hashlib.md5(supplier_id.encode(), usedforsecurity=False).hexdigest()[:4], 16) / 65535.0
    if score < 0.3:
        tier = "LOW"
    elif score < 0.6:
        tier = "MEDIUM"
    elif score < 0.85:
        tier = "HIGH"
    else:
        tier = "CRITICAL"
    return round(score, 3), tier


def apply_schema(conn) -> None:
    sql = SCHEMA_SQL.read_text(encoding="utf-8")
    conn.autocommit = True
    with conn.cursor() as cur:
        cur.execute(sql)
    conn.autocommit = False


def clear_demo_tables(conn) -> None:
    with conn.cursor() as cur:
        cur.execute("DELETE FROM sku_emissions_summary")
        cur.execute("DELETE FROM shipment_silver_summary")
        cur.execute("DELETE FROM supplier_risk_scores")
        cur.execute("DELETE FROM emissions_alerts")
        cur.execute("DELETE FROM skus")
        cur.execute("DELETE FROM suppliers")
        cur.execute("DELETE FROM epa_emission_factors")
        cur.execute("DELETE FROM pipeline_status")
    conn.commit()


def seed_suppliers(conn) -> int:
    rows = []
    with SUPPLIERS_CSV.open(encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            rows.append(
                (
                    r["supplier_id"].strip(),
                    r["name"].strip(),
                    r["country"].strip(),
                    float(r["lat"]),
                    float(r["lng"]),
                    int(r["tier"]),
                    (r.get("industry") or "").strip() or None,
                )
            )
    with conn.cursor() as cur:
        psycopg2.extras.execute_batch(
            cur,
            """
            INSERT INTO suppliers (supplier_id, name, country, lat, lng, tier, industry)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            rows,
            page_size=200,
        )
    conn.commit()
    return len(rows)


def seed_skus(conn) -> int:
    try:
        from faker import Faker

        fake = Faker()
        fake.seed_instance(42)
    except Exception:  # pragma: no cover
        fake = None

    rows = []
    for i in range(1, SKU_COUNT + 1):
        sku_id = f"SKU-{i:05d}"
        if fake:
            name = fake.catch_phrase()[:120]
        else:
            name = f"Product {i}"
        cat = CATEGORIES[i % len(CATEGORIES)]
        hs = f"{80000000 + (i * 7919) % 10000000:08d}"[:8]
        rows.append((sku_id, name, cat, hs))
    with conn.cursor() as cur:
        psycopg2.extras.execute_batch(
            cur,
            "INSERT INTO skus (sku_id, name, category, hs_code) VALUES (%s, %s, %s, %s)",
            rows,
            page_size=500,
        )
    conn.commit()
    return len(rows)


def seed_epa(conn) -> int:
    rows = []
    with EPA_CSV.open(encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            rows.append(
                (
                    r["transport_mode"].strip(),
                    int(r["naics_code"]),
                    r["naics_title"].strip(),
                    r["epa_version"].strip(),
                    int(r["ghg_data_year"]),
                    int(r["dollar_year"]),
                    r["gwp_standard"].strip(),
                    float(r["sef_without_margins"]),
                    float(r["margins_sef"]),
                    float(r["sef_with_margins"]),
                    float(r["cost_usd_per_tonne_km"]),
                    float(r["kg_co2e_per_tonne_km"]),
                    r["source"].strip(),
                )
            )
    with conn.cursor() as cur:
        psycopg2.extras.execute_batch(
            cur,
            """
            INSERT INTO epa_emission_factors (
                transport_mode, naics_code, naics_title, epa_version, ghg_data_year, dollar_year,
                gwp_standard, sef_without_margins, margins_sef, sef_with_margins,
                cost_usd_per_tonne_km, kg_co2e_per_tonne_km, source
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """,
            rows,
            page_size=50,
        )
    conn.commit()
    return len(rows)


def seed_shipments(conn, supplier_ids: list[str], sku_ids: list[str]) -> int:
    modes = list(FACTOR_KG_PER_TONNE_KM.keys())
    now = datetime.now(timezone.utc)
    random.seed(42)
    with conn.cursor() as cur:
        cur.execute("SELECT supplier_id, country FROM suppliers")
        country_by_sup = {r[0]: r[1] for r in cur.fetchall()}
    insert_sql = """
        INSERT INTO shipment_silver_summary (
            shipment_id, supplier_id, sku_id, event_at, weight_kg, distance_km,
            cost_usd, emissions_kg_co2e, carbon_intensity, transport_mode, route_key,
            is_anomaly, supplier_country, destination_country, processing_timestamp,
            ingestion_timestamp, emissions_factor_version, emissions_dollar_year,
            emissions_factor_per_tonne_km
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
    """
    batch: list = []
    with conn.cursor() as cur:
        for _ in range(SHIPMENT_TARGET):
            sid = random.choice(supplier_ids)
            sku = random.choice(sku_ids)
            mode = random.choice(modes)
            fk = FACTOR_KG_PER_TONNE_KM[mode]
            weight = max(0.5, random.lognormvariate(3, 1))
            distance = max(50.0, random.uniform(200, 12000))
            emissions = (weight / 1000.0) * distance * fk
            intensity = emissions / weight if weight else 0.0
            evt = now - timedelta(hours=random.randint(0, 24 * 365))
            country = country_by_sup.get(sid, "US")
            batch.append(
                (
                    str(uuid.uuid4()),
                    sid,
                    sku,
                    evt,
                    weight,
                    distance,
                    random.uniform(50, 5000),
                    emissions,
                    intensity,
                    mode,
                    f"{country}_US_{mode}",
                    random.random() < 0.02,
                    country,
                    "US",
                    now,
                    now,
                    "v1.4.0",
                    "2024",
                    fk,
                )
            )
            if len(batch) >= 2000:
                psycopg2.extras.execute_batch(cur, insert_sql, batch, page_size=500)
                conn.commit()
                batch = []
        if batch:
            psycopg2.extras.execute_batch(cur, insert_sql, batch, page_size=500)
            conn.commit()
    return SHIPMENT_TARGET


def seed_supplier_risk_scores(conn) -> int:
    with conn.cursor() as cur:
        cur.execute(
            """
            WITH agg AS (
                SELECT
                    supplier_id,
                    COALESCE(SUM(CASE WHEN event_at >= NOW() - INTERVAL '30 days'
                        THEN emissions_kg_co2e ELSE 0 END), 0)::float AS e30,
                    COALESCE(SUM(CASE WHEN event_at >= NOW() - INTERVAL '90 days'
                        THEN emissions_kg_co2e ELSE 0 END), 0)::float AS e90
                FROM shipment_silver_summary
                GROUP BY supplier_id
            )
            SELECT s.supplier_id, COALESCE(a.e30, 0), COALESCE(a.e90, 0)
            FROM suppliers s
            LEFT JOIN agg a ON a.supplier_id = s.supplier_id
            """
        )
        fetched = cur.fetchall()
        now = datetime.now(timezone.utc)
        rows = []
        for sid, e30, e90 in fetched:
            score, tier = risk_from_id(sid)
            rows.append(
                (
                    sid,
                    score,
                    tier,
                    float(e30),
                    float(e90),
                    random.choice(["IMPROVING", "STABLE", "WORSENING"]),
                    now,
                    "neon-seed-1.0",
                )
            )
        psycopg2.extras.execute_batch(
            cur,
            """
            INSERT INTO supplier_risk_scores (
                supplier_id, risk_score, risk_tier, emissions_30d_kg, emissions_90d_kg,
                emissions_trend, last_scored_at, model_version
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (supplier_id) DO UPDATE SET
                risk_score = EXCLUDED.risk_score,
                risk_tier = EXCLUDED.risk_tier,
                emissions_30d_kg = EXCLUDED.emissions_30d_kg,
                emissions_90d_kg = EXCLUDED.emissions_90d_kg,
                emissions_trend = EXCLUDED.emissions_trend,
                last_scored_at = EXCLUDED.last_scored_at,
                model_version = EXCLUDED.model_version
            """,
            rows,
            page_size=200,
        )
    conn.commit()
    return len(rows)


def seed_alerts(conn) -> int:
    templates = [
        ("ANOMALY", "CRITICAL", "Spike vs 30d baseline"),
        ("SPIKE", "HIGH", "Weekly emissions spike"),
        ("THRESHOLD_BREACH", "MEDIUM", "Intensity drift vs category"),
        ("ROUTING", "LOW", "Unusual lane mix detected"),
        ("DATA_QUALITY", "MEDIUM", "Missing weight on inbound leg"),
    ]
    with conn.cursor() as cur:
        cur.execute("SELECT supplier_id FROM suppliers ORDER BY supplier_id LIMIT 50")
        sids = [r[0] for r in cur.fetchall()]
        cur.execute("SELECT sku_id FROM skus ORDER BY sku_id LIMIT 50")
        skus = [r[0] for r in cur.fetchall()]
        random.seed(123)
        rows = []
        for i in range(ALERT_COUNT):
            atype, sev, msg = templates[i % len(templates)]
            sid = random.choice(sids) if sids else None
            sku = random.choice(skus) if skus and random.random() > 0.3 else None
            rows.append(
                (
                    atype,
                    sev,
                    sid,
                    sku,
                    float(random.uniform(200, 8000)),
                    float(random.uniform(100, 2000)),
                    f"{msg} (#{i + 1})",
                )
            )
        psycopg2.extras.execute_batch(
            cur,
            """
            INSERT INTO emissions_alerts (
                alert_type, severity, supplier_id, sku_id, emissions_kg, threshold_kg, message
            ) VALUES (%s,%s,%s,%s,%s,%s,%s)
            """,
            rows,
            page_size=50,
        )
    conn.commit()
    return len(rows)


def seed_pipeline(conn) -> int:
    now = datetime.now(timezone.utc)
    random.seed(7)
    with conn.cursor() as cur:
        for c in PIPELINE_COMPONENTS:
            cur.execute(
                """
                INSERT INTO pipeline_status (component, status, last_heartbeat, records_processed, last_error)
                VALUES (%s, 'HEALTHY', %s, %s, NULL)
                ON CONFLICT (component) DO UPDATE SET
                    status = EXCLUDED.status,
                    last_heartbeat = EXCLUDED.last_heartbeat,
                    records_processed = EXCLUDED.records_processed,
                    last_error = EXCLUDED.last_error
                """,
                (c, now, random.randint(1_000, 99_000)),
            )
    conn.commit()
    return len(PIPELINE_COMPONENTS)


def seed_sku_emissions_summary(conn) -> int:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO sku_emissions_summary (
                sku_id, sku_name, product_category, total_emissions_kg, avg_carbon_intensity,
                shipment_count, top_supplier_id, last_updated
            )
            SELECT
                k.sku_id,
                k.name,
                k.category,
                SUM(s.emissions_kg_co2e)::float,
                AVG(s.carbon_intensity)::float,
                COUNT(*)::int,
                (
                    SELECT s2.supplier_id
                    FROM shipment_silver_summary s2
                    WHERE s2.sku_id = k.sku_id
                    GROUP BY s2.supplier_id
                    ORDER BY SUM(s2.emissions_kg_co2e) DESC
                    LIMIT 1
                ),
                NOW()
            FROM skus k
            JOIN shipment_silver_summary s ON s.sku_id = k.sku_id
            GROUP BY k.sku_id, k.name, k.category
            ON CONFLICT (sku_id) DO UPDATE SET
                sku_name = EXCLUDED.sku_name,
                product_category = EXCLUDED.product_category,
                total_emissions_kg = EXCLUDED.total_emissions_kg,
                avg_carbon_intensity = EXCLUDED.avg_carbon_intensity,
                shipment_count = EXCLUDED.shipment_count,
                top_supplier_id = EXCLUDED.top_supplier_id,
                last_updated = EXCLUDED.last_updated
            """
        )
        cur.execute("SELECT COUNT(*) FROM sku_emissions_summary")
        n = cur.fetchone()[0]
    conn.commit()
    return int(n)


def main() -> None:
    print("Neon seed: connecting…")
    conn = get_conn()
    try:
        print("Applying schema from api/db/schema.sql …")
        apply_schema(conn)
        print("Clearing existing demo rows …")
        clear_demo_tables(conn)
        print(f"Loading suppliers from {SUPPLIERS_CSV} …")
        n_sup = seed_suppliers(conn)
        print(f"  inserted {n_sup} suppliers")
        print(f"Generating {SKU_COUNT} SKUs …")
        n_sku = seed_skus(conn)
        print(f"  inserted {n_sku} skus")
        print(f"Loading EPA factors from {EPA_CSV} …")
        n_epa = seed_epa(conn)
        print(f"  inserted {n_epa} epa_emission_factors rows")
        with conn.cursor() as cur:
            cur.execute("SELECT supplier_id FROM suppliers")
            supplier_ids = [r[0] for r in cur.fetchall()]
            cur.execute("SELECT sku_id FROM skus")
            sku_ids = [r[0] for r in cur.fetchall()]
        print(f"Generating {SHIPMENT_TARGET} shipments (batched commits) …")
        n_ship = seed_shipments(conn, supplier_ids, sku_ids)
        print(f"  inserted {n_ship} shipment_silver_summary rows")
        print("Computing supplier_risk_scores …")
        n_risk = seed_supplier_risk_scores(conn)
        print(f"  upserted {n_risk} supplier_risk_scores rows")
        print(f"Inserting {ALERT_COUNT} emissions_alerts …")
        n_al = seed_alerts(conn)
        print(f"  inserted {n_al} emissions_alerts rows")
        print(f"Upserting {len(PIPELINE_COMPONENTS)} pipeline_status components …")
        n_pipe = seed_pipeline(conn)
        print(f"  upserted {n_pipe} pipeline_status rows")
        print("Aggregating sku_emissions_summary …")
        n_sum = seed_sku_emissions_summary(conn)
        conn.commit()
        print(f"  upserted {n_sum} sku_emissions_summary rows")
        print("Done.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()

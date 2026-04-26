# Verdant

[![CI](https://github.com/nikhilgiridharan/verdant/actions/workflows/ci.yml/badge.svg)](https://github.com/nikhilgiridharan/verdant/actions)
[![Python](https://img.shields.io/badge/python-3.11-3776ab?logo=python&logoColor=white)](https://python.org)
[![Kafka](https://img.shields.io/badge/Apache%20Kafka-MSK%20compatible-231f20?logo=apachekafka&logoColor=white)](https://kafka.apache.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon%20Serverless-336791?logo=postgresql&logoColor=white)](https://neon.tech)
[![Vercel](https://img.shields.io/badge/deployed-verdant.nikhilgiridharan.com-000000?logo=vercel&logoColor=white)](https://verdant.nikhilgiridharan.com)
[![License](https://img.shields.io/badge/license-MIT-10b981)](LICENSE)

A production-grade Scope 3 carbon emissions intelligence platform processing 10M+ supplier shipment records, attributing carbon to the SKU level using EPA v1.4.0 emission factors, scoring supplier risk with LightGBM, and surfacing real-time anomalies via WebSocket.

---

## 🌐 Demo

| | |
|---|---|
| **Live Platform** | [verdant.nikhilgiridharan.com](https://verdant.nikhilgiridharan.com) |
| **Medium** | https://medium.com/@nikhilgiridharan/building-verdant-019e8e44b7b3 |
| **API Docs** | [verdant.nikhilgiridharan.com/docs](https://carbontrace-b69i.onrender.com/docs) |

---

## Architecture

```
╔══════════════════════════════════════════════════════════════════╗
║  INGESTION — 100 events/sec                                       ║
║                                                                   ║
║  Shipment Producer ──▶ Kafka ──▶ PySpark Bronze ──▶ S3/MinIO    ║
║  (US Census-        market       Structured          Delta Lake   ║
║   calibrated)       .shipments   Streaming           raw layer    ║
║                                       │                           ║
║  PROCESSING                           ▼                           ║
║                                  PySpark Silver                   ║
║                                  EPA v1.4.0 calc                  ║
║                                  emissions_kg_co2e                ║
║                                       │                           ║
║  WAREHOUSE + ORCHESTRATION            ▼                           ║
║                                  PostgreSQL (Neon)                ║
║                                  Gold layer tables                ║
║                                       │                           ║
║                                  Airflow DAG ──▶ LightGBM        ║
║                                  15-min schedule   risk scoring   ║
║                                                                   ║
║  REAL-TIME ANOMALY DETECTION                                      ║
║                                                                   ║
║  Kafka ──▶ Z-score detector ──▶ emissions_alerts ──▶ WebSocket   ║
║  stream     rolling 30-event    PostgreSQL           sub-second   ║
║             window per supplier                      broadcast    ║
║                                                                   ║
║  SERVING                                                          ║
║                                                                   ║
║  FastAPI ──▶ React + Mapbox ──▶ verdant.nikhilgiridharan.com     ║
║  15 REST      interactive        NL query · Scenarios             ║
║  endpoints    world map          PDF ESG report                   ║
╚══════════════════════════════════════════════════════════════════╝
```

---

## Key Engineering Decisions

### 1. EPA v1.4.0 Emission Factors — Cost-Based to Physical Conversion

The EPA publishes Scope 3 factors in kg CO₂e per USD spent on transport services. Verdant stores physical shipment data (weight_kg, distance_km), requiring a derivation step:

```
Formula:
  kg_co2e_per_tonne_km = epa_factor_per_usd × cost_usd_per_tonne_km

Industry-average cost rates (2024):
  AIR:   $0.85/tonne-km → 0.644 × 0.85 = 0.5474 kg CO₂e/tonne-km
  OCEAN: $0.04/tonne-km → 0.583 × 0.04 = 0.0233 kg CO₂e/tonne-km
  TRUCK: $0.12/tonne-km → 0.767 × 0.12 = 0.0920 kg CO₂e/tonne-km
  RAIL:  $0.05/tonne-km → 0.154 × 0.05 = 0.0077 kg CO₂e/tonne-km

Emissions per shipment:
  emissions_kg = (weight_kg / 1000) × distance_km × kg_co2e_per_tonne_km
```

Every `fact_emissions` row carries `emissions_factor_version = 'v1.4.0'` for full audit trail. When EPA releases v1.5.0, a single seed file update recalibrates all calculations.

### 2. Real-Time Anomaly Detection — Z-Score on Rolling Window

A dedicated Kafka consumer (`anomaly_stream.py`) reads from the same `shipment-events` topic as the batch pipeline but operates independently. For each event:

```
For each supplier, maintain a deque(maxlen=30) of recent emissions values.
When a new event arrives:
  z_score = (emissions_kg - mean(window)) / stdev(window)
  if z_score > 2.5:   flag as SPIKE (CRITICAL if z_score > 4.0)
  if value > mean × 3: flag as THRESHOLD_BREACH
  if intensity > category_avg × 2: flag as ANOMALY

On detection:
  1. INSERT into emissions_alerts (PostgreSQL) — persisted
  2. Broadcast to all WebSocket clients — sub-second delivery
```

The consumer never blocks the batch pipeline — two independent consumers, same topic, different consumer groups.

### 3. Trade Flow Calibration — Synthetic Data on Real Patterns

No public database of real supplier-to-SKU shipment records exists. The producer generates synthetic events calibrated to 2024 US Census Bureau international trade data (`api.census.gov` — no login required):

```
Key calibration findings vs naive assumptions:
  Mexico: 16.2% of US imports (#2 source, was assumed 10%)
  Canada: 9.8% of US imports (#3 source, was missing entirely)
  Ocean:  72.8% of volume (was underweighted)
  Electronics by air: 35% (high value/weight ratio — was assumed 20%)

Seasonal factors from Census monthly data:
  November: 1.20× baseline (pre-holiday inventory)
  February: 0.78× baseline (Chinese New Year disruption)
```

### 4. LightGBM Supplier Risk Scoring

Features engineered from `shipment_silver_summary` per supplier:

```python
features = [
    'emissions_30d_kg',      # total last 30 days
    'emissions_90d_kg',      # total last 90 days
    'air_pct',               # % of shipments by air
    'ocean_pct',             # % of shipments by ocean
    'truck_pct',             # % of shipments by truck
    'rail_pct',              # % of shipments by rail
    'avg_carbon_intensity',  # kg CO₂e per kg shipped
    'weight_volatility',     # std dev of shipment weight
    'shipment_count_30d',    # volume proxy
]

# Labels from emissions percentiles:
# CRITICAL: >90th  HIGH: 75-90th  MEDIUM: 50-75th  LOW: <50th
```

LightGBM was chosen over XGBoost for native categorical support (country, transport mode) and 3× faster training on tabular data. Model artifacts are versioned — every `supplier_risk_scores` row carries `model_version = 'lgbm-1.0'`. Risk scores refresh every 15 minutes via Airflow.

### 5. Natural Language Query Layer

Users ask questions in plain English. Claude API converts them to SQL, executes against Neon, and generates a one-sentence insight:

```
User: "Which suppliers in China are getting worse this month?"

Claude API → SQL:
  SELECT s.name, r.risk_tier,
         ROUND(r.emissions_30d_kg, 0) as emissions_30d_kg,
         r.emissions_trend
  FROM supplier_risk_scores r
  JOIN suppliers s ON r.supplier_id = s.supplier_id
  WHERE s.country = 'CN'
    AND r.emissions_trend = 'WORSENING'
  ORDER BY r.emissions_30d_kg DESC NULLS LAST
  LIMIT 10

Claude API → Insight:
  "8 Chinese suppliers are worsening, led by Foxconn Vietnam
   with 2,847 kg CO₂e in the last 30 days — 34% above their
   90-day baseline."
```

Safety: only SELECT queries are permitted. All non-SELECT strings are rejected before execution.

### 6. Decarbonization Pathway — Greedy Algorithm

Given a target reduction percentage, the API calculates the minimum set of transport mode switches needed:

```python
# Greedy approach: sort switches by savings_kg descending,
# select until cumulative savings >= target

pathway = []
cumulative = 0
for supplier in air_suppliers.order_by('-mode_emissions'):
    savings = calc_switch_savings(supplier, 'AIR', 'OCEAN')
    pathway.append({**supplier, 'savings_kg': savings})
    cumulative += savings
    if cumulative >= target_savings_kg:
        break

# Returns ordered action list with cumulative impact at each step
```

---

## Performance

| Metric | Result |
|---|---|
| Pipeline throughput | 100 events/sec (configurable via PRODUCER_RATE) |
| Local pipeline scale | 10M+ shipment records |
| Live database | 50,000 pre-aggregated records (Neon free tier) |
| Anomaly detection latency | Sub-second (Kafka → WebSocket) |
| API cold start (Render free) | ~30 seconds after 15-min idle |
| API response time (warm) | <200ms p99 |
| Risk scoring cycle | Every 15 minutes via Airflow |
| Suppliers tracked | 500 across 9 countries |
| SKUs attributed | 2,000 across 10 categories |

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/emissions/summary` | Total CO₂ YTD, MTD, supplier count |
| GET | `/api/v1/emissions/timeseries` | Daily/weekly/monthly trend data |
| GET | `/api/v1/emissions/by-transport-mode` | Split by AIR/OCEAN/TRUCK/RAIL |
| GET | `/api/v1/emissions/by-country` | Aggregated by supplier origin country |
| GET | `/api/v1/emissions/decarbonization-pathway` | Greedy pathway to reduction target |
| GET | `/api/v1/suppliers` | Paginated supplier list with risk scores |
| GET | `/api/v1/suppliers/map-data` | Optimized for Mapbox GL rendering |
| GET | `/api/v1/suppliers/{id}` | Full supplier profile |
| GET | `/api/v1/suppliers/benchmarks` | Intensity vs category average |
| GET | `/api/v1/skus` | SKU list with emissions summary |
| GET | `/api/v1/skus/{id}/sankey` | Sankey diagram data (supplier → mode → SKU) |
| GET | `/api/v1/forecasts/supplier/{id}` | 30/60/90-day emissions forecast |
| POST | `/api/v1/nl/query` | Natural language → SQL → result |
| GET | `/api/v1/pipeline/status` | All component health + Kafka lag |
| GET | `/api/v1/report/generate` | Download Scope 3 PDF report |
| WS | `/ws/alerts` | Real-time anomaly alert stream |
| WS | `/ws/pipeline` | Pipeline status stream |

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Ingestion | Apache Kafka (MSK-compatible) | Decouples producers from consumers, enables replay |
| Processing | PySpark Structured Streaming | Glue-compatible, handles 10M+ records |
| Storage | PostgreSQL (Neon serverless) | Zero-cost, scale-to-zero, production Postgres |
| Orchestration | Apache Airflow | Industry standard, tested in FAANG interviews |
| ML — risk scoring | LightGBM | Native categorical support, 3× faster than XGBoost on tabular |
| ML — forecasting | XGBoost | Point forecast + prediction interval |
| ML — tracking | MLflow | Experiment versioning, artifact storage |
| NL Query | Claude API (claude-sonnet) | SQL generation + insight summarization |
| Emission factors | EPA v1.4.0 NAICS-6 | Official government source, October 2025 |
| API | FastAPI | Async, auto OpenAPI, Pydantic validation |
| Dashboard | React + Vite + Mapbox GL JS | Interactive globe, supplier nodes |
| Charts | Recharts + D3 Sankey | Trend lines, SKU attribution diagram |
| Containerization | Docker Compose | One-command local stack |
| Deployment | Neon + Render + Vercel | $0/month, no credit card |

---

## Data Sources

| Source | Description | Access |
|---|---|---|
| [EPA v1.4.0](https://doi.org/10.5281/zenodo.17202747) | Supply Chain GHG Emission Factors (Oct 2025) | Free download |
| [US Census Bureau](https://api.census.gov/data/timeseries/intltrade/imports) | 2024 international trade flow calibration | Free public API |
| Synthetic shipments | 10M+ records, US Census-calibrated distributions | Generated by producer |
| Real supplier names | Publicly disclosed supplier lists (Apple, auto OEMs) | Public sustainability reports |

---

## Getting Started

### Option A — View the live platform

Visit **[verdant.nikhilgiridharan.com](https://verdant.nikhilgiridharan.com)** — no setup required.

> **Note:** The Render API may take ~30 seconds to wake from idle on first request (free tier). The dashboard will show data once the API responds.

### Option B — Run locally

**Prerequisites:**
- Docker + Docker Compose
- Python 3.11+
- Node.js 18+
- Mapbox account (free token at mapbox.com)

```bash
# Clone
git clone https://github.com/nikhilgiridharan/verdant.git
cd verdant

# Configure environment
cp .env.production.example .env
# Required: DATABASE_URL, VITE_MAPBOX_TOKEN
# Optional: ANTHROPIC_API_KEY (NL query), RESEND_API_KEY (email digest)

# Start full local stack (Kafka, Spark, Airflow, MLflow, API)
make up

# Seed the database (creates schema + 500 suppliers + 50k shipments)
DATABASE_URL=<your_neon_url> python3 scripts/seed_neon.py

# Start dashboard
cd dashboard && npm install && npm run dev
# Dashboard: http://localhost:3000
# API docs:  http://localhost:8000/docs
# Airflow:   http://localhost:8080
# MLflow:    http://localhost:5000
```

```bash
make up           # Start all services
make down         # Stop all services
make logs         # Tail all logs
make suppliers    # Regenerate supplier coordinates
make dbt-run      # Run dbt models (if Snowflake configured)
make test         # Run test suite
make clean        # Stop + remove volumes
```

---

## Environment Variables

| Variable | Description | Required |
|---|---|---|
| `DATABASE_URL` | Neon PostgreSQL connection string | Yes |
| `VITE_API_BASE_URL` | FastAPI backend URL | Yes |
| `VITE_MAPBOX_TOKEN` | Mapbox GL JS public token | Yes |
| `KAFKA_BOOTSTRAP_SERVERS` | Kafka broker (local: `localhost:29092`) | Local only |
| `ANTHROPIC_API_KEY` | Claude API for NL query layer | Optional |
| `RESEND_API_KEY` | Resend for weekly email digest | Optional |
| `PRODUCER_RATE` | Events/second (default: 100) | Optional |

See `.env.production.example` for full reference.

---

## Project Structure

```
verdant/
├── ingestion/
│   └── producer/
│       ├── shipment_producer.py       # Kafka event producer, 100 events/sec
│       ├── generate_supplier_coords.py # City-anchored supplier coordinates
│       └── trade_calibration.py       # US Census 2024 distributions
├── processing/
│   ├── spark_processor.py             # PySpark Bronze: Kafka → Delta Lake
│   └── silver_transformer.py          # PySpark Silver: EPA emissions calc
├── ml/
│   ├── train_risk_model.py            # LightGBM supplier risk classifier
│   ├── anomaly_stream.py              # Real-time Kafka anomaly detector
│   └── models/                        # Trained model artifacts
├── api/
│   ├── main.py                        # FastAPI app, WebSocket endpoints
│   ├── routers/
│   │   ├── emissions.py               # Emissions endpoints + pathway
│   │   ├── suppliers.py               # Supplier endpoints + benchmarks
│   │   ├── skus.py                    # SKU attribution + Sankey
│   │   ├── nl_query.py                # Claude API NL → SQL
│   │   ├── report.py                  # PDF ESG report generation
│   │   └── pipeline.py                # Health + alert endpoints
│   └── db/
│       └── connection.py              # Neon connection pool
├── dashboard/
│   └── src/
│       ├── views/                     # Overview, Suppliers, SKU Trace,
│       │                              # Network, Scenarios, Forecast,
│       │                              # AskVerdant, Introduction
│       └── components/
│           ├── map/                   # Mapbox GL, supplier nodes, heatmap
│           ├── panels/                # Supplier intel, alert feed
│           └── charts/                # Recharts, D3 Sankey
├── infrastructure/
│   └── airflow/dags/
│       ├── carbonpulse_full_pipeline.py # 15-min orchestration DAG
│       └── score_suppliers.py          # LightGBM scoring job
├── data/
│   └── seeds/
│       ├── suppliers.csv              # 500 suppliers, city-anchored
│       └── epa_emission_factors.csv   # EPA v1.4.0 NAICS-6 factors
├── scripts/
│   └── seed_neon.py                   # Database seeder
├── docs/
│   └── decisions/                     # Architecture Decision Records
├── docker-compose.yml                 # Full local stack
└── Makefile                           # make up · make test · make clean
```

---

## Architecture Decision Records

| ADR | Decision |
|---|---|
| [ADR-001](docs/decisions/ADR-001-warehouse-choice.md) | DuckDB for local dev, Neon PostgreSQL for production |
| [ADR-002](docs/decisions/ADR-002-streaming-vs-batch.md) | Kafka + Spark Structured Streaming for sub-minute freshness |
| [ADR-003](docs/decisions/ADR-003-emission-factors-methodology.md) | EPA v1.4.0 cost-to-tonne-km derivation methodology |

---

## Team

Built by three collaborators with deliberate ownership separation — mirroring how ESG platforms are built in production:

- **Data Engineer** — pipeline infrastructure, emissions calculations, API, anomaly detection, deployment
- **Data Scientist** — LightGBM risk scoring, XGBoost forecasting, MLflow experiment tracking
- **Supply Chain Analyst** — EPA factor validation, KPI framework, domain validation

---

## Deployment

Zero-cost production deployment:

| Service | Purpose | Cost |
|---|---|---|
| [Neon](https://neon.tech) | PostgreSQL (serverless, scale-to-zero) | Free forever |
| [Render](https://render.com) | FastAPI backend (750 hrs/month) | Free tier |
| [Vercel](https://vercel.com) | React dashboard (unlimited bandwidth) | Free forever |

**Total monthly cost: $0.00**

The Render free tier spins down after 15 minutes of inactivity (~30s cold start). [UptimeRobot](https://uptimerobot.com) pings `/health` every 5 minutes to keep the API warm.

---

## License

MIT

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
SUPPLIERS_CSV = REPO_ROOT / "data" / "seeds" / "suppliers.csv"
EPA_CSV = REPO_ROOT / "data" / "seeds" / "epa_emission_factors.csv"

SHIPMENT_TARGET = 50_000
SKU_COUNT = 2000
ALERT_COUNT = 15

# EPA v1.4.0 derived kg CO2e per tonne-km (primary NAICS per mode)
FACTOR_KG_PER_TONNE_KM = {"AIR": 0.5474, "OCEAN": 0.0233, "TRUCK": 0.0920, "RAIL": 0.0077}

PIPELINE_COMPONENTS = [
    "kafka-producer",
    "spark-bronze",
    "spark-silver",
    "postgres-sync",
    "quality-checks",
    "ge-checks",
    "api",
]

REAL_SUPPLIER_NAMES = {
    "CN_Electronics": [
        "Foxconn Technology Group", "Pegatron Corporation", "Compal Electronics", "Wistron Corporation",
        "BOE Technology Group", "Luxshare Precision", "Goertek Inc", "BYD Electronic", "Sunny Optical",
        "AAC Technologies", "Tongda Group", "Truly International", "Jabil Circuit Shenzhen",
        "Flex Ltd Shenzhen", "Flextronics Zhuhai", "Qisda Corporation", "Inventec Corporation",
        "Quanta Computer Kunshan", "Delta Electronics Dongguan", "Lite-On Technology Guangzhou",
    ],
    "CN_Apparel": [
        "Shenzhou International Group", "Pacific Textiles Holdings", "Crystal International Group",
        "Texhong Textile Group", "Nameson Holdings", "Regina Miracle International", "Eclat Textile Suzhou",
        "Feng Tay Enterprises", "Pou Chen Dongguan", "Yue Yuen Industrial", "Huali Industrial Group",
        "Stella International", "TAL Apparel Shanghai", "Sinomax Group", "Esquel Group Guangdong",
        "Fang Brothers Shenzhen", "Victory City International", "Lever Style Corporation",
        "William Carter Suzhou", "Hanesbrands Nanjing",
    ],
    "CN_Auto Parts": [
        "CITIC Dicastal", "Minth Group", "Fuyao Glass Industry", "Yanfeng Automotive Interiors",
        "Joyson Safety Systems", "Sensata Technologies Guangzhou", "Lear Corporation Chengdu",
        "Aptiv Shanghai", "BorgWarner Taicang", "ZF Chassis Liuzhou", "Bosch Automotive Suzhou",
        "Continental Automotive Regensburg China", "Valeo Thermal Changchun", "Plastic Omnium Wuhan",
        "Faurecia Emissions Control Nanjing", "Gentherm Automotive Suzhou",
        "Superior Industries Qinhuangdao", "Nexteer Automotive Saginaw China",
        "Modine Manufacturing Aachen China", "Meridian Lightweight Nanjing",
    ],
    "CN_Food & Beverage": [
        "Yili Industrial Group", "China Mengniu Dairy", "WH Group Zhengzhou", "New Hope Liuhe",
        "COFCO Corporation", "Bright Food Shanghai", "Dali Foods Group", "Uni-President China",
        "Want Want China Holdings", "Foshan Haitian Flavouring", "Ting Hsin International",
        "Wens Foodstuff Group", "Sunner Development", "New Hope Dairy", "Feihe International",
        "Ausnutria Dairy", "Nongfu Spring", "China Resources Beer", "Tsingtao Brewery", "Yanjing Brewery",
    ],
    "CN_Chemicals": [
        "Sinopec Corp Shanghai", "Wanhua Chemical Group", "Rongsheng Petrochemical", "Hengli Petrochemical",
        "Zhejiang NHU", "Jiangsu Yangnong Chemical", "BASF Petrochemical Nanjing",
        "Dow Chemical Zhangjiagang", "LyondellBasell Suzhou", "Eastman Chemical Hefei", "Celanese Nanjing",
        "Solvay Specialty Polymers Shanghai", "Lanxess Urethane Wuxi", "Clariant Masterbatches Shanghai",
        "Evonik Specialty Chemicals Shanghai", "Arkema Coating Resins Cangzhou",
        "Dupont Electronics Shanghai", "Huntsman Advanced Materials Shanghai",
        "Air Products Suzhou", "Linde Industrial Gases Hangzhou",
    ],
    "CN_Industrial Machinery": [
        "Siemens Factory Automation Chengdu", "ABB Robotics Shanghai", "Schneider Electric Wuhan",
        "Rockwell Automation Shanghai", "Emerson Automation Marshalltown China",
        "Honeywell Process Solutions Shanghai", "GE Healthcare Wuxi", "Caterpillar Xuzhou",
        "Komatsu Changzhou", "Volvo CE Linyi", "Liebherr Nenzing China", "Terex Changchun",
        "Manitowoc Cranes Shunde", "Atlas Copco Wuxi", "Ingersoll Rand Compression Wuxi",
        "Gardner Denver Suzhou", "Sulzer Pumps Suzhou", "Alfa Laval Qingdao", "SPX FLOW Suzhou",
        "Dover Pump Solutions Shanghai",
    ],
    "MX_Auto Parts": [
        "Nemak Monterrey", "Vitro Monterrey", "Grupo KUO San Luis Potosi", "Rassini Puebla",
        "Metalsa Monterrey", "Katcon Global Monterrey", "Grupo Industrial Saltillo", "Draxton Queretaro",
        "DENSO Manufacturing Mexico", "Magna Closures Ramos Arizpe", "Delphi Technologies Juarez",
        "Lear Corporation Silao", "Aptiv Cd Juarez", "Continental Guadalajara",
        "ZF Steering Mexico Queretaro", "Bosch Rexroth Monterrey", "Valeo Thermal Systems Puebla",
        "Plastic Omnium Auto Inergy San Luis Potosi", "Faurecia Emissions Silao", "Motherson Sumi Toluca",
    ],
    "MX_Food & Beverage": [
        "Grupo Bimbo Mexico City", "Gruma Monterrey", "Sigma Alimentos Monterrey", "Lala Torreon",
        "Bachoco Celaya", "Arca Continental Monterrey", "Coca-Cola FEMSA Mexico City",
        "Grupo Modelo Mexico City", "Grupo Herdez Mexico City", "Jumex Ecatepec", "La Costena Lerma",
        "Barcel Lerma", "Grupo Lala Durango", "Del Monte Foods Irapuato",
        "McCormick de Mexico Cuautitlan", "Heinz Mexico Queretaro", "Nestle Mexico Queretaro",
        "Pepsico Mexico Monterrey", "Kellanova Mexico Monterrey", "Kraft Heinz Mexico Lerma",
    ],
    "MX_Apparel": [
        "Kaltex Berriozabal", "Global Denim Gomez Palacio", "Parras Cone de Mexico Parras",
        "Tavex Mexico Tlaxcala", "Cone Denim Parras", "Propimex Puebla", "Textil del Valle Aguascalientes",
        "Industrias Cannon Tlaxcala", "Grupo Textil Providencia Queretaro", "Nylstar Mexico Puebla",
        "Compania Industrial de Orizaba Veracruz", "Roc-Sil Textiles Guadalajara",
        "Fibras Texcel Toluca", "Hilasal Mexicana Monterrey", "Hamco San Pedro Garza Garcia",
        "Confecciones Internacionales Merida", "Textiles Opichen Merida",
        "Maquilas Tetakawi Guaymas", "American Industries Monterrey", "Mexmode Morelos",
    ],
    "CA_Auto Parts": [
        "Magna International Aurora", "Martinrea International Vaughan", "Linamar Corporation Guelph",
        "Multimatic Markham", "Stackpole International Ancaster", "Woodbridge Foam Mississauga",
        "ABC Technologies Brampton", "Shawflex Toronto", "Cosma International Aurora",
        "Inteva Products Windsor", "Martinrea Honsel Soest Canada", "Flex-N-Gate Acton",
        "Meridian Lightweight Technologies Strathroy", "Magna Exteriors Guelph",
        "Decoma International Concord", "Ventra Industries Tillsonburg", "Wescast Industries Brantford",
        "Toyoda Gosei Ontario Cambridge", "Denso Manufacturing Canada Guelph",
        "Toyota Boshoku Canada Cambridge",
    ],
    "CA_Industrial Machinery": [
        "Bombardier Transportation Plattsburgh Canada", "CAE Inc Montreal", "Toromont Industries Toronto",
        "Finning International Vancouver", "Wajax Corporation Mississauga", "Russel Metals Mississauga",
        "Bird Construction Mississauga", "PCL Constructors Edmonton", "EllisDon Corporation London",
        "Aecon Group Toronto", "SNC-Lavalin Montreal", "Strad Inc Calgary", "Maxim Power Corp Calgary",
        "Stuart Olson Calgary", "Graham Corporation Regina", "Smith International Calgary",
        "Savanna Energy Services Calgary", "CES Energy Solutions Calgary", "Enerflex Ltd Calgary",
        "Pason Systems Calgary",
    ],
    "DE_Auto Parts": [
        "Robert Bosch GmbH Stuttgart", "Continental AG Hannover", "ZF Friedrichshafen AG",
        "Mahle GmbH Stuttgart", "Schaeffler AG Herzogenaurach", "Hella GmbH Lippstadt",
        "Brose Fahrzeugteile Coburg", "Webasto SE Stockdorf", "Knorr-Bremse AG Munich",
        "Leoni AG Nuremberg", "ElringKlinger AG Dettingen", "Stabilus GmbH Koblenz",
        "Grammer AG Amberg", "Norma Group Maintal", "SAF-Holland Bessenbach",
        "Polytec Group Horsching Germany", "Georg Fischer Schaffhausen Germany",
        "Wabco Holdings Hanover", "TE Connectivity Bensheim", "Visteon Corporation Kerpen",
    ],
    "DE_Industrial Machinery": [
        "Siemens AG Munich", "ThyssenKrupp AG Essen", "Voith GmbH Heidenheim", "Trumpf GmbH Ditzingen",
        "KUKA AG Augsburg", "GEA Group Dusseldorf", "Heidelberger Druckmaschinen",
        "Gebr Pfeiffer Kaiserslautern", "Windmoller Holscher Lengerich", "Haver Boecker Oelde",
        "BMA AG Braunschweig", "Linde Engineering Pullach", "Andritz AG Germany",
        "Sulzer Pumps Winterthur Germany", "Atlas Copco Essen", "Sandvik Coromant Dusseldorf",
        "Alfa Laval Lund Germany", "SPX FLOW Bad Homburg", "Dover Corporation Cologne", "Graco Inc Munich",
    ],
    "DE_Chemicals": [
        "BASF SE Ludwigshafen", "Bayer AG Leverkusen", "Lanxess AG Cologne", "Evonik Industries Essen",
        "Henkel AG Dusseldorf", "Wacker Chemie AG Munich", "Brenntag SE Essen", "Symrise AG Holzminden",
        "Merck KGaA Darmstadt", "Covestro AG Leverkusen", "K+S AG Kassel",
        "Clariant International Muttenz Germany", "Solvay Specialty Brunsbuttel",
        "Celanese GmbH Frankfurt", "Air Liquide Deutschland Dusseldorf", "Linde plc Munich",
        "Air Products Hattingen", "Praxair Deutschland Dusseldorf",
        "Nippon Gases Europa Dusseldorf", "Ineos Styrolution Frankfurt",
    ],
    "VN_Electronics": [
        "Samsung Electronics HCMC Complex", "LG Electronics Haiphong", "Intel Products Vietnam HCMC",
        "Canon Vietnam Hanoi", "Panasonic Vietnam Hanoi", "Foxconn Industrial Vietnam Bac Ninh",
        "Luxshare ICT Vietnam Bac Giang", "Goertek Vietnam Nghe An", "Jabil Circuit Vietnam HCMC",
        "Flextronics Vietnam Binh Duong", "Nidec Vietnam Binh Duong", "Mabuchi Motor Vietnam Dong Nai",
        "Hosiden Vietnam Bac Ninh", "Kyocera Vietnam Binh Duong", "TDK Vietnam Binh Duong",
        "Murata Manufacturing Vietnam Binh Duong", "Alps Alpine Vietnam Dong Nai",
        "Yazaki Vietnam Vinh Phuc", "Sumitomo Electric Vietnam Binh Duong", "AMS OSRAM Vietnam HCMC",
    ],
    "VN_Apparel": [
        "Viet Tien Garment Corporation HCMC", "May 10 Corporation Hanoi", "Nha Be Garment Corporation HCMC",
        "Thanh Cong Textile Garment HCMC", "Hoa Tho Textile Garment Da Nang", "Phong Phu Corporation HCMC",
        "Saigon 3 Garment HCMC", "An Phuoc Garment HCMC", "Vinatex Hanoi", "TNG Investment Vietnam Thai Nguyen",
        "Garment 10 Corporation Hanoi", "Duc Giang Corporation Hanoi", "Hung Yen Garment Corporation",
        "Hanosimex Hanoi", "Maxport Limited Vietnam Hanoi", "Crystal Martin Vietnam Binh Duong",
        "Eclat Textile Vietnam Binh Duong", "Coats Vietnam HCMC", "YKK Vietnam HCMC",
        "Scovill Fasteners Vietnam Binh Duong",
    ],
    "JP_Auto Parts": [
        "Toyota Industries Corporation Aichi", "Denso Corporation Kariya", "Aisin Corporation Kariya",
        "Jtekt Corporation Osaka", "Toyota Boshoku Aichi", "Sumitomo Electric Industries Osaka",
        "Yazaki Corporation Tokyo", "Tokai Rika Aichi", "Toyoda Gosei Aichi", "Stanley Electric Tokyo",
        "Koito Manufacturing Tokyo", "Futaba Industrial Aichi", "Tachi-S Akishima", "Kojima Industries Aichi",
        "GS Yuasa Kyoto", "Maruyasu Industries Aichi", "Toyoda Iron Works Aichi", "Toyo Tire Corporation Osaka",
        "Sumitomo Riko Aichi", "Calsonic Kansei Saitama",
    ],
    "JP_Electronics": [
        "Sony Corporation Tokyo", "Panasonic Holdings Osaka", "Murata Manufacturing Kyoto",
        "TDK Corporation Tokyo", "Nidec Corporation Kyoto", "Kyocera Corporation Kyoto", "Alps Alpine Tokyo",
        "Mabuchi Motor Chiba", "Hosiden Corporation Osaka", "Minebea Mitsumi Tokyo", "Rohm Semiconductor Kyoto",
        "Omron Corporation Kyoto", "Keyence Corporation Osaka", "Hirose Electric Tokyo", "Fujikura Ltd Tokyo",
        "Sumitomo Electric Osaka", "Hitachi Metals Tokyo", "Shin-Etsu Chemical Tokyo", "Hoya Corporation Tokyo",
        "Ushio Inc Tokyo",
    ],
    "KR_Electronics": [
        "Samsung SDI Suwon", "SK Hynix Icheon", "LG Display Paju", "Samsung Electro-Mechanics Suwon",
        "LG Innotek Seoul", "Samsung Display Asan", "Hyundai Mobis Seoul", "SK Innovation Seoul",
        "Hanon Systems Daejeon", "LS Electric Anyang", "Hyosung Corporation Seoul", "Korea Circuit Incheon",
        "Interflex Gumi", "BH Co Ltd Cheonan", "Simmtech Cheongju", "Daeduck Electronics Cheonan",
        "Iljin Electric Seoul", "Wonik IPS Pyeongtaek", "Doosan Bobcat Incheon", "Hanwha Solutions Seoul",
    ],
    "IN_Pharmaceuticals": [
        "Sun Pharmaceutical Industries Mumbai", "Dr Reddys Laboratories Hyderabad", "Cipla Limited Mumbai",
        "Lupin Limited Mumbai", "Aurobindo Pharma Hyderabad", "Divis Laboratories Hyderabad",
        "Biocon Limited Bangalore", "Glenmark Pharmaceuticals Mumbai", "Torrent Pharmaceuticals Ahmedabad",
        "Alkem Laboratories Mumbai", "Ipca Laboratories Mumbai", "Zydus Lifesciences Ahmedabad",
        "Abbott India Mumbai", "Pfizer India Mumbai", "GlaxoSmithKline India Mumbai", "Sanofi India Mumbai",
        "Novartis India Mumbai", "AstraZeneca India Bangalore", "Johnson Johnson India Mumbai",
        "Roche India Mumbai",
    ],
    "IN_Textiles": [
        "Welspun India Ahmedabad", "Arvind Limited Ahmedabad", "Raymond Limited Mumbai",
        "Vardhman Textiles Ludhiana", "Trident Group Barnala", "Indo Count Industries Kolhapur",
        "Siyaram Silk Mills Mumbai", "Himatsingka Seide Bangalore", "Nitin Spinners Bhilwara",
        "Banswara Syntex Banswara", "Century Enka Pune", "Ginni Filaments Dadri", "Nahar Industrial Ludhiana",
        "Sutlej Textiles Bhawanimandi", "Bombay Dyeing Mumbai", "Mafatlal Industries Ahmedabad",
        "BSL Limited Bhilwara", "Ambika Cotton Mills Dindigul", "Pallonji Textiles Mumbai",
        "KPR Mill Coimbatore",
    ],
    "TW_Electronics": [
        "Taiwan Semiconductor Manufacturing TSMC", "Hon Hai Precision Foxconn Taiwan",
        "Pegatron Corporation Taipei", "Quanta Computer Taoyuan", "Compal Electronics Taipei",
        "Wistron Corporation Taipei", "ASUSTeK Computer Taipei", "Acer Incorporated Taipei",
        "MediaTek Incorporated Hsinchu", "Realtek Semiconductor Hsinchu", "Novatek Microelectronics Hsinchu",
        "Silicon Motion Technology Hsinchu", "Himax Technologies Tainan", "Innolux Corporation Miaoli",
        "AU Optronics Hsinchu", "Advanced Semiconductor Engineering ASE",
        "Siliconware Precision Industries Taichung", "King Yuan Electronics Miaoli",
        "Powertech Technology Hsinchu", "Nan Ya PCB Taoyuan",
    ],
    "US_Consumer Goods": [
        "Procter Gamble Cincinnati", "Colgate-Palmolive New York", "Church Dwight Ewing",
        "Spectrum Brands Middleton", "Energizer Holdings St Louis", "Edgewell Personal Care Shelton",
        "Prestige Consumer Healthcare Tarrytown", "Central Garden Pet Walnut Creek", "Acco Brands Lake Zurich",
        "Avery Dennison Glendale", "Sealed Air Corporation Parsippany", "Berry Global Group Evansville",
        "Silgan Holdings Stamford", "AptarGroup Crystal Lake", "Sonoco Products Hartsville",
        "Greif Inc Delaware", "Pactiv Evergreen Lake Forest", "Graphic Packaging Atlanta",
        "WestRock Company Atlanta", "Bemis Company Neenah",
    ],
    "US_Industrial Machinery": [
        "Caterpillar Inc Deerfield", "Deere Company Moline", "Parker Hannifin Cleveland",
        "Emerson Electric St Louis", "Eaton Corporation Dublin", "Illinois Tool Works Glenview",
        "Dover Corporation Downers Grove", "Rockwell Automation Milwaukee", "Roper Technologies Sarasota",
        "IDEX Corporation Lake Forest", "Mueller Water Products Atlanta", "Enpro Industries Charlotte",
        "Chart Industries Ball Ground", "Graham Corporation Batavia", "Thermon Group San Marcos",
        "Lydall Inc Manchester", "NN Inc Johnson City", "Haynes International Kokomo",
        "Watts Water Technologies North Andover", "Franklin Electric Bluffton",
    ],
}


def get_real_supplier_name(country: str, industry: str, index: int, used: set[str]) -> str:
    key = f"{country}_{industry}"
    names = REAL_SUPPLIER_NAMES.get(key, [])

    if not names:
        for k, v in REAL_SUPPLIER_NAMES.items():
            if k.startswith(f"{country}_"):
                names = v
                break

    if not names:
        for k, v in REAL_SUPPLIER_NAMES.items():
            if k.endswith(f"_{industry}"):
                names = v
                break

    if names:
        base = names[index % len(names)]
        candidate = base
        suffix = 2
        while candidate in used:
            candidate = f"{base} {suffix}"
            suffix += 1
        used.add(candidate)
        return candidate

    return f"{country} Supplier {index:04d}"


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
    used_names: set[str] = set()
    rows = []
    with SUPPLIERS_CSV.open(encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for i, r in enumerate(reader):
            sid = r["supplier_id"].strip()
            country = r["country"].strip()
            industry = (r.get("industry") or "").strip() or "Electronics"
            name = get_real_supplier_name(country, industry, i, used_names)
            rows.append(
                (
                    sid,
                    name,
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

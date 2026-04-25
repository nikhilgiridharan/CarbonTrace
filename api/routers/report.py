"""
report.py
Verdant — Automated ESG Report Generator
"""

from __future__ import annotations

import io
from datetime import datetime

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from psycopg2.extras import RealDictCursor

from db.connection import get_conn

router = APIRouter()

try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import inch
    from reportlab.platypus import HRFlowable, Paragraph, Spacer, Table, TableStyle, SimpleDocTemplate

    REPORTLAB_AVAILABLE = True
except Exception:  # pragma: no cover
    REPORTLAB_AVAILABLE = False


def fetch_report_data(conn):
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute(
        """
        SELECT
            ROUND(SUM(emissions_kg_co2e)::numeric, 0) as total_ytd,
            ROUND(SUM(emissions_kg_co2e) FILTER (WHERE event_at > NOW() - INTERVAL '30 days')::numeric, 0) as total_30d,
            COUNT(DISTINCT supplier_id) as supplier_count,
            COUNT(DISTINCT sku_id) as sku_count,
            COUNT(*) as shipment_count,
            ROUND(AVG(carbon_intensity)::numeric, 4) as avg_intensity
        FROM shipment_silver_summary
        """
    )
    result = cur.fetchone()
    summary = dict(result) if result else {}

    cur.execute(
        """
        SELECT transport_mode,
               ROUND(SUM(emissions_kg_co2e)::numeric, 0) as emissions_kg,
               COUNT(*) as shipments,
               ROUND(
                   SUM(emissions_kg_co2e) * 100.0 /
                   NULLIF(SUM(SUM(emissions_kg_co2e)) OVER(), 0)
               ::numeric, 1) as pct
        FROM shipment_silver_summary
        GROUP BY transport_mode
        ORDER BY emissions_kg DESC
        """
    )
    by_mode = [dict(r) for r in cur.fetchall()]

    cur.execute(
        """
        SELECT s.name, s.country, r.risk_tier,
               ROUND(r.emissions_30d_kg::numeric, 0) as emissions_30d,
               r.emissions_trend
        FROM supplier_risk_scores r
        JOIN suppliers s ON r.supplier_id = s.supplier_id
        WHERE r.risk_tier IN ('HIGH', 'CRITICAL')
        ORDER BY r.emissions_30d_kg DESC NULLS LAST
        LIMIT 10
        """
    )
    high_risk = [dict(r) for r in cur.fetchall()]

    cur.execute(
        """
        SELECT supplier_country as country,
               COUNT(DISTINCT supplier_id) as suppliers,
               ROUND(SUM(emissions_kg_co2e)::numeric, 0) as emissions_kg
        FROM shipment_silver_summary
        WHERE event_at > NOW() - INTERVAL '30 days'
        GROUP BY supplier_country
        ORDER BY emissions_kg DESC
        LIMIT 8
        """
    )
    by_country = [dict(r) for r in cur.fetchall()]
    return summary, by_mode, high_risk, by_country


@router.get("/generate")
async def generate_esg_report():
    if not REPORTLAB_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="PDF generation unavailable — reportlab not installed. Run: pip install reportlab",
        )

    try:
        with get_conn() as conn:
            summary, by_mode, _high_risk, _by_country = fetch_report_data(conn)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Database error fetching report data: {str(e)[:200]}",
        ) from e

    try:
        buf = io.BytesIO()
        doc = SimpleDocTemplate(
            buf,
            pagesize=letter,
            rightMargin=0.75 * inch,
            leftMargin=0.75 * inch,
            topMargin=0.75 * inch,
            bottomMargin=0.75 * inch,
        )

        story = []
        now = datetime.utcnow()
        styles = getSampleStyleSheet()

        GREEN = colors.HexColor("#1a3d2b")
        LIGHT = colors.HexColor("#f0fdf4")
        GRAY = colors.HexColor("#6b7566")

        story.append(
            Paragraph(
                "Verdant — Scope 3 Emissions Report",
                ParagraphStyle("T", parent=styles["Title"], fontSize=20, textColor=GREEN, spaceAfter=6),
            )
        )
        story.append(
            Paragraph(
                f"Generated: {now.strftime('%B %Y')} · EPA v1.4.0 factors",
                ParagraphStyle("S", parent=styles["Normal"], fontSize=10, textColor=GRAY, spaceAfter=14),
            )
        )
        story.append(HRFlowable(width="100%", thickness=1.5, color=GREEN, spaceAfter=14))

        ytd = float(summary.get("total_ytd") or 0)
        mtd = float(summary.get("total_30d") or 0)
        sups = int(summary.get("supplier_count") or 0)
        ships = int(summary.get("shipment_count") or 0)

        summary_data = [
            ["Metric", "Value"],
            ["Total Scope 3 Emissions (YTD)", f"{ytd:,.0f} kg CO2e"],
            ["Total Scope 3 Emissions (30-day)", f"{mtd:,.0f} kg CO2e"],
            ["Suppliers Tracked", f"{sups:,}"],
            ["Shipments Analyzed", f"{ships:,}"],
        ]
        t = Table(summary_data, colWidths=[3.5 * inch, 2.5 * inch])
        t.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), GREEN),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("BACKGROUND", (0, 1), (-1, -1), LIGHT),
                    ("GRID", (0, 0), (-1, -1), 0.5, GRAY),
                    ("PADDING", (0, 0), (-1, -1), 6),
                ]
            )
        )
        story.append(t)
        story.append(Spacer(1, 14))

        if by_mode:
            story.append(
                Paragraph(
                    "Emissions by Transport Mode",
                    ParagraphStyle("H", parent=styles["Heading2"], fontSize=12, textColor=GREEN, spaceAfter=8),
                )
            )
            mode_data = [["Mode", "Emissions (kg CO2e)", "Shipments"]]
            for row in by_mode:
                mode_data.append(
                    [
                        str(row.get("transport_mode", "")),
                        f"{float(row.get('emissions_kg') or 0):,.0f}",
                        f"{int(row.get('shipments') or 0):,}",
                    ]
                )
            t2 = Table(mode_data, colWidths=[2 * inch, 2.5 * inch, 1.5 * inch])
            t2.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, 0), GREEN),
                        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                        ("FONTSIZE", (0, 0), (-1, -1), 9),
                        ("BACKGROUND", (0, 1), (-1, -1), LIGHT),
                        ("GRID", (0, 0), (-1, -1), 0.5, GRAY),
                        ("PADDING", (0, 0), (-1, -1), 6),
                    ]
                )
            )
            story.append(t2)
            story.append(Spacer(1, 14))

        story.append(
            Paragraph(
                "Methodology",
                ParagraphStyle("H2", parent=styles["Heading2"], fontSize=12, textColor=GREEN, spaceAfter=8),
            )
        )
        story.append(
            Paragraph(
                "Emission factors: EPA Supply Chain GHG Emission Factors v1.4.0 "
                "(October 2025). GHG data year: 2023. Dollar year: 2024 USD. "
                "GWP: IPCC AR6. Scope 3 Category 4 upstream transportation.",
                ParagraphStyle("B", parent=styles["Normal"], fontSize=9, textColor=GRAY, leading=14),
            )
        )

        doc.build(story)
        buf.seek(0)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"PDF generation failed: {str(e)[:200]}",
        ) from e

    filename = f"verdant-scope3-report-{datetime.utcnow().strftime('%Y-%m')}.pdf"
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-cache",
        },
    )

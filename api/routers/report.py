"""
report.py
Verdant — Automated ESG Report Generator
"""

from __future__ import annotations

import io
from datetime import datetime

from fastapi import APIRouter
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
    summary = dict(cur.fetchone() or {})

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
        return {"error": "reportlab not installed"}

    with get_conn() as conn:
        summary, by_mode, high_risk, _by_country = fetch_report_data(conn)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=letter,
        rightMargin=0.75 * inch,
        leftMargin=0.75 * inch,
        topMargin=0.75 * inch,
        bottomMargin=0.75 * inch,
    )
    styles = getSampleStyleSheet()
    green = colors.HexColor("#1a3d2b")
    light_green = colors.HexColor("#f0fdf4")
    gray = colors.HexColor("#6b7566")

    title_style = ParagraphStyle("VerdantTitle", parent=styles["Title"], fontSize=22, textColor=green, spaceAfter=4)
    subtitle_style = ParagraphStyle("VerdantSubtitle", parent=styles["Normal"], fontSize=11, textColor=gray, spaceAfter=16)
    section_style = ParagraphStyle("VerdantSection", parent=styles["Heading2"], fontSize=13, textColor=green, spaceBefore=16, spaceAfter=8)
    body_style = ParagraphStyle("VerdantBody", parent=styles["Normal"], fontSize=9, textColor=colors.HexColor("#374034"), leading=14, spaceAfter=6)
    small_style = ParagraphStyle("VerdantSmall", parent=styles["Normal"], fontSize=8, textColor=gray, leading=12)

    now = datetime.utcnow()
    story = [
        Paragraph("Verdant", title_style),
        Paragraph(f"Scope 3 GHG Emissions Report — {now.strftime('%B %Y')}", subtitle_style),
        HRFlowable(width="100%", thickness=2, color=green),
        Spacer(1, 12),
        Paragraph(
            "This report discloses Scope 3 Category 4 emissions using EPA Supply Chain GHG Emission Factors v1.4.0.",
            body_style,
        ),
        Spacer(1, 16),
        Paragraph("Executive Summary", section_style),
    ]

    ytd = summary.get("total_ytd") or 0
    mtd = summary.get("total_30d") or 0
    sup = summary.get("supplier_count") or 0
    ship = summary.get("shipment_count") or 0
    intensity = summary.get("avg_intensity") or 0

    summary_data = [
        ["Metric", "Value", "Scope", "Standard"],
        ["Total Scope 3 Emissions (YTD)", f"{float(ytd):,.0f} kg CO₂e", "Scope 3 Cat. 4", "GHG Protocol"],
        ["Total Scope 3 Emissions (30-day)", f"{float(mtd):,.0f} kg CO₂e", "Scope 3 Cat. 4", "GHG Protocol"],
        ["Suppliers Tracked", f"{sup:,}", "All tiers", "Internal"],
        ["Shipments Analyzed", f"{int(ship):,}", "All modes", "Internal"],
        ["Average Carbon Intensity", f"{float(intensity):.4f} kg CO₂e/kg", "Scope 3 Cat. 4", "GHG Protocol"],
    ]
    t = Table(summary_data, colWidths=[2.5 * inch, 1.5 * inch, 1.3 * inch, 1.3 * inch])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), green),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, light_green]),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5cc")),
                ("PADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story += [t, Spacer(1, 16), Paragraph("Emissions by Transport Mode", section_style)]

    mode_data = [["Mode", "Emissions (kg CO₂e)", "Shipments", "% of Total"]]
    for row in by_mode:
        mode_data.append(
            [
                row.get("transport_mode", ""),
                f"{float(row.get('emissions_kg') or 0):,.0f}",
                f"{int(row.get('shipments') or 0):,}",
                f"{float(row.get('pct') or 0):.1f}%",
            ]
        )
    t2 = Table(mode_data, colWidths=[1.5 * inch, 2 * inch, 1.5 * inch, 1.5 * inch])
    t2.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), green),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, light_green]),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5cc")),
                ("PADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story += [t2, Spacer(1, 16)]

    if high_risk:
        story.append(Paragraph("High-Risk Suppliers Requiring Action", section_style))
        risk_data = [["Supplier", "Country", "Risk Tier", "30d Emissions", "Trend"]]
        for row in high_risk:
            risk_data.append(
                [
                    str(row.get("name", ""))[:30],
                    row.get("country", ""),
                    row.get("risk_tier", ""),
                    f"{float(row.get('emissions_30d') or 0):,.0f} kg",
                    row.get("emissions_trend", ""),
                ]
            )
        t3 = Table(risk_data, colWidths=[2.2 * inch, 0.8 * inch, 0.9 * inch, 1.2 * inch, 1.2 * inch])
        t3.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), green),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTSIZE", (0, 0), (-1, -1), 8),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#fff7ed")]),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5cc")),
                    ("PADDING", (0, 0), (-1, -1), 6),
                ]
            )
        )
        story += [t3, Spacer(1, 16)]

    story += [
        Paragraph("Methodology & Data Sources", section_style),
        Paragraph("Emission factors: EPA Supply Chain GHG Emission Factors v1.4.0.", body_style),
        Paragraph(f"Report generated: {now.strftime('%Y-%m-%d %H:%M')} UTC", small_style),
    ]

    doc.build(story)
    buf.seek(0)
    filename = f"verdant-scope3-report-{now.strftime('%Y-%m')}.pdf"
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"', "Cache-Control": "no-cache"},
    )

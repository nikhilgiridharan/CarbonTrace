"""
digest.py
Verdant — Weekly Email Digest
"""

from __future__ import annotations

import os
from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from psycopg2.extras import RealDictCursor

from db.connection import get_conn

try:
    import resend
except Exception:  # pragma: no cover
    resend = None

router = APIRouter()
if resend is not None:
    resend.api_key = os.environ.get("RESEND_API_KEY", "")


class DigestRequest(BaseModel):
    email: str


def build_digest_html(summary, top_suppliers, recommended_action):
    rows = "".join(
        [
            f"""
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7e2;font-size:13px;color:#374034;">{s['name']}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7e2;font-size:13px;color:#374034;">{s['country']}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7e2;font-size:13px;font-weight:600;color:{'#b91c1c' if s['risk_tier'] == 'CRITICAL' else '#c2410c' if s['risk_tier'] == 'HIGH' else '#374034'};">{s['risk_tier']}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7e2;font-size:13px;font-family:monospace;color:#374034;">{float(s.get('emissions_30d') or 0):,.0f} kg</td>
        </tr>
        """
            for s in top_suppliers
        ]
    )
    return f"""
    <html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f7f8f6;">
      <div style="background:#1a3d2b;padding:24px 28px;border-radius:8px 8px 0 0;">
        <h1 style="color:#f0fdf4;margin:0;font-size:22px;">Verdant</h1>
        <p style="color:#86efac;margin:4px 0 0;font-size:12px;">Weekly Scope 3 Emissions Digest — {datetime.utcnow().strftime('%B %d, %Y')}</p>
      </div>
      <div style="background:white;padding:24px 28px;">
        <h2 style="color:#1a3d2b;font-size:15px;margin:0 0 16px;">Platform Summary</h2>
        <div style="display:flex;gap:16px;margin-bottom:24px;">
          <div style="flex:1;padding:14px;background:#f0fdf4;border-radius:6px;border-left:3px solid #3d8c21;">
            <div style="font-size:11px;color:#6b7566;text-transform:uppercase;letter-spacing:0.05em;">Total CO₂ (30d)</div>
            <div style="font-size:22px;font-weight:700;color:#1a3d2b;margin-top:4px;">{float(summary.get('total_30d') or 0):,.0f} kg</div>
          </div>
          <div style="flex:1;padding:14px;background:#fff7ed;border-radius:6px;border-left:3px solid #c2410c;">
            <div style="font-size:11px;color:#6b7566;text-transform:uppercase;letter-spacing:0.05em;">Suppliers at Risk</div>
            <div style="font-size:22px;font-weight:700;color:#b91c1c;margin-top:4px;">{summary.get('at_risk_count', 0)}</div>
          </div>
        </div>
        <h2 style="color:#1a3d2b;font-size:15px;margin:0 0 12px;">Top 5 Suppliers Requiring Attention</h2>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7e2;border-radius:6px;overflow:hidden;margin-bottom:24px;">
          <thead>
            <tr style="background:#f0f2ee;">
              <th style="padding:10px 12px;text-align:left;font-size:11px;color:#6b7566;text-transform:uppercase;letter-spacing:0.05em;">Supplier</th>
              <th style="padding:10px 12px;text-align:left;font-size:11px;color:#6b7566;text-transform:uppercase;">Country</th>
              <th style="padding:10px 12px;text-align:left;font-size:11px;color:#6b7566;text-transform:uppercase;">Risk</th>
              <th style="padding:10px 12px;text-align:left;font-size:11px;color:#6b7566;text-transform:uppercase;">30d Emissions</th>
            </tr>
          </thead>
          <tbody>{rows}</tbody>
        </table>
        <div style="padding:16px;background:#f0fdf4;border-radius:6px;border-left:3px solid #3d8c21;margin-bottom:24px;">
          <div style="font-size:11px;font-weight:600;color:#3d8c21;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Recommended Action</div>
          <p style="font-size:13px;color:#374034;margin:0;line-height:1.5;">{recommended_action}</p>
        </div>
      </div>
    </body></html>
    """


@router.post("/send")
async def send_digest(request: DigestRequest):
    if resend is None or not os.environ.get("RESEND_API_KEY"):
        raise HTTPException(status_code=503, detail="Email service not configured (RESEND_API_KEY not set)")

    with get_conn() as conn, conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """
            SELECT
                ROUND(SUM(emissions_kg_co2e) FILTER (WHERE event_at > NOW() - INTERVAL '30 days')::numeric, 0) as total_30d,
                COUNT(DISTINCT supplier_id) FILTER (
                    WHERE EXISTS (
                        SELECT 1 FROM supplier_risk_scores r
                        WHERE r.supplier_id = shipment_silver_summary.supplier_id
                        AND r.risk_tier IN ('HIGH', 'CRITICAL')
                    )
                ) as at_risk_count
            FROM shipment_silver_summary
            """
        )
        summary = dict(cur.fetchone() or {})
        cur.execute(
            """
            SELECT s.name, s.country, r.risk_tier,
                   ROUND(r.emissions_30d_kg::numeric, 0) as emissions_30d
            FROM supplier_risk_scores r
            JOIN suppliers s ON r.supplier_id = s.supplier_id
            WHERE r.risk_tier IN ('HIGH', 'CRITICAL')
            ORDER BY r.emissions_30d_kg DESC NULLS LAST
            LIMIT 5
            """
        )
        top_suppliers = [dict(r) for r in cur.fetchall()]
        cur.execute(
            """
            SELECT s.name, ROUND(r.emissions_30d_kg::numeric, 0) as emissions
            FROM supplier_risk_scores r
            JOIN suppliers s ON r.supplier_id = s.supplier_id
            WHERE r.risk_tier = 'CRITICAL'
            ORDER BY r.emissions_30d_kg DESC NULLS LAST
            LIMIT 1
            """
        )
        top_critical = cur.fetchone()

    action = (
        f"Prioritize reviewing {top_critical['name']} — your highest-risk supplier with "
        f"{float(top_critical['emissions'] or 0):,.0f} kg CO₂e in the last 30 days."
        if top_critical
        else "Your supply chain emissions are within normal ranges this week."
    )
    html = build_digest_html(summary, top_suppliers, action)

    try:
        resend.Emails.send(
            {
                "from": "Verdant <digest@yourdomain.com>",
                "to": request.email,
                "subject": f"Weekly Emissions Digest — {datetime.utcnow().strftime('%B %d')}",
                "html": html,
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}") from e
    return {"status": "sent", "email": request.email}

# app/routes/planner.py
from flask import Blueprint, render_template, request, jsonify, Response
import io, csv, json
from datetime import datetime

planner = Blueprint("planner", __name__)

# ---------------------------
# Helpers (no rompen compat)
# ---------------------------
def _normalize_phases(phases, days):
    """Normaliza shares y asegura días válidos por fase."""
    if not phases:
        if not days:
            days = 30
        phases = [
            {"name": "Testing",  "share": 0.2, "days": min(7, days)},
            {"name": "Escalado", "share": 0.8, "days": max(days - min(7, days), 1)},
        ]
    else:
        total_share = sum(float(p.get("share", 0)) for p in phases) or 1.0
        for p in phases:
            p["share"] = float(p.get("share", 0)) / total_share

    if not days:
        days = sum(int(p.get("days", 0) or 0) for p in phases) or 30
    return phases, int(days)


def _compute_plan(payload):
    """Devuelve (result_dict, error_msg) sin lanzar excepciones."""
    data   = payload or {}
    budget = float(data.get("budget", 0) or 0)
    cpa    = float(data.get("cpa", 0) or 0)
    days   = int(data.get("days", 0) or 0)
    phases = data.get("phases") or []

    if budget <= 0 or cpa <= 0:
        return None, "budget y cpa deben ser > 0"

    phases, days = _normalize_phases(phases, days)

    series, total = [], 0.0
    day = 1
    for p in phases:
        p_days = int(p.get("days", 0)) or max(int(days * float(p["share"])), 1)
        p_budget = budget * float(p["share"])
        daily = p_budget / p_days
        for _ in range(p_days):
            leads = daily / cpa
            total += leads
            series.append({
                "day": day,
                "phase": p["name"],
                "spend": round(daily, 2),
                "leads": round(leads, 2)
            })
            day += 1

    result = {
        "totals": {
            "budget": round(budget, 2),
            "cpa": round(cpa, 2),
            "leads": round(total, 2),
            "days": len(series)
        },
        "series": series,
        "phases": [{"name": p["name"], "share": p["share"], "days": p.get("days")} for p in phases]
    }
    return result, None


def _series_to_csv(series):
    """Convierte la serie a CSV en memoria y retorna bytes."""
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=["day", "phase", "spend", "leads"])
    writer.writeheader()
    for row in series:
        writer.writerow(row)
    return buf.getvalue().encode("utf-8")


# ======== Export de ESTRUCTURA (para Excel/Sheets) ========
_STRUCTURE_HEADERS = [
    "campaign_name","objective","buy_type","start_date","end_date",
    "platforms","placements",
    "adset_name","daily_budget","advantage_flags",
    "ad_name","cta","url","utm_source","utm_medium","utm_campaign","utm_content",
    "variation_index","copy","title","description"
]

def _model_to_structure_rows(model: dict):
    """
    Convierte el 'modelo' del planner (cliente, campana, sets, ads, variaciones, utms, etc.)
    en filas planas (una por variación) con cabeceras _STRUCTURE_HEADERS.
    """
    m = model or {}
    rows = []
    campana     = m.get("campana") or ""
    objetivo    = m.get("objetivo") or ""
    compra      = (m.get("compra") or "").upper()
    f_inicio    = m.get("fInicio") or ""
    f_fin       = m.get("fFin") or ""
    platforms   = "|".join(m.get("platforms") or [])
    placements  = "|".join(m.get("placements") or [])
    advantage   = "|".join(m.get("advantage") or [])

    sets = m.get("sets") or []
    ads  = m.get("ads")  or []

    budget_by_set = { (s.get("nombre") or ""): (s.get("presupuesto") or "") for s in sets }

    for ad in ads:
        ad_nombre  = ad.get("nombre") or ""
        conjunto   = ad.get("conjunto") or ""
        daily_bud  = budget_by_set.get(conjunto, "")
        cta        = ad.get("cta") or ""
        url        = ad.get("url") or ""
        utm_source = ad.get("utm_source") or ""
        utm_medium = ad.get("utm_medium") or ""
        utm_camp   = ad.get("utm_campaign") or ""
        utm_cont   = ad.get("utm_content") or ""
        variaciones = ad.get("variaciones") or []

        if not variaciones:
            rows.append({
                "campaign_name": campana, "objective": objetivo, "buy_type": compra,
                "start_date": f_inicio, "end_date": f_fin,
                "platforms": platforms, "placements": placements,
                "adset_name": conjunto, "daily_budget": daily_bud, "advantage_flags": advantage,
                "ad_name": ad_nombre, "cta": cta, "url": url,
                "utm_source": utm_source, "utm_medium": utm_medium,
                "utm_campaign": utm_camp, "utm_content": utm_cont,
                "variation_index": "", "copy": "", "title": "", "description": ""
            })
        else:
            for v in variaciones:
                rows.append({
                    "campaign_name": campana, "objective": objetivo, "buy_type": compra,
                    "start_date": f_inicio, "end_date": f_fin,
                    "platforms": platforms, "placements": placements,
                    "adset_name": conjunto, "daily_budget": daily_bud, "advantage_flags": advantage,
                    "ad_name": ad_nombre, "cta": cta, "url": url,
                    "utm_source": utm_source, "utm_medium": utm_medium,
                    "utm_campaign": utm_camp, "utm_content": utm_cont,
                    "variation_index": v.get("index") or "",
                    "copy": v.get("copy") or "",
                    "title": v.get("titulo") or "",
                    "description": v.get("descripcion") or ""
                })

    if not rows:
        rows.append({
            "campaign_name": campana, "objective": objetivo, "buy_type": compra,
            "start_date": f_inicio, "end_date": f_fin,
            "platforms": platforms, "placements": placements,
            "adset_name": "", "daily_budget": "", "advantage_flags": "",
            "ad_name": "", "cta": "", "url": "",
            "utm_source": "", "utm_medium": "", "utm_campaign": "", "utm_content": "",
            "variation_index": "", "copy": "", "title": "", "description": ""
        })
    return rows


def _rows_to_csv(headers, rows):
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=headers, extrasaction="ignore")
    writer.writeheader()
    for r in rows:
        writer.writerow({h: r.get(h, "") for h in headers})
    return buf.getvalue().encode("utf-8")


# ---------------------------
# Vistas
# ---------------------------
@planner.get("/plan")
def plan_page():
    return render_template("plan.html", title="Estrategia & Simulador")


@planner.post("/api/simulate")
def simulate():
    payload = request.get_json(force=True, silent=True) or {}
    result, err = _compute_plan(payload)
    if err:
        return jsonify(error=err), 400
    return jsonify(result)


@planner.post("/api/export")
def export_plan():
    """
    Exporta la SERIE DIARIA de la simulación.
    body:
      {
        budget: number,
        cpa: number,
        days?: number,
        phases?: [{name, share?, days?}],
        format?: "json" | "csv"   (default json)
      }
    """
    payload = request.get_json(force=True, silent=True) or {}
    fmt = (payload.get("format") or "json").lower()

    result, err = _compute_plan(payload)
    if err:
        return jsonify(error=err), 400

    if fmt == "csv":
        csv_bytes = _series_to_csv(result["series"])
        filename = f"plan-series-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}.csv"
        return Response(
            csv_bytes,
            mimetype="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )

    filename = f"plan-summary-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}.json"
    return Response(
        json.dumps(result, ensure_ascii=False, indent=2).encode("utf-8"),
        mimetype="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


@planner.post("/api/export-structure")
def export_structure():
    """
    Exporta la ESTRUCTURA DE CAMPAÑA (lista plana por variación) para Excel/Sheets.
    Acepta:
      - rows: lista de filas ya aplanadas
      - model: objeto del planner (como buildSummary() en el FE)
    """
    payload = request.get_json(force=True, silent=True) or {}
    fmt = (payload.get("format") or "csv").lower()

    rows = payload.get("rows")
    if not rows:
        model = payload.get("model") or {}
        rows = _model_to_structure_rows(model)

    if not isinstance(rows, list):
        return jsonify(error="rows debe ser una lista"), 400

    ts = datetime.utcnow().strftime('%Y%m%d-%H%M%S')
    if fmt == "json":
        filename = f"estructura-campana-{ts}.json"
        return Response(
            json.dumps(rows, ensure_ascii=False, indent=2).encode("utf-8"),
            mimetype="application/json",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )

    csv_bytes = _rows_to_csv(_STRUCTURE_HEADERS, rows)
    filename = f"estructura-campana-{ts}.csv"
    return Response(
        csv_bytes,
        mimetype="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


@planner.get("/api/health")
def health():
    return jsonify(status="ok")

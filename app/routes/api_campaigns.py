# app/routes/api_campaigns.py
from __future__ import annotations

from flask import Blueprint, request, jsonify, g
from werkzeug.exceptions import BadRequest, NotFound

from ..models import (
    Project, Campaign, Phase, AdSet, Ad,
    create_campaign, duplicate_campaign, campaign_projection,
)

bp = Blueprint("api_campaigns", __name__, url_prefix="/api/campaigns")


# ---------------------------
# Helpers
# ---------------------------
def model_to_dict(obj):
    """Serializador simple para respuestas JSON."""
    if isinstance(obj, Project):
        return {
            "id": obj.id,
            "name": obj.name,
            "client_name": obj.client_name,
            "created_at": obj.created_at.isoformat() if obj.created_at else None,
        }
    if isinstance(obj, Campaign):
        return {
            "id": obj.id,
            "project_id": obj.project_id,
            "name": obj.name,
            "objective": obj.objective,
            "budget_total": obj.budget_total,
            "currency": obj.currency,
            "cpa_expected": obj.cpa_expected,
            "days": obj.days,
            "start_date": obj.start_date.isoformat() if obj.start_date else None,
            "end_date": obj.end_date.isoformat() if obj.end_date else None,
            "notes": obj.notes,
            "is_active": obj.is_active,
            "created_at": obj.created_at.isoformat() if obj.created_at else None,
        }
    if isinstance(obj, Phase):
        return {
            "id": obj.id,
            "campaign_id": obj.campaign_id,
            "name": obj.name,
            "order": obj.order,
            "days": obj.days,
            "budget_share": obj.budget_share,
        }
    if isinstance(obj, AdSet):
        return {
            "id": obj.id,
            "campaign_id": obj.campaign_id,
            "name": obj.name,
            "targeting": obj.get_targeting(),
            "budget_daily": obj.budget_daily,
            "use_advantage_plus": obj.use_advantage_plus,
        }
    if isinstance(obj, Ad):
        return {
            "id": obj.id,
            "adset_id": obj.adset_id,
            "name": obj.name,
            "ad_type": obj.ad_type,
            "copy_primary": obj.copy_primary,
            "copy_secondary": obj.copy_secondary,
            "cta": obj.cta,
            "post_id": obj.post_id,
            "url": obj.url,
        }
    return {}


def _require_json() -> dict:
    if not request.is_json:
        raise BadRequest("Content-Type must be application/json")
    data = request.get_json(silent=True) or {}
    return data


# ---------------------------
# Endpoints
# ---------------------------

@bp.get("")
def list_campaigns():
    """Lista campañas con info mínima + nombre de proyecto."""
    s = g.db
    rows = (
        s.query(Campaign, Project.name.label("project_name"))
        .join(Project, Project.id == Campaign.project_id)
        .order_by(Campaign.created_at.desc())
        .all()
    )
    out = []
    for camp, project_name in rows:
        d = model_to_dict(camp)
        d["project_name"] = project_name
        out.append(d)
    return jsonify(out)


@bp.post("")
def create_campaign_endpoint():
    """
    Crea campaña. Body JSON esperado:
    {
      "project_id": 1,                  // opcional
      "project_name": "Mi Cliente",     // si no se envía project_id
      "name": "Campaña X",
      "objective": "LEADS" | "MESSAGES" | "PURCHASES" | "TRAFFIC_WHATSAPP",
      "budget_total": 1500,
      "currency": "PEN" | "USD",
      "cpa_expected": 5,
      "days": 30,
      "notes": "opcional"
    }
    """
    s = g.db
    data = _require_json()

    project_id = data.get("project_id")
    if not project_id:
        # crear proyecto on-the-fly si no mandan ID
        pname = data.get("project_name") or "Proyecto"
        p = Project(name=pname)
        s.add(p)
        s.flush()
        project_id = p.id

    camp = create_campaign(
        s,
        project_id=project_id,
        name=data.get("name") or "Campaña",
        objective=data.get("objective") or "LEADS",
        budget_total=float(data.get("budget_total") or 0),
        currency=(data.get("currency") or "PEN"),
        cpa_expected=float(data.get("cpa_expected") or 0),
        days=int(data.get("days") or 30),
        notes=data.get("notes"),
    )
    return model_to_dict(camp), 201


@bp.get("/<int:cid>")
def get_campaign(cid: int):
    s = g.db
    camp = s.get(Campaign, cid)
    if not camp:
        raise NotFound("Campaña no encontrada")

    # detalle con relaciones básicas
    payload = model_to_dict(camp)
    payload["phases"] = [model_to_dict(ph) for ph in camp.phases]
    payload["adsets"] = []
    for aset in camp.adsets:
        d = model_to_dict(aset)
        d["ads"] = [model_to_dict(ad) for ad in aset.ads]
        payload["adsets"].append(d)

    return jsonify(payload)


@bp.put("/<int:cid>")
def update_campaign(cid: int):
    s = g.db
    camp = s.get(Campaign, cid)
    if not camp:
        raise NotFound("Campaña no encontrada")

    data = _require_json()
    # campos editables rápidos
    for field in ["name", "objective", "currency", "notes"]:
        if field in data:
            setattr(camp, field, data[field])
    if "budget_total" in data:
        camp.budget_total = float(data["budget_total"] or 0)
    if "cpa_expected" in data:
        camp.cpa_expected = float(data["cpa_expected"] or 0)
    if "days" in data:
        camp.days = int(data["days"] or 1)

    s.add(camp)
    s.commit()
    return model_to_dict(camp)


@bp.delete("/<int:cid>")
def delete_campaign(cid: int):
    s = g.db
    camp = s.get(Campaign, cid)
    if not camp:
        raise NotFound("Campaña no encontrada")
    s.delete(camp)
    s.commit()
    return {"ok": True}


@bp.post("/<int:cid>/duplicate")
def duplicate_campaign_endpoint(cid: int):
    s = g.db
    copy = duplicate_campaign(s, cid)
    return model_to_dict(copy), 201


@bp.get("/<int:cid>/projection")
def projection(cid: int):
    s = g.db
    rows = campaign_projection(s, cid)
    return jsonify(rows)

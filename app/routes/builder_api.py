# app/routes/builder_api.py
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Tuple

from flask import Blueprint, jsonify, request, g, Response, abort

# Usamos el Project de tus modelos y el Session que abre app/__init__.py
from ..models import Project  # type: ignore

bp = Blueprint("builder_api", __name__, url_prefix="/api/builder")

# --------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------
def _now_iso() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"


def _ensure_meta(project: Project) -> Dict[str, Any]:
    """Garantiza que project.meta exista y tenga la clave 'builder'."""
    if project.meta is None:
        project.meta = {}
    if "builder" not in project.meta or not isinstance(project.meta.get("builder"), dict):
        project.meta["builder"] = {}
    return project.meta


def _project_to_dict(project: Project) -> Dict[str, Any]:
    meta = _ensure_meta(project)
    plan = meta.get("builder", {})
    return {
        "id": project.id,
        "name": project.name,
        "created_at": getattr(project, "created_at", None),
        "updated_at": getattr(project, "updated_at", None),
        "plan": plan,
    }


def _require_json() -> Dict[str, Any]:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        abort(400, description="Payload JSON inválido.")
    return data


# --------------------------------------------------------------------
# CRUD
# --------------------------------------------------------------------
@bp.get("/projects")
def list_projects() -> Response:
    """Lista proyectos con plan del builder (id, name)."""
    db = g.db
    q = db.query(Project).order_by(Project.id.desc())
    rows = [_project_to_dict(p) for p in q.all()]
    return jsonify(rows)


@bp.post("/projects")
def create_project() -> Response:
    """Crea un proyecto con name y plan (JSON del builder)."""
    db = g.db
    data = _require_json()

    name = (data.get("name") or "Nuevo plan").strip()
    plan = data.get("plan") or {}

    p = Project(name=name)  # otros campos por defecto
    p.meta = {"builder": plan, "builder_saved_at": _now_iso()}
    db.add(p)
    db.commit()
    db.refresh(p)
    return jsonify(_project_to_dict(p)), 201


@bp.get("/projects/<int:pid>")
def get_project(pid: int) -> Response:
    db = g.db
    p = db.get(Project, pid)
    if not p:
        abort(404, description="Proyecto no encontrado")
    return jsonify(_project_to_dict(p))


@bp.put("/projects/<int:pid>")
def update_project(pid: int) -> Response:
    db = g.db
    p = db.get(Project, pid)
    if not p:
        abort(404, description="Proyecto no encontrado")

    data = _require_json()
    name = data.get("name")
    plan = data.get("plan")

    if isinstance(name, str) and name.strip():
        p.name = name.strip()

    meta = _ensure_meta(p)
    if isinstance(plan, dict):
        meta["builder"] = plan
        meta["builder_saved_at"] = _now_iso()

    db.add(p)
    db.commit()
    return jsonify(_project_to_dict(p))


@bp.delete("/projects/<int:pid>")
def delete_project(pid: int) -> Response:
    db = g.db
    p = db.get(Project, pid)
    if not p:
        abort(404, description="Proyecto no encontrado")
    db.delete(p)
    db.commit()
    return jsonify({"ok": True})


@bp.post("/projects/<int:pid>/duplicate")
def duplicate_project(pid: int) -> Response:
    db = g.db
    p = db.get(Project, pid)
    if not p:
        abort(404, description="Proyecto no encontrado")

    new_name = f"{p.name} (copia)"
    copy = Project(name=new_name)
    _ = _ensure_meta(p)
    plan = p.meta.get("builder", {}) if isinstance(p.meta, dict) else {}
    copy.meta = {"builder": plan, "builder_saved_at": _now_iso()}

    db.add(copy)
    db.commit()
    db.refresh(copy)
    return jsonify(_project_to_dict(copy)), 201


# --------------------------------------------------------------------
# Export a CSV (campañas / adsets / ads) a partir del plan JSON
# --------------------------------------------------------------------
def _flatten_plan(plan: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Convierte el JSON del builder en 3 tablas planas:
    - campaigns: 1 fila por campaña (normalmente 1)
    - adsets:    1 fila por conjunto
    - ads:       1 fila por anuncio
    Estructura tolerante: si faltan claves, rellena con valores por defecto.
    """
    campaigns: List[Dict[str, Any]] = []
    adsets: List[Dict[str, Any]] = []
    ads: List[Dict[str, Any]] = []

    pj = plan.get("project") or {}
    cj = plan.get("campaign") or {}
    aj = plan.get("adsets") or []

    # --- Campaign
    campaigns.append({
        "campaign_name": cj.get("name", ""),
        "objective": cj.get("objective", ""),
        "buying_type": cj.get("buyingType", ""),   # CBO/ABO
        "daily_budget": cj.get("dailyBudget", ""),
        "lifetime_budget": cj.get("lifetimeBudget", ""),
        "start_date": cj.get("startDate", ""),
        "end_date": cj.get("endDate", ""),
        "is_evergreen": cj.get("evergreen", False),
        "placements_mode": cj.get("placementsMode", "manual"),
        "use_advantage_plus": cj.get("useAdvPlus", False),
        "client": pj.get("client", ""),
        "brand": pj.get("brand", ""),
        "notes": cj.get("notes", ""),
    })

    # --- AdSets & Ads
    for idx, s in enumerate(aj, start=1):
        adset_row = {
            "adset_name": s.get("name", f"Adset {idx}"),
            "budget": s.get("budget", ""),
            "schedule": s.get("schedule", ""),
            "country": ", ".join(s.get("country", []) or s.get("countries", []) or []),
            "age_min": s.get("ageMin", ""),
            "age_max": s.get("ageMax", ""),
            "genders": ",".join(s.get("genders", [])) if isinstance(s.get("genders"), list) else s.get("genders", ""),
            "languages": ",".join(s.get("languages", [])) if isinstance(s.get("languages"), list) else s.get("languages", ""),
            "placements": ",".join(s.get("placements", [])) if isinstance(s.get("placements"), list) else s.get("placements", ""),
            "interests": ",".join([i.get("name", i) for i in (s.get("interests") or [])]),
            "use_ai_expansion": bool(s.get("useAIExpansion", False)),
        }
        adsets.append(adset_row)

        # anuncios
        for jdx, ad in enumerate(s.get("ads") or [], start=1):
            ads.append({
                "adset_name": adset_row["adset_name"],
                "ad_name": ad.get("name", f"Ad {idx}.{jdx}"),
                "use_existing_post": bool(ad.get("useExistingPost", False)),
                "post_id": ad.get("postId", ""),
                "link": ad.get("link", ""),
                "utm": ad.get("utm", ""),
                "primary_text": ad.get("primaryText", ""),
                "headline": ad.get("headline", ""),
                "description": ad.get("description", ""),
                "use_text_ai": bool(ad.get("useTextAI", False)),
                "creative_type": ad.get("creativeType", ""),
            })

    return campaigns, adsets, ads


def _to_csv(rows: List[Dict[str, Any]], columns: List[str]) -> str:
    import csv
    from io import StringIO

    sio = StringIO()
    w = csv.writer(sio)
    w.writerow(columns)
    for r in rows:
        w.writerow([r.get(c, "") for c in columns])
    return sio.getvalue()


@bp.get("/projects/<int:pid>/export/<string:which>.csv")
def export_csv(pid: int, which: str) -> Response:
    """
    Devuelve CSV de 'campaigns' | 'adsets' | 'ads'
    Ej: /api/builder/projects/12/export/campaigns.csv
    """
    db = g.db
    p = db.get(Project, pid)
    if not p:
        abort(404, description="Proyecto no encontrado")

    meta = _ensure_meta(p)
    plan = meta.get("builder", {}) if isinstance(meta, dict) else {}

    campaigns, adsets, ads = _flatten_plan(plan)

    if which == "campaigns":
        cols = [
            "campaign_name", "objective", "buying_type", "daily_budget", "lifetime_budget",
            "start_date", "end_date", "is_evergreen", "placements_mode", "use_advantage_plus",
            "client", "brand", "notes",
        ]
        csv_text = _to_csv(campaigns, cols)
    elif which == "adsets":
        cols = [
            "adset_name", "budget", "schedule", "country", "age_min", "age_max",
            "genders", "languages", "placements", "interests", "use_ai_expansion",
        ]
        csv_text = _to_csv(adsets, cols)
    elif which == "ads":
        cols = [
            "adset_name", "ad_name", "use_existing_post", "post_id", "link", "utm",
            "primary_text", "headline", "description", "use_text_ai", "creative_type",
        ]
        csv_text = _to_csv(ads, cols)
    else:
        abort(400, description="Recurso CSV desconocido. Usa campaigns|adsets|ads")

    filename = f"{which}.csv"
    return Response(
        csv_text,
        mimetype="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

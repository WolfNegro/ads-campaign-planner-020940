# app/routes/structure.py
from __future__ import annotations
from flask import Blueprint, render_template

bp = Blueprint("structure", __name__)

@bp.get("/structure")
def structure_home():
    # UI que consume /api/campaigns
    return render_template("structure.html")

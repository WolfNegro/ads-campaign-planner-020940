# app/routes/builder.py
from flask import Blueprint, render_template

bp = Blueprint("builder", __name__)

@bp.get("/builder")
def builder_view():
    # Render del Organizador/Constructor de Campañas
    return render_template("builder.html")

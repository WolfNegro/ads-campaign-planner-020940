# app/__init__.py
from __future__ import annotations

import os
from flask import Flask, g
from dotenv import load_dotenv

# Capa de datos (SQLAlchemy puro)
from .models import (
    init_db, get_engine, Base, create_demo_data,
)
from sqlalchemy.orm import sessionmaker, Session


def create_app() -> Flask:
    load_dotenv()

    app = Flask(__name__, static_folder="static", template_folder="templates")
    app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "dev")
    app.config["JSON_SORT_KEYS"] = False

    # ---------- DB / SQLAlchemy (sin Flask-SQLAlchemy) ----------
    db_url = os.getenv("DATABASE_URL") or os.getenv("SQLALCHEMY_DATABASE_URI")
    engine = init_db(db_url)  # crea tablas si no existen
    SessionLocal = sessionmaker(bind=engine, expire_on_commit=False, future=True)
    app.extensions["db_sessionmaker"] = SessionLocal

    @app.before_request
    def _open_session():
        g.db = SessionLocal()

    @app.teardown_appcontext
    def _close_session(_exc):
        db: Session | None = getattr(g, "db", None)
        if db is not None:
            db.close()

    # ---------- Blueprints ----------
    from .routes.main import bp as main_bp
    from .routes.planner import planner as planner_bp
    from .routes.api_campaigns import bp as api_campaigns_bp
    from .routes.structure import bp as structure_bp
    from .routes.builder_api import bp as builder_api_bp
    from .routes.builder import bp as builder_bp       # <-- NUEVO

    app.register_blueprint(main_bp)
    app.register_blueprint(planner_bp)
    app.register_blueprint(api_campaigns_bp)
    app.register_blueprint(structure_bp)
    app.register_blueprint(builder_api_bp)
    app.register_blueprint(builder_bp)                 # <-- NUEVO

    # ---------- CLI helpers ----------
    @app.cli.command("init-db")
    def init_db_cmd():
        init_db(db_url)
        print("✔ DB lista:", (db_url or "sqlite:///instance/app.db"))

    @app.cli.command("seed-demo")
    def seed_demo_cmd():
        SessionLocal = app.extensions["db_sessionmaker"]
        with SessionLocal() as s:
            info = create_demo_data(s)
            print("✔ Seed:", info)

    # ---------- Errores ----------
    @app.errorhandler(404)
    def not_found(_):
        return {"error": "Not found"}, 404

    return app

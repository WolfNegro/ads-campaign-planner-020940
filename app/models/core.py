# app/models/core.py
from __future__ import annotations

import json
import os
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any

from sqlalchemy import (
    create_engine, String, Integer, Float, ForeignKey, DateTime, Enum,
    Boolean, Text, func
)
from sqlalchemy.orm import (
    DeclarativeBase, Mapped, mapped_column, relationship, Session, sessionmaker
)


# =========================
#  Config & Base ORM
# =========================

DEFAULT_DB_URL = "sqlite:///instance/app.db"


class Base(DeclarativeBase):
    """Base declarativa de SQLAlchemy."""


def get_engine(db_url: Optional[str] = None):
    """
    Crea un engine. Por defecto usa instance/app.db (crea la carpeta si no existe).
    """
    url = db_url or DEFAULT_DB_URL
    if url.startswith("sqlite:///"):
        # asegurar carpeta instance/
        path = url.replace("sqlite:///", "")
        folder = os.path.dirname(path)
        if folder and not os.path.exists(folder):
            os.makedirs(folder, exist_ok=True)
    return create_engine(url, echo=False, future=True)


def get_session(db_url: Optional[str] = None) -> Session:
    engine = get_engine(db_url)
    return sessionmaker(bind=engine, expire_on_commit=False, future=True)()


def init_db(db_url: Optional[str] = None):
    """Crea tablas si no existen."""
    engine = get_engine(db_url)
    Base.metadata.create_all(engine)
    return engine


# =========================
#  Enums de negocio
# =========================

CurrencyEnum = Enum("PEN", "USD", name="currency")
ObjectiveEnum = Enum(
    "LEADS",             # Formularios / conversiones
    "MESSAGES",          # Mensajes/WhatsApp
    "PURCHASES",         # Compras
    "TRAFFIC_WHATSAPP",  # Tráfico a WhatsApp
    name="objective",
)
AdTypeEnum = Enum("IMAGE", "VIDEO", "CAROUSEL", name="ad_type")


# =========================
#  Modelos
# =========================

class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    client_name: Mapped[Optional[str]] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    campaigns: Mapped[List["Campaign"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Project {self.id} {self.name}>"


class Campaign(Base):
    __tablename__ = "campaigns"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False, index=True)

    objective: Mapped[str] = mapped_column(ObjectiveEnum, default="LEADS")
    budget_total: Mapped[float] = mapped_column(Float, default=0.0)
    currency: Mapped[str] = mapped_column(CurrencyEnum, default="PEN")
    cpa_expected: Mapped[float] = mapped_column(Float, default=0.0)  # costo por resultado
    days: Mapped[int] = mapped_column(Integer, default=30)

    start_date: Mapped[Optional[datetime]] = mapped_column(DateTime)
    end_date: Mapped[Optional[datetime]] = mapped_column(DateTime)

    notes: Mapped[Optional[str]] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    project: Mapped["Project"] = relationship(back_populates="campaigns")
    phases: Mapped[List["Phase"]] = relationship(
        back_populates="campaign", cascade="all, delete-orphan", order_by="Phase.order"
    )
    adsets: Mapped[List["AdSet"]] = relationship(
        back_populates="campaign", cascade="all, delete-orphan"
    )

    # ---- Helpers de negocio ----
    def ensure_default_phases(self):
        """
        Si la campaña no tiene fases, crea 2 por defecto:
        - Testing (30% del presupuesto, 7 días o 20% de duración)
        - Escalado (70% restante)
        """
        if self.phases:
            return

        testing_days = max(3, min(14, int(max(self.days, 1) * 0.2)))
        scaling_days = max(self.days - testing_days, 1)

        self.phases = [
            Phase(name="Testing", order=1, days=testing_days, budget_share=0.30),
            Phase(name="Escalado", order=2, days=scaling_days, budget_share=0.70),
        ]

    def projection(self) -> List[Dict[str, Any]]:
        """
        Proyección diaria simple:
        - Distribuye el presupuesto total entre fases por 'budget_share'.
        - Para cada día de la fase: inversión_diaria = presupuesto_fase / días_fase
          leads_diarios = inversión_diaria / cpa_expected  (si cpa_expected > 0)
        Retorna una lista con: día_absoluto (1..days), fase, inversion, leads
        """
        results: List[Dict[str, Any]] = []
        if self.days <= 0 or self.budget_total <= 0:
            return results

        self.ensure_default_phases()
        day_index = 1
        for ph in self.phases:
            # asegurar consistencia por si el usuario edita
            ph_days = max(ph.days or 0, 1)
            phase_budget = self.budget_total * (ph.budget_share or 0)
            inv_diaria = phase_budget / ph_days if ph_days else 0.0

            for _ in range(ph_days):
                if day_index > self.days:
                    break
                leads = (inv_diaria / self.cpa_expected) if self.cpa_expected > 0 else 0.0
                results.append(
                    dict(
                        day=day_index,
                        phase=ph.name,
                        investment=round(inv_diaria, 2),
                        leads=round(leads, 2),
                        currency=self.currency,
                    )
                )
                day_index += 1

        # si faltaron días (por redondeos), rellena con la última fase
        while day_index <= self.days:
            last_phase = self.phases[-1].name if self.phases else "Escalado"
            inv_diaria = self.budget_total / max(self.days, 1)
            leads = (inv_diaria / self.cpa_expected) if self.cpa_expected > 0 else 0.0
            results.append(
                dict(
                    day=day_index,
                    phase=last_phase,
                    investment=round(inv_diaria, 2),
                    leads=round(leads, 2),
                    currency=self.currency,
                )
            )
            day_index += 1

        return results

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Campaign {self.id} {self.name} {self.currency}>"


class Phase(Base):
    __tablename__ = "phases"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    campaign_id: Mapped[int] = mapped_column(ForeignKey("campaigns.id"), index=True)
    name: Mapped[str] = mapped_column(String(80), default="Testing")
    order: Mapped[int] = mapped_column(Integer, default=1)
    days: Mapped[int] = mapped_column(Integer, default=7)
    budget_share: Mapped[float] = mapped_column(Float, default=0.5)  # 0..1

    campaign: Mapped["Campaign"] = relationship(back_populates="phases")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Phase {self.id} {self.name} #{self.order}>"


class AdSet(Base):
    __tablename__ = "adsets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    campaign_id: Mapped[int] = mapped_column(ForeignKey("campaigns.id"), index=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)

    # Segmentación guardada como JSON string (edad, género, ubicaciones, intereses, etc.)
    targeting_json: Mapped[Optional[str]] = mapped_column(Text)

    budget_daily: Mapped[Optional[float]] = mapped_column(Float)
    placements_json: Mapped[Optional[str]] = mapped_column(Text)
    use_advantage_plus: Mapped[bool] = mapped_column(Boolean, default=False)

    campaign: Mapped["Campaign"] = relationship(back_populates="adsets")
    ads: Mapped[List["Ad"]] = relationship(
        back_populates="adset", cascade="all, delete-orphan"
    )

    # Helpers
    def set_targeting(self, data: Dict[str, Any]):
        self.targeting_json = json.dumps(data or {}, ensure_ascii=False)

    def get_targeting(self) -> Dict[str, Any]:
        try:
            return json.loads(self.targeting_json or "{}")
        except Exception:
            return {}

    def __repr__(self) -> str:  # pragma: no cover
        return f"<AdSet {self.id} {self.name}>"


class Ad(Base):
    __tablename__ = "ads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    adset_id: Mapped[int] = mapped_column(ForeignKey("adsets.id"), index=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)

    ad_type: Mapped[str] = mapped_column(AdTypeEnum, default="IMAGE")
    copy_primary: Mapped[Optional[str]] = mapped_column(Text)
    copy_secondary: Mapped[Optional[str]] = mapped_column(Text)
    cta: Mapped[Optional[str]] = mapped_column(String(60))
    post_id: Mapped[Optional[str]] = mapped_column(String(120))  # si reutilizas post
    url: Mapped[Optional[str]] = mapped_column(String(300))      # landing o wa.me

    adset: Mapped["AdSet"] = relationship(back_populates="ads")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Ad {self.id} {self.name}>"



# ==========================================================
#  Servicios de dominio (puedes llamarlos desde tu Blueprint)
# ==========================================================

def create_demo_data(session: Session) -> Dict[str, Any]:
    """
    Crea un proyecto y una campaña demo si la base está vacía.
    Retorna dict con ids creados para facilitar pruebas.
    """
    existing_projects = session.query(func.count(Project.id)).scalar() or 0
    if existing_projects > 0:
        return {"created": False}

    project = Project(name="Demo Brand", client_name="Cliente Demo")
    camp = Campaign(
        name="Campaña Leads Noviembre",
        project=project,
        objective="LEADS",
        budget_total=1500.0,
        currency="PEN",
        cpa_expected=5.0,
        days=30,
        start_date=datetime.utcnow(),
    )
    camp.ensure_default_phases()

    # Un adset y dos anuncios demo
    adset = AdSet(name="Mujeres 25-40 Lima", campaign=camp)
    adset.set_targeting(
        {
            "age_min": 25,
            "age_max": 40,
            "gender": "female",
            "locations": ["Lima"],
            "interests": ["Odontología", "Blanqueamiento dental"],
        }
    )
    adset.ads = [
        Ad(name="Copy A (Dolor)", ad_type="IMAGE", cta="Reservar", url="https://wa.me/"),
        Ad(name="Copy B (Resultado)", ad_type="VIDEO", cta="Enviar mensaje", url="https://wa.me/"),
    ]

    session.add(project)
    session.commit()
    return {"created": True, "project_id": project.id, "campaign_id": camp.id}


def create_campaign(
    session: Session,
    *,
    project_id: int,
    name: str,
    objective: str = "LEADS",
    budget_total: float = 0.0,
    currency: str = "PEN",
    cpa_expected: float = 0.0,
    days: int = 30,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    notes: Optional[str] = None,
) -> Campaign:
    """Crea campaña con dos fases por defecto."""
    camp = Campaign(
        project_id=project_id,
        name=name,
        objective=objective,
        budget_total=float(budget_total or 0),
        currency=currency,
        cpa_expected=float(cpa_expected or 0),
        days=int(days or 1),
        start_date=start_date,
        end_date=end_date,
        notes=notes,
    )
    camp.ensure_default_phases()
    session.add(camp)
    session.commit()
    return camp


def duplicate_campaign(session: Session, campaign_id: int, *, suffix: str = " (copia)") -> Campaign:
    """Duplica campaña completa (fases, adsets y ads)."""
    src: Campaign | None = session.get(Campaign, campaign_id)
    if not src:
        raise ValueError("Campaña no encontrada")

    dst = Campaign(
        project_id=src.project_id,
        name=(src.name + suffix)[:160],
        objective=src.objective,
        budget_total=src.budget_total,
        currency=src.currency,
        cpa_expected=src.cpa_expected,
        days=src.days,
        start_date=src.start_date,
        end_date=src.end_date,
        notes=src.notes,
        is_active=True,
    )
    session.add(dst)
    session.flush()  # obtiene id

    # fases
    for ph in src.phases:
        session.add(
            Phase(
                campaign_id=dst.id,
                name=ph.name,
                order=ph.order,
                days=ph.days,
                budget_share=ph.budget_share,
            )
        )

    # adsets y ads
    for aset in src.adsets:
        new_aset = AdSet(
            campaign_id=dst.id,
            name=aset.name,
            targeting_json=aset.targeting_json,
            budget_daily=aset.budget_daily,
            placements_json=aset.placements_json,
            use_advantage_plus=aset.use_advantage_plus,
        )
        session.add(new_aset)
        session.flush()
        for ad in aset.ads:
            session.add(
                Ad(
                    adset_id=new_aset.id,
                    name=ad.name,
                    ad_type=ad.ad_type,
                    copy_primary=ad.copy_primary,
                    copy_secondary=ad.copy_secondary,
                    cta=ad.cta,
                    post_id=ad.post_id,
                    url=ad.url,
                )
            )

    session.commit()
    return dst


def campaign_projection(session: Session, campaign_id: int) -> List[Dict[str, Any]]:
    camp = session.get(Campaign, campaign_id)
    if not camp:
        raise ValueError("Campaña no encontrada")
    return camp.projection()


# ==========================================================
#  Ejecución directa (debug rápido)
# ==========================================================
if __name__ == "__main__":
    # Permite probar desde terminal:
    #   python -m app.models.core
    engine = init_db()
    with Session(engine) as s:
        info = create_demo_data(s)
        print("DB inicializada.", info)
        if info.get("campaign_id"):
            rows = campaign_projection(s, info["campaign_id"])
            print("Proyección (primeros 3 días):", rows[:3])

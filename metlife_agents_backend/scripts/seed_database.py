"""
Database seed — ScenarioConfig (S1–S7) + ``consolidated data/*.xlsx``.

Canonical location for this repo. Run::

    cd metlife_agents_backend
    uv run python scripts/seed_database.py

From repo root you can use ``scripts/seed_database.py`` (launcher).

RBAC users: ``scripts/seed_users.py``.
"""

from __future__ import annotations

import asyncio
import logging
import re
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_BACKEND = Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

import pandas as pd
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from config.v1.database_config import db_config
from model.database.v1.communications import Communication
from model.database.v1.consultation import ConsultationRequest
from model.database.v1.emails import EmailEvent
from model.database.v1.hitl import HITLQueue
from model.database.v1.leads import Lead
from model.database.v1.quotes import Quote
from model.database.v1.scenarios import ScenarioConfig

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("seed_database")

REG_PREFIX = "consolidated_xlsx"
REG_TYEC = f"{REG_PREFIX}_tyec"
REG_CONSULT = f"{REG_PREFIX}_consult"
REG_SEMINAR = f"{REG_PREFIX}_seminar"


def _consolidated_dir() -> Path:
    """``<repo>/consolidated data`` — parents[2] from ``…/metlife_agents_backend/scripts/``."""
    return Path(__file__).resolve().parents[2] / "consolidated data"


def _str_val(v: Any) -> str | None:
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    s = str(v).strip()
    return s if s else None


def _bool_val(v: Any) -> bool | None:
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    if isinstance(v, bool):
        return v
    s = str(v).strip().lower()
    if s in ("1", "true", "yes", "y", "t"):
        return True
    if s in ("0", "false", "no", "n", "f"):
        return False
    return None


def _dt_val(v: Any) -> datetime | None:
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    if isinstance(v, datetime):
        dt = v
    else:
        try:
            dt = pd.Timestamp(v).to_pydatetime()
        except Exception:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _truncate(s: str | None, n: int) -> str | None:
    if s is None:
        return None
    return s if len(s) <= n else s[:n]


def _norm_gender(v: Any) -> str | None:
    s = _str_val(v)
    if not s:
        return None
    u = s.upper()
    if u in ("M", "F", "0", "1", "2"):
        return u if len(u) == 1 else ("M" if u == "0" else "F")
    return _truncate(s, 10)


def _age_from_dob(dob: str | None) -> int | None:
    if not dob:
        return None
    m = re.match(r"^(\d{4})[-/](\d{1,2})[-/](\d{1,2})", dob.strip())
    if not m:
        return None
    try:
        y = int(m.group(1))
        return max(0, datetime.now(timezone.utc).year - y)
    except ValueError:
        return None


async def _purge_consolidated_xlsx_leads(db: AsyncSession) -> int:
    res = await db.execute(
        select(Lead.id).where(Lead.registration_source.startswith(REG_PREFIX))
    )
    ids = [r[0] for r in res.all()]
    if not ids:
        return 0
    await db.execute(delete(Quote).where(Quote.lead_id.in_(ids)))
    await db.execute(
        delete(ConsultationRequest).where(ConsultationRequest.lead_id.in_(ids))
    )
    await db.execute(delete(EmailEvent).where(EmailEvent.lead_id.in_(ids)))
    await db.execute(delete(Communication).where(Communication.lead_id.in_(ids)))
    await db.execute(delete(Lead).where(Lead.id.in_(ids)))
    await db.commit()
    logger.info("Removed %d prior consolidated-xlsx lead(s).", len(ids))
    return len(ids)


async def _seed_consolidated_workbooks(db: AsyncSession) -> dict[str, int]:
    root = _consolidated_dir()
    out = {"tyec_rows": 0, "consult_rows": 0, "seminar_rows": 0, "adobe_events": 0}

    if not root.is_dir():
        logger.warning("Consolidated folder missing (%s) — skipping xlsx import.", root)
        return out

    tyec_path = root / "TYecQuoteMst.xlsx"
    legacy_tyec_id_to_lead: dict[str, uuid.UUID] = {}
    tyec_lead_pk_set: set[uuid.UUID] = set()
    quote_ids_used: set[str] = set()

    def take_quote_id(raw: Any) -> str | None:
        base = _str_val(raw)
        if not base:
            return None
        base = _truncate(base, 100) or ""
        q = base
        n = 2
        while q in quote_ids_used:
            suffix = f"_{n}"
            q = _truncate(base[: (100 - len(suffix))] + suffix, 100) or base[:100]
            n += 1
        quote_ids_used.add(q)
        return q

    if tyec_path.is_file():
        df = pd.read_excel(tyec_path)
        leads_batch: list[Lead] = []
        quotes_batch: list[Quote] = []
        for _, row in df.iterrows():
            src_id = row.get("id")
            lead_pk = uuid.uuid4()
            if src_id is not None and not (
                isinstance(src_id, float) and pd.isna(src_id)
            ):
                legacy_tyec_id_to_lead[str(src_id).strip()] = lead_pk
            tyec_lead_pk_set.add(lead_pk)

            mail = _str_val(row.get("MAIL_ID"))

            dob = _str_val(row.get("POWN_DOB"))
            opt = _bool_val(row.get("OPT_IN"))
            commit = _dt_val(row.get("COMMIT_TIME"))

            lead = Lead(
                id=lead_pk,
                quote_id=take_quote_id(row.get("QUOTE_NO")),
                first_name=_truncate(_str_val(row.get("POWN_KFNM")), 100),
                last_name=_truncate(_str_val(row.get("POWN_KLNM")), 100),
                email=_truncate(mail, 255),
                gender=_norm_gender(row.get("POWN_SEX")),
                date_of_birth=_truncate(dob, 20),
                age=_age_from_dob(dob),
                ans3=_truncate(_str_val(row.get("ANS3")), 5),
                ans4=_truncate(_str_val(row.get("ANS4")), 5),
                ans5=_truncate(_str_val(row.get("ANS5")), 5),
                opt_in=bool(opt) if opt is not None else False,
                banner_code=_truncate(_str_val(row.get("BANNER_CODE")), 100),
                product_code=_truncate(_str_val(row.get("PRODUCT_CODE")), 50),
                plan_code=_truncate(_str_val(row.get("PLAN_CODE")), 50),
                device_type=_truncate(_str_val(row.get("MOBILE_SITE")), 50),
                accept_mail_error=_truncate(
                    _str_val(row.get("ACCEPT_MAIL_ERROR")), 255
                ),
                session_id=_truncate(_str_val(row.get("SESSION_ID")), 200),
                registration_source=REG_TYEC,
                workflow_status="New",
                commit_time=commit,
                engagement_score=0.0,
            )
            leads_batch.append(lead)
            pc = _str_val(row.get("PRODUCT_CODE"))
            quotes_batch.append(
                Quote(
                    id=uuid.uuid4(),
                    lead_id=lead_pk,
                    product_code=_truncate(pc, 50),
                    raw_quote_ref=_truncate(_str_val(row.get("QUOTE_NO")), 200),
                )
            )

        if leads_batch:
            db.add_all(leads_batch)
            db.add_all(quotes_batch)
            await db.flush()
            out["tyec_rows"] = len(leads_batch)
            logger.info("Imported %d TYecQuoteMst row(s).", len(leads_batch))

    cr_path = root / "TConsultReq.xlsx"
    if cr_path.is_file():
        df = pd.read_excel(cr_path)
        for _, row in df.iterrows():
            lead_pk = uuid.uuid4()
            email = _truncate(_str_val(row.get("EMAIL_ADDRESS")), 255)
            f2f = _bool_val(row.get("FACE_TO_FACE"))
            dob = _str_val(row.get("DOB"))
            lead = Lead(
                id=lead_pk,
                first_name=_truncate(_str_val(row.get("FIRST_NAME_KANJI")), 100),
                last_name=_truncate(_str_val(row.get("LAST_NAME_KANJI")), 100),
                email=email,
                phone=_truncate(_str_val(row.get("PHONE_NUMBER")), 50),
                gender=_norm_gender(row.get("GENDER")),
                date_of_birth=_truncate(dob, 20),
                age=_age_from_dob(dob),
                registration_source=REG_CONSULT,
                workflow_status="New",
                engagement_score=0.0,
                opt_in=False,
            )
            db.add(lead)
            db.add(
                ConsultationRequest(
                    id=uuid.uuid4(),
                    lead_id=lead_pk,
                    request_type="face_to_face" if f2f is True else "web_to_call",
                    form_id="W011",
                    request_id=_truncate(_str_val(row.get("REQUEST_ID")), 100),
                    email=email,
                    phone=lead.phone,
                    gender=_truncate(_norm_gender(row.get("GENDER")), 5),
                    date_of_birth=lead.date_of_birth,
                    prefecture=_truncate(_str_val(row.get("PREFECTURE")), 100),
                    zip_code=_truncate(_str_val(row.get("ZIP_CODE")), 20),
                    memo=_str_val(row.get("MEMO")),
                    campaign_code=_truncate(_str_val(row.get("CAMPAIGN_CODE")), 100),
                    contract_status=_truncate(
                        _str_val(row.get("CONTRACT_STATUS")), 100
                    ),
                    face_to_face=bool(f2f) if f2f is not None else False,
                    email_captured=bool(email),
                )
            )
            out["consult_rows"] += 1
        await db.flush()
        if out["consult_rows"]:
            logger.info("Imported %d TConsultReq row(s).", out["consult_rows"])

    sem_path = root / "TSeminarConsultReq.xlsx"
    if sem_path.is_file():
        df = pd.read_excel(sem_path)
        for _, row in df.iterrows():
            lead_pk = uuid.uuid4()
            email = _truncate(_str_val(row.get("EMAIL")), 255)
            db.add(
                Lead(
                    id=lead_pk,
                    first_name=_truncate(
                        _str_val(row.get("USER_FIRST_NAME_KANJI")), 100
                    ),
                    last_name=_truncate(_str_val(row.get("USER_LAST_NAME_KANJI")), 100),
                    email=email,
                    registration_source=REG_SEMINAR,
                    workflow_status="New",
                    engagement_score=0.0,
                    opt_in=False,
                )
            )
            db.add(
                ConsultationRequest(
                    id=uuid.uuid4(),
                    lead_id=lead_pk,
                    request_type="seminar",
                    form_id="W033",
                    email=email,
                    memo=_str_val(row.get("MEMO")),
                    face_to_face=False,
                    email_captured=bool(email),
                )
            )
            out["seminar_rows"] += 1
        await db.flush()
        if out["seminar_rows"]:
            logger.info("Imported %d TSeminarConsultReq row(s).", out["seminar_rows"])

    aa_path = root / "AdobeAnalytics.xlsx"
    if aa_path.is_file() and tyec_lead_pk_set:
        df = pd.read_excel(aa_path)
        for _, row in df.iterrows():
            raw_lid = row.get("lead_id")
            lid_key = (
                None
                if raw_lid is None or (isinstance(raw_lid, float) and pd.isna(raw_lid))
                else str(raw_lid).strip()
            )
            lead_uuid: uuid.UUID | None = (
                legacy_tyec_id_to_lead.get(lid_key) if lid_key else None
            )
            if lead_uuid is None and lid_key:
                try:
                    parsed = uuid.UUID(lid_key)
                    if parsed in tyec_lead_pk_set:
                        lead_uuid = parsed
                except ValueError:
                    pass

            bounce = _bool_val(row.get("bounce_flag"))
            ev_type = _truncate(_str_val(row.get("event_type")), 30)
            if bounce is True and not ev_type:
                ev_type = "bounced"
            if not ev_type:
                ev_type = "analytics_event"

            if lead_uuid is None:
                logger.debug(
                    "Adobe row skipped — lead_id %r not mapped to TYec import.",
                    lid_key,
                )
                continue

            ts = _dt_val(row.get("event_timestamp")) or _dt_val(
                row.get("LAST_EVENT_DATE")
            )

            db.add(
                EmailEvent(
                    id=uuid.uuid4(),
                    lead_id=lead_uuid,
                    event_type=ev_type or "analytics_event",
                    clicked_url=_truncate(_str_val(row.get("click_url")), 500),
                    clicked_label=_truncate(_str_val(row.get("cta_branch")), 100),
                    campaign_id=_truncate(_str_val(row.get("campaign_id")), 100),
                    created_at=ts or datetime.now(timezone.utc),
                )
            )
            out["adobe_events"] += 1

            last_ev = _dt_val(row.get("LAST_EVENT_DATE"))
            if last_ev:
                await db.execute(
                    update(Lead)
                    .where(Lead.id == lead_uuid)
                    .values(last_active_at=last_ev)
                )

        await db.flush()
        if out["adobe_events"]:
            logger.info("Imported %d AdobeAnalytics event(s).", out["adobe_events"])

    await db.commit()
    return out


async def seed_database() -> None:
    db_url = db_config.get_database_url()
    engine = create_async_engine(db_url, echo=False)
    AsyncSessionLocal = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    async with AsyncSessionLocal() as db:
        logger.info("Clearing test data...")
        await _purge_consolidated_xlsx_leads(db)
        await db.execute(delete(HITLQueue))
        await db.execute(delete(Quote))
        await db.execute(delete(ConsultationRequest))
        await db.execute(delete(Lead).where(Lead.email.like("%@mock.metlife.co.jp%")))
        await db.execute(delete(ScenarioConfig))
        await db.commit()

        logger.info("Seeding ScenarioConfig...")
        db.add_all(
            [
                ScenarioConfig(
                    scenario_id="S1",
                    name="Young Professional",
                    description="Age < 35, ANS3=C, ANS4=No. Term Life focus.",
                    handoff_threshold=0.80,
                    base_score=0.40,
                    cadence_days=3,
                    max_emails=5,
                    default_keigo="casual",
                    default_tone="friendly",
                ),
                ScenarioConfig(
                    scenario_id="S2",
                    name="Recently Married",
                    description="ANS3=C, ANS4=Yes (life event). Family protection.",
                    handoff_threshold=0.80,
                    base_score=0.45,
                    cadence_days=3,
                    max_emails=5,
                    default_keigo="丁寧語",
                    default_tone="empathetic",
                ),
                ScenarioConfig(
                    scenario_id="S3",
                    name="Senior Citizen",
                    description="ANS3=C, ANS4=No, Age ≥ 35. Formal trust-building. 1-day cadence.",
                    handoff_threshold=0.80,
                    base_score=0.35,
                    cadence_days=1,
                    max_emails=5,
                    default_keigo="敬語",
                    default_tone="formal",
                ),
                ScenarioConfig(
                    scenario_id="S4",
                    name="Dormant Revival",
                    description="180+ days no activity. Max 2 emails. G3 mandatory.",
                    handoff_threshold=0.75,
                    base_score=0.20,
                    cadence_days=7,
                    max_emails=2,
                    default_keigo="丁寧語",
                    default_tone="empathetic",
                ),
                ScenarioConfig(
                    scenario_id="S5",
                    name="Active Buyer",
                    description="ANS3=A or B. 3-CTA comparison email, fast track.",
                    handoff_threshold=0.80,
                    base_score=0.60,
                    cadence_days=2,
                    max_emails=3,
                    default_keigo="casual",
                    default_tone="direct",
                ),
                ScenarioConfig(
                    scenario_id="S6",
                    name="F2F Consultation Request",
                    description="f2f_form registration. G2 always fires. 1 LLM email then G4.",
                    handoff_threshold=0.85,
                    base_score=0.85,
                    cadence_days=1,
                    max_emails=1,
                    default_keigo="丁寧語",
                    default_tone="warm",
                ),
                ScenarioConfig(
                    scenario_id="S7",
                    name="Web-to-Call",
                    description="BANNER_CODE pos 3='7' or web_callback. G2 always fires.",
                    handoff_threshold=0.85,
                    base_score=0.88,
                    cadence_days=1,
                    max_emails=1,
                    default_keigo="丁寧語",
                    default_tone="urgent",
                ),
            ]
        )
        await db.commit()

        logger.info("Importing consolidated xlsx (no synthetic mock leads).")
        xlsx_counts = await _seed_consolidated_workbooks(db)
        if any(xlsx_counts.values()):
            logger.info(
                "Consolidated xlsx: TYec=%(tyec_rows)d consult=%(consult_rows)d "
                "seminar=%(seminar_rows)d adobe_events=%(adobe_events)d",
                xlsx_counts,
            )
        else:
            logger.warning(
                "No consolidated xlsx rows imported — add files under repo "
                "`consolidated data/` or check paths."
            )

    await engine.dispose()


def main() -> None:
    asyncio.run(seed_database())


if __name__ == "__main__":
    main()

"""
Seeder — static reference data + 100 realistic mock leads.

Seeds only what the workflow engine needs before first run:
  1. ScenarioConfig rows (S1–S7) — thresholds / cadence / keigo per scenario
  2. 100 Mock Leads            — raw attributes only; scenario assigned by
                                  A2 Persona Classifier at runtime
  3. ConsultationRequests      — for S6 / S7 leads

Scenarios are NOT pre-assigned here (except S4 dormant leads which must be
pre-flagged as Dormant since they come from a batch scan, not new registration).

Dormant leads (S4 eligible) are seeded with:
  - workflow_status = "Dormant"
  - commit_time = 200+ days ago   (beyond the 180-day dormancy threshold)
  - last_active_at = 200+ days ago

Usage:
    uv run python -m utils.v1.seed_data
    uv run python utils/v1/seed_data.py
"""

import asyncio
import logging
import random
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

# Ensure project root is importable when this file is executed directly.
PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from model.database.v1.leads import Lead
from model.database.v1.quotes import Quote
from model.database.v1.consultation import ConsultationRequest
from model.database.v1.hitl import HITLQueue
from model.database.v1.scenarios import ScenarioConfig
from config.v1.database_config import db_config

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

NOW = datetime.now(timezone.utc)

# Japanese name pools
MALE_FIRST = [
    "Kenji",
    "Daiki",
    "Hiroshi",
    "Taro",
    "Yuto",
    "Kenta",
    "Sho",
    "Ryota",
    "Naoto",
    "Kazuki",
    "Takeru",
    "Masaki",
    "Yuki",
    "Sota",
    "Haruto",
    "Shohei",
    "Takuma",
    "Kohei",
    "Ren",
    "Yusei",
]
FEMALE_FIRST = [
    "Yui",
    "Aoi",
    "Sayaka",
    "Hana",
    "Sakura",
    "Mio",
    "Rin",
    "Nana",
    "Akari",
    "Ayaka",
    "Saki",
    "Misaki",
    "Miyu",
    "Reina",
    "Koharu",
    "Haruka",
    "Yuna",
    "Asuka",
    "Mai",
    "Kaede",
]
LAST_NAMES = [
    "Sato",
    "Suzuki",
    "Takahashi",
    "Tanaka",
    "Watanabe",
    "Ito",
    "Nakamura",
    "Kobayashi",
    "Yamamoto",
    "Kato",
    "Yoshida",
    "Yamada",
    "Shimizu",
    "Hayashi",
    "Saito",
    "Matsumoto",
    "Inoue",
    "Kimura",
    "Ogawa",
    "Fujita",
    "Okamoto",
    "Nishimura",
    "Hasegawa",
    "Ikeda",
    "Abe",
    "Maeda",
    "Sasaki",
    "Yamashita",
    "Ishikawa",
    "Noguchi",
]

PRODUCT_CODES = {
    "S1": ["TERM_LIFE_01", "TERM_LIFE_02", "YOUNG_PRO_01"],
    "S2": ["FAMILY_PROTECT_01", "FAMILY_PROTECT_02", "COUPLE_LIFE_01"],
    "S3": ["MEDICAL_S_01", "MEDICAL_S_02", "SENIOR_CARE_01", "RETIREMENT_01"],
    "S5": ["ASSET_FORM_01", "MEDICAL_BEST_01", "LIFE_PROTECT_01"],
}

BANNER_CODES_STD = [
    "ML-NL-001",
    "ML-NL-002",
    "ML-SEO-01",
    "ML-SEM-01",
    "CAMP-A-1",
    "CAMP-B-1",
    "CAMP-C-1",
    "ML-SNS-01",
]
BANNER_CODES_W2C = [
    "AB7XY",
    "XY7AB",
    "BC7DE",
    "QQ7ZZ",
    "ML7CA",  # pos 2 = '7' → S7
]


def _dob_from_age(age: int) -> str:
    year = NOW.year - age
    return f"{year}-{random.randint(1, 12):02d}-{random.randint(1, 28):02d}"


def _mk_lead(
    *,
    first_name: str,
    last_name: str,
    gender: str,
    age: int,
    ans3: str | None = None,
    ans4: str | None = None,
    ans5: str | None = None,
    product_code: str | None = None,
    registration_source: str = "newsletter",
    banner_code: str | None = None,
    device_type: str | None = None,
    workflow_status: str = "New",
    commit_time: datetime | None = None,
    last_active_at: datetime | None = None,
    engagement_score: float = 0.0,
    cooldown_flag: bool = False,
    quote_id_prefix: str = "Q-M",
    idx: int = 0,
) -> Lead:
    lead_id = uuid.uuid4()
    return Lead(
        id=lead_id,
        quote_id=f"{quote_id_prefix}{idx:04d}"
        if registration_source == "newsletter"
        else None,
        first_name=first_name,
        last_name=last_name,
        email=f"{first_name.lower()}.{last_name.lower()}{idx}@mock.metlife.co.jp",
        phone=f"090-{random.randint(1000, 9999)}-{random.randint(1000, 9999)}",
        age=age,
        date_of_birth=_dob_from_age(age),
        gender=gender,
        ans3=ans3,
        ans4=ans4,
        ans5=ans5,
        product_code=product_code,
        registration_source=registration_source,
        banner_code=banner_code or random.choice(BANNER_CODES_STD),
        device_type=device_type or random.choice(["MOBILE_SITE", "PC"]),
        workflow_status=workflow_status,
        engagement_score=engagement_score,
        cooldown_flag=cooldown_flag,
        commit_time=commit_time or (NOW - timedelta(days=random.randint(1, 30))),
        last_active_at=last_active_at,
        opt_in=False,
    )


async def seed_database():
    db_url = db_config.get_database_url()
    engine = create_async_engine(db_url, echo=False)
    AsyncSessionLocal = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    async with AsyncSessionLocal() as db:
        # ── Wipe test-specific tables only ─────────────────────────────────
        logger.info("Clearing test data...")
        await db.execute(delete(HITLQueue))
        await db.execute(delete(Quote))
        await db.execute(delete(ConsultationRequest))
        await db.execute(delete(Lead).where(Lead.email.like("%@mock.metlife.co.jp%")))
        await db.execute(delete(ScenarioConfig))
        await db.commit()

        # ── ScenarioConfig S1–S7 ───────────────────────────────────────────
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

        # ── 100 Mock Leads ─────────────────────────────────────────────────
        #
        # Distribution (100 total):
        #   S1-eligible  (ANS3=C, ANS4=No, Age 20-34)  : 22 leads
        #   S2-eligible  (ANS3=C, ANS4=Yes)             : 18 leads
        #   S3-eligible  (ANS3=C, ANS4=No, Age 35-75)   : 18 leads
        #   S4-dormant   (workflow_status=Dormant, 200d) : 15 leads
        #   S5-eligible  (ANS3=A or B)                  : 15 leads
        #   S6-eligible  (f2f_form)                     : 7 leads
        #   S7-eligible  (web_callback / banner_code 7) : 5 leads
        #
        # Scenarios are NOT pre-assigned — A2 Persona Classifier assigns them.
        # S4 leads ARE pre-set Dormant because they arrive via batch scan, not
        # new registration.

        logger.info("Seeding 100 mock leads...")
        leads_batch: list[Lead] = []
        quotes_batch: list[Quote] = []
        consult_batch: list[ConsultationRequest] = []
        idx = 1

        # ── S1-eligible: Young Professionals (ANS3=C, ANS4=No, Age 20-34) ─
        s1_names_m = [
            "Haruto",
            "Yuto",
            "Sota",
            "Ren",
            "Yusei",
            "Shohei",
            "Ryota",
            "Takeru",
            "Sho",
            "Naoto",
            "Masaki",
        ]
        s1_names_f = [
            "Hana",
            "Sakura",
            "Mio",
            "Rin",
            "Akari",
            "Ayaka",
            "Saki",
            "Koharu",
            "Kaede",
            "Yuna",
            "Mai",
        ]
        for i in range(22):
            is_male = i % 2 == 0
            first = (
                s1_names_m[i % len(s1_names_m)]
                if is_male
                else s1_names_f[i % len(s1_names_f)]
            )
            age = random.randint(20, 34)
            lead = _mk_lead(
                first_name=first,
                last_name=random.choice(LAST_NAMES),
                gender="M" if is_male else "F",
                age=age,
                ans3="C",
                ans4="No",
                ans5="No",
                product_code=random.choice(PRODUCT_CODES["S1"]),
                registration_source="newsletter",
                quote_id_prefix="Q-S1-",
                idx=idx,
            )
            leads_batch.append(lead)
            quotes_batch.append(
                Quote(
                    lead_id=lead.id,
                    product_category="Term Life",
                    premium_estimate_jpy=random.randint(2500, 5000),
                )
            )
            idx += 1

        # ── S2-eligible: Recently Married (ANS3=C, ANS4=Yes) ──────────────
        s2_names_f = [
            "Yui",
            "Asuka",
            "Haruka",
            "Reina",
            "Miyu",
            "Misaki",
            "Nana",
            "Aoi",
            "Hana",
            "Koharu",
        ]
        s2_names_m = [
            "Kenji",
            "Daiki",
            "Kenta",
            "Takuma",
            "Kohei",
            "Kazuki",
            "Yuki",
            "Taro",
        ]
        for i in range(18):
            is_female = i % 2 == 0
            first = (
                s2_names_f[i % len(s2_names_f)]
                if is_female
                else s2_names_m[i % len(s2_names_m)]
            )
            age = random.randint(25, 38)
            lead = _mk_lead(
                first_name=first,
                last_name=random.choice(LAST_NAMES),
                gender="F" if is_female else "M",
                age=age,
                ans3="C",
                ans4="Yes",
                ans5="No",
                product_code=random.choice(PRODUCT_CODES["S2"]),
                registration_source="newsletter",
                quote_id_prefix="Q-S2-",
                idx=idx,
            )
            leads_batch.append(lead)
            quotes_batch.append(
                Quote(
                    lead_id=lead.id,
                    product_category="Family Life",
                    premium_estimate_jpy=random.randint(6000, 12000),
                )
            )
            idx += 1

        # ── S3-eligible: Seniors (ANS3=C, ANS4=No, Age 35-75) ─────────────
        # Age bands: 35-54 → 丁寧語, 55-64 → 敬語, 65+ → 最敬語
        s3_ages = (
            [random.randint(35, 54) for _ in range(6)]  # 丁寧語
            + [random.randint(55, 64) for _ in range(6)]  # 敬語
            + [random.randint(65, 75) for _ in range(6)]  # 最敬語
        )
        s3_names_m = [
            "Hiroshi",
            "Makoto",
            "Noboru",
            "Akira",
            "Jiro",
            "Keizo",
            "Fumio",
            "Saburo",
            "Tadashi",
        ]
        s3_names_f = [
            "Makiko",
            "Yoshiko",
            "Keiko",
            "Fumiko",
            "Noriko",
            "Sachiko",
            "Kimiko",
            "Kazuko",
            "Haruko",
        ]
        for i in range(18):
            is_male = i % 2 == 0
            first = (
                s3_names_m[i % len(s3_names_m)]
                if is_male
                else s3_names_f[i % len(s3_names_f)]
            )
            lead = _mk_lead(
                first_name=first,
                last_name=random.choice(LAST_NAMES),
                gender="M" if is_male else "F",
                age=s3_ages[i],
                ans3="C",
                ans4="No",
                ans5="No",
                product_code=random.choice(PRODUCT_CODES["S3"]),
                registration_source="newsletter",
                device_type="PC",
                quote_id_prefix="Q-S3-",
                idx=idx,
            )
            leads_batch.append(lead)
            quotes_batch.append(
                Quote(
                    lead_id=lead.id,
                    product_category="Medical Insurance",
                    premium_estimate_jpy=random.randint(8000, 20000),
                )
            )
            idx += 1

        # ── S4-dormant: 180+ days inactive, batched for revival ───────────
        s4_names = [
            ("Sayaka", "F"),
            ("Tomoko", "F"),
            ("Junko", "F"),
            ("Keiko", "F"),
            ("Ryoko", "F"),
            ("Tetsuo", "M"),
            ("Fumio", "M"),
            ("Masao", "M"),
            ("Nobuo", "M"),
            ("Hiroyuki", "M"),
            ("Michiko", "F"),
            ("Chieko", "F"),
            ("Setsuko", "F"),
            ("Yoshio", "M"),
            ("Katsuya", "M"),
        ]
        for i, (first, gender) in enumerate(s4_names):
            days_ago = random.randint(200, 400)  # all well past 180-day threshold
            commit = NOW - timedelta(days=days_ago)
            last_act = NOW - timedelta(days=days_ago - random.randint(0, 30))
            age = random.randint(30, 65)
            # Vary engagement_score so A10 gets P1/P2/P3 distribution:
            # P1 (score < 0.25): no web visits, P2 (0.25-0.45): visited, P3 (> 0.45): product viewed
            score_band = i % 3
            if score_band == 0:
                eng_score = round(random.uniform(0.10, 0.24), 2)  # → P1
            elif score_band == 1:
                eng_score = round(random.uniform(0.25, 0.44), 2)  # → P2
            else:
                eng_score = round(random.uniform(0.45, 0.65), 2)  # → P3

            lead = _mk_lead(
                first_name=first,
                last_name=random.choice(LAST_NAMES),
                gender=gender,
                age=age,
                ans3="C",
                ans4=random.choice(["No", "Yes"]),
                ans5="No",
                product_code=random.choice(PRODUCT_CODES["S1"] + PRODUCT_CODES["S3"]),
                registration_source="newsletter",
                workflow_status="Dormant",
                commit_time=commit,
                last_active_at=last_act,
                engagement_score=eng_score,
                cooldown_flag=False,
                quote_id_prefix="Q-S4-",
                idx=idx,
            )
            leads_batch.append(lead)
            idx += 1

        # ── S5-eligible: Active Buyers (ANS3=A or B) ──────────────────────
        s5_ans3_cycle = [
            "A",
            "A",
            "B",
            "A",
            "B",
            "A",
            "A",
            "B",
            "A",
            "B",
            "A",
            "A",
            "B",
            "A",
            "B",
        ]
        s5_names_m = [
            "Daiki",
            "Kenta",
            "Shohei",
            "Takuma",
            "Kohei",
            "Ryota",
            "Yuto",
            "Sota",
        ]
        s5_names_f = [
            "Yui",
            "Akari",
            "Ayaka",
            "Saki",
            "Misaki",
            "Miyu",
            "Reina",
            "Koharu",
        ]
        for i in range(15):
            is_male = i % 2 == 0
            first = (
                s5_names_m[i % len(s5_names_m)]
                if is_male
                else s5_names_f[i % len(s5_names_f)]
            )
            age = random.randint(25, 50)
            lead = _mk_lead(
                first_name=first,
                last_name=random.choice(LAST_NAMES),
                gender="M" if is_male else "F",
                age=age,
                ans3=s5_ans3_cycle[i],
                product_code=random.choice(PRODUCT_CODES["S5"]),
                registration_source="newsletter",
                quote_id_prefix="Q-S5-",
                idx=idx,
            )
            leads_batch.append(lead)
            quotes_batch.append(
                Quote(
                    lead_id=lead.id,
                    product_category="Asset Formation",
                    premium_estimate_jpy=random.randint(10000, 25000),
                )
            )
            idx += 1

        # ── S6-eligible: F2F Consultation (f2f_form) ──────────────────────
        s6_leads = [
            ("Aoi", "Kobayashi", "F", 34, "退職後の貯蓄について相談したいです。"),
            ("Makiko", "Tanaka", "F", 52, "がん保険と医療保険の違いを教えてください。"),
            ("Hiroshi", "Saito", "M", 45, "家族のための死亡保険を検討しています。"),
            ("Yuki", "Yamamoto", "F", 29, "出産を機に生命保険を見直したい。"),
            (
                "Taro",
                "Watanabe",
                "M",
                61,
                "老後資金と相続対策について面談を希望します。",
            ),
            ("Nana", "Ito", "F", 38, "住宅購入に合わせた団信と収入保障を相談したい。"),
            ("Kenji", "Fujita", "M", 33, "医療保険とがん保険のコスパを比較したい。"),
        ]
        for i, (first, last, gender, age, memo) in enumerate(s6_leads):
            lead = _mk_lead(
                first_name=first,
                last_name=last,
                gender=gender,
                age=age,
                registration_source="f2f_form",
                device_type="MOBILE_SITE",
                quote_id_prefix="Q-S6-",
                idx=idx,
            )
            lead.email = f"{first.lower()}.{last.lower()}{idx}@mock.metlife.co.jp"
            leads_batch.append(lead)
            consult_batch.append(
                ConsultationRequest(
                    lead_id=lead.id,
                    request_type="face_to_face",
                    form_id=random.choice(["W011", "W022", "W033"]),
                    email=lead.email,
                    phone=lead.phone,
                    gender=gender,
                    date_of_birth=_dob_from_age(age),
                    memo=memo,
                    face_to_face=True,
                    email_captured=True,
                )
            )
            idx += 1

        # ── S7-eligible: Web-to-Call (BANNER_CODE pos 2 = '7') ────────────
        s7_leads = [
            (
                "Kenta",
                "Yamamoto",
                "M",
                52,
                None,
                "AB7CD",
                "090-7001-0001",
                "I called to ask about whole life vs term life.",
            ),
            (
                "Ryoko",
                "Hashimoto",
                "F",
                38,
                "ryoko.h@example.com",
                "XY7AB",
                "090-7002-0002",
                "Interested in cancer insurance after family history diagnosis.",
            ),
            (
                "Takeshi",
                "Moriwaki",
                "M",
                44,
                None,
                "BC7DE",
                "090-7003-0003",
                "Wants to compare MetLife vs Japan Post Life insurance.",
            ),
            (
                "Akemi",
                "Ogawa",
                "F",
                61,
                "akemi.o@example.com",
                "QQ7ZZ",
                "090-7004-0004",
                "Retirement plan inquiry — looking for annuity product.",
            ),
            (
                "Noboru",
                "Ishida",
                "M",
                29,
                None,
                "ML7CA",
                "090-7005-0005",
                "First time buyer; unsure which product suits a 20s single.",
            ),
        ]
        for i, (first, last, gender, age, email, banner, phone, memo) in enumerate(
            s7_leads
        ):
            lead = Lead(
                id=uuid.uuid4(),
                first_name=first,
                last_name=last,
                email=email,
                phone=phone,
                age=age,
                date_of_birth=_dob_from_age(age),
                gender=gender,
                registration_source="web_callback",
                banner_code=banner,
                device_type="MOBILE_SITE",
                workflow_status="New",
                engagement_score=0.0,
                opt_in=False,
                commit_time=NOW - timedelta(days=random.randint(1, 5)),
            )
            leads_batch.append(lead)
            consult_batch.append(
                ConsultationRequest(
                    lead_id=lead.id,
                    request_type="web_to_call",
                    email=email,
                    phone=phone,
                    gender=gender,
                    date_of_birth=_dob_from_age(age),
                    memo=memo,
                    face_to_face=False,
                    email_captured=bool(email),
                )
            )
            idx += 1

        # ── Persist ────────────────────────────────────────────────────────
        db.add_all(leads_batch)
        await db.flush()

        db.add_all(quotes_batch)
        db.add_all(consult_batch)
        await db.commit()

        total_leads = len(leads_batch)
        dormant_count = sum(
            1 for lead in leads_batch if lead.workflow_status == "Dormant"
        )
        new_count = total_leads - dormant_count

        logger.info(
            "Seeded %d leads total (%d New, %d Dormant) + %d quotes + %d consults + 7 ScenarioConfigs.",
            total_leads,
            new_count,
            dormant_count,
            len(quotes_batch),
            len(consult_batch),
        )
        logger.info("Scenario breakdown:")
        logger.info("  S1-eligible (A2 will assign): ~22 leads")
        logger.info("  S2-eligible (A2 will assign): ~18 leads")
        logger.info("  S3-eligible (A2 will assign): ~18 leads")
        logger.info("  S4-dormant  (pre-set):        15 leads")
        logger.info("  S5-eligible (A2 will assign): ~15 leads")
        logger.info("  S6-eligible (A2 will assign):  7 leads")
        logger.info("  S7-eligible (A2 will assign):  5 leads")
        logger.info("Run: POST /api/v1/agents/batch/run")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed_database())

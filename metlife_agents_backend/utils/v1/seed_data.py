"""
Mock data seeder for MetLife Agent Flow core engine testing.

Creates 7 distinct test leads mapped to S1–S7 scenarios,
along with quotes and consultation requests.

Run this script to wipe existing leads and populate fresh mock data.
"""

import asyncio
import logging
import uuid

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

# Import models
from model.database.v1.leads import Lead
from model.database.v1.quotes import Quote
from model.database.v1.consultation import ConsultationRequest
from model.database.v1.hitl import HITLQueue
from config.v1.database_config import db_config

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def seed_database():
    """Wipe and re-seed the test leads and related tables."""
    db_url = db_config.get_database_url()
    engine = create_async_engine(db_url, echo=False)
    AsyncSessionLocal = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    async with AsyncSessionLocal() as db:
        # 1. Wipe existing test data
        logger.info("Wiping existing test data...")
        await db.execute(delete(HITLQueue))
        await db.execute(delete(Quote))
        await db.execute(delete(ConsultationRequest))
        await db.execute(delete(Lead).where(Lead.email.like("%@mock.metlife.co.jp")))
        await db.commit()

        # 2. Prepare the 7 mock leads
        logger.info("Generating 7 scenario-specific mock leads...")

        leads_to_insert = []
        quotes_to_insert = []
        consults_to_insert = []

        # ── S1: Young Professional (No specific survey signals, Age < 35)
        lead_s1 = Lead(
            id=uuid.uuid4(),
            quote_id="Q-10001",
            first_name="Kenji",
            last_name="Sato",
            email="s1.youngpro@mock.metlife.co.jp",
            phone="090-1111-1111",
            age=28,
            date_of_birth="1996-05-15",
            gender="M",
            ans3="C",
            ans4="No",
            ans5="No",
            product_code="TERM_LIFE_01",
            device_type="MOBILE_SITE",
            banner_code="CAMP-A-1",
            workflow_status="New",
        )
        leads_to_insert.append(lead_s1)
        quotes_to_insert.append(
            Quote(
                lead_id=lead_s1.id,
                product_category="Term Life",
                premium_estimate_jpy=3500,
            )
        )

        # ── S2: Recently Married (ANS3=C, ANS4=Yes)
        lead_s2 = Lead(
            id=uuid.uuid4(),
            quote_id="Q-10002",
            first_name="Yui",
            last_name="Takahashi",
            email="s2.married@mock.metlife.co.jp",
            phone="090-2222-2222",
            age=32,
            date_of_birth="1992-08-22",
            gender="F",
            ans3="C",
            ans4="Yes",
            ans5="No",
            product_code="FAMILY_PROTECT_02",
            device_type="PC",
            banner_code="CAMP-B-1",
            workflow_status="New",
        )
        leads_to_insert.append(lead_s2)
        quotes_to_insert.append(
            Quote(
                lead_id=lead_s2.id,
                product_category="Family Life",
                premium_estimate_jpy=8200,
            )
        )

        # ── S3: Senior Citizen (Age >= 35, ANS3=C, ANS4=No) -> Keigo trigger
        lead_s3 = Lead(
            id=uuid.uuid4(),
            quote_id="Q-10003",
            first_name="Hiroshi",
            last_name="Watanabe",
            email="s3.senior@mock.metlife.co.jp",
            phone="090-3333-3333",
            age=68,
            date_of_birth="1956-02-10",
            gender="M",
            ans3="C",
            ans4="No",
            ans5="No",
            product_code="MEDICAL_S_03",
            device_type="PC",
            banner_code="CAMP-C-1",
            workflow_status="New",
        )
        leads_to_insert.append(lead_s3)

        # ── S4: Dormant Revival (Existing lead, Dormant state)
        lead_s4 = Lead(
            id=uuid.uuid4(),
            quote_id="Q-10004",
            first_name="Sayaka",
            last_name="Ito",
            email="s4.dormant@mock.metlife.co.jp",
            phone="090-4444-4444",
            age=45,
            date_of_birth="1979-11-05",
            gender="F",
            workflow_status="Dormant",
            device_type="MOBILE_SITE",
            emails_sent_count=0,
        )
        leads_to_insert.append(lead_s4)

        # ── S5: Active Buyer (ANS3 = A or B)
        lead_s5 = Lead(
            id=uuid.uuid4(),
            quote_id="Q-10005",
            first_name="Daiki",
            last_name="Nakamura",
            email="s5.active@mock.metlife.co.jp",
            phone="090-5555-5555",
            age=39,
            date_of_birth="1985-04-12",
            gender="M",
            ans3="A",
            product_code="ASSET_FORM_05",
            device_type="PC",
            banner_code="SEARCH-AD-1",
            workflow_status="New",
        )
        leads_to_insert.append(lead_s5)

        # ── S6: F2F Consultation Request (registration_source = f2f_form, bare demo) -> G2 gate
        lead_s6 = Lead(
            id=uuid.uuid4(),
            first_name="Aoi",
            last_name="Kobayashi",
            email="s6.f2f@mock.metlife.co.jp",
            phone="090-6666-6666",
            age=None,
            date_of_birth="1990-01-01",  # Blueprint: DOB+Gender only
            gender="F",
            device_type="MOBILE_SITE",
            registration_source="f2f_form",
            workflow_status="New",
        )
        leads_to_insert.append(lead_s6)
        consults_to_insert.append(
            ConsultationRequest(
                lead_id=lead_s6.id,
                request_type="f2f_form",
                phone="090-6666-6666",
                email="s6.f2f@mock.metlife.co.jp",
                memo="I would like to meet an advisor to discuss my retirement savings and mutual funds.",
            )
        )

        # ── S7: Web-to-Call (registration_source = web_callback, no email)
        lead_s7 = Lead(
            id=uuid.uuid4(),
            first_name="Kenta",
            last_name="Yamamoto",
            email=None,  # No email = Direct handoff path
            phone="090-7777-7777",
            age=52,
            date_of_birth="1972-09-30",
            gender="M",
            device_type="MOBILE_SITE",
            banner_code="AB7CD",  # S7 requirement: banner_code pos 3 = 7
            registration_source="web_callback",
            workflow_status="New",
        )
        leads_to_insert.append(lead_s7)
        consults_to_insert.append(
            ConsultationRequest(
                lead_id=lead_s7.id,
                request_type="web_callback",
                phone="090-7777-7777",
                email=None,
                memo="Caller wants to know the difference between Term Life and Whole Life policies immediately.",
            )
        )

        # 3. Commit to database
        db.add_all(leads_to_insert)
        db.add_all(quotes_to_insert)
        db.add_all(consults_to_insert)

        await db.commit()

        logger.info(f"Successfully seeded {len(leads_to_insert)} mock leads.")
        logger.info("Run POST /api/v1/workflows/batch/run to process them all.")

        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed_database())

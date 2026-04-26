"""
Dormancy Agent (A10) — batch-triggered revival scan.

Blueprint: MetLife_JP_Flows.html · S4 Dormant Revival

Eligibility (ALL must be true — re-validated here, not trusted from the batch):
  • last_active_at OR commit_time ≥ 180 days ago
  • opt_in = False  (not opted-out / suppressed)
  • cooldown_flag is not True
  • workflow_status != "Suppressed"  (no hard bounce)

P1 / P2 / P3 segmentation (6-month web-behaviour proxy):
  The engagement_score starts at base_score (e.g. 0.40 for S1).
  We use the *delta above base* to infer behaviour tier (Tier-1 proxy;
  Adobe Analytics web_events will replace this at Tier 2):

    delta ≤ 0.05  → P1  (no email interaction at all)
                       → Brand awareness / re-engagement campaign
    delta ≤ 0.34  → P2  (some email opens/clicks; no product-page intent)
                       → New product + simulation invite
    delta ≥ 0.35  → P3  (consult_page_visit +0.40 or strong intent)
                       → Direct consultation campaign
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone, timedelta

from sqlalchemy import select

from core.v1.services.agents.rules.scoring_rules import classify_dormant_segment
from core.v1.services.sse.manager import event_manager, node_transition_event
from core.v1.services.agents.state import create_log_entry
from utils.v1.db_sync import sync_lead_state
from model.database.v1.consultation import ConsultationRequest
from model.database.v1.leads import Lead

logger = logging.getLogger(__name__)

NODE_ID = "A10_Dormancy"
DORMANCY_DAYS = 180


def _to_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if getattr(dt, "tzinfo", None) is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


async def dormancy_agent(state: dict, *, db=None) -> dict:
    """Re-validate dormancy eligibility and assign P1/P2/P3 revival segment.

    Returns early with workflow_status='suppressed' if the lead is no longer
    eligible for revival.  The conditional edge in graph.py routes suppressed
    leads straight to END instead of continuing to G3.
    """
    lead_id = state["lead_id"]
    await event_manager.publish(
        node_transition_event(
            lead_id, NODE_ID, "started", batch_id=state.get("batch_id")
        )
    )
    start = time.perf_counter()

    cutoff = datetime.now(timezone.utc) - timedelta(days=DORMANCY_DAYS)

    # ── DB eligibility re-validation ─────────────────────────────────
    # The batch pre-filter (agent_api.py) does a fast SQL pass over all leads,
    # but conditions can change between query time and now.  A10 is the
    # authoritative gate for S4 eligibility — all rules are checked here.
    if db is not None:
        result = await db.execute(select(Lead).where(Lead.id == lead_id))
        lead_row = result.scalars().first()

        if lead_row is not None:
            consult_result = await db.execute(
                select(ConsultationRequest)
                .where(ConsultationRequest.lead_id == lead_id)
                .limit(1)
            )
            if consult_result.scalars().first() is not None:
                logger.info(
                    "A10 skipped lead %s â€” consultation request exists", lead_id
                )
                state["workflow_status"] = "suppressed"
                state["execution_log"] = [
                    create_log_entry(
                        title="A10 - DORMANCY AGENT Â· SKIPPED â€” Consultation exists",
                        description="Lead has a consultation request and is not eligible for dormant revival.",
                        badges=["Not Dormant Revival"],
                    )
                ]
                return state

            # Rule: OPT_IN = False (opt_in=True means opted-out / suppressed)
            if lead_row.opt_in is True:
                logger.info("A10 skipped lead %s — opt_in active", lead_id)
                state["workflow_status"] = "suppressed"
                state["execution_log"] = [
                    create_log_entry(
                        title="A10 - DORMANCY AGENT · SKIPPED — OPT_IN active",
                        description="Lead has opted out or bounced. Revival cancelled.",
                        badges=["Suppressed", "OPT_IN"],
                    )
                ]
                return state

            # Rule: cooldown_flag must not be set
            if lead_row.cooldown_flag is True:
                logger.info("A10 skipped lead %s — cooldown_flag set", lead_id)
                state["workflow_status"] = "suppressed"
                state["execution_log"] = [
                    create_log_entry(
                        title="A10 - DORMANCY AGENT · SKIPPED — Cooldown active",
                        description=(
                            "cooldown_flag=True. Lead not eligible for revival "
                            "until the flag is manually cleared."
                        ),
                        badges=["Cooldown Active"],
                    )
                ]
                return state

            # Rule: last_active_at OR commit_time must be ≥ 180 days old
            la = _to_utc(lead_row.last_active_at)
            ct = _to_utc(lead_row.commit_time)
            stale = (la is not None and la <= cutoff) or (
                la is None and ct is not None and ct <= cutoff
            )
            if not stale:
                ref_dt = la or ct
                logger.info(
                    "A10 skipped lead %s — not yet %d days dormant (ref=%s)",
                    lead_id,
                    DORMANCY_DAYS,
                    ref_dt,
                )
                state["workflow_status"] = "suppressed"
                state["execution_log"] = [
                    create_log_entry(
                        title="A10 - DORMANCY AGENT · SKIPPED — Not yet dormant",
                        description=(
                            f"Last active: {ref_dt}. "
                            f"180-day dormancy threshold not reached."
                        ),
                        badges=["Not Dormant"],
                    )
                ]
                return state

            # Sync score fields from DB row so the delta calculation is accurate
            if lead_row.base_score is not None:
                state["base_score"] = lead_row.base_score
            if lead_row.engagement_score is not None:
                state["engagement_score"] = lead_row.engagement_score

    # ── Re-use existing segment if already assigned ───────────────────
    # Preserves a segment that was set on a previous scan or by a manager.
    existing_segment = state.get("revival_segment")

    if existing_segment in ("P1", "P2", "P3"):
        segment = existing_segment
        reason = "existing segment preserved"
    else:
        # ── P1/P2/P3 classification via engagement delta ──────────────
        # engagement_score is initialised at base_score (see A2 persona_classifier).
        # Comparing the *delta above base* avoids the scenario where every lead
        # (whose base_score is already > 0) incorrectly classifies as P2 or P3.
        #
        # Delta thresholds (Tier-1 email-engagement proxy):
        #   ≤ 0.05  → P1  no email opens/clicks      → Brand campaign
        #   ≤ 0.34  → P2  some opens/clicks           → New product + sim
        #   ≥ 0.35  → P3  consult_page_visit (+0.40)  → Consultation push
        base_score = state.get("base_score", 0.40)
        score = state.get("engagement_score", base_score)
        delta = round(score - base_score, 4)

        # Derive the boolean flags expected by classify_dormant_segment
        has_website_visits = delta > 0.05  # any positive email engagement
        has_product_views = delta >= 0.35  # consult_page_visit territory

        segment = classify_dormant_segment(
            has_website_visits=has_website_visits,
            has_product_views=has_product_views,
        )
        reason = (
            f"derived: base={base_score:.2f} score={score:.2f} "
            f"delta={delta:.4f} → "
            f"visits={has_website_visits} product={has_product_views}"
        )

    state["revival_segment"] = segment
    state["scenario"] = "S4"

    # G3 Campaign Approval is mandatory for all S4 revival batches
    state["hitl_gate"] = "G3"
    state["hitl_status"] = "pending"
    state["current_node"] = NODE_ID

    if db is not None:
        await sync_lead_state(
            db,
            lead_id,
            revival_segment=segment,
            scenario_id="S4",
            current_agent_node=NODE_ID,
            workflow_status="Active",
        )

    latency_ms = int((time.perf_counter() - start) * 1000)
    logger.info(
        "A10 segment=%s for lead %s in %dms (%s)", segment, lead_id, latency_ms, reason
    )
    await event_manager.publish(
        node_transition_event(
            lead_id,
            NODE_ID,
            "completed",
            f"{segment} {latency_ms}ms",
            batch_id=state.get("batch_id"),
        )
    )

    state["execution_log"] = [
        create_log_entry(
            title="A10 - DORMANCY AGENT · COMPLETED — Awaiting G3 Campaign Approval",
            description=f"Revival segment: {segment}  ({reason})",
            badges=["S4 Revival", f"Segment {segment}", "G3 · Pending"],
        )
    ]
    return state

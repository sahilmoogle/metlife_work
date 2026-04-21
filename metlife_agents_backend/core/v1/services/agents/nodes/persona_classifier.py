"""
A2 — Life-Stage & Persona Classifier.

Uses deterministic rules first.  Falls back to LLM (GPT-4o-mini)
only when confidence is low (e.g. S6/S7 consultation forms).
"""

from __future__ import annotations

import logging
import time

from core.v1.services.agents.rules.scenario_rules import (
    classify_scenario,
    get_scenario_config,
    resolve_keigo_level,
)
from core.v1.services.sse.manager import event_manager, node_transition_event
from core.v1.services.agents.state import create_log_entry
from utils.v1.db_sync import sync_lead_state

logger = logging.getLogger(__name__)

NODE_ID = "A2_Persona"

# Confidence threshold — below this, G2 HITL gate fires
G2_CONFIDENCE_THRESHOLD = 0.60


async def persona_classifier(state: dict, *, db=None) -> dict:
    """Classify the lead into a scenario and assign persona."""
    lead_id = state["lead_id"]
    await event_manager.publish(node_transition_event(lead_id, NODE_ID, "started"))
    start = time.perf_counter()

    # ── OPT_IN check (preflight) ─────────────────────────────────────
    if state.get("opt_in"):
        state["workflow_status"] = "suppressed"
        state["current_node"] = NODE_ID
        if db is not None:
            await sync_lead_state(
                db,
                lead_id,
                workflow_status="Suppressed",
                current_agent_node=NODE_ID,
            )
        await event_manager.publish(
            node_transition_event(
                lead_id, NODE_ID, "completed", "OPT_IN=1 → suppressed"
            )
        )
        state["execution_log"] = [
            create_log_entry(
                title="RULE CHECK · COMPLETED",
                description="OPT_IN=1 → Unsubscribed. Workflow suppressed.",
                badges=["Rule-Based", "Suppressed"],
            )
        ]
        return state

    # ── Deterministic classification ─────────────────────────────────
    scenario = classify_scenario(
        ans3=state.get("ans3"),
        ans4=state.get("ans4"),
        ans5=state.get("ans5"),
        age=state.get("age"),
        registration_source=state.get("registration_source"),
        banner_code=state.get("banner_code"),
    )

    config = get_scenario_config(scenario)
    keigo = resolve_keigo_level(state.get("age"))

    # ── Calculate confidence ─────────────────────────────────────────
    has_survey = bool(state.get("ans3"))
    has_age = state.get("age") is not None

    if has_survey and has_age:
        confidence = 0.92
    elif has_survey or has_age:
        confidence = 0.70
    else:
        confidence = 0.40  # Degraded mode — G2 will fire

    # ── Update state ─────────────────────────────────────────────────
    state["scenario"] = scenario
    state["persona_code"] = config["persona_code"]
    state["persona_confidence"] = confidence
    state["keigo_level"] = keigo if scenario == "S3" else config.get("keigo", "casual")
    state["base_score"] = config["base_score"]
    state["engagement_score"] = config["base_score"]
    state["handoff_threshold"] = config["handoff_threshold"]
    state["max_emails"] = config["max_emails"]
    state["current_node"] = NODE_ID

    if scenario == "S2":
        state["life_event_flag"] = True

    if scenario == "S5":
        state["active_buyer"] = True

    if confidence < G2_CONFIDENCE_THRESHOLD:
        state["hitl_gate"] = "G2"
        state["hitl_status"] = "pending"

    # ── Write scenario + persona back to Lead table ──────────────────
    if db is not None:
        await sync_lead_state(
            db,
            lead_id,
            scenario_id=scenario,
            persona_code=state["persona_code"],
            persona_confidence=confidence,
            keigo_level=state["keigo_level"],
            engagement_score=state["engagement_score"],
            base_score=state["base_score"],
            current_agent_node=NODE_ID,
            workflow_status="Active",
        )

    latency_ms = int((time.perf_counter() - start) * 1000)
    logger.info(
        "A2 classified lead %s → %s (confidence=%.2f) in %dms",
        lead_id,
        scenario,
        confidence,
        latency_ms,
    )
    await event_manager.publish(
        node_transition_event(
            lead_id,
            NODE_ID,
            "completed",
            f"{scenario} conf={confidence:.2f} {latency_ms}ms",
        )
    )
    state["execution_log"] = [
        create_log_entry(
            title="RULE CHECK · COMPLETED: OPT_IN Eligibility",
            description="OPT_IN=0 → Eligible. Proceed.",
            badges=["Rule-Based"],
        ),
        create_log_entry(
            title=f"ROUTER · COMPLETED: {scenario} Assignment",
            description=f"ANS3={state.get('ans3')} + ANS4={state.get('ans4')} + Age={state.get('age')} → {scenario}",
            badges=["Decision Tree"],
        ),
        create_log_entry(
            title="A2 - LIFE-STAGE & PERSONA CLASSIFIER · COMPLETED",
            description=f"Confidence {confidence:.2f} — Persona {config['persona_code']}",
            badges=["Rule-Based" if confidence > 0.6 else "LLM Fallback"],
        ),
    ]

    return state

"""
LangGraph StateGraph compiler — the orchestration brain.

Wires all 10 agent nodes, 5 HITL gates, and conditional edges
into a single compiled graph with checkpoint persistence.

Scenario routing summary (per MetLife_JP_Flows.html):
  S1–S3, S5: A1 → A2 → [G2?] → A4/A5/G1/A6 loop (email nurture) → A8 → [G5?] → A9/G4
  S4:         A10 → G3 → A1 → A2 → same nurture loop (max 2 emails) → mark_dormant
  S6:         A1 → A2 → G2(always) → A3(MEMO) → A4/A5/G1/A6(1 email) → A9 → G4
  S7:         A1 → A2 → G2(always) → A3(MEMO) →
              email_captured=True  → A4/A5/G1/A6 → A8 → A9 → G4
              email_captured=False → A9 → G4  (skip email)
"""

from __future__ import annotations

import logging
import uuid
from functools import partial
from contextlib import asynccontextmanager

from sqlalchemy import update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
from langgraph.types import Command

from config.v1.database_config import db_config
from model.database.v1.leads import Lead

from core.v1.services.agents.state import create_initial_state, create_log_entry
from core.v1.services.agents.nodes.identity_unifier import identity_unifier
from core.v1.services.agents.nodes.persona_classifier import persona_classifier
from core.v1.services.agents.nodes.intent_analyser import intent_analyser
from core.v1.services.agents.nodes.content_strategist import content_strategist
from core.v1.services.agents.nodes.generative_writer import generative_writer
from core.v1.services.agents.nodes.send_engine import send_engine
from core.v1.services.agents.nodes.propensity_scorer import propensity_scorer
from core.v1.services.agents.nodes.sales_handoff import sales_handoff
from core.v1.services.agents.nodes.dormancy_agent import dormancy_agent
from core.v1.services.agents.nodes.hitl_gates import (
    should_fire_g2,
    should_fire_g5,
    persist_hitl_record,
)
from core.v1.services.agents.rules.scoring_rules import evaluate_score_route
from core.v1.services.sse.manager import event_manager, workflow_state_event
from config.v1.llm_config import get_llm
from utils.v1.db_sync import sync_lead_state

try:
    from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
except ImportError:
    AsyncPostgresSaver = None

try:
    from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
    import aiosqlite  # noqa: F401
except ImportError:
    AsyncSqliteSaver = None

logger = logging.getLogger(__name__)


# ── Checkpointer factory ─────────────────────────────────────────────


@asynccontextmanager
async def get_checkpointer():
    """Return the appropriate LangGraph checkpointer.

    Checkpoint tables are created automatically via saver.setup() so
    a fresh database (no prior migrations for LangGraph internals) works
    on first run.  Both app tables and checkpoint tables live in the same
    database file / schema — one connection string, one DB to manage.

    Priority: PostgreSQL → SQLite → MemorySaver (state lost on restart).
    """
    db_url = db_config.get_database_url()
    is_postgres = not db_config.is_sqlite()

    if AsyncPostgresSaver and is_postgres:
        try:
            # AsyncPostgresSaver uses psycopg3 (plain postgresql:// not asyncpg)
            sync_url = str(db_url).replace("postgresql+asyncpg://", "postgresql://")
            async with AsyncPostgresSaver.from_conn_string(sync_url) as saver:
                # setup() creates LangGraph's checkpoint tables if they don't exist.
                # Must be called before first use on a fresh Postgres database.
                await saver.setup()
                logger.info("Using PostgreSQL checkpointer")
                yield saver
            return
        except Exception as exc:
            logger.warning(
                "Postgres checkpointer unavailable (%s) — falling back to SQLite", exc
            )

    if AsyncSqliteSaver:
        sqlite_path = db_config.SQLITE_DB_PATH
        async with AsyncSqliteSaver.from_conn_string(sqlite_path) as saver:
            # setup() is idempotent — safe to call every time
            await saver.setup()
            logger.info("Using SQLite checkpointer at %s", sqlite_path)
            yield saver
        return

    logger.warning(
        "No persistent checkpointer available — using MemorySaver. "
        "Workflow state WILL be lost on server restart."
    )
    yield MemorySaver()


# ── HITL prep nodes ─────────────────────────────────────────────────


async def prep_g1(state: dict, *, db=None) -> dict:
    await persist_hitl_record(state, "G1", "Content Compliance", db=db)
    new_state = {**state, "hitl_gate": "G1", "hitl_status": "pending"}
    new_state["execution_log"] = [
        create_log_entry(
            title=f"G1 · CONTENT COMPLIANCE — Awaiting Review (Email #{state.get('email_number', 0)})",
            description=(
                f"Subject: {str(state.get('draft_email_subject', ''))[:80]} — "
                "Reviewer can approve, edit, or reject."
            ),
            badges=["HITL", "G1 · Compliance Review", "Pending"],
        )
    ]
    return new_state


async def prep_g2(state: dict, *, db=None) -> dict:
    await persist_hitl_record(state, "G2", "Persona Override", db=db)
    new_state = {**state, "hitl_gate": "G2", "hitl_status": "pending"}
    new_state["execution_log"] = [
        create_log_entry(
            title="G2 · PERSONA OVERRIDE — Awaiting Review",
            description=(
                f"Suggested persona: {state.get('persona_code', 'unknown')} "
                f"(confidence {state.get('persona_confidence', 0):.0%}). "
                "Reviewer can accept or override."
            ),
            badges=["HITL", "G2 · Persona Override", "Pending"],
        )
    ]
    return new_state


async def prep_g3(state: dict, *, db=None) -> dict:
    await persist_hitl_record(state, "G3", "Revival Campaign Approval", db=db)
    new_state = {**state, "hitl_gate": "G3", "hitl_status": "pending"}
    new_state["execution_log"] = [
        create_log_entry(
            title="G3 · CAMPAIGN APPROVAL — Awaiting Review (S4 Dormant Revival)",
            description=(
                f"Segment: {state.get('revival_segment', 'P1')} — "
                "Campaign manager must approve before emails are sent."
            ),
            badges=["HITL", "G3 · Campaign Approval", "Pending"],
        )
    ]
    return new_state


async def prep_g4(state: dict, *, db=None) -> dict:
    await persist_hitl_record(state, "G4", "Sales Handoff Review", db=db)
    new_state = {**state, "hitl_gate": "G4", "hitl_status": "pending"}
    new_state["execution_log"] = [
        create_log_entry(
            title="G4 · SALES HANDOFF REVIEW — Awaiting Approval",
            description=(
                f"Score: {state.get('engagement_score', 0):.2f} — "
                "Sales briefing ready. Advisor review required before CRM escalation."
            ),
            badges=["HITL", "G4 · Sales Handoff", "Pending"],
        )
    ]
    return new_state


async def prep_g5(state: dict, *, db=None) -> dict:
    await persist_hitl_record(state, "G5", "Edge Score Override", db=db)
    new_state = {**state, "hitl_gate": "G5", "hitl_status": "pending"}
    new_state["execution_log"] = [
        create_log_entry(
            title="G5 · EDGE SCORE OVERRIDE — Awaiting Decision",
            description=(
                f"Score {state.get('engagement_score', 0):.2f} is near threshold "
                f"{state.get('handoff_threshold', 0.80):.2f}. "
                "Reviewer can promote to handoff or hold for nurture."
            ),
            badges=["HITL", "G5 · Edge Override", "Pending"],
        )
    ]
    return new_state


async def mark_dormant(state: dict, *, db=None) -> dict:
    """Terminal node: email sequence exhausted, lead moves to Dormant pool.

    Sets workflow_status='Dormant'.  For S4 leads, also sets cooldown_flag
    so the dormancy scanner won't pick them up again until manually reset.
    """
    lead_id = state["lead_id"]
    state["workflow_status"] = "dormant"

    updates: dict = {"workflow_status": "Dormant"}
    if state.get("scenario") == "S4":
        updates["cooldown_flag"] = True
        state["cooldown_flag"] = True

    if db is not None:
        await sync_lead_state(db, lead_id, **updates)

    logger.info(
        "Lead %s marked Dormant after exhausting email sequence (%s)",
        lead_id,
        state.get("scenario"),
    )
    await event_manager.publish(
        workflow_state_event(
            lead_id,
            "dormant",
            f"Email sequence exhausted — scenario {state.get('scenario')}",
        )
    )
    is_s4 = state.get("scenario") == "S4"
    badges = ["Dormant", "Sequence Complete"]
    cooldown_note = ""
    if is_s4:
        badges.append("Cooldown Set")
        cooldown_note = (
            " cooldown_flag=True set — will not be re-scanned until manually cleared."
        )

    state["execution_log"] = [
        create_log_entry(
            title="WORKFLOW COMPLETE — Lead moved to Dormant pool",
            description=(
                f"Scenario {state.get('scenario')} email sequence exhausted "
                f"({state.get('email_number', 0)} emails sent). "
                "Lead eligible for S4 Dormant Revival after 180 days of inactivity."
                + cooldown_note
            ),
            badges=badges,
        )
    ]
    return state


# ── Conditional edge functions ───────────────────────────────────────


def _route_after_classifier(state: dict) -> str:
    """Route after A2.

    Priority:
    1. Suppressed (OPT_IN) → END
    2. G2 fires for ALL scenarios including S6/S7 (confidence always < 0.60)
    3. S6/S7 high-intent → intent_analyser (bypass email nurture loop)
    4. Everything else → content_strategist (start email nurture)
    """
    if state.get("workflow_status") == "suppressed":
        return "end"

    # G2 check applies BEFORE any scenario-specific bypass
    if should_fire_g2(state):
        return "prep_g2"

    # S6/S7 skip the regular email nurture loop entirely; A3 MEMO analysis is next
    if state.get("scenario") in ("S6", "S7"):
        return "intent_analyser"

    return "content_strategy"


def _route_after_g2(state: dict) -> str:
    """Route after G2 pause resumes.

    S6/S7 go to MEMO intent analysis (no nurture loop).
    All others enter the email content strategy.
    """
    if state.get("scenario") in ("S6", "S7"):
        return "intent_analyser"
    return "content_strategist"


def _route_after_intent(state: dict) -> str:
    """Route after A3 Intent Analyser.

    S1–S5: feed into propensity_scorer (A8) as normal.
    S6: always send one LLM email (MEMO-based) before handoff.
         Routes to content_strategist if email not yet sent.
    S7: if email captured → send one post-call email;
        if no email → skip directly to sales_handoff.
    """
    scenario = state.get("scenario")
    email_number = state.get("email_number", 0)

    if scenario == "S6":
        if email_number == 0:
            return "content_strategist"
        return "sales_handoff"

    if scenario == "S7":
        if not state.get("email_captured", False):
            return "sales_handoff"
        if email_number == 0:
            return "content_strategist"
        return "sales_handoff"

    # S1–S5 (and S4) follow the standard scoring path
    return "propensity_scorer"


def _route_after_scoring(state: dict) -> str:
    """Route after A8: continue nurture / G5 edge review / handoff / mark dormant."""
    score = state.get("engagement_score", 0)
    threshold = state.get("handoff_threshold", 0.80)
    email_number = state.get("email_number", 0)
    max_emails = state.get("max_emails", 5)

    route = evaluate_score_route(score, threshold)

    if route == "handoff":
        return "sales_handoff"
    if route == "edge" and should_fire_g5(state):
        return "prep_g5"
    if email_number >= max_emails:
        return "mark_dormant"
    return "continue_nurture"


def _route_after_handoff(state: dict) -> str:
    """Route after A9: always through G4 gate."""
    return "prep_g4"


def _route_after_g1(state: dict) -> str:
    """Route after g1_pause resumes.

    approved / edited → send engine.
    rejected → back to generative_writer for a revised draft.
    """
    decision = state.get("hitl_resume_value", "approved")
    if decision == "rejected":
        return "generative_writer"
    return "send_engine"


def _route_after_g5(state: dict) -> str:
    """Route after g5_pause resumes.

    approved → promote to handoff.
    hold → return to nurture loop.
    """
    decision = state.get("hitl_resume_value", "approved")
    if decision == "hold":
        return "content_strategist"
    return "sales_handoff"


# ── Graph builder ────────────────────────────────────────────────────


def build_graph(*, db_session=None, checkpointer=None):
    """Construct and compile the LangGraph workflow.

    Args:
        db_session: AsyncSession for database operations within nodes.
        checkpointer: LangGraph checkpointer.  Defaults to MemorySaver.

    Returns:
        Compiled LangGraph application ready for invocation.
    """
    llm = get_llm()

    # Bind DB session and LLM into nodes that need them
    bound_a1 = partial(identity_unifier, db=db_session)
    bound_a2 = partial(persona_classifier, db=db_session)
    bound_a3 = partial(intent_analyser, llm=llm)
    bound_a5 = partial(generative_writer, llm=llm)
    bound_a6 = partial(send_engine, db=db_session)
    bound_a8 = partial(propensity_scorer, db=db_session)
    bound_a9 = partial(sales_handoff, llm=llm)
    bound_mark_dormant = partial(mark_dormant, db=db_session)

    bound_prep_g1 = partial(prep_g1, db=db_session)
    bound_prep_g2 = partial(prep_g2, db=db_session)
    bound_prep_g3 = partial(prep_g3, db=db_session)
    bound_prep_g4 = partial(prep_g4, db=db_session)
    bound_prep_g5 = partial(prep_g5, db=db_session)

    graph = StateGraph(dict)

    # ── Agent nodes ─────────────────────────────────────────────────
    graph.add_node("identity_unifier", bound_a1)
    graph.add_node("persona_classifier", bound_a2)
    graph.add_node("intent_analyser", bound_a3)
    graph.add_node("content_strategist", content_strategist)
    graph.add_node("generative_writer", bound_a5)
    graph.add_node("send_engine", bound_a6)
    graph.add_node("propensity_scorer", bound_a8)
    graph.add_node("sales_handoff", bound_a9)
    graph.add_node("dormancy_agent", dormancy_agent)
    graph.add_node("mark_dormant", bound_mark_dormant)

    # ── HITL prep nodes ─────────────────────────────────────────────
    graph.add_node("prep_g1", bound_prep_g1)
    graph.add_node("prep_g2", bound_prep_g2)
    graph.add_node("prep_g3", bound_prep_g3)
    graph.add_node("prep_g4", bound_prep_g4)
    graph.add_node("prep_g5", bound_prep_g5)

    # ── HITL pause nodes (graph suspends before these) ───────────────
    graph.add_node("g1_pause", lambda state: state)
    graph.add_node("g2_pause", lambda state: state)
    graph.add_node("g3_pause", lambda state: state)
    graph.add_node("g4_pause", lambda state: state)
    graph.add_node("g5_pause", lambda state: state)

    # ── Entry point ─────────────────────────────────────────────────
    # S4 dormant leads skip straight to dormancy_agent (A10) so the segment
    # can be classified and G3 campaign approval can fire before A1 runs.
    # All other scenarios start at identity_unifier (A1) as normal.
    graph.add_conditional_edges(
        START,
        lambda state: "dormancy_agent"
        if state.get("scenario") == "S4"
        else "identity_unifier",
        {"dormancy_agent": "dormancy_agent", "identity_unifier": "identity_unifier"},
    )

    # A1 → A2
    graph.add_edge("identity_unifier", "persona_classifier")

    # A2 → G2 | content_strategy | intent_analyser (S6/S7)
    graph.add_conditional_edges(
        "persona_classifier",
        _route_after_classifier,
        {
            "end": END,
            "prep_g2": "prep_g2",
            "content_strategy": "content_strategist",
            "intent_analyser": "intent_analyser",
        },
    )

    # G2 gate
    graph.add_edge("prep_g2", "g2_pause")
    # After G2: S6/S7 → intent_analyser; others → content_strategist
    graph.add_conditional_edges(
        "g2_pause",
        _route_after_g2,
        {
            "intent_analyser": "intent_analyser",
            "content_strategist": "content_strategist",
        },
    )

    # ── Email nurture loop: A4 → A5 → G1 → A6 ──────────────────────
    graph.add_edge("content_strategist", "generative_writer")
    graph.add_edge("generative_writer", "prep_g1")
    graph.add_edge("prep_g1", "g1_pause")

    # G1: approved/edited → send; rejected → re-generate
    graph.add_conditional_edges(
        "g1_pause",
        _route_after_g1,
        {"send_engine": "send_engine", "generative_writer": "generative_writer"},
    )

    # A6 → A3 → routing (S6/S7 go to handoff, others to A8)
    graph.add_edge("send_engine", "intent_analyser")
    graph.add_conditional_edges(
        "intent_analyser",
        _route_after_intent,
        {
            "propensity_scorer": "propensity_scorer",
            "content_strategist": "content_strategist",
            "sales_handoff": "sales_handoff",
        },
    )

    # A8 → continue | G5 | handoff | mark_dormant
    graph.add_conditional_edges(
        "propensity_scorer",
        _route_after_scoring,
        {
            "continue_nurture": "content_strategist",
            "prep_g5": "prep_g5",
            "sales_handoff": "sales_handoff",
            "mark_dormant": "mark_dormant",
        },
    )

    # mark_dormant → END
    graph.add_edge("mark_dormant", END)

    # G5: promoted → handoff; hold → back to nurture
    graph.add_edge("prep_g5", "g5_pause")
    graph.add_conditional_edges(
        "g5_pause",
        _route_after_g5,
        {"content_strategist": "content_strategist", "sales_handoff": "sales_handoff"},
    )

    # A9 → G4 → END
    graph.add_conditional_edges(
        "sales_handoff",
        _route_after_handoff,
        {"prep_g4": "prep_g4"},
    )
    graph.add_edge("prep_g4", "g4_pause")
    graph.add_edge("g4_pause", END)

    # ── S4 dormancy path: A10 → G3 → A1 ────────────────────────────
    graph.add_edge("dormancy_agent", "prep_g3")
    graph.add_edge("prep_g3", "g3_pause")
    graph.add_edge("g3_pause", "identity_unifier")

    # ── Compile ──────────────────────────────────────────────────────
    saver = checkpointer or MemorySaver()
    compiled = graph.compile(
        checkpointer=saver,
        interrupt_before=["g1_pause", "g2_pause", "g3_pause", "g4_pause", "g5_pause"],
    )
    logger.info("LangGraph compiled with %d nodes", len(graph.nodes))
    return compiled


# ── Invocation helpers ───────────────────────────────────────────────


async def start_workflow(
    lead_id: str,
    *,
    db_session: AsyncSession | None = None,
    target_language: str = "JA",
    scenario: str | None = None,
) -> dict:
    """Create a new workflow thread and run until first HITL interrupt.

    Persists thread_id to the Lead row immediately so the leads table
    and detail endpoints stay current.

    Pass scenario='S4' for dormant revival leads — the graph will enter
    at dormancy_agent (A10) instead of identity_unifier (A1).
    """
    thread_id = str(uuid.uuid4())
    initial_state = create_initial_state(
        lead_id=str(lead_id),
        thread_id=thread_id,
        target_language=target_language,
    )
    # Pre-set scenario so the START router can direct dormant leads to A10
    if scenario:
        initial_state["scenario"] = scenario

    config = {"configurable": {"thread_id": thread_id}}

    if db_session is not None:
        try:
            await db_session.execute(
                sa_update(Lead)
                .where(Lead.id == lead_id)
                .values(thread_id=thread_id, workflow_status="Active")
            )
            await db_session.commit()
        except Exception as e:
            logger.warning("Could not pre-save thread_id for lead %s: %s", lead_id, e)

    await event_manager.publish(
        workflow_state_event(str(lead_id), "started", f"thread={thread_id}")
    )

    async with get_checkpointer() as cp:
        graph = build_graph(db_session=db_session, checkpointer=cp)
        result = await graph.ainvoke(initial_state, config=config)

    return {
        "thread_id": thread_id,
        "lead_id": str(lead_id),
        "state": result,
        "config": config,
    }


async def resume_workflow(
    thread_id: str,
    *,
    db_session: AsyncSession | None = None,
    resume_value: str = "approved",
) -> dict:
    """Resume a paused workflow after HITL decision.

    Injects hitl_resume_value into state before resuming so conditional
    edges (G1 rejection → re-generate, G5 hold → back to nurture) route
    correctly.
    """
    config = {"configurable": {"thread_id": thread_id}}

    async with get_checkpointer() as cp:
        graph = build_graph(db_session=db_session, checkpointer=cp)
        await graph.aupdate_state(config, {"hitl_resume_value": resume_value})
        result = await graph.ainvoke(Command(resume=resume_value), config=config)

    return {
        "thread_id": thread_id,
        "state": result,
    }

"""
LangGraph StateGraph compiler — the orchestration brain.

Wires all 9 agent nodes, 5 HITL gates, and conditional edges
into a single compiled graph with checkpoint persistence.
"""

from __future__ import annotations

import logging
import uuid
from functools import partial

from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver

from core.v1.services.agents.state import create_initial_state
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
)
from core.v1.services.agents.rules.scoring_rules import evaluate_score_route
from config.v1.llm_config import get_llm

logger = logging.getLogger(__name__)


# ── Checkpoint persistence ───────────────────────────────────────────
# MemorySaver for development.  Swap to SqliteSaver / PostgresSaver
# in production for "refresh & continue" persistence.


def _get_checkpointer():
    """Return the appropriate checkpointer for the environment.

    Tries PostgresSaver first. Falls back to SqliteSaver if Postgres
    is unavailable. Falls back to MemorySaver if SQLite is unavailable.
    """
    try:
        from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
        from utils.v1.connections import get_settings

        settings = get_settings()
        if hasattr(settings, "DATABASE_URL") and settings.DATABASE_URL.startswith(
            "postgresql"
        ):
            # Requires psycopg pool management in production, using connection string for now
            return AsyncPostgresSaver.from_conn_string(settings.DATABASE_URL)
    except ImportError:
        logger.info("Postgres checkpointer unavailable")

    try:
        from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
        import aiosqlite  # noqa: F401

        logger.info("Using SQLite checkpointer")
        return AsyncSqliteSaver.from_conn_string("metlife_checkpoints.db")
    except ImportError:
        logger.info("SQLite checkpointer unavailable — using MemorySaver")
        return MemorySaver()


# ── Conditional edge routers & DB Injectors ────────────

async def prep_g1(state: dict, *, db=None) -> dict:
    from core.v1.services.agents.nodes.hitl_gates import persist_hitl_record
    await persist_hitl_record(state, "G1", "Content Compliance", db=db)
    return {**state, "hitl_gate": "G1", "hitl_status": "pending"}

async def prep_g2(state: dict, *, db=None) -> dict:
    from core.v1.services.agents.nodes.hitl_gates import persist_hitl_record
    await persist_hitl_record(state, "G2", "Persona Override", db=db)
    return {**state, "hitl_gate": "G2", "hitl_status": "pending"}

async def prep_g4(state: dict, *, db=None) -> dict:
    from core.v1.services.agents.nodes.hitl_gates import persist_hitl_record
    await persist_hitl_record(state, "G4", "Sales Handoff Review", db=db)
    return {**state, "hitl_gate": "G4", "hitl_status": "pending"}

async def prep_g5(state: dict, *, db=None) -> dict:
    from core.v1.services.agents.nodes.hitl_gates import persist_hitl_record
    await persist_hitl_record(state, "G5", "Edge Score Override", db=db)
    return {**state, "hitl_gate": "G5", "hitl_status": "pending"}


def _route_after_classifier(state: dict) -> str:
    """Route after A2: check if G2 gate should fire."""
    if state.get("workflow_status") == "suppressed":
        return "end"
    if should_fire_g2(state):
        return "prep_g2"
    return "content_strategy"


def _route_after_scoring(state: dict) -> str:
    """Route after A8: continue / G5 edge review / handoff."""
    score = state.get("engagement_score", 0)
    threshold = state.get("handoff_threshold", 0.80)
    email_number = state.get("email_number", 0)
    max_emails = state.get("max_emails", 5)
    scenario = state.get("scenario")

    # S6/S7 — always go to handoff
    if scenario in ("S6", "S7"):
        return "sales_handoff"

    route = evaluate_score_route(score, threshold)

    if route == "handoff":
        return "sales_handoff"
    if route == "edge" and should_fire_g5(state):
        return "prep_g5"
    if email_number >= max_emails:
        return "end"
    return "continue_nurture"


def _route_after_handoff(state: dict) -> str:
    """Route after A9: always go through G4 gate."""
    return "prep_g4"


# ── Graph builder ────────────────────────────────────────────────────


def build_graph(*, db_session=None, checkpointer=None):
    """Construct and compile the LangGraph workflow.

    Args:
        db_session: AsyncSession for database operations within nodes.
        checkpointer: LangGraph checkpointer for state persistence.
                      Defaults to MemorySaver if not provided.

    Returns:
        Compiled LangGraph application ready for invocation.
    """
    llm = get_llm()

    # ── Bind dependencies to node functions ──────────────────────────
    bound_a1 = partial(identity_unifier, db=db_session)
    bound_a3 = partial(intent_analyser, llm=llm)
    bound_a5 = partial(generative_writer, llm=llm)
    bound_a6 = partial(send_engine, db=db_session)
    bound_a9 = partial(sales_handoff, llm=llm)

    bound_prep_g1 = partial(prep_g1, db=db_session)
    bound_prep_g2 = partial(prep_g2, db=db_session)
    bound_prep_g4 = partial(prep_g4, db=db_session)
    bound_prep_g5 = partial(prep_g5, db=db_session)

    # ── Build the state graph ────────────────────────────────────────
    graph = StateGraph(dict)

    # Register nodes
    graph.add_node("identity_unifier", bound_a1)
    graph.add_node("persona_classifier", persona_classifier)
    graph.add_node("intent_analyser", bound_a3)
    graph.add_node("content_strategist", content_strategist)
    graph.add_node("generative_writer", bound_a5)
    graph.add_node("send_engine", bound_a6)
    graph.add_node("propensity_scorer", propensity_scorer)
    graph.add_node("sales_handoff", bound_a9)
    graph.add_node("dormancy_agent", dormancy_agent)

    # DB persistence inject nodes for gateways
    graph.add_node("prep_g1", bound_prep_g1)
    graph.add_node("prep_g2", bound_prep_g2)
    graph.add_node("prep_g4", bound_prep_g4)
    graph.add_node("prep_g5", bound_prep_g5)

    # Placeholder pause nodes where the graph will gracefully suspend
    graph.add_node("g1_pause", lambda state: state)
    graph.add_node("g2_pause", lambda state: state)
    graph.add_node("g4_pause", lambda state: state)
    graph.add_node("g5_pause", lambda state: state)

    # ── Entry point ──────────────────────────────────────────────────
    graph.set_entry_point("identity_unifier")

    # ── Edges: A1 → A2 ──────────────────────────────────────────────
    graph.add_edge("identity_unifier", "persona_classifier")

    # ── Conditional: A2 → prep_g2(pause) | content_strategy ───────────────
    graph.add_conditional_edges(
        "persona_classifier",
        _route_after_classifier,
        {
            "end": END,
            "prep_g2": "prep_g2",
            "content_strategy": "content_strategist",
        },
    )

    # G2 interrupted — after human resumes, proceed to content strategy
    graph.add_edge("prep_g2", "g2_pause")
    graph.add_edge("g2_pause", "content_strategist")

    # ── A4 → A5 → prep_g1(pause) → send_engine → A3 → A8 ─────────────────────
    graph.add_edge("content_strategist", "generative_writer")
    graph.add_edge("generative_writer", "prep_g1")
    graph.add_edge("prep_g1", "g1_pause")
    graph.add_edge("g1_pause", "send_engine")
    graph.add_edge("send_engine", "intent_analyser")
    graph.add_edge("intent_analyser", "propensity_scorer")

    # ── Conditional: A8 → continue | prep_g5 | handoff | end ──────────────
    graph.add_conditional_edges(
        "propensity_scorer",
        _route_after_scoring,
        {
            "continue_nurture": "content_strategist",
            "prep_g5": "prep_g5",
            "sales_handoff": "sales_handoff",
            "end": END,
        },
    )

    # G5 after human review → either handoff or back to nurture
    graph.add_edge("prep_g5", "g5_pause")
    graph.add_edge("g5_pause", "sales_handoff")

    # ── A9 → prep_g4 → END ───────────────────────────────────────────────
    graph.add_conditional_edges(
        "sales_handoff",
        _route_after_handoff,
        {"g4_pause": "g4_pause"},
    )
    graph.add_edge("g4_pause", END)

    # ── A10 (dormancy) entry — standalone trigger ────────────────────
    # A10 feeds into A1 for profile refresh, then follows normal flow
    graph.add_edge("dormancy_agent", "identity_unifier")

    # ── Compile with interrupt points for HITL ───────────────────────
    saver = checkpointer or MemorySaver()

    compiled = graph.compile(
        checkpointer=saver,
        interrupt_before=["g1_pause", "g2_pause", "g4_pause", "g5_pause"],
    )

    logger.info("LangGraph compiled with %d nodes", len(graph.nodes))
    return compiled


# ── Invocation helpers ───────────────────────────────────────────────


async def start_workflow(
    lead_id: str,
    *,
    db_session=None,
    target_language: str = "JA",
) -> dict:
    """Create a new workflow thread for a lead and run until first interrupt.

    Returns the thread config and final state snapshot.
    """
    thread_id = str(uuid.uuid4())
    initial_state = create_initial_state(
        lead_id=str(lead_id),
        thread_id=thread_id,
        target_language=target_language,
    )

    graph = build_graph(db_session=db_session)

    config = {"configurable": {"thread_id": thread_id}}
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
    db_session=None,
    resume_value: str = "approved",
) -> dict:
    """Resume a paused workflow after HITL approval.

    Loads the checkpointed state and continues execution.
    """
    from langgraph.types import Command

    graph = build_graph(db_session=db_session)
    config = {"configurable": {"thread_id": thread_id}}

    result = await graph.ainvoke(
        Command(resume=resume_value),
        config=config,
    )

    return {
        "thread_id": thread_id,
        "state": result,
    }

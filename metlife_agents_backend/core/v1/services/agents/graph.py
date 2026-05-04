"""
LangGraph StateGraph compiler — the orchestration brain.

Wires the agent nodes, 5 HITL gates, cadence timers, and conditional edges
into a single compiled graph with checkpoint persistence.

Scenario routing summary (per MetLife_JP_Flows.html):
  S1–S3, S5: A1 → A2 → [G2?] → A4/A5/G1/A6 → A8 → A11 cadence or A9/G4
  S4:         A10 → G3 → A1 → A2 → nurture loop + S4 response timer → mark_dormant
  S6:         A1 → A2 → G2(always) → A3(MEMO) → A4/A5/G1/A6(1 email) → A9 → G4
  S7:         A1 → A2 → G2(always) → A3(MEMO) →
              email_captured=True  → A4/A5/G1/A6 → A8 → A9 → G4
              email_captured=False → A9 → G4  (skip email)
"""

from __future__ import annotations

import logging
import uuid
import json
import time
from functools import partial
from datetime import datetime, timezone, timedelta
from contextlib import asynccontextmanager

from sqlalchemy import update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
from langgraph.types import interrupt, Command
from config.v1.database_config import db_config
from model.database.v1.leads import Lead
from model.database.v1.workflow_timers import WorkflowTimer
from model.database.v1.audit_log import AuditLog

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


def _with_agent_audit(node_id: str, node_fn, db_session=None):
    async def audited_node(state: dict) -> dict:
        started = time.perf_counter()
        status = "completed"
        error: str | None = None
        try:
            return await node_fn(state)
        except Exception as exc:
            status = "failed"
            error = str(exc)
            raise
        finally:
            if db_session is not None:
                try:
                    db_session.add(
                        AuditLog(
                            action=f"agent_node_{status}",
                            resource_type="agent_node",
                            resource_id=str(state.get("lead_id") or ""),
                            details=json.dumps(
                                {
                                    "node_id": node_id,
                                    "thread_id": state.get("thread_id"),
                                    "scenario": state.get("scenario"),
                                    "latency_ms": int(
                                        (time.perf_counter() - started) * 1000
                                    ),
                                    "error": error,
                                },
                                ensure_ascii=False,
                            ),
                        )
                    )
                    await db_session.commit()
                except Exception as audit_exc:
                    await db_session.rollback()
                    logger.warning("Agent audit write failed: %s", audit_exc)

    return audited_node


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

    updates: dict = {
        "workflow_status": "Dormant",
        "workflow_completed": True,
        "completed_at": datetime.now(timezone.utc),
    }
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


CADENCE_NODE_ID = "A11_CadenceTimer"


async def schedule_cadence_timer(state: dict, *, db=None) -> dict:
    """Pause the workflow until the next nurture/send window is due."""
    lead_id = state["lead_id"]
    cadence_days = max(int(state.get("cadence_days") or 0), 0)
    now_jst = datetime.now(timezone(timedelta(hours=9)))
    preferred_hour = int(state.get("preferred_send_hour_jst") or 17)
    preferred_hour = max(0, min(23, preferred_hour))
    due_jst = (now_jst + timedelta(days=cadence_days)).replace(
        hour=preferred_hour, minute=0, second=0, microsecond=0
    )
    if due_jst <= now_jst:
        due_jst += timedelta(days=1)
    due_at = due_jst.astimezone(timezone.utc)
    timer_type = "s4_response_window" if state.get("scenario") == "S4" else "cadence"

    await event_manager.publish(
        workflow_state_event(
            lead_id,
            "paused",
            f"{timer_type} due at {due_at.isoformat()}",
        )
    )

    if db is not None:
        db.add(
            WorkflowTimer(
                lead_id=lead_id,
                thread_id=state.get("thread_id", ""),
                timer_type=timer_type,
                status="pending",
                due_at=due_at,
                payload=f"next_email_number={state.get('email_number', 0) + 1}",
            )
        )
        await db.execute(
            sa_update(Lead)
            .where(Lead.id == lead_id)
            .values(workflow_status="Paused", current_agent_node=CADENCE_NODE_ID)
        )
        await db.commit()

    state["workflow_status"] = "paused"
    state["current_node"] = CADENCE_NODE_ID
    state["cadence_due_at"] = due_at.isoformat()
    state["hitl_gate"] = None
    state["hitl_status"] = "idle"
    state["execution_log"] = [
        create_log_entry(
            title="A11 - CADENCE TIMER · PAUSED",
            description=(
                f"Next nurture touch is scheduled for {due_at.isoformat()} "
                f"({timer_type}, cadence_days={cadence_days})."
            ),
            badges=["Scheduler", timer_type],
        )
    ]
    return state


# ── Conditional edge functions ───────────────────────────────────────


def _route_after_classifier(state: dict) -> str:
    """Route after A2.

    Priority:
    1. Suppressed (OPT_IN) → END
    2. G2 fires for ALL scenarios including S6/S7 (confidence always < 0.60)
    3. Otherwise → intent_analyser (A3 runs before email strategy)
    """
    if state.get("workflow_status") == "suppressed":
        return "end"

    # G2 check applies BEFORE any scenario-specific bypass
    if should_fire_g2(state):
        return "prep_g2"

    # Run A3 for all scenarios so LLM emails (and scoring) can use intent context.
    return "intent_analyser"


def _route_after_g2(state: dict) -> str:
    """Route after G2 pause resumes.

    Resume into intent analysis for all scenarios.
    """
    return "intent_analyser"


def _route_after_intent(state: dict) -> str:
    """Route after A3 Intent Analyser.

    S1–S5: proceed into content strategy to draft/send the next email.
    S6: send one LLM email only when email is captured; otherwise handoff.
    S7: if email captured → send one post-call email;
        if no email → skip directly to sales_handoff.
    """
    scenario = state.get("scenario")
    email_number = state.get("email_number", 0)

    # After an email send or an external engagement event, score first so the
    # graph can either hand off, pause for cadence, or mark dormant. Without
    # this guard, S1-S5 loop directly into the next email in the same run.
    if state.get("post_send_route") or state.get("event_pending_route"):
        return "propensity_scorer"

    if scenario == "S6":
        if email_number == 0 and state.get("email_captured", False):
            return "content_strategist"
        return "sales_handoff"

    if scenario == "S7":
        if not state.get("email_captured", False):
            return "sales_handoff"
        if email_number == 0:
            return "content_strategist"
        return "propensity_scorer"

    # S1–S5 (and S4/S5) enter the standard email strategy path.
    return "content_strategist"


def _route_after_scoring(state: dict) -> str:
    """Route after A8: schedule nurture / G5 edge review / handoff / mark dormant."""
    score = state.get("engagement_score", 0)
    threshold = state.get("handoff_threshold", 0.80)
    email_number = state.get("email_number", 0)
    max_emails = state.get("max_emails", 5)

    if state.get("consultation_booked"):
        return "sales_handoff"

    route = evaluate_score_route(score, threshold)

    if route == "handoff":
        return "sales_handoff"
    if route == "edge" and should_fire_g5(state):
        return "prep_g5"
    if email_number >= max_emails:
        return "mark_dormant"
    # cadence_days=0 means send immediately — skip the timer pause.
    if int(state.get("cadence_days") or 0) == 0:
        state["post_send_route"] = False
        return "intent_analyser"
    return "schedule_cadence"


def _route_after_handoff(state: dict) -> str:
    """Route after A9: always through G4 gate."""
    return "prep_g4"


def _route_after_g1(state: dict) -> str:
    """Route after g1_pause resumes.

    approved / edited → send engine.
    rejected -> back through A4 so existing assets become LLM drafts.
    """
    decision = state.get("hitl_resume_value", "approved")
    if decision == "rejected":
        return "content_strategist"
    return "send_engine"


def _route_after_send(state: dict) -> str:
    """Route after A6.

    Deferred, failed, or suppressed sends stop here; a future scheduler/manual
    action can resume from the durable outbox/timer state.
    """
    if state.get("send_deferred") or state.get("workflow_status") in (
        "failed",
        "paused",
        "suppressed",
    ):
        return "end"
    return "intent_analyser"


def _route_after_g5(state: dict) -> str:
    """Route after g5_pause resumes.

    approved → promote to handoff.
    hold → return to nurture loop.
    """
    decision = state.get("hitl_resume_value", "approved")
    if decision == "hold":
        if state.get("email_number", 0) >= state.get("max_emails", 0):
            return "mark_dormant"
        if int(state.get("cadence_days") or 0) == 0:
            state["post_send_route"] = False
            return "intent_analyser"
        return "schedule_cadence"
    return "sales_handoff"


def _route_after_g4(state: dict) -> str:
    """Route after sales handoff review.

    A hold sends nurture-capable leads back for another touch; approval/edit
    and rejection finish the graph because the API has already persisted the
    human outcome.
    """
    decision = state.get("hitl_resume_value", "approved")
    if decision == "hold":
        if state.get("scenario") in ("S6", "S7") and not state.get(
            "email_captured", False
        ):
            return "end"
        if state.get("email_number", 0) < state.get("max_emails", 0):
            if int(state.get("cadence_days") or 0) == 0:
                state["post_send_route"] = False
                return "intent_analyser"
            return "schedule_cadence"
        return "mark_dormant"
    return "end"


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
    bound_a1 = _with_agent_audit(
        "A1_Identity", partial(identity_unifier, db=db_session), db_session
    )
    bound_a2 = _with_agent_audit(
        "A2_Persona", partial(persona_classifier, db=db_session), db_session
    )
    bound_a3 = _with_agent_audit(
        "A3_Intent", partial(intent_analyser, llm=llm, db=db_session), db_session
    )
    bound_a4 = _with_agent_audit(
        "A4_ContentStrategy", partial(content_strategist, db=db_session), db_session
    )
    bound_a5 = _with_agent_audit(
        "A5_Writer", partial(generative_writer, llm=llm, db=db_session), db_session
    )
    bound_a6 = _with_agent_audit(
        "A6_Send", partial(send_engine, db=db_session), db_session
    )
    bound_a8 = _with_agent_audit(
        "A8_Scoring", partial(propensity_scorer, db=db_session), db_session
    )
    bound_a9 = _with_agent_audit(
        "A9_Handoff", partial(sales_handoff, llm=llm, db=db_session), db_session
    )
    bound_a10 = _with_agent_audit(
        "A10_Dormancy", partial(dormancy_agent, db=db_session), db_session
    )
    bound_mark_dormant = _with_agent_audit(
        "mark_dormant", partial(mark_dormant, db=db_session), db_session
    )
    bound_schedule_cadence = _with_agent_audit(
        "A11_CadenceTimer", partial(schedule_cadence_timer, db=db_session), db_session
    )

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
    graph.add_node("content_strategist", bound_a4)
    graph.add_node("generative_writer", bound_a5)
    graph.add_node("send_engine", bound_a6)
    graph.add_node("propensity_scorer", bound_a8)
    graph.add_node("sales_handoff", bound_a9)
    graph.add_node("dormancy_agent", bound_a10)
    graph.add_node("mark_dormant", bound_mark_dormant)
    graph.add_node("schedule_cadence", bound_schedule_cadence)

    # ── HITL prep nodes ─────────────────────────────────────────────
    graph.add_node("prep_g1", bound_prep_g1)
    graph.add_node("prep_g2", bound_prep_g2)
    graph.add_node("prep_g3", bound_prep_g3)
    graph.add_node("prep_g4", bound_prep_g4)
    graph.add_node("prep_g5", bound_prep_g5)

    # ── HITL pause nodes — call interrupt() so LangGraph suspends inside
    # the node and stores the FULL state in the checkpoint.  Resuming with
    # Command(resume=value) causes interrupt() to return that value; the
    # node then writes it to hitl_resume_value before returning the full
    # state, so downstream conditional edges can read the decision.
    async def g1_pause(state: dict) -> dict:
        decision = interrupt({"gate": "G1", "lead_id": state.get("lead_id")})
        return {**state, "hitl_resume_value": str(decision)}

    async def g2_pause(state: dict) -> dict:
        decision = interrupt({"gate": "G2", "lead_id": state.get("lead_id")})
        return {**state, "hitl_resume_value": str(decision)}

    async def g3_pause(state: dict) -> dict:
        decision = interrupt({"gate": "G3", "lead_id": state.get("lead_id")})
        return {**state, "hitl_resume_value": str(decision)}

    async def g4_pause(state: dict) -> dict:
        decision = interrupt({"gate": "G4", "lead_id": state.get("lead_id")})
        return {**state, "hitl_resume_value": str(decision)}

    async def g5_pause(state: dict) -> dict:
        decision = interrupt({"gate": "G5", "lead_id": state.get("lead_id")})
        return {**state, "hitl_resume_value": str(decision)}

    graph.add_node("g1_pause", g1_pause)
    graph.add_node("g2_pause", g2_pause)
    graph.add_node("g3_pause", g3_pause)
    graph.add_node("g4_pause", g4_pause)
    graph.add_node("g5_pause", g5_pause)

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

    # G1: approved/edited -> send; rejected -> re-plan then re-generate
    graph.add_conditional_edges(
        "g1_pause",
        _route_after_g1,
        {"send_engine": "send_engine", "content_strategist": "content_strategist"},
    )

    # A6 → A3 → routing (S6/S7 go to handoff, others to A8)
    graph.add_conditional_edges(
        "send_engine",
        _route_after_send,
        {"intent_analyser": "intent_analyser", "end": END},
    )
    graph.add_conditional_edges(
        "intent_analyser",
        _route_after_intent,
        {
            "propensity_scorer": "propensity_scorer",
            "content_strategist": "content_strategist",
            "sales_handoff": "sales_handoff",
        },
    )

    # A8 -> cadence wait | G5 | handoff | mark_dormant
    graph.add_conditional_edges(
        "propensity_scorer",
        _route_after_scoring,
        {
            "schedule_cadence": "schedule_cadence",
            "prep_g5": "prep_g5",
            "sales_handoff": "sales_handoff",
            "mark_dormant": "mark_dormant",
            "intent_analyser": "intent_analyser",
        },
    )

    graph.add_edge("schedule_cadence", END)

    # mark_dormant → END
    graph.add_edge("mark_dormant", END)

    # G5: promoted -> handoff; hold -> cadence timer / more nurture
    graph.add_edge("prep_g5", "g5_pause")
    graph.add_conditional_edges(
        "g5_pause",
        _route_after_g5,
        {
            "schedule_cadence": "schedule_cadence",
            "sales_handoff": "sales_handoff",
            "mark_dormant": "mark_dormant",
            "intent_analyser": "intent_analyser",
        },
    )

    # A9 → G4 → END
    graph.add_conditional_edges(
        "sales_handoff",
        _route_after_handoff,
        {"prep_g4": "prep_g4"},
    )
    graph.add_edge("prep_g4", "g4_pause")
    graph.add_conditional_edges(
        "g4_pause",
        _route_after_g4,
        {
            "schedule_cadence": "schedule_cadence",
            "mark_dormant": "mark_dormant",
            "end": END,
            "intent_analyser": "intent_analyser",
        },
    )

    # ── S4 dormancy path: A10 → G3 → A1 ────────────────────────────
    # A10 may mark a lead suppressed (opted-out, cooldown, not yet 180 days).
    # In that case skip G3 and end the workflow immediately.
    def _route_after_dormancy(state: dict) -> str:
        if state.get("workflow_status") in ("suppressed", "dormant"):
            return "end"
        return "prep_g3"

    graph.add_conditional_edges(
        "dormancy_agent",
        _route_after_dormancy,
        {"end": END, "prep_g3": "prep_g3"},
    )
    graph.add_edge("prep_g3", "g3_pause")
    graph.add_edge("g3_pause", "identity_unifier")

    # ── Compile ──────────────────────────────────────────────────────
    # No interrupt_before — each gX_pause node calls interrupt() internally.
    # This is the recommended LangGraph HITL pattern: the full checkpoint
    # state is stored at the interrupt() call site, so resuming with
    # Command(resume=value) always recovers the complete lead state.
    saver = checkpointer or MemorySaver()
    compiled = graph.compile(checkpointer=saver)
    logger.info("LangGraph compiled with %d nodes", len(graph.nodes))
    return compiled


# ── Invocation helpers ───────────────────────────────────────────────


async def patch_checkpoint_state(graph, config: dict, state_patch: dict) -> dict:
    """Merge a partial state patch into a LangGraph dict checkpoint.

    For ``StateGraph(dict)``, ``aupdate_state`` replaces the stored dict with
    the supplied dict.  Read + merge first so small API patches do not erase
    required fields such as ``lead_id`` and ``scenario``.
    """
    snapshot = await graph.aget_state(config)
    current = dict(snapshot.values or {}) if snapshot else {}
    merged = {**current, **state_patch}
    await graph.aupdate_state(config, merged)
    return merged


async def start_workflow(
    lead_id: str,
    *,
    db_session: AsyncSession | None = None,
    target_language: str = "JA",
    scenario: str | None = None,
    batch_id: str | None = None,
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
    if batch_id:
        initial_state["batch_id"] = batch_id
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
    state_patch: dict | None = None,
) -> dict:
    """Resume a paused workflow after HITL decision.

    Each pause node (g1_pause … g5_pause) calls ``interrupt()`` internally.
    LangGraph stores the full checkpoint state at that call site.  Resuming
    with ``Command(resume=value)`` causes ``interrupt()`` to return ``value``
    inside the node; the node then writes it to ``hitl_resume_value`` and
    returns the complete state so downstream conditional edges can route on it.

    Optional ``state_patch`` merges into the checkpoint **before** resume — used
    for G1 when a reviewer edits ``draft_email_subject`` / ``draft_email_body``
    so ``send_engine`` persists the human-approved text, not only the AI draft.

    This avoids the ``KeyError: 'lead_id'`` bug that plagued the previous
    ``aupdate_state + ainvoke(None)`` approach where ``aupdate_state`` with
    ``StateGraph(dict)`` replaced the checkpoint state with only the one
    patched key instead of merging it.
    """
    config = {"configurable": {"thread_id": thread_id}}

    async with get_checkpointer() as cp:
        graph = build_graph(db_session=db_session, checkpointer=cp)
        if state_patch:
            await patch_checkpoint_state(graph, config, state_patch)
        # Command(resume=value) delivers `value` as the return of interrupt().
        # LangGraph loads the full saved checkpoint, runs from the interrupt
        # site, and continues until the next interrupt() or END.
        result = await graph.ainvoke(Command(resume=resume_value), config=config)

    return {
        "thread_id": thread_id,
        "state": result,
    }


async def jump_to_node(
    thread_id: str,
    node_name: str,
    *,
    db_session: AsyncSession | None = None,
    state_patch: dict | None = None,
) -> dict:
    """Resume a completed/paused checkpoint from a specific graph node.

    Used by the internal scheduler for due quiet-hour sends and cadence timers.
    """
    config = {"configurable": {"thread_id": thread_id}}

    async with get_checkpointer() as cp:
        graph = build_graph(db_session=db_session, checkpointer=cp)
        if state_patch:
            await patch_checkpoint_state(graph, config, state_patch)
        result = await graph.ainvoke(Command(goto=node_name), config=config)

    return {
        "thread_id": thread_id,
        "state": result,
    }

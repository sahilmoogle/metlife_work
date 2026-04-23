"""
Analytics API — aggregates KPIs from leads, communications, email_events, hitl_queue.

Many UI metrics are approximations where the DB does not store per-agent latency
or LLM token usage; those fields are explicitly marked or returned empty.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from model.api.v1 import APIResponse
from model.api.v1.analytics import (
    AgentPerfRow,
    AnalyticsKPI,
    AnalyticsOverviewResponse,
    EmailMetric,
    EmailTopPerforming,
    HitlGateStat,
    LLMUsageRow,
    ScenarioConversionRow,
    ScoreBucket,
    WeeklyBar,
)
from model.database.v1.communications import Communication
from model.database.v1.emails import EmailEvent
from model.database.v1.hitl import HITLQueue
from model.database.v1.leads import Lead
from utils.v1.connections import get_db

router = APIRouter()

SCENARIO_META: dict[str, str] = {
    "S1": "Young",
    "S2": "Married",
    "S3": "Senior",
    "S4": "Dormant",
    "S5": "Buyer",
    "S6": "F2F",
    "S7": "W2C",
}

GATE_LABELS: dict[str, str] = {
    "G1": "G1 · Compliance",
    "G2": "G2 · Persona",
    "G3": "G3 · Campaign",
    "G4": "G4 · Sales Handoff",
    "G5": "G5 · Score Override",
}


def _parse_range(range_key: str) -> tuple[Optional[datetime], str]:
    """Return (start_utc inclusive, human label). None start = all time."""
    now = datetime.now(timezone.utc)
    if range_key == "30d":
        return now - timedelta(days=30), "Last 30 days"
    if range_key == "90d":
        return now - timedelta(days=90), "Last 90 days"
    return None, "All time"


def _prev_window_start(start: datetime | None, range_key: str) -> datetime | None:
    """Previous period of equal length for delta comparisons."""
    if start is None:
        return None
    if range_key == "30d":
        return start - timedelta(days=30)
    if range_key == "90d":
        return start - timedelta(days=90)
    return None


async def _count_converted_leads(db: AsyncSession, start: datetime | None) -> int:
    q = select(func.count(Lead.id)).where(
        Lead.is_converted.is_(True),  # noqa: E712
    )
    if start is not None:
        q = q.where(Lead.updated_at >= start)
    r = await db.execute(q)
    return int(r.scalar() or 0)


async def _count_leads_in_cohort(db: AsyncSession, start: datetime | None) -> int:
    """Leads created in window (denominator for in-period conversion)."""
    q = select(func.count(Lead.id))
    if start is not None:
        q = q.where(Lead.created_at >= start)
    r = await db.execute(q)
    return int(r.scalar() or 0)


async def _conversion_rate_pair(
    db: AsyncSession, start: datetime | None, prev_start: datetime | None
) -> tuple[float, Optional[float]]:
    """Current period rate vs previous period rate (%)."""
    total = await _count_leads_in_cohort(db, start)
    conv = await _count_converted_leads(db, start)
    cur = (conv / total * 100.0) if total else 0.0

    prev_rate: Optional[float] = None
    if prev_start is not None and start is not None:
        # previous window [prev_start, start)
        q_prev_total = select(func.count(Lead.id)).where(
            Lead.created_at >= prev_start,
            Lead.created_at < start,
        )
        t2 = await db.execute(q_prev_total)
        prev_total = int(t2.scalar() or 0)

        q_prev_conv = select(func.count(Lead.id)).where(
            Lead.is_converted.is_(True),  # noqa: E712
            Lead.updated_at >= prev_start,
            Lead.updated_at < start,
        )
        c2 = await db.execute(q_prev_conv)
        prev_conv = int(c2.scalar() or 0)
        prev_rate = (prev_conv / prev_total * 100.0) if prev_total else 0.0

    return cur, prev_rate


async def _avg_engagement_converted(
    db: AsyncSession, start: datetime | None
) -> Optional[float]:
    q = select(func.avg(Lead.engagement_score)).where(
        Lead.is_converted.is_(True),  # noqa: E712
        Lead.engagement_score.isnot(None),
    )
    if start is not None:
        q = q.where(Lead.updated_at >= start)
    r = await db.execute(q)
    v = r.scalar()
    return float(v) if v is not None else None


async def _hitl_review_minutes_avg(
    db: AsyncSession, start: datetime | None
) -> Optional[float]:
    q = select(HITLQueue.created_at, HITLQueue.reviewed_at).where(
        HITLQueue.reviewed_at.isnot(None),
        HITLQueue.review_status.in_(["Approved", "Edited", "Rejected"]),
    )
    if start is not None:
        q = q.where(HITLQueue.reviewed_at >= start)
    r = await db.execute(q)
    rows = r.all()
    if not rows:
        return None
    deltas: list[float] = []
    for created_at, reviewed_at in rows:
        if not created_at or not reviewed_at:
            continue
        ca = created_at
        ra = reviewed_at
        if ca.tzinfo is None:
            ca = ca.replace(tzinfo=timezone.utc)
        if ra.tzinfo is None:
            ra = ra.replace(tzinfo=timezone.utc)
        deltas.append((ra - ca).total_seconds() / 60.0)
    return sum(deltas) / len(deltas) if deltas else None


async def _email_rates(
    db: AsyncSession, start: datetime | None
) -> tuple[float, float, float, float]:
    """delivered%, open%, click%, unsub% among comms with sent_at in window."""
    base = select(Communication).where(Communication.sent_at.isnot(None))
    if start is not None:
        base = base.where(Communication.sent_at >= start)
    r = await db.execute(base)
    comms = r.scalars().all()
    if not comms:
        return 0.0, 0.0, 0.0, 0.0
    n = len(comms)
    delivered = sum(1 for c in comms if c.delivered_at or c.sent_at)
    opens = sum(1 for c in comms if c.opened_at)
    clicks = sum(1 for c in comms if c.clicked_at)
    unsubs = sum(1 for c in comms if c.unsubscribed_at)
    return (
        delivered / n * 100,
        opens / n * 100,
        clicks / n * 100,
        unsubs / n * 100,
    )


async def _avg_days_to_convert(
    db: AsyncSession, start: datetime | None
) -> tuple[Optional[float], Optional[float]]:
    q = select(Lead.created_at, Lead.updated_at).where(
        Lead.is_converted.is_(True),  # noqa: E712
    )
    if start is not None:
        q = q.where(Lead.updated_at >= start)
    r = await db.execute(q)
    rows = r.all()
    days: list[float] = []
    for created_at, updated_at in rows:
        if not created_at or not updated_at:
            continue
        ca = created_at
        ua = updated_at
        if ca.tzinfo is None:
            ca = ca.replace(tzinfo=timezone.utc)
        if ua.tzinfo is None:
            ua = ua.replace(tzinfo=timezone.utc)
        days.append((ua - ca).total_seconds() / 86400.0)
    if not days:
        return None, None
    avg = sum(days) / len(days)
    srt = sorted(days)
    mid = len(srt) // 2
    median = srt[mid] if len(srt) % 2 else (srt[mid - 1] + srt[mid]) / 2
    return avg, median


async def _weekly_progression(db: AsyncSession, weeks_back: int = 4) -> list[WeeklyBar]:
    now = datetime.now(timezone.utc)
    bars: list[WeeklyBar] = []
    for i in range(weeks_back - 1, -1, -1):
        week_end = now - timedelta(weeks=i)
        week_start = week_end - timedelta(weeks=1)
        label = f"W{weeks_back - i}"

        q_new = select(func.count(Lead.id)).where(
            Lead.created_at >= week_start,
            Lead.created_at < week_end,
        )
        n_new = int((await db.execute(q_new)).scalar() or 0)

        q_ev = select(func.count(func.distinct(EmailEvent.lead_id))).where(
            EmailEvent.created_at >= week_start,
            EmailEvent.created_at < week_end,
            EmailEvent.event_type.in_(
                [
                    "email_opened",
                    "email_clicked",
                    "consultation_booked",
                    "seminar_inquiry",
                    "f2f_request",
                    "direct_reply",
                ]
            ),
        )
        engaged = int((await db.execute(q_ev)).scalar() or 0)

        q_conv = select(func.count(Lead.id)).where(
            Lead.is_converted.is_(True),  # noqa: E712
            Lead.updated_at >= week_start,
            Lead.updated_at < week_end,
        )
        converted = int((await db.execute(q_conv)).scalar() or 0)

        bars.append(
            WeeklyBar(
                label=label,
                new_leads=n_new,
                engaged=engaged,
                converted=converted,
            )
        )
    return bars


async def _scenario_conversion(
    db: AsyncSession, start: datetime | None
) -> list[ScenarioConversionRow]:
    out: list[ScenarioConversionRow] = []
    for sid in ["S5", "S6", "S7", "S3", "S1", "S2", "S4"]:
        q_tot = select(func.count(Lead.id)).where(Lead.scenario_id == sid)
        if start is not None:
            q_tot = q_tot.where(Lead.created_at >= start)
        total = int((await db.execute(q_tot)).scalar() or 0)

        q_conv = select(func.count(Lead.id)).where(
            Lead.scenario_id == sid,
            Lead.is_converted.is_(True),  # noqa: E712
        )
        if start is not None:
            q_conv = q_conv.where(Lead.created_at >= start)
        conv = int((await db.execute(q_conv)).scalar() or 0)

        pct = (conv / total * 100.0) if total else 0.0
        out.append(
            ScenarioConversionRow(
                scenario_id=sid,
                label=SCENARIO_META[sid],
                conversion_pct=round(pct, 1),
                converted_count=conv,
                total_leads_in_period=total,
            )
        )
    return out


async def _distinct_comm_leads(db: AsyncSession, start: datetime | None) -> int:
    q = select(func.count(func.distinct(Communication.lead_id))).where(
        Communication.sent_at.isnot(None)
    )
    if start is not None:
        q = q.where(Communication.sent_at >= start)
    return int((await db.execute(q)).scalar() or 0)


async def _distinct_event_leads(db: AsyncSession, start: datetime | None) -> int:
    q = select(func.count(func.distinct(EmailEvent.lead_id)))
    if start is not None:
        q = q.where(EmailEvent.created_at >= start)
    return int((await db.execute(q)).scalar() or 0)


async def _hitl_gate_rows(
    db: AsyncSession, start: datetime | None
) -> list[HitlGateStat]:
    gates = ["G1", "G2", "G3", "G4", "G5"]
    rows_out: list[HitlGateStat] = []
    for g in gates:
        base = select(HITLQueue).where(HITLQueue.gate_type == g)
        if start is not None:
            base = base.where(HITLQueue.reviewed_at >= start)
        r = await db.execute(base)
        items = r.scalars().all()
        resolved = [
            x
            for x in items
            if x.review_status in ("Approved", "Edited", "Rejected") and x.reviewed_at
        ]
        reviewed_n = len(resolved)
        if reviewed_n == 0:
            rows_out.append(
                HitlGateStat(
                    gate=g,
                    title=GATE_LABELS.get(g, g),
                    reviewed_count=0,
                    approval_rate_pct=None,
                    avg_review_minutes=None,
                )
            )
            continue
        approved_n = sum(
            1 for x in resolved if x.review_status in ("Approved", "Edited")
        )
        pct_val = approved_n / reviewed_n * 100.0

        mins: list[float] = []
        for x in resolved:
            ca = x.created_at
            ra = x.reviewed_at
            if ca and ra:
                if ca.tzinfo is None:
                    ca = ca.replace(tzinfo=timezone.utc)
                if ra.tzinfo is None:
                    ra = ra.replace(tzinfo=timezone.utc)
                mins.append((ra - ca).total_seconds() / 60.0)
        avg_m = sum(mins) / len(mins) if mins else 0.0

        rows_out.append(
            HitlGateStat(
                gate=g,
                title=GATE_LABELS.get(g, g),
                reviewed_count=reviewed_n,
                approval_rate_pct=round(pct_val, 1),
                avg_review_minutes=round(avg_m, 2),
            )
        )
    return rows_out


async def _score_distribution(
    db: AsyncSession,
) -> tuple[list[ScoreBucket], dict[str, int]]:
    q = select(Lead.engagement_score).where(Lead.opt_in.is_(False))  # noqa: E712
    r = await db.execute(q)
    scores = [float(x[0] or 0) for x in r.all()]
    range_labels = ["0-0.2", "0.2-0.4", "0.4-0.6", "0.6-0.8", "0.8-1.0"]
    counts = [0, 0, 0, 0, 0]
    below = above = 0
    for s in scores:
        if s < 0.40:
            below += 1
        if s > 0.70:
            above += 1
        idx = min(int(s * 5), 4)
        counts[idx] += 1
    out = [
        ScoreBucket(score_range_label=range_labels[i], range_index=i, count=counts[i])
        for i in range(5)
    ]
    insights = {"below_0_40": below, "above_0_70": above}
    return out, insights


async def _top_emails(
    db: AsyncSession, start: datetime | None
) -> list[EmailTopPerforming]:
    """Best open rate & click rate by scenario among communications with subject."""
    # Group by subject line prefix / scenario via join Lead
    stmt = (
        select(
            Lead.scenario_id,
            func.count(Communication.id),
            func.sum(case((Communication.opened_at.isnot(None), 1), else_=0)),
            func.sum(case((Communication.clicked_at.isnot(None), 1), else_=0)),
        )
        .join(Lead, Communication.lead_id == Lead.id)
        .where(Communication.sent_at.isnot(None))
    )
    if start is not None:
        stmt = stmt.where(Communication.sent_at >= start)
    stmt = stmt.group_by(Lead.scenario_id)
    r = await db.execute(stmt)
    rows = r.all()
    best_open: Optional[tuple] = None
    best_click: Optional[tuple] = None
    for scenario_id, n_sent, n_open, n_click in rows:
        if not scenario_id or not n_sent:
            continue
        ns = int(n_sent)
        op = (int(n_open or 0) / ns) * 100
        cl = (int(n_click or 0) / ns) * 100
        if best_open is None or op > best_open[0]:
            best_open = (op, scenario_id)
        if best_click is None or cl > best_click[0]:
            best_click = (cl, scenario_id)
    out: list[EmailTopPerforming] = []
    if best_open:
        sid = str(best_open[1])
        out.append(
            EmailTopPerforming(
                scenario_id=sid,
                rank_type="best_open",
                open_rate_pct=round(best_open[0], 2),
                click_rate_pct=None,
            )
        )
    if best_click:
        sid = str(best_click[1])
        out.append(
            EmailTopPerforming(
                scenario_id=sid,
                rank_type="best_click",
                open_rate_pct=None,
                click_rate_pct=round(best_click[0], 2),
            )
        )
    return out


@router.get(
    "/overview",
    response_model=APIResponse[AnalyticsOverviewResponse],
    status_code=status.HTTP_200_OK,
)
async def get_analytics_overview(
    range_key: Literal["30d", "90d", "all"] = Query("30d", alias="range"),
    db: AsyncSession = Depends(get_db),
):
    """
    Aggregated analytics for the Analytics dashboard.

    * ``range``: ``30d`` | ``90d`` | ``all`` — filters most time-based metrics.
    """
    start, range_label = _parse_range(range_key)
    prev_start = _prev_window_start(start or datetime.now(timezone.utc), range_key)

    conv_rate, prev_conv_rate = await _conversion_rate_pair(db, start, prev_start)
    delta_txt = ""
    if prev_conv_rate is not None:
        d = conv_rate - prev_conv_rate
        arrow = "↑" if d >= 0 else "↓"
        delta_txt = f"{arrow} {abs(d):.1f}% vs prior period"

    avg_score = await _avg_engagement_converted(db, start)
    hitl_min = await _hitl_review_minutes_avg(db, start)
    del_pct, open_pct, click_pct, unsub_pct = await _email_rates(db, start)
    avg_days, median_days = await _avg_days_to_convert(db, start)

    kpis: list[AnalyticsKPI] = [
        AnalyticsKPI(
            title="Conversion Rate",
            value=f"{conv_rate:.1f}%",
            sub=delta_txt or "vs prior period (when available)",
        ),
        AnalyticsKPI(
            title="Avg Handoff Score",
            value=f"{avg_score:.2f}" if avg_score is not None else "—",
            sub="Converted leads · engagement_score · threshold ≥ 0.80",
        ),
        AnalyticsKPI(
            title="HITL Avg Review",
            value=f"{hitl_min:.1f}m" if hitl_min is not None else "—",
            sub=(
                "Below 5m target"
                if hitl_min is not None and hitl_min < 5
                else (
                    "Within 5m target"
                    if hitl_min is not None and hitl_min <= 5
                    else "No reviewed items in window"
                )
            ),
        ),
        AnalyticsKPI(
            title="Email Open Rate",
            value=f"{open_pct:.1f}%",
            sub="Among sends in selected window",
        ),
        AnalyticsKPI(
            title="LLM Cost / Lead",
            value="—",
            sub="Not tracked in DB yet",
        ),
        AnalyticsKPI(
            title="Avg Days to Convert",
            value=f"{avg_days:.1f}" if avg_days is not None else "—",
            sub=f"Median: {median_days:.1f} days"
            if median_days is not None
            else "updated_at − created_at",
        ),
    ]

    weekly = await _weekly_progression(db, 4)
    scenarios = await _scenario_conversion(db, start)

    # Agent throughput proxies
    n_thread = int(
        (
            await db.execute(
                select(func.count(Lead.id)).where(Lead.thread_id.isnot(None))
            )
        ).scalar()
        or 0
    )
    if start is not None:
        n_thread = int(
            (
                await db.execute(
                    select(func.count(Lead.id)).where(
                        Lead.thread_id.isnot(None),
                        Lead.updated_at >= start,
                    )
                )
            ).scalar()
            or 0
        )

    n_persona = int(
        (
            await db.execute(
                select(func.count(Lead.id)).where(Lead.persona_code.isnot(None))
            )
        ).scalar()
        or 0
    )
    if start is not None:
        n_persona = int(
            (
                await db.execute(
                    select(func.count(Lead.id)).where(
                        Lead.persona_code.isnot(None),
                        Lead.created_at >= start,
                    )
                )
            ).scalar()
            or 0
        )

    n_comm = await _distinct_comm_leads(db, start)
    n_events = await _distinct_event_leads(db, start)
    n_conv = await _count_converted_leads(db, start)

    q_g1 = select(func.count(func.distinct(HITLQueue.lead_id))).where(
        HITLQueue.gate_type == "G1"
    )
    if start is not None:
        q_g1 = q_g1.where(HITLQueue.created_at >= start)
    n_a45 = int((await db.execute(q_g1)).scalar() or 0)

    agents: list[AgentPerfRow] = [
        AgentPerfRow(
            node_key="A1_Identity",
            name="A1 · Identity",
            processed_count=n_thread,
            latency_seconds=None,
            success_rate_pct=None,
        ),
        AgentPerfRow(
            node_key="A2_Persona",
            name="A2 · Persona",
            processed_count=n_persona,
            latency_seconds=None,
            success_rate_pct=None,
        ),
        AgentPerfRow(
            node_key="A3_Intent",
            name="A3 · Intent (LLM)",
            processed_count=n_events,
            latency_seconds=None,
            success_rate_pct=None,
        ),
        AgentPerfRow(
            node_key="A4_A5_Content",
            name="A4+A5 · Content",
            processed_count=n_a45,
            latency_seconds=None,
            success_rate_pct=None,
        ),
        AgentPerfRow(
            node_key="A6_Send",
            name="A6 · Send",
            processed_count=n_comm,
            latency_seconds=None,
            success_rate_pct=None,
        ),
        AgentPerfRow(
            node_key="A8_Scoring",
            name="A8 · Scoring",
            processed_count=n_events,
            latency_seconds=None,
            success_rate_pct=None,
        ),
        AgentPerfRow(
            node_key="A9_Handoff",
            name="A9 · Handoff",
            processed_count=n_conv,
            latency_seconds=None,
            success_rate_pct=None,
        ),
    ]

    email_metrics: list[EmailMetric] = [
        EmailMetric(metric="delivered", value_pct=round(del_pct, 1)),
        EmailMetric(metric="open_rate", value_pct=round(open_pct, 1)),
        EmailMetric(metric="click_rate", value_pct=round(click_pct, 1)),
        EmailMetric(metric="unsubscribe", value_pct=round(unsub_pct, 1)),
    ]

    top_emails = await _top_emails(db, start)
    hitl_gates = await _hitl_gate_rows(db, start)

    # G1 existing_asset auto-approved proxy: resolved G1 with existing_asset content
    auto_q = select(func.count(HITLQueue.id)).where(
        HITLQueue.gate_type == "G1",
        HITLQueue.content_type == "existing_asset",
        HITLQueue.review_status.in_(["Approved", "Edited"]),
    )
    if start is not None:
        auto_q = auto_q.where(HITLQueue.reviewed_at >= start)
    auto_n = int((await db.execute(auto_q)).scalar() or 0)

    score_buckets, score_insights = await _score_distribution(db)

    llm_rows = [
        LLMUsageRow(
            model="GPT-4",
            tokens_millions=None,
            cost_jpy=None,
            note="Token usage not persisted — enable LLM billing hooks to populate.",
            tracked=False,
        ),
        LLMUsageRow(
            model="GPT-4 mini",
            tokens_millions=None,
            cost_jpy=None,
            note="Token usage not persisted.",
            tracked=False,
        ),
    ]

    data = AnalyticsOverviewResponse(
        range_key=range_key,
        range_label=range_label,
        kpis=kpis,
        weekly_progression=weekly,
        scenario_conversion=scenarios,
        agent_performance=agents,
        email_performance=email_metrics,
        email_top_performing=top_emails,
        hitl_gate_stats=hitl_gates,
        hitl_auto_approved_estimate=auto_n,
        score_distribution=score_buckets,
        score_insights=score_insights,
        llm_usage=llm_rows,
        llm_total_monthly_jpy=None,
    )

    return APIResponse(
        success=True,
        status_code=status.HTTP_200_OK,
        data=data,
        message="Analytics overview computed from database aggregates.",
    )

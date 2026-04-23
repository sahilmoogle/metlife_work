"""
Response models for GET /analytics/overview — data only; no UI / theme fields.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class AnalyticsKPI(BaseModel):
    """Single headline metric card."""

    title: str
    value: str
    sub: str


class WeeklyBar(BaseModel):
    label: str
    new_leads: int
    engaged: int
    converted: int


class ScenarioConversionRow(BaseModel):
    scenario_id: str
    label: str
    conversion_pct: float
    converted_count: int
    total_leads_in_period: int


class AgentPerfRow(BaseModel):
    node_key: str
    name: str
    processed_count: int
    latency_seconds: Optional[float] = None
    success_rate_pct: Optional[float] = None


class EmailMetric(BaseModel):
    """Percentage for one email funnel metric."""

    metric: str
    value_pct: float


class HitlGateStat(BaseModel):
    gate: str
    title: str
    reviewed_count: int
    approval_rate_pct: Optional[float] = None
    avg_review_minutes: Optional[float] = None


class ScoreBucket(BaseModel):
    score_range_label: str
    range_index: int
    count: int


class EmailTopPerforming(BaseModel):
    scenario_id: str
    rank_type: str
    open_rate_pct: Optional[float] = None
    click_rate_pct: Optional[float] = None


class LLMUsageRow(BaseModel):
    model: str
    tokens_millions: Optional[float] = None
    cost_jpy: Optional[float] = None
    note: str = ""
    tracked: bool = False


class AnalyticsOverviewResponse(BaseModel):
    range_key: str
    range_label: str
    kpis: list[AnalyticsKPI]
    weekly_progression: list[WeeklyBar]
    scenario_conversion: list[ScenarioConversionRow]
    agent_performance: list[AgentPerfRow]
    email_performance: list[EmailMetric]
    email_top_performing: list[EmailTopPerforming] = Field(default_factory=list)
    hitl_gate_stats: list[HitlGateStat]
    hitl_auto_approved_estimate: int = 0
    score_distribution: list[ScoreBucket]
    score_insights: dict = Field(
        default_factory=dict,
        description="Counts: below_0_40, above_0_70",
    )
    llm_usage: list[LLMUsageRow] = Field(default_factory=list)
    llm_total_monthly_jpy: Optional[float] = None

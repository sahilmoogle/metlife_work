"""
Scoring rules — rule-based propensity scoring engine.

Implements the engagement score deltas from the blueprint.
Each event type contributes a fixed delta to the lead's score.
At Tier 3 this will be replaced by an ML model.
"""

from __future__ import annotations


# ── Score deltas per engagement event ────────────────────────────────
SCORE_DELTAS: dict[str, float] = {
    "email_sent": 0.05,
    "email_delivered": 0.02,
    "email_opened": 0.10,
    "email_clicked": 0.15,
    "consult_page_visit": 0.40,
    "consultation_booked": 0.50,
    "seminar_inquiry": 0.20,
    "f2f_request": 0.30,
    "cta_click": 0.15,
    "direct_reply": 0.25,
    "two_consecutive_opens": 0.20,
}


def calculate_score_delta(event_type: str) -> float:
    """Return the score increment for a given engagement event."""
    return SCORE_DELTAS.get(event_type, 0.0)


def evaluate_score_route(
    score: float,
    threshold: float,
    edge_band: float = 0.10,
) -> str:
    """Determine the routing decision based on current score.

    Returns one of:
      - ``"handoff"``  → score ≥ threshold
      - ``"edge"``     → score within edge_band below threshold (G5 territory)
      - ``"continue"`` → score below the edge band
    """
    if score >= threshold:
        return "handoff"
    if score >= (threshold - edge_band):
        return "edge"
    return "continue"


def classify_dormant_segment(
    has_website_visits: bool,
    has_product_views: bool,
) -> str:
    """P1 / P2 / P3 segmentation for S4 Dormant Revival.

    P1 — No visits → Brand Campaign
    P2 — Visited, no product/sim → New Product + Sim invite
    P3 — Product/Sim viewed → Consultation Campaign
    """
    if has_product_views:
        return "P3"
    if has_website_visits:
        return "P2"
    return "P1"

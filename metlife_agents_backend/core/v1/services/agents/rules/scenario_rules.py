"""
Scenario classification rules — deterministic routing logic.

Implements the ANS3 / ANS4 / ANS5 / Age decision tree from the
MetLife Japan blueprint.  No LLM involved — pure rule-based.
"""

from __future__ import annotations

from typing import Optional


# ── Scenario configuration defaults ──────────────────────────────────
SCENARIO_DEFAULTS: dict[str, dict] = {
    "S1": {
        "name": "Young Professional",
        "persona_code": "F-1",
        "base_score": 0.40,
        "handoff_threshold": 0.80,
        "cadence_days": 3,
        "max_emails": 5,
        "keigo": "casual",
        "tone": "casual",
    },
    "S2": {
        "name": "Recently Married",
        "persona_code": "E",
        "base_score": 0.45,
        "handoff_threshold": 0.80,
        "cadence_days": 3,
        "max_emails": 5,
        "keigo": "casual",
        "tone": "empathetic",
    },
    "S3": {
        "name": "Senior Citizen",
        "persona_code": "F-2",
        "base_score": 0.35,
        "handoff_threshold": 0.80,
        "cadence_days": 1,
        "max_emails": 5,
        "keigo": "丁寧語",  # refined at runtime by age
        "tone": "formal",
    },
    "S4": {
        "name": "Dormant Revival",
        "persona_code": None,
        "base_score": 0.30,
        "handoff_threshold": 0.90,
        "cadence_days": 7,
        "max_emails": 2,
        "keigo": None,
        "tone": "check-in",
    },
    "S5": {
        "name": "Active Buyer",
        "persona_code": None,
        "base_score": 0.60,
        "handoff_threshold": 0.80,
        "cadence_days": 3,
        "max_emails": 5,
        "keigo": "casual",
        "tone": "direct",
    },
    "S6": {
        "name": "F2F Consultation",
        "persona_code": None,
        "base_score": 0.85,
        "handoff_threshold": 0.85,
        "cadence_days": 0,
        "max_emails": 1,
        "keigo": None,
        "tone": "professional",
    },
    "S7": {
        "name": "Web-to-Call",
        "persona_code": None,
        "base_score": 0.88,
        "handoff_threshold": 0.85,
        "cadence_days": 0,
        "max_emails": 1,
        "keigo": None,
        "tone": "professional",
    },
}


def classify_scenario(
    ans3: Optional[str],
    ans4: Optional[str],
    ans5: Optional[str],
    age: Optional[int],
    registration_source: Optional[str] = None,
) -> str:
    """Deterministic scenario assignment per the blueprint decision tree.

    Priority order:
      1. registration_source overrides (S6 / S7)
      2. ANS3 = A or B → S5 (Active Buyer — skips survey Q2/Q3)
      3. ANS3 = C + ANS4 = Yes → S2 (Life Event)
      4. ANS3 = C + ANS4 = No + ANS5 = No + Age ≥ 35 → S3 (Senior)
      5. ANS3 = C + ANS4 = No + ANS5 = No + Age < 35 → S1 (Young Pro)
      6. Fallback → S1
    """
    # S6 / S7 come from different forms, not from T_YEC_QUOTE_MST
    if registration_source == "f2f_form":
        return "S6"
    if registration_source == "web_callback":
        return "S7"

    # ANS3 = A or B → Active Buyer (Q2/Q3 skipped entirely)
    if ans3 and ans3.upper() in ("A", "B"):
        return "S5"

    # ANS3 = C → newsletter survey path
    if ans3 and ans3.upper() == "C":
        if ans4 and ans4.upper() == "YES":
            return "S2"
        # ANS4 = No (or missing)
        if age is not None and age >= 35:
            return "S3"
        return "S1"

    # No survey data at all — fallback
    return "S1"


def resolve_keigo_level(age: Optional[int]) -> str:
    """Determine Japanese formality tier from age (blueprint S3 logic).

    35–54 → 丁寧語 (polite)
    55–64 → 敬語   (respectful)
    65+   → 最敬語 (most respectful)
    < 35  → casual
    """
    if age is None:
        return "casual"
    if age >= 65:
        return "最敬語"
    if age >= 55:
        return "敬語"
    if age >= 35:
        return "丁寧語"
    return "casual"


def get_scenario_config(scenario_id: str) -> dict:
    """Return the default configuration dict for a scenario."""
    return SCENARIO_DEFAULTS.get(scenario_id, SCENARIO_DEFAULTS["S1"]).copy()

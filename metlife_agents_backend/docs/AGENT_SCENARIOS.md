# Agent Scenarios (S1–S7) — Code Truth

This document describes the **exact scenario routing and workflow behavior implemented in code**.

## Core concepts

- **Workflow engine**: LangGraph `StateGraph(dict)` built in `core/v1/services/agents/graph.py`.
- **Agents (nodes)**: A1–A10 in `core/v1/services/agents/nodes/`.
- **HITL gates**: G1–G5 in `core/v1/services/agents/nodes/hitl_gates.py`.
- **Persistence**:
  - Per-lead “current stage” is stored in `leads.current_agent_node`.
  - Terminal outcomes are stored in `leads.workflow_status` plus:
    - `leads.workflow_completed` (bool)
    - `leads.completed_at` (timestamp)
  - Emails sent are stored in `communications` (subject + preview) and `email_events`.
  - HITL review payloads are stored in `hitl_queue`.
- **SSE events**: published via `core/v1/services/sse/manager.py` and streamed at `/api/v1/sse/stream`.
  - Key event types: `node_transition`, `workflow_state`, `hitl_required`, `hitl_approved|hitl_edited|hitl_rejected`, `lead_converted`, `batch_progress`.

## Scenario classification (S1–S7)

Implemented in `core/v1/services/agents/rules/scenario_rules.py` (`classify_scenario`):

- **S6**: `registration_source == "f2f_form"`
- **S7**: `registration_source == "web_callback"` OR `banner_code[2] == "7"`
- **S5**: `ANS3 ∈ {A,B}` (active buyer)
- **S2**: `ANS3 == C` AND `ANS4 == YES` (life event)
- **S3**: `ANS3 == C` AND `ANS4 != YES` AND `age >= 35`
- **S1**: `ANS3 == C` AND `ANS4 != YES` AND `age < 35` OR fallback

Keigo formality is set by `resolve_keigo_level(age)` (S3 refines formality tiers).

## HITL gates (G1–G5)

Implemented in `core/v1/services/agents/nodes/hitl_gates.py`:

- **G1 Content Compliance**: fires **before every email send** (`should_fire_g1` returns `True`).
- **G2 Persona Override**: fires when `persona_confidence < 0.60`.
- **G3 Campaign Approval**: fires only for **S4 Dormant Revival**.
- **G4 Sales Handoff Review**: always required before handoff is accepted.
- **G5 Edge Score Override**: fires when score is within 0.10 below threshold.

When a gate fires:
- A HITL row is persisted into `hitl_queue` (draft email, persona suggestion, campaign segment, or handoff briefing depending on gate).
- SSE emits `hitl_required`.

When a reviewer resolves:
- `hitl_queue.review_status` is set to `Approved|Edited|Rejected`
- Lead status may be updated (notably G4 approval ⇒ Converted; G3 rejection ⇒ Dormant)
- SSE emits `hitl_approved|hitl_edited|hitl_rejected`
- G4 approval also emits `lead_converted`

## Agent nodes (A1–A10)

These are the node IDs emitted in SSE `node_transition.node` and persisted to `leads.current_agent_node`:

- **A1_Identity** (`identity_unifier.py`): loads lead/profile signals and assembles `context_block`.
- **A2_Persona** (`persona_classifier.py`): assigns `scenario` + `persona_code` + confidence; may set G2 pending.
- **A3_Intent** (`intent_analyser.py`): extracts `intent_summary`, `urgency`, `product_interest` (LLM or fallback).
- **A4_ContentStrategy** (`content_strategist.py`): chooses asset vs LLM generation for the current email number.
- **A5_Writer** (`generative_writer.py`): drafts subject/body when LLM content is needed; passes through assets otherwise.
- **A6_Send** (`send_engine.py`): quiet-hours hold, persists `communications` + `email_events`, increments `emails_sent_count`.
- **A8_Scoring** (`propensity_scorer.py`): updates `engagement_score`, routes to nurture or handoff.
- **A9_Handoff** (`sales_handoff.py`): generates the advisor briefing and sets G4 pending.
- **A10_Dormancy** (`dormancy_agent.py`): assigns S4 revival segment and sets G3 pending.
- **mark_dormant** (`graph.py`): terminal node that moves lead to Dormant + completion bookkeeping.

## Scenario flows (code routes)

The flows below match the `graph.py` summary and routing functions.

### S1 — Young Professional

**Flow**
- A1 → A2 → (G2 if low confidence) → A4 → A5 → G1 → A6 → A8 → (G5 edge band) → A9 → G4 → terminal

**Notes**
- Email loop continues until `max_emails` or Dormant terminal (for non-handoff outcomes).
- G1 always pauses before A6.

### S2 — Recently Married

Same as S1 (regular nurture loop + scoring + handoff gates).

### S3 — Senior Citizen

Same as S1, with **quiet hours hold** enforced in A6 (21:00–08:00 JST).

### S4 — Dormant Revival

**Entry**
- Starts at **A10** (Dormancy Agent) instead of A1.

**Flow**
- A10 → **G3** → (if approved) A1 → A2 → nurture loop (max 2 emails) → mark_dormant

**Notes**
- G3 is mandatory; rejection keeps lead Dormant and stops resume.
- Terminal is typically Dormant (revival campaign ends).

### S5 — Active Buyer

Same as S1 but uses different content strategy:
- Email #1 uses a pre-approved 3-CTA comparison asset (A4 sets it).

### S6 — Face-to-Face (F2F) Consultation

**Flow**
- A1 → A2 → **G2 always** (confidence forced low) → A3 (MEMO intent) → A4/A5/G1/A6 (1 email) → A9 → G4

### S7 — Web-to-Call (W2C)

**Flow**
- A1 → A2 → **G2 always** → A3 (MEMO intent) →
  - if `email_captured=True`: A4/A5/G1/A6 → A8 → A9 → G4
  - if `email_captured=False`: A9 → G4 (skips email)

## Batch runner behavior (why totals can exceed “New leads”)

Batch execution is started at `POST /api/v1/agents/batch/run`:

- **Eligibility** (not based on `workflow_status`): not opt-out, not converted, and either
  no `thread_id` yet or `workflow_completed` (avoids interrupting an in-flight graph).
- **S4 revival** vs default start: `cooldown_flag` false, and “stale” vs 180-day cutoff
  using `last_active_at` if set, else `commit_time` when `last_active_at` is null;
  cutoff = now − 180 days.

## SSE per-lead debugging

- Live stream: `/api/v1/sse/stream`
- Persisted trace (new): `/api/v1/sse/recent?lead_id=...&limit=...`


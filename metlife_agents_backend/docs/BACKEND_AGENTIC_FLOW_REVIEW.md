# MetLife Agentic Backend Review

## Scope

This document analyzes only `metlife_agents_backend`.

It is based on the current code in:

- `core/v1/services/agents/graph.py`
- `core/v1/services/agents/nodes/*`
- `core/v1/services/agents/rules/*`
- `core/v1/api/agents/*`
- `model/database/v1/*`
- `utils/v1/*`

The goal of this document is to answer four questions:

1. What is the exact agentic flow implemented in code?
2. How does each scenario S1-S7 behave?
3. What edge cases are handled?
4. What looks wrong, inconsistent, or risky in the current implementation?

## Executive Summary

The backend is a real workflow engine, not a stub. It combines:

- FastAPI for APIs
- LangGraph for workflow orchestration
- SQLite/Postgres checkpointing for pause/resume
- HITL gates G1-G5
- SSE for live event streaming
- A lead data model that mirrors the workflow state closely

At a high level, the system is well-structured. The core graph is understandable, the node boundaries are clear, and the API surface is already broad enough for a working product.

Implementation update, 2026-04-25:

- A2 now preserves accumulated engagement score and overlays active DB scenario config.
- G1 rejection now routes back through A4 and switches rejected assets to the LLM path.
- Quiet-hours now holds into `email_outbox` + `workflow_timers` and does not send immediately.
- Low-score nurture now pauses into cadence/S4 response-window timers instead of looping immediately.
- S6/S7 now force low persona confidence so G2 fires consistently.
- G3 rejection now sets `cooldown_flag=True`.
- G4 approval now creates a durable internal `sales_handoffs` row.

Remaining gaps are now mostly around always-on scheduling, richer event-route traces, S4 re-segmentation, S5 no-click branch depth, and intake/data-quality APIs.

## Backend Architecture

### Entry point

`fastapi_application.py`

- Creates the FastAPI app
- Loads logging config
- Creates/removes DB connections during app lifespan
- Adds CORS
- Mounts the versioned router
- Exposes `/health-check`

### Router layout

`core/fastapi_blueprint.py`

- `/auth`
- `/agents`
- `/hitl`
- `/sse`
- `/leads`
- `/dashboard`
- `/analytics`
- `/admin/users`
- `/templates`

All non-auth routes require JWT auth, except SSE which uses special auth handling because browser `EventSource` cannot set arbitrary headers in the usual way.

### Orchestration layer

`core/v1/services/agents/graph.py`

This is the workflow brain. It compiles a `StateGraph(dict)` with:

- Agent nodes:
  - A1 identity_unifier
  - A2 persona_classifier
  - A3 intent_analyser
  - A4 content_strategist
  - A5 generative_writer
  - A6 send_engine
  - A8 propensity_scorer
  - A9 sales_handoff
  - A10 dormancy_agent
  - A11 schedule_cadence_timer
  - mark_dormant
- HITL preparation nodes:
  - prep_g1
  - prep_g2
  - prep_g3
  - prep_g4
  - prep_g5
- HITL pause nodes:
  - g1_pause
  - g2_pause
  - g3_pause
  - g4_pause
  - g5_pause

Pause/resume is implemented with LangGraph `interrupt()` and `Command(resume=...)`, which is the right pattern for checkpoint-safe HITL workflows.

## State and Persistence Model

### LangGraph state

`core/v1/services/agents/state.py`

Important fields:

- Identity:
  - `lead_id`, `thread_id`
- Customer profile:
  - `first_name`, `last_name`, `email`, `phone`, `age`, `gender`
- Routing inputs:
  - `ans3`, `ans4`, `ans5`, `registration_source`, `banner_code`
- Scenario and persona:
  - `scenario`, `persona_code`, `persona_confidence`, `keigo_level`
- Consultation / S6-S7:
  - `memo`, `consult_request_type`, `email_captured`
- Content:
  - `draft_email_subject`, `draft_email_body`, `content_type`, `template_name`
- Scoring:
  - `base_score`, `engagement_score`, `handoff_threshold`
- HITL:
  - `hitl_gate`, `hitl_status`, `hitl_resume_value`
- Workflow:
  - `workflow_status`, `current_node`, `is_converted`
- S4:
  - `revival_segment`, `cooldown_flag`

### Database persistence

Primary tables used by the workflow:

- `leads`
  - current state snapshot for the UI and analytics
- `communications`
  - sent emails
- `email_events`
  - engagement events and score deltas
- `hitl_queue`
  - frozen review payloads for G1-G5
- `batch_runs`
  - batch progress
- `sse_events`
  - durable event log
- `consultation_requests`
  - S6/S7 source data

### Checkpoint persistence

The workflow state itself is not stored only in `leads`.
It is checkpointed via LangGraph:

- Postgres if configured
- otherwise SQLite
- otherwise in-memory fallback

This is important because pause/resume depends on the checkpointed graph state, not only on DB row fields.

## Global Workflow Logic

### Start path

`start_workflow()`:

- Creates a new `thread_id`
- Builds initial state
- Stores `thread_id` on the lead
- Publishes `workflow_state(started)`
- Invokes the graph until first pause or terminal end

### Resume path

`resume_workflow()`:

- Loads the checkpoint by `thread_id`
- Optionally patches state before resume
- Resumes from the exact interrupt site using `Command(resume=...)`

### Core routing rules

After A2:

- If `workflow_status == "suppressed"` -> END
- If G2 should fire -> G2
- If scenario is S6 or S7 -> A3
- Else -> A4

After A3:

- S6:
  - if no email sent yet -> A4
  - else -> A9
- S7:
  - if no captured email -> A9
  - if email exists and no email sent yet -> A4
  - else -> A9
- S1-S5 (and S4 after re-entry):
  - -> A8

After A8:

- score >= threshold -> A9
- threshold - 0.10 <= score < threshold -> G5
- email_number >= max_emails -> mark_dormant
- else -> continue nurture loop via A4

## HITL Gate Semantics

### G1 Content Compliance

- Fired before every send
- Review payload includes draft subject/body/content type/email number
- Decisions:
  - approved -> A6
  - edited -> A6 with patched content
  - rejected -> routed by `_route_after_g1`

### G2 Persona Override

- Fired when `persona_confidence < 0.60`
- Review payload includes suggested persona and confidence
- Optional `persona_override` updates checkpoint state and lead row before resume

### G3 Campaign Approval

- Fired only for S4 dormant revival
- Review payload includes revival segment
- Rejection does not resume the graph

### G4 Sales Handoff Review

- Fired before final sales acceptance
- Approval or edit marks the lead converted
- Rejection does not resume the graph

### G5 Edge Score Override

- Fired when score is within 0.10 below threshold
- Decisions:
  - approved or edited -> promote to A9
  - hold -> route back to nurture

## Scenario Classification Truth

Implemented in `core/v1/services/agents/rules/scenario_rules.py`.

Priority order:

1. `consultation_request_type == "face_to_face"` -> S6
2. `consultation_request_type == "web_to_call"` or `"seminar"` -> S7
3. `registration_source == "f2f_form"` -> S6
4. `registration_source == "web_callback"` -> S7
5. `banner_code[2] == "7"` -> S7
6. `ans3 in {"A", "B"}` -> S5
7. `ans3 == "C"` and ANS4 affirmative -> S2
8. `ans3 == "C"` and age >= 35 -> S3
9. `ans3 == "C"` and age < 35 -> S1
10. fallback -> S1

ANS4 affirmative values are normalized and include variants like:

- `YES`
- `Y`
- `TRUE`
- `1`
- `ON`

## Node-by-Node Behavior

### A1 Identity Unifier

Reads from:

- `leads`
- `quotes`
- `consultation_requests`
- latest `email_events.campaign_id`

Populates:

- profile fields
- source fields
- survey answers
- consultation data
- memo
- `context_block`

Special behavior:

- Sets `email_captured = bool(lead.email)` initially
- If consultation row exists, `email_captured = bool(consult.email)`
- Seeds state engagement score from the lead row if greater than current state

### A2 Persona Classifier

Classifies scenario deterministically and sets:

- `scenario`
- `persona_code`
- `persona_confidence`
- `keigo_level`
- `base_score`
- `engagement_score`
- `handoff_threshold`
- `max_emails`

Confidence logic:

- survey + age -> 0.92
- survey or age -> 0.70
- neither -> 0.40

Important note:

- S6/S7 now explicitly set confidence below the G2 threshold.
- This makes the "S6/S7 always go through G2" route true in runtime behavior.

### A3 Intent Analyser

Uses LLM if available, else fallback.

Produces:

- `intent_summary`
- `urgency`
- `product_interest`

For S6/S7 this is the MEMO-based interpretation step before optional email and handoff.

### A4 Content Strategist

Determines whether the next email is:

- `existing_asset`
- `llm_generated`

Rules:

- S6/S7 email #1 -> always `llm_generated`
- S1-S5 email #1 -> attempt DB template asset
- S4 email #1 -> segment-aware asset using `revival_segment`
- emails #2+ -> `llm_generated`

Special case exists in code and is now reachable:

- if email #1 asset was rejected at G1, switch to `llm_generated`

G1 rejection routes back through A4 without advancing the email number, so the reviewer does not see the same rejected asset again.

### A5 Generative Writer

- Pass-through if content is already an existing asset
- Otherwise calls LLM and tries to parse JSON with `subject`, `body`, and compliance checklist
- If LLM fails, fallback content is generated

### A6 Send Engine

Responsibilities:

- Re-check opt-out suppression
- Check quiet hours
- Persist `communications`
- Persist `email_events(event_type="email_sent")`
- Increment `leads.emails_sent_count`

Important reality:

- Quiet-hours creates a held outbox item and due timer, emits a paused event, and returns without recording an immediate send.
- Due holds are processed through `POST /api/v1/agents/scheduler/process-due`.

### A8 Propensity Scorer

Adds `email_sent` delta (+0.05) after each send and writes score back to `leads`.

Routing decisions are not made inside A8 itself.
They are made by graph logic immediately after A8 using:

- threshold crossing
- edge-band check
- max email count

### A9 Sales Handoff

Builds a briefing, sets:

- `handoff_briefing`
- `hitl_gate = "G4"`
- `hitl_status = "pending"`

### A10 Dormancy Agent

Re-validates S4 eligibility using lead row facts, not just batch pre-filtering.

Rules checked again:

- not opted out
- `cooldown_flag != True`
- dormant for at least 180 days using:
  - `last_active_at`, or
  - `commit_time` if `last_active_at` is null

Then sets:

- `scenario = "S4"`
- `revival_segment = P1|P2|P3`
- `hitl_gate = "G3"`

## Scenario-by-Scenario Flows

### S1 Young Professional

Entry conditions:

- default newsletter / quote path
- `ans3 == C`
- ANS4 not affirmative
- age < 35
- or general fallback

Flow:

1. A1 loads lead/profile/signals
2. A2 classifies S1
3. If confidence < 0.60 -> G2
4. A4 selects email content
5. A5 generates or passes through content
6. G1 approval before send
7. A6 sends
8. A3 runs after send
9. A8 adds score delta
10. If score >= threshold -> A9 -> G4 -> END
11. If score near threshold -> G5
12. If score still low and email limit not reached -> A11 cadence timer -> A4 when due
13. If max emails reached -> mark_dormant -> END

Edge cases:

- opted out at A2 -> suppressed immediately
- opted out at A6 -> suppressed immediately
- quiet-hours path holds instead of sending immediately
- G5 hold schedules more nurture when more emails are allowed

Terminal outcomes:

- Converted via G4 approval
- Dormant via `mark_dormant`
- Suppressed via opt-out/bounce/unsubscribe path

### S2 Life Event

Entry conditions:

- `ans3 == C`
- ANS4 affirmative

Flow:

- Same graph shape as S1
- `life_event_flag = True`
- Different base score / tone defaults

Key difference from S1:

- Messaging intent and scenario config differ, but orchestration path is the same.

### S3 Senior Citizen

Entry conditions:

- `ans3 == C`
- ANS4 not affirmative
- age >= 35

Flow:

- Same graph shape as S1
- More formal `keigo_level`
- A6 checks JST quiet hours

Important code truth:

- Quiet hours are not a hard stop in current implementation.
- The send still happens in the same call after logging a hold.

### S4 Dormant Revival

Entry conditions:

- selected by batch runner as dormant candidate
- then re-validated in A10

Graph entry:

- Starts at A10, not A1

Flow:

1. A10 re-checks dormancy eligibility
2. If ineligible -> set `workflow_status = "suppressed"` and END
3. If eligible -> classify revival segment P1/P2/P3
4. G3 mandatory campaign approval
5. If G3 approved -> A1
6. A2 re-classifies and continues through standard nurture flow
7. `max_emails` for S4 is 2
8. When exhausted -> `mark_dormant`
9. `mark_dormant` sets:
   - `workflow_status = Dormant`
   - `workflow_completed = True`
   - `cooldown_flag = True`

Revival segment logic:

- P1:
  - no meaningful engagement delta above base
- P2:
  - some engagement but not strong product intent
- P3:
  - strong engagement indicative of product or consult intent

Important edge cases:

- If lead is no longer stale at runtime, A10 cancels revival
- If `cooldown_flag` is already true, A10 cancels revival
- If lead opted out, A10 cancels revival

Important design nuance:

- S4 starts with scenario set to `S4`
- after G3 approval it still goes through A1 and A2
- A2 can re-classify to another scenario based on current routing logic
- so "S4" acts more like a special entry mode plus revival gate than a guaranteed persistent scenario identity through the whole graph

### S5 Active Buyer

Entry conditions:

- `ans3 in {"A", "B"}`

Flow:

- Same broad nurture loop as S1
- A4 special handling:
  - email #1 tries to use scenario-specific existing asset
  - fallback subject/body are CTA-comparison themed

Special event behavior:

- `POST /agents/events/track`
- if `event_type == "email_clicked"` and `clicked_label` maps to a known CTA
- state `product_interest` is updated before future content generation

### S6 Face-to-Face Consultation

Entry conditions:

- consultation request type `face_to_face`
- or `registration_source == "f2f_form"`

Actual implemented flow:

1. A1 loads lead + consultation memo
2. A2 classifies S6
3. If confidence < 0.60 -> G2
4. A3 extracts intent from MEMO/context
5. If email is captured and no email sent yet -> A4
6. If email is missing -> A9 directly
7. A4 sets first email to `llm_generated`
8. A5 writes email
9. G1 approval
10. A6 sends one email
11. A3 runs again after send
12. Because email_number > 0 for S6, route goes directly to A9
13. A9 creates briefing
14. G4 approval/rejection
15. END

Key behavior:

- S6 does not pass through A8 after its one email
- it goes directly from the second A3 pass to A9
- `max_emails = 1`

Edge cases:

- If no LLM is available, fallback email and fallback briefing are still produced
- G2 is now guaranteed by forcing S6 confidence below 0.60
- Missing email no longer records a fake send; S6 can hand off with MEMO-only context

### S7 Web-to-Call

Entry conditions:

- consultation request type `web_to_call` or `seminar`
- or `registration_source == "web_callback"`
- or `banner_code[2] == "7"`

Actual implemented flow:

1. A1 loads lead + consultation memo
2. A2 classifies S7
3. If confidence < 0.60 -> G2
4. A3 extracts intent
5. If `email_captured == False` -> A9 directly
6. If `email_captured == True` and no email has been sent -> A4
7. A4 marks first email `llm_generated`
8. A5 writes email
9. G1 approval
10. A6 sends
11. A3 runs again
12. A8 scores the email send path
13. Score crosses threshold for S7 and routes to A9
14. G4 review
15. END

Important code truth:

- S7 now goes through A8 after its email-captured send path.
- If email is missing, it still goes directly to A9/G4.

## Batch Runner Behavior

Batch orchestration lives in `POST /api/v1/agents/batch/run`.

Eligibility:

- `opt_in == False`
- `is_converted == False`
- no active in-flight thread:
  - either `thread_id is null`
  - or `workflow_completed == True`

Dormant revival selection:

- `cooldown_flag != True`
- stale if:
  - `last_active_at <= cutoff`, or
  - `last_active_at is null and commit_time <= cutoff`

Then:

- standard leads start normal flow
- dormant leads start with `scenario="S4"` so the graph enters A10

## Event Tracking Side Effects

`POST /api/v1/agents/events/track`

This endpoint is important because it updates both:

- graph checkpoint state
- relational DB tables

Supported event impacts:

- `email_opened` -> +0.10
- `email_clicked` -> +0.15
- `consult_page_visit` -> +0.40
- `consultation_booked` -> +0.50
- `seminar_inquiry` -> +0.20
- `f2f_request` -> +0.30
- `direct_reply` -> +0.25
- `unsubscribe` or `bounce`:
  - suppresses the lead
  - sets `opt_in=True`

This means later workflow restarts should see updated engagement score and suppression state, at least in theory.

## Important Edge Cases Covered by Code

The code does explicitly handle a good number of edge cases:

- Lead row missing at A1 -> workflow fails cleanly
- Opted out before classification -> suppress immediately
- Opted out again before send -> suppress immediately
- Dormant candidate revalidated at A10 before spending reviewer time
- G4 rejection does not resume graph
- G3 rejection does not resume graph
- G5 hold returns to nurture
- Reviewer edits at G1 are patched into checkpoint state before resume
- S7 with no captured email skips email entirely
- SSE reconnect uses `Last-Event-ID` replay logic

## Findings: What Looks Wrong or Risky

### 1. A2 wipes out previously accumulated engagement score

Why this matters:

- A1 intentionally loads the lead's stored engagement score from DB.
- A2 then unconditionally resets `engagement_score` to the scenario base score.
- Any previously tracked opens, clicks, page visits, or consult events can be lost when a workflow starts again.

Code:

- `core/v1/services/agents/nodes/identity_unifier.py:79`
- `core/v1/services/agents/nodes/identity_unifier.py:82`
- `core/v1/services/agents/nodes/persona_classifier.py:103`

Impact:

- handoff readiness may be understated
- dormant segmentation can be distorted later
- repeated runs are not using the real historical score

Recommendation:

- keep `base_score` as scenario baseline
- preserve the higher of existing DB score and base score, instead of overwriting blindly

Status:

- Implemented. A2 now preserves accumulated score while still storing the scenario base score separately.

### 2. G1 rejection of an existing asset now reaches the LLM fallback

Why this matters:

- A4 has explicit code for:
  - "if first email existing asset was rejected, switch to llm_generated"
- Graph routing now sends G1 rejection back through A4.
- A4 preserves the current email number and switches the draft to `llm_generated`.

Code:

- `core/v1/services/agents/graph.py:346`
- `core/v1/services/agents/graph.py:354`
- `core/v1/services/agents/nodes/content_strategist.py:48`
- `core/v1/services/agents/nodes/content_strategist.py:52`
- `core/v1/services/agents/nodes/content_strategist.py:54`

Impact:

- The original reviewer-loop risk is fixed.
- Remaining risk is normal LLM fallback quality if the LLM call fails.

Status:

- Implemented. G1 rejection routes to `content_strategist` before A5.

### 3. Quiet-hours logic is enforced through internal timers

Why this matters:

- Comments say "never send during these hours"
- A6 now creates a held outbox item and a quiet-hours timer.
- A6 returns without persisting a `communications` send when quiet hours are active.

Code:

- `core/v1/services/agents/nodes/send_engine.py:82`
- `core/v1/services/agents/nodes/send_engine.py:84`
- `core/v1/services/agents/nodes/send_engine.py:175`

Impact:

- The original "held and sent anyway" mismatch is fixed.
- Paused quiet-hour sends still require the scheduler endpoint or cron worker to process due timers.

Status:

- Implemented as internal outbox/timer hold plus `scheduler/process-due`.

### 4. Dynamic `scenarios_config` is now used at runtime

Why this matters:

- The DB model and seed script present scenario configuration as hot-swappable.
- Runtime now overlays active DB config on top of `SCENARIO_DEFAULTS`.
- Seeded values and hardcoded values already diverge.

Examples of divergence:

- S4 in seed:
  - threshold 0.75
  - base_score 0.20
- S4 in code:
  - threshold 0.90
  - base_score 0.30

- S5 in seed:
  - cadence 2
  - max_emails 3
- S5 in code:
  - cadence 3
  - max_emails 5

- S6/S7 in seed:
  - cadence 1
- S6/S7 in code:
  - cadence 0

Code:

- `model/database/v1/scenarios.py:2`
- `model/database/v1/scenarios.py:5`
- `scripts/seed_database.py:473`
- `scripts/seed_database.py:476`
- `scripts/seed_database.py:477`
- `core/v1/services/agents/rules/scenario_rules.py:45`
- `core/v1/services/agents/rules/scenario_rules.py:48`
- `core/v1/services/agents/rules/scenario_rules.py:49`

Impact:

- Runtime behavior can now follow seeded/admin config.
- Remaining risk is governance: admins still need a UI/process for validating config changes.

Status:

- Implemented in A2. A5/A9 still use state config values produced upstream.

### 5. G3 rejection no longer immediately re-queues the same dormant lead

Why this matters:

- G3 rejection sets lead status to Dormant and completed
- rejection now sets `cooldown_flag=True`
- batch runner considers dormant revival candidates where:
  - `workflow_completed == True`
  - `cooldown_flag != True`
  - stale date condition still holds

Code:

- `core/v1/api/agents/hitl_api.py:260`
- `core/v1/api/agents/hitl_api.py:261`
- `core/v1/api/agents/hitl_api.py:267`
- `core/v1/api/agents/agent_api.py:314`
- `core/v1/api/agents/agent_api.py:360`
- `core/v1/services/agents/graph.py:204`
- `core/v1/services/agents/graph.py:216`

Impact:

- The immediate repeat-selection risk is fixed.
- Leads can still be made eligible again if `cooldown_flag` is intentionally cleared.

Status:

- Implemented.

### 6. S6/S7 now always fire G2

Why this matters:

- comments in the graph say S6/S7 always go through G2
- G2 still depends on confidence < 0.60
- A2 now explicitly sets S6/S7 confidence to 0.40

Code:

- `core/v1/services/agents/graph.py:10`
- `core/v1/services/agents/graph.py:266`
- `core/v1/services/agents/nodes/persona_classifier.py:87`
- `core/v1/services/agents/nodes/persona_classifier.py:95`

Impact:

- Flow documentation and runtime behavior now match for S6/S7.

Status:

- Implemented.

## Recommended Fix Order

If the team wants the highest-value fixes first, this is the order I would choose:

1. Add an always-on scheduler/cron around `scheduler/process-due`
2. Expand event tracking into a full A3 -> A8 graph route for every event
3. Add richer S4 D+7 outcome and re-segmentation logic
4. Add stronger S5 no-click branch copy/sequence rules
5. Add intake/data-quality endpoints for quote, consult, seminar, and invalid-contact flows

## Final Assessment

What is good:

- Strong graph structure
- Good use of checkpointing
- Good separation between workflow nodes, API endpoints, and persistence
- Useful SSE story for frontend live monitoring
- Good amount of defensive logic in dormant and HITL flows

What is risky:

- Some business-critical behavior is only partially implemented
- The scheduler exists as an API/cron hook, not an always-on worker
- Event tracking opens handoff directly but does not yet produce a full A3/A8 trace for every event
- Some scenario-specific branch depth is still simplified

Bottom line:

The backend is now much closer to the MetLife JP no-external-service flow. The core correctness pass is implemented; the remaining work is mostly production hardening and deeper scenario fidelity rather than broken core routing.

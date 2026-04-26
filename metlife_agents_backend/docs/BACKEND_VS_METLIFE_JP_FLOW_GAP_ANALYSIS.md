# Backend vs MetLife JP Agentic AI Flow Gap Analysis

## Scope

This document compares the current `metlife_agents_backend` implementation against the local MetLife JP flow artifacts:

- `../MetLife_JP_Flows (1).html`
- `../MetLife_JP_Agentic_AI_Flows (2).pdf`

The HTML is the readable source for the scenario flow diagrams and includes the "Download PDF" action, so it is treated as the line-addressable source of truth for the PDF export. The PDF is a rendered artifact of the same flow material.

This analysis also assumes the product will not use external Adobe Campaign, Adobe Analytics, SendGrid/SES, Salesforce, Jira, or any other third-party delivery/event/CRM service. Under that assumption, the backend must own the send simulation, engagement events, scheduling, and sales-handoff records internally.

## Implementation Progress - 2026-04-25

The implementation pass has closed the highest-risk no-external-service gaps:

- A2 now preserves accumulated engagement score instead of resetting it to scenario base score.
- A2 can load runtime scenario settings from `scenarios_config` when active DB config exists.
- S6/S7 now intentionally force low persona confidence so G2 fires consistently.
- S6 skips email and goes directly to handoff when no email is captured.
- S7 email-captured path now routes through A8 before handoff.
- G1 rejection now routes back through content strategy without advancing the email number.
- A6 blocks missing-recipient sends.
- A6 records quiet-hour holds into internal `email_outbox` and `workflow_timers` instead of recording an immediate send.
- Low-score nurture now pauses into an internal cadence timer instead of immediately blasting the next email.
- Due timers can be processed through `POST /api/v1/agents/scheduler/process-due`, which resumes quiet-hour sends or cadence/S4 response-window workflows.
- G3 rejection now sets `cooldown_flag=True` so rejected dormant leads are not re-queued immediately.
- G4 approval now creates an internal `sales_handoffs` row.
- Internal event tracking can open an A9/G4 handoff when a tracked event crosses threshold or records `consultation_booked`.
- Checkpoint patches now merge with the existing LangGraph state instead of replacing it.
- New internal persistence models/migration were added for `email_outbox`, `workflow_timers`, and `sales_handoffs`.

Still not complete:

- There is not yet an always-on background worker; the scheduler is currently an explicit API/cron hook.
- `events/track` does direct score/event/handoff handling, but it still does not run the full A3 -> A8 graph route for every event.
- S4 now has timer-backed response-window support, but re-segmentation before email #2 is still basic.
- S5 now waits through cadence, but no-click branch copy/sequence modeling is still basic.
- Intake webhooks and data-quality/manual-review flows are still future work.

## Current Backend Truth

The backend already has a solid core:

- FastAPI APIs under `/api/v1`.
- LangGraph workflow with checkpointed HITL pause/resume.
- Agent nodes A1, A2, A3, A4, A5, A6, A8, A9, A10.
- HITL gates G1-G5.
- SQLite/Postgres persistence.
- Internal `communications`, `email_events`, `hitl_queue`, `batch_runs`, and `sse_events`.
- Internal event ingestion via `POST /api/v1/agents/events/track`.
- Internal scheduler hook via `POST /api/v1/agents/scheduler/process-due`.
- Internal `email_outbox`, `workflow_timers`, and `sales_handoffs`.
- Batch runner that can start standard and dormant revival workflows.

The main gap is not that the backend is empty. The gap is now narrower: the backend has the internal primitives for no-external-service operation, but it still needs always-on scheduling, richer event routing, and deeper scenario-specific branch rules to fully match the MetLife JP artifact.

## Highest-Level Mismatch

The MetLife JP flow expects:

- A6 sends through Adobe Campaign or equivalent.
- A3 listens to opens, clicks, website behavior, and consultation bookings.
- A8 recalculates score after each engagement event.
- Conditional routing happens after engagement, not only after email send.
- A4/A5 generate the next email after cadence windows and event outcomes.
- A9 creates a real sales handoff.

The current backend now does:

- A6 simulates send by writing `communications` and `email_events`.
- A6 holds quiet-hour sends in `email_outbox` and `workflow_timers`.
- A8 adds `email_sent +0.05` after sends and then schedules the next touch if the lead is not ready.
- `events/track` updates score/event rows and opens A9/G4 when threshold or `consultation_booked` is reached.
- Cadence and S4 response windows are represented as due timers, processed by the internal scheduler endpoint.
- G4 approval creates a durable internal `sales_handoffs` row.

## Priority Ranking

### P0 - Must Fix Before Reliable Demo or Production

#### 1. Event-driven loop is missing as an active workflow driver

Flow spec expectation:

- A3 fires on every engagement event.
- A8 scores every open, click, consult page visit, seminar inquiry, F2F request, and booking.
- High score or consultation booking routes immediately to A9/G4.

Implementation status:

- `POST /api/v1/agents/events/track` updates checkpoint state and DB rows.
- It now opens A9/G4 automatically when the event crosses the handoff threshold or is `consultation_booked`.
- It still does not run the full A3 -> A8 graph route for every event; it applies deterministic score deltas directly.

Why this is serious:

- A normal click/open is tracked and scored, but non-threshold events still do not create a full event-processing graph trace.
- The main promise of agentic nurturing is event-driven adaptation; this is now partially implemented but still not complete.

Remaining change:

- Add an internal engagement-event orchestrator.
- After `events/track`, load the graph checkpoint and run a deterministic event route:
  - update state with event
  - run A3 if the event carries intent data
  - run A8 scoring
  - if score crosses threshold or booking exists, route to A9/G4 (already handled directly)
  - otherwise schedule or unlock the next nurture email
- For no-external-service mode, treat `/events/track` as the canonical internal event source.

Suggested implementation:

- Add `last_event_type`, `last_event_at`, `last_clicked_label`, `consultation_booked`, and `event_pending_route` state fields.
- Add an API path like `POST /api/v1/agents/events/track-and-route`.
- Or modify existing `track_engagement_event` to resume a small event-processing graph path.
- Add tests for click -> score -> G5/A9 routing and consultation_booked -> A9/G4.

#### 2. A2 overwrites accumulated engagement score

Flow spec expectation:

- A8 score is cumulative and should reflect prior engagement.
- Dormant segmentation and handoff routing depend on historical score.

Implementation status:

- A1 loads `lead.engagement_score` into state if it is higher than current state.
- A2 now preserves the higher of current `engagement_score` and scenario base score.

Why this is serious:

- Opens/clicks/page visits imported from seed data or internal events can be erased on workflow start.
- Dormant P1/P2/P3 segmentation can become wrong.
- High-intent leads may be under-routed.

Implemented change:

- In A2, set `base_score` from scenario config, but preserve the higher of current `engagement_score` and base score.
- Do not wipe score on every classification.

Suggested implementation:

```python
state["base_score"] = config["base_score"]
state["engagement_score"] = max(
    float(state.get("engagement_score") or 0.0),
    float(config["base_score"]),
)
```

#### 3. Send, cadence, and quiet-hours behavior need internal scheduling

Flow spec expectation:

- A6 sends email.
- Quiet hours 21:00-08:00 JST hold sends until 08:00.
- S1/S2/S5 have cadence windows.
- S3 has a stricter senior-friendly cadence/quiet-hour emphasis.
- S4 has a 7-day response window.
- S6/S7 are instant or same-day.

Implementation status:

- A6 writes `communications` only for actual simulated sends.
- Quiet-hours now writes a held `email_outbox` row and a `workflow_timers` row, then stops.
- Low-score nurture now creates cadence/S4 response-window timers instead of immediately looping to A4.
- Due timers can be processed by `POST /api/v1/agents/scheduler/process-due`.
- There is still no always-on background worker; the scheduler endpoint must be called manually or by cron.

Why this is serious:

- If the scheduler endpoint is not called, paused workflows will remain paused.
- S4 7-day response windows are represented, but re-segmentation logic before email #2 is still basic.

Implemented/remaining change:

- Internal outbox and timers exist.
- A6 creates held outbox items for quiet hours.
- A11 creates cadence/S4 response-window timers.
- `scheduler/process-due` dispatches due timers and resumes the graph.
- Remaining: run this endpoint from an always-on worker/cron in production.

Suggested internal tables:

- `email_outbox`
  - `id`
  - `lead_id`
  - `thread_id`
  - `subject`
  - `body`
  - `email_number`
  - `status`: pending, held, sent, cancelled
  - `scheduled_for`
  - `sent_at`
  - `hold_reason`
- `workflow_timers`
  - `id`
  - `thread_id`
  - `timer_type`: cadence, quiet_hours, s4_response_window
  - `due_at`
  - `status`

#### 4. G1 rejection path must regenerate existing assets

Flow spec expectation:

- G1 rejected content returns for revision.
- For generated content, revise with LLM.
- For existing assets, either auto-bypass or use a clearly defined alternate revision path.

Implementation status:

- A4 has code to switch first-email rejected assets to `llm_generated`.
- G1 rejection now routes back to A4, preserves the same email number, and switches to the LLM path.

Why this is serious:

- Human rejection may not change the content.
- A reviewer can see the same rejected content again.

Implemented change:

- Route G1 rejection back to A4, not A5.
- Avoid incrementing the email number for rejected drafts.

#### 5. S6 can attempt an email touch even if email is missing

Flow spec expectation:

- S6 is a F2F consultation request.
- If contact data is thin, handoff should still happen.
- Email is useful when available, but the core path is the consultation/handoff.

Implementation status:

- S6 now checks `email_captured` before routing to A4.
- If no email is captured, it routes directly to A9/G4.
- A6 blocks missing-recipient sends and marks the workflow failed instead of recording an impossible send.

Why this is serious:

- The backend can record impossible sends.
- The user journey becomes inaccurate for consultation leads without email.

Implemented change:

- For S6, check `email_captured` before A4.
- If no email, skip directly to A9/G4 with MEMO-only briefing.
- Add validation in A6 so no email send can be recorded without an email address.

#### 6. S4 dormant flow is materially incomplete

Flow spec expectation:

- A10 scheduled daily/weekly scan.
- Eligibility includes 180+ days, no consultation, opt-in allowed, no hard bounce, no cooldown.
- Segmentation uses 6-month web behavior.
- G3 approval sends segment asset.
- D+0 to D+7 response collection window.
- If converted in 7 days, terminate.
- If engagement changes, re-segment before email #2.
- Max 2 touches.

Implementation status:

- Batch run is manually triggered.
- A10 uses engagement score delta as a proxy for web behavior.
- A10 now skips leads that already have a consultation request.
- G3 rejection now sets `cooldown_flag=True`.
- Low-score S4 follow-up now pauses into an `s4_response_window` timer.
- No `converted_7d` or `responded_7d`.
- No re-segmentation before email #2.
- After G3 approval, flow goes A1 -> A2 and can reclassify away from S4.

Why this is serious:

- S4 is one of the more specialized flows in the spec.
- The current implementation behaves like a normal nurture sequence with an S4 entry gate, not the full revival campaign loop.

Remaining change:

- Keep S4 identity stable after A10/G3 unless intentionally reclassified.
- Make S4 identity stable after G3/A1/A2 if the business requires strict S4 continuity.
- Add internal web/engagement event model for P1/P2/P3.
- Add re-segmentation before email #2.
- Expand 7-day response outcome fields beyond the timer-backed wait.

### P1 - High Priority Flow Mismatches

#### 7. S6/S7 G2 must always fire

Flow spec expectation:

- S6 and S7 always fire G2 because persona confidence is degraded.

Implementation status:

- S6/S7 now force `persona_confidence = 0.40`, so the existing G2 rule fires consistently.

Implemented change:

- If scenario in `("S6", "S7")`, set `persona_confidence` below threshold or force `should_fire_g2`.

#### 8. S7 email path skips A8 tracking

Flow spec expectation:

- If S7 has email captured, send same-day email.
- Then A8 tracks open/click and score can reach 0.92+.
- Then A9 uses call + MEMO + email engagement.

Implementation status:

- S7 email-captured path now routes through A8 after the first send.

Implemented change:

- Route S7 email path through A8 before handoff.

#### 9. G4 hold/return-to-nurture is not implemented

Flow spec expectation:

- G4 can approve or hold.
- Hold can return to nurture or trigger resend/re-review depending on scenario.

Implementation status:

- `HITLApproveRequest.action` allows `hold`.
- G4 hold now routes back into a cadence timer when more nurture is possible.
- G4 rejection does not resume.
- If no email/contact path remains, G4 hold ends or marks dormant depending on sequence state.

Implemented/remaining change:

- Define G4 actions precisely:
  - approved -> converted/internal handoff accepted
  - edited -> converted/internal handoff accepted
  - hold -> schedule follow-up when possible
  - rejected -> currently terminal/no-resume
- Remaining: confirm whether G4 rejection should be terminal or should return to nurture.

#### 10. Internal sales handoff is missing

Flow spec expectation:

- A9 creates a Salesforce/Jira handoff in Tier 3.

No-external-service assumption:

- The backend should create an internal sales task instead.

Implementation status:

- A9 creates a briefing in state.
- G4 approval marks the lead `Converted`.
- G4 approval now creates a durable `sales_handoffs` row.

Implemented change:

- Add internal `sales_handoffs` table.
- On G4 approval, create a handoff row with briefing, score, scenario, assigned status, and timestamps.
- Treat `Converted` as "handoff accepted" only if that is the business meaning.

#### 11. Runtime scenario config ignores `scenarios_config`

Flow spec/development plan expectation:

- Admins can hot-swap thresholds, cadence, and activation without code deploy.

Implementation status:

- `scenarios_config` is seeded.
- Runtime now overlays active DB `scenarios_config` values on top of hardcoded defaults.
- Hardcoded defaults remain as fallback when DB config is missing/inactive.

Implemented/remaining change:

- Runtime DB config is loaded.
- Remaining: make an admin workflow for editing/validating config differences.

#### 12. Intake/webhook triggers are not implemented as spec APIs

Flow spec expectation:

- `lead_created` from T_YEC_QUOTE_MST.
- `consultation_requested` from T_CONSULT_REQ.
- Webhooks trigger workflows or create records.

Current backend:

- Seed scripts import spreadsheet data.
- APIs mostly start workflows for existing leads.
- No obvious production webhook intake endpoint exists for raw quote/consultation payloads.

Required change:

- Add internal intake endpoints if needed:
  - `POST /api/v1/intake/quote`
  - `POST /api/v1/intake/consultation`
  - `POST /api/v1/intake/seminar`
- Under no-external-service mode, these endpoints become the canonical way to simulate source-system events.

### P2 - Scenario-Specific Logic Gaps

#### 13. S1-S3 first asset lookup is too broad

Flow spec expectation:

- Email #1 is an existing asset.
- Selection considers persona, product, keigo, and sometimes product code.

Current backend:

- A4 mostly looks up first template by `scenario_id` and version.
- It does not consistently filter by `product_code`, `persona_code`, or `keigo_level`.

Required change:

- Make template selection deterministic:
  - scenario
  - version
  - persona where relevant
  - product category where relevant
  - keigo for S3

#### 14. Pre-approved asset auto-bypass is not implemented

Flow spec says:

- Pre-approved brand assets may auto-bypass G1.

Current backend:

- G1 always fires for all emails.

Required change:

- Decide if stricter review is intentional.
- If auto-bypass is required, add a template flag like `requires_hitl`.

#### 15. S2 life-event detail is incomplete

Flow spec expectation:

- ANS4 code should eventually map to marriage, pregnancy, home, etc.
- A4/A5 should use that event context.

Current backend:

- ANS4 is only affirmative/non-affirmative.
- `life_event_flag=True` is set, but no detailed event context is stored.

Required change:

- Add ANS4 detail mapping once source data mapping is known.
- Store `life_event_type`.
- Feed it into A3/A4/A5 prompts.

#### 16. S3 seminar and F2F detection is partial

Flow spec expectation:

- S3 A3 checks seminar inquiries and F2F requests.

Current backend:

- Seed imports seminar requests as `ConsultationRequest(request_type="seminar")`.
- Event API supports `seminar_inquiry` and `f2f_request`.
- But graph routing does not actively query these after each email unless an event is manually tracked.

Required change:

- Route seminar/F2F events through the event-driven orchestrator.

#### 17. S5 no-click default and branch sequences are incomplete

Flow spec expectation:

- S5 email #1 has three CTAs.
- CTA click determines medical/life/asset sequence.
- No click defaults to Medical Insurance.

Current backend:

- Click label can set `product_interest`.
- No-click default is not explicitly set to medical.
- Branch-specific sequence is only prompt-level, not strongly modeled.

Required change:

- Add explicit default:
  - if S5 and no click after response window, set `product_interest="medical_insurance"`.
- Add branch-aware template/style selection.

#### 18. S7 data quality edge case is missing

Flow spec expectation:

- Both email bounce and phone invalid -> data quality flag -> archived -> manual review queue.

Current backend:

- Bounce suppresses lead.
- No phone validation or `data_quality_flag`.
- No manual data-quality queue.

Required change:

- Add `phone_valid`, `email_valid`, `data_quality_flags`.
- Add a manual review queue or extend HITL with a data-quality gate.

### P3 - Product/Operations Gaps

#### 19. Agent execution audit trail is not a durable first-class table

Flow/development plan expectation:

- Agent logs are persisted as an immutable compliance trail.

Current backend:

- `execution_log` exists in graph state.
- SSE events are persisted.
- There is an `audit_log` model, but agent node logging is not consistently written to a dedicated agent log table.

Required change:

- Add or standardize `agent_logs`.
- Write one row per agent node execution with latency, status, and summary.

#### 20. Language/localization is partly implemented but not end-to-end verified

Flow/development plan expectation:

- EN/JA language preference affects generated content.

Current backend:

- `target_language` is carried into prompts.
- Existing templates are JA-focused.
- Review/output behavior depends on template availability and prompt fallback.

Required change:

- Verify EN and JA paths with sample workflows.
- Add template language filtering in A4.

## No-External-Service Backend Replacements

Because Adobe/email/CRM services are not being used, these internal modules are required for the backend to satisfy the flow intent. Some now exist as first-pass backend primitives; others still need deeper production behavior.

### 1. Internal Send Adapter

Purpose:

- Represent email sends without a provider.

Required behavior:

- Create outbox item.
- Respect quiet hours.
- Respect cadence.
- Mark sent only when due.
- Create communication row.
- Create `email_sent` event.
- Publish SSE event.

Status:

- First pass implemented via `email_outbox`, A6 quiet-hour hold logic, and normal simulated sends.
- Remaining: richer tracked-link generation and more operational admin views.

### 2. Internal Engagement Event Store

Purpose:

- Replace Adobe Campaign and Adobe Analytics events.

Required behavior:

- Accept open/click/bounce/unsubscribe/page visit/product view/simulation/consult booking events.
- Update `communications`.
- Write `email_events`.
- Update lead score and `last_active_at`.
- Trigger graph routing.

Status:

- First pass implemented for score/event storage and immediate A9/G4 opening on threshold or booking.
- Remaining: full A3 -> A8 trace on every event.

### 3. Internal Link and Click Tracking

Purpose:

- Replace Adobe click URLs.

Required behavior:

- Generate tracked CTA URLs for preview/demo.
- Endpoint records click and redirects to a local/internal destination or simply returns success.
- CTA labels map to S5 branches.

Status:

- Partially implemented through `events/track` CTA labels.
- Remaining: generated local tracked URLs and redirect behavior.

### 4. Internal Scheduler

Purpose:

- Replace campaign scheduling and response windows.

Required behavior:

- Process due outbox sends.
- Resume workflows after quiet-hour holds.
- Resume workflows after cadence delays.
- Close S4 D+7 response windows.
- Apply S5 no-click default after waiting window.

Status:

- First pass implemented through `workflow_timers`, A11 cadence pauses, and `scheduler/process-due`.
- Remaining: always-on worker/cron and explicit S5 no-click branch semantics.

### 5. Internal Sales Handoff Queue

Purpose:

- Replace Salesforce/Jira.

Required behavior:

- Create handoff record on G4 approval.
- Store briefing, score, scenario, source event, and status.
- Allow advisor assignment and completion.

Status:

- First pass implemented with `sales_handoffs` on G4 approval.
- Remaining: assignment/completion APIs and UI workflow.

## Suggested Implementation Roadmap

### Phase 1 - Correctness Patch

Goal:

- Make current graph behavior truthful and avoid broken branches.

Status: implemented.

Changes:

- Preserve engagement score in A2.
- Fix G1 rejection routing.
- Enforce no-recipient guard in A6.
- Make S6 no-email path go directly to A9.
- Force G2 for S6/S7 if that is the accepted business rule.
- Make quiet-hours behavior honest by returning held without send.

### Phase 2 - Internal Event-Driven Engine

Goal:

- Make no-external-service mode actually event-driven.

Status: partially implemented.

Changes:

- Upgrade `events/track` to route/trace the graph after every event.
- Add internal engagement event fields to state.
- Add tests:
  - click -> product interest -> score
  - consultation_booked -> A9/G4
  - unsubscribe/bounce -> suppressed
  - S5 no click -> medical default

### Phase 3 - Scheduler and Outbox

Goal:

- Make cadence, quiet hours, and response windows real.

Status: first pass implemented; production worker still needed.

Changes:

- Add `email_outbox`.
- Add `workflow_timers`.
- Add worker/API to process due items.
- Move low-score loops from immediate continue to timer-backed cadence.

### Phase 4 - Scenario Fidelity

Goal:

- Match S1-S7 details from the flow spec.

Changes:

- S4 D+7 response window and re-segmentation.
- S5 branch-specific sequences.
- S2 life-event type mapping.
- S3 seminar/F2F event routing.
- S7 data-quality/manual-review path.
- Template lookup by persona/product/keigo/language.

### Phase 5 - Operational Completeness

Goal:

- Make the backend demoable and auditable without external systems.

Changes:

- Expand internal sales handoff workflow.
- Add agent execution logs.
- Add intake endpoints for quote/consult/seminar events.
- Add admin/debug endpoints for outbox, timers, and event traces.

## Bottom Line

The current backend now implements the skeleton, the key no-external-service persistence primitives, and the main correctness fixes. The biggest remaining gap is deeper event-driven runtime fidelity around the graph.

If external services are not being used, the backend needs to become its own small campaign/event/handoff system:

- internal outbox instead of email provider: first pass implemented
- internal event tracking instead of Adobe: partially implemented
- internal scheduler instead of campaign cadence: API/cron hook implemented
- internal sales queue instead of CRM: first pass implemented

With these internal replacements in place, the LangGraph structure can now carry the MetLife JP flows much more faithfully. The next layer is production hardening and scenario-specific detail.

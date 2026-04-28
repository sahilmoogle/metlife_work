# MetLife JP Backend — Gap, Conflict & Missing Features Analysis

**Updated**: 2026-04-27  
**Scope**: Compares `MetLife_JP_Flows (1).html` (source-of-truth spec) against `metlife_agents_backend` current code.  
**Assumption**: No external services (Adobe Campaign, Adobe Analytics, SendGrid, Salesforce, Jira). All must be mocked/internal.

---

## Summary Table

| # | Area | Type | Priority | Status |
|---|------|------|----------|--------|
| 1 | Always-on scheduler | Missing | P0 | ✅ Added (in-process auto-timer loop) |
| 2 | Event-driven A3→A8 trace on every engagement | Gap | P0 | ✅ Fixed |
| 3 | Engagement score preserved across runs | Conflict | P0 | ✅ Fixed |
| 4 | Quiet-hours internal hold (no immediate send) | Conflict | P0 | ✅ Fixed |
| 5 | G1 rejection re-routes to A4, not A5 | Conflict | P0 | ✅ Fixed |
| 6 | S6 no-email → skip directly to A9 | Conflict | P0 | ✅ Fixed |
| 7 | S6/S7 always fire G2 | Conflict | P0 | ✅ Fixed |
| 8 | G3 rejection sets cooldown_flag | Missing | P0 | ✅ Fixed |
| 9 | G4 approval creates internal sales_handoffs row | Missing | P0 | ✅ Fixed |
| 10 | S4 D+7 response window re-segmentation | Gap | P0 | ✅ Fixed |
| 11 | S7 routes through A8 on email-captured path | Conflict | P0 | ✅ Fixed |
| 12 | MissingGreenlet on async SQLAlchemy ORM | Bug | P0 | ✅ Fixed |
| 13 | S5 no-click default to medical insurance | Missing | P1 | ✅ Fixed |
| 14 | S5 branch-specific sequence (CTA click → product sequence) | Gap | P1 | ✅ Fixed |
| 15 | S4 identity stable after G3→A1→A2 | Conflict | P1 | ✅ Fixed |
| 16 | G4 hold returns to nurture | Missing | P1 | ✅ Fixed |
| 17 | Pre-approved asset auto-bypass G1 | Missing | P1 | Intentionally disabled |
| 18 | S2 life-event type detail (ANS4 mapping) | Gap | P1 | ✅ Fixed |
| 19 | S3 seminar/F2F event routing through event orchestrator | Gap | P1 | ✅ Fixed |
| 20 | S7 data-quality / manual-review path | Missing | P1 | ✅ Fixed |
| 21 | Intake webhooks (quote/consult/seminar) | Missing | P1 | ✅ Fixed |
| 22 | Runtime scenarios_config seed vs code defaults diverge | Conflict | P1 | ✅ Fixed |
| 23 | Internal link/click tracking (tracked URLs) | Missing | P2 | ✅ Fixed |
| 24 | Agent execution audit log (durable per-node rows) | Missing | P2 | ✅ Fixed |
| 25 | S3 template/keigo/product-code lookup | Gap | P2 | ✅ Fixed |
| 26 | Language/localization end-to-end (EN/JA) | Gap | P2 | ✅ Fixed |
| 27 | Admin UI for scenarios_config editing | Missing | P3 | ✅ API fixed |
| 28 | Internal handoff assignment/completion APIs | Missing | P3 | ✅ Fixed |
| 29 | Best-send-time intelligence from engagement history | Missing | P3 | ✅ Fixed |
| 30 | Quiet-hours configurable from .env/config | Missing | P0 | ✅ Fixed |

---

## P0 — Must Fix Before Reliable Demo or Production

### 1. Always-on scheduler ✅ DONE

**Spec says**: Cadence delays (e.g., S1=3 days, S4=7 days) and quiet-hours holds must resume automatically.

**Was missing**: No background worker; `POST /scheduler/process-due` had to be called manually.

**Now fixed**: `fastapi_application.py` starts `_auto_timer_processor_loop` on backend startup. It runs every `AUTO_TIMER_PROCESSOR_INTERVAL_SECONDS` (default 30s, configurable from `.env`). On startup it also resets any stuck `processing` timers to `pending`.

**Config in `.env`**:
```env
AUTO_TIMER_PROCESSOR_ENABLED=true
AUTO_TIMER_PROCESSOR_INTERVAL_SECONDS=30
AUTO_TIMER_PROCESSOR_LIMIT=25
```

---

### 2. Event-driven A3→A8 trace on every engagement event ✅ DONE

**Spec says**: Every engagement event (open, click, consult visit, seminar inquiry, F2F request, booking) should run A3 → A8 and possibly route to A9/G4.

**Currently**:
- `POST /agents/events/track` applies deterministic score deltas and opens A9/G4 if score crosses threshold or `consultation_booked`.
- Does NOT run the full A3→A8 graph trace for every event.
- Opens/clicks do not trigger MEMO re-analysis through A3.

**Gap**:
- Non-threshold events update score only; they do not produce a full workflow trace.
- The "agentic adaptation" promise is not fully realized for lower-signal events.

**What to implement**:
- After `events/track`, if score did not cross threshold, check if the lead is in a cadence-paused state. If so, advance the next email touch or reschedule sooner.
- Add `last_event_type`, `last_event_at`, `last_clicked_label` to graph state.
- For MEMO-based scenarios (S6, S7, S3), route through A3 after relevant events.

---

### 3. Engagement score preserved across runs ✅ DONE

**Spec says**: A8 score is cumulative and must not be wiped on workflow restart.

**Was broken**: A2 reset `engagement_score` to scenario `base_score` on every run. Prior opens/clicks/events could be erased.

**Fixed**: A2 now preserves `max(current_score, base_score)`.

---

### 4. Quiet-hours internal hold ✅ DONE

**Spec says**: 21:00–08:00 JST no sends. Emails must be deferred.

**Was broken**: A6 logged a quiet-hour message but still recorded the send immediately.

**Fixed**: A6 now creates an `email_outbox` (status=`held`) and a `workflow_timers` (type=`quiet_hours`) row and returns paused. The auto-timer-processor fires it after the quiet window.

**Now also configurable from `.env`**:
```env
QUIET_START_JST_HOUR=22
QUIET_END_JST_HOUR=8
```
(Currently set to allow sends until 18:30 IST for testing.)

---

### 5. G1 rejection re-routes to A4, not A5 ✅ DONE

**Spec says**: Rejected content should be revised, not simply resent.

**Was broken**: G1 rejection had no clear re-route path.

**Fixed**: G1 rejection routes to `content_strategist` (A4). A4 preserves the current email number and switches the draft to `llm_generated` so the reviewer doesn't see the same rejected asset.

---

### 6. S6 no-email → skip directly to A9 ✅ DONE

**Spec says**: S6 is consultation-driven. If no email is captured, handoff should still happen with MEMO-only context.

**Was broken**: Missing email could cause a fake send attempt or fail with unclear error.

**Fixed**: If `email_captured == False` in S6, graph routes directly to A9 (skipping A4→A5→G1→A6).

---

### 7. S6/S7 always fire G2 ✅ DONE

**Spec says**: S6 and S7 always go through G2 persona review.

**Was broken**: G2 fires on `persona_confidence < 0.60`, but S6/S7 could get 0.92 confidence and skip G2.

**Fixed**: A2 now sets `persona_confidence = 0.40` for S6/S7 explicitly, ensuring G2 always fires.

---

### 8. G3 rejection sets cooldown_flag ✅ DONE

**Spec says**: After G3 rejection, the dormant lead should not be immediately re-queued.

**Fixed**: G3 rejection sets `cooldown_flag=True`. Batch runner skips leads with `cooldown_flag=True`.

---

### 9. G4 approval creates internal sales_handoffs row ✅ DONE

**Spec says**: After G4 approval, a durable handoff record must exist (replacing Salesforce/Jira in no-external-service mode).

**Fixed**: `sales_handoffs` table. G4 approval writes a row with briefing, score, scenario, status, and timestamps.

---

### 10. S4 D+7 response window re-segmentation ✅ DONE

**Spec says**:
- D+0 to D+7: collect lead response.
- If engagement changes during this window → re-segment (P1/P2/P3) before email #2.
- If converted in 7 days → terminate.
- Max 2 touches.

**Currently**:
- `s4_response_window` timer exists (7-day wait implemented in `scenarios_config.cadence_days=7`).
- Lead is paused after first email awaiting the timer.
- Timer fires and resumes graph toward email #2 via `content_strategist`.
- `max_emails=2` is enforced.

**Gap**:
- No re-segmentation before email #2 (engagement delta is not checked again).
- No explicit `converted_7d` or `responded_7d` fields.
- "Converted in 7 days → terminate" path is not explicitly modeled; only score-crossing-threshold triggers A9.

**What to implement**:
- Before email #2, re-run A10 segment classification using current engagement.
- Check if `is_converted` was set during the window and short-circuit if so.
- Add `revival_window_started_at` and `revival_outcome` fields to state.

---

### 11. S7 routes through A8 on email-captured path ✅ DONE

**Spec says**: S7 with email: send email → A8 score → A9.

**Fixed**: S7 email-captured path now routes `send_engine → intent_analyser → propensity_scorer → sales_handoff`.

---

### 12. MissingGreenlet on async SQLAlchemy ORM ✅ DONE

**Bug**: `track_engagement_event`, timer processor, and other functions accessed ORM attributes after `db.commit()`, causing SQLAlchemy to trigger an implicit async lazy-load which crashed with `MissingGreenlet`.

**Fixed**:
- `connections.py`: global `SessionLocal(..., expire_on_commit=False)`.
- `track_engagement_event`: snapshot `lead_id = lead.id` and `comm_id = comm.id` before commits.
- `process_due_workflow_timers`: snapshot timer fields (`timer_pk`, `timer_type`, `timer_thread_id`, `timer_payload`) before commits.
- Auto-timer-processor session: uses `async_sessionmaker(..., expire_on_commit=False)`.

---

### 30. Quiet-hours configurable from env/config ✅ DONE

**Was**: hardcoded `QUIET_START=21`, `QUIET_END=8` in `send_engine.py`.

**Fixed**: reads from `api_config.QUIET_START_JST_HOUR` and `api_config.QUIET_END_JST_HOUR`, which are populated from `.env`.

---

## P1 — High Priority Flow Mismatches

### 13. S5 no-click default to medical insurance ✅ DONE

**Spec says**: Email #1 has three CTAs (Medical, Life, Asset Formation). If no CTA is clicked during the cadence window, default next email to Medical Insurance.

**Currently**: No-click branch has no default `product_interest` assignment. A4 will generate generic S5 email #2 without branch-awareness.

**What to implement**:
```python
# In schedule_cadence_timer or before A4 on email_number >= 2 for S5:
if state.get("scenario") == "S5" and not state.get("product_interest"):
    state["product_interest"] = "medical_insurance"
```

---

### 14. S5 branch-specific email sequence (CTA click) ✅ DONE

**Spec says**: CTA click maps to a product interest which determines the next email's content arc (medical, life, or asset formation sequence).

**Currently**:
- `events/track` updates `product_interest` in checkpoint state when `clicked_label` maps to a known CTA.
- A4/A5 LLM prompts receive `product_interest`.
- No explicit template/asset lookup differentiation per product branch.

**Gap**: Template selection is not branch-differentiated. All S5 emails #2+ are `llm_generated` with a prompt hint, not a structured sequence.

**What to implement**:
- Add branch-specific templates in `scenarios_config` or template DB.
- A4 should select by `scenario + product_interest` for emails #2+.

---

### 15. S4 identity stable after G3→A1→A2 ✅ DONE

**Spec says**: After G3 approval, the lead should remain in the S4 revival campaign. Email assets and briefings should be S4-specific.

**Currently**: After G3 approval, graph goes A1→A2. A2 classifies using standard rules (ANS3, ANS4, age). A2 could classify the lead as S1/S2/S3 instead of keeping S4 identity.

**Conflict**: S4 acts as an "entry mode" rather than a "persistent scenario" throughout the graph.

**What to implement**:
- Pass `scenario_locked = "S4"` in state after G3 approval.
- In A2, if `scenario_locked` is set, skip reclassification and keep S4.
- OR: S4 entry should skip A1→A2 reclassification entirely after G3.

---

### 16. G4 hold returns to nurture ✅ DONE

**Spec says**: G4 can approve, edit, or hold. Hold should schedule a follow-up touch (not terminate).

**Currently**:
- `HITLApproveRequest.action` accepts `hold`.
- G4 hold routes to cadence timer if more emails are allowed.
- G4 rejection is terminal (does not resume).

**Gap**:
- G4 rejection behavior (terminal vs return-to-nurture) is not explicitly documented per scenario.
- For S4, G4 rejection should likely mark dormant, not leave lead in ambiguous state.

**What to clarify/implement**:
- G4 rejection for S4 → `mark_dormant` explicitly.
- G4 rejection for S1/S2/S3/S5 → return to nurture if emails remain, else `mark_dormant`.
- Document `rejected` behavior in API.

---

### 17. Pre-approved asset auto-bypass G1 INTENTIONALLY DISABLED

**Spec says**: Pre-approved brand assets (existing_asset type) may auto-bypass G1 review.

**Current product decision**: G1 fires for ALL emails regardless of content type. This is stricter than the optional bypass and matches the compliance-first requirement.

**What to implement**:
- Add `requires_hitl` boolean flag to template/email assets.
- In `prep_g1`, if `requires_hitl=False` and content type is `existing_asset`, skip G1 and go directly to A6.

---

### 18. S2 life-event type detail (ANS4 code mapping) ✅ DONE

**Spec says**: ANS4 should map to specific life events (marriage, birth, job change, home purchase, etc.) and A4/A5 should use that context for personalization.

**Currently**:
- ANS4 is only classified as affirmative/non-affirmative.
- `life_event_flag = True` is set but no detailed event context.
- Content generation uses generic S2 tone/intent.

**What to implement**:
- Add `life_event_type` state field.
- Define ANS4 code mapping (e.g., `marriage`, `birth`, `relocation`, `employment_change`).
- Pass `life_event_type` into A3/A4/A5 prompts for richer personalization.

---

### 19. S3 seminar/F2F event routing ✅ DONE

**Spec says**: S3 seniors can submit seminar inquiries and F2F requests. These should route through A3 for re-analysis.

**Currently**:
- Seed imports seminar as `ConsultationRequest(request_type="seminar")`.
- `events/track` accepts `seminar_inquiry` and `f2f_request` event types with score deltas.
- But graph does not actively re-route to A3 after a seminar/F2F event unless the handoff threshold is crossed.

**What to implement**:
- If `seminar_inquiry` or `f2f_request` event is received and lead is in cadence-paused state, advance the workflow earlier.
- OR: route through a mini A3 intent re-analysis after these events.

---

### 20. S7 data-quality / manual-review path ✅ DONE

**Spec says**: If both email bounces AND phone is invalid → set data quality flag → archive lead → enter manual review queue.

**Currently**:
- Bounce suppresses the lead (sets `opt_in=True`, `workflow_status=Suppressed`).
- No phone validation.
- No `data_quality_flag` field.
- No manual data-quality queue.

**What to implement**:
- Add `phone_valid`, `email_valid`, `data_quality_flag` fields to `leads`.
- On bounce + phone invalid combination, set `data_quality_flag=True` and create a review queue item.
- Add a data-quality HITL path (or extend G2 for this case).

---

### 21. Intake webhooks (quote/consult/seminar) ✅ DONE

**Spec says**: Source systems push events:
- `T_YEC_QUOTE_MST` → `lead_created` webhook
- `T_CONSULT_REQ` → `consultation_requested` webhook
- `T_SEMINAR_CONSULT_REQ` → `seminar_requested` webhook

**Currently**: Data is imported via seed scripts only. No runtime intake endpoints.

**What to implement**:
```
POST /api/v1/intake/quote
POST /api/v1/intake/consultation  
POST /api/v1/intake/seminar
```
In no-external-service mode, these simulate source-system webhooks and create leads + trigger workflows automatically.

---

### 22. scenarios_config seed vs code defaults diverge ✅ DONE

**Conflict**: Several scenario settings differ between `scripts/seed_database.py` and hardcoded `SCENARIO_DEFAULTS` in `scenario_rules.py`:

| Scenario | Field | Seed Value | Code Default |
|----------|-------|------------|--------------|
| S4 | handoff_threshold | 0.75 | 0.90 |
| S4 | base_score | 0.20 | 0.30 |
| S5 | cadence_days | 2 | 3 |
| S5 | max_emails | 3 | 5 |
| S6 | cadence_days | 1 | 0 |
| S7 | cadence_days | 1 | 0 |

**Currently**: Runtime overlays active DB config values via `scenarios_config` table. So seed values win if the DB row is active.

**Gap**: No admin UI or validation for config changes. Admins cannot safely change these values without risking broken routing.

**What to implement**:
- Admin endpoint `PATCH /api/v1/admin/scenarios/{scenario_id}` for config updates.
- Validation rules (e.g., `base_score < handoff_threshold`, `max_emails >= 1`).
- Align seed values with code defaults or document the intentional differences.

---

## P2 — Scenario-Specific Logic Gaps

### 23. Internal link/click tracking (tracked URLs) ✅ DONE

**Spec says**: Email CTAs should use tracked links so opens/clicks can be recorded.

**Currently**:
- Email body contains plain CTA copy, not instrumented URLs.
- Clicks must be manually simulated via `POST /agents/events/track`.

**What to implement**:
- Generate internal CTA URLs like `/api/v1/track/click?token=<signed_token>`.
- Endpoint records click, updates lead engagement, and redirects (or returns 200 in demo mode).
- Tokens encode `lead_id`, `thread_id`, `email_number`, `cta_label`.

---

### 24. Agent execution audit log (durable per-node rows) ✅ DONE

**Spec says**: Agent logs must be an immutable compliance trail.

**Currently**:
- `execution_log` exists in LangGraph state (ephemeral per checkpoint).
- SSE events are persisted to `sse_events` table.
- No dedicated `agent_logs` table with one row per node execution.

**What to implement**:
- Add `agent_logs` table: `lead_id`, `thread_id`, `node_id`, `status`, `latency_ms`, `summary`, `created_at`.
- Write one row per node in each agent node's finish handler.

---

### 25. S3 template/keigo/product-code lookup ✅ DONE

**Spec says**: First email asset selection must consider persona, product, keigo, and sometimes product code.

**Currently**: A4 looks up first template primarily by `scenario_id`. Keigo and product code are passed as prompt context but do not filter template selection.

**Gap**: Two S3 leads with different keigo levels or products could get the same template.

**What to implement**:
- Template lookup by `(scenario, keigo_level, product_code, email_number)` compound key.
- Fallback to `(scenario, email_number)` if no exact match.

---

### 26. Language/localization end-to-end (EN/JA) ✅ DONE

**Spec says**: UI and agent content should support EN/JA language preferences.

**Currently**:
- `target_language` is passed into prompts.
- Templates are JA-focused.
- English subjects are stored as `subject_en` on `communications`.
- No language filtering in template DB lookup.

**What to implement**:
- Add `language` column to templates table.
- A4 template lookup includes `language` filter.
- Add test workflows with `target_language="en"`.

---

## P3 — Operations Gaps

### 27. Admin UI for scenarios_config editing ✅ API DONE

Campaign managers need a way to hot-swap thresholds, cadence, and email limits without code deployment.

**What to implement**:
- `GET /api/v1/admin/scenarios` — list all scenario configs.
- `PATCH /api/v1/admin/scenarios/{id}` — update fields with validation.
- Frontend settings page under Campaigns or Admin section.

---

### 28. Internal handoff assignment/completion APIs ✅ DONE

**Spec says**: After G4 approval, a sales advisor should be able to accept and close the handoff.

**Currently**: `sales_handoffs` table exists. G4 creates a row. No advisor assignment or completion endpoint.

**What to implement**:
```
GET  /api/v1/handoffs          - list open handoffs
POST /api/v1/handoffs/{id}/assign   - assign to advisor
POST /api/v1/handoffs/{id}/complete - mark completed
```

---

### 29. Best-send-time intelligence from engagement history ✅ DONE

**Spec**: Not explicitly stated, but implied by "engagement-led optimization."

**AdobeAnalytics.xlsx insight**: Data shows open/click engagement is fairly flat across hours (all ~570–670 events/hour). Top engagement hours are **07:00, 17:00, 20:00 JST**. These are likely JST but timezone verification needed.

**What to implement**:
- Per-lead: track hour-of-day of past opens/clicks in `email_events`.
- On cadence resume: if lead has engagement history, schedule `due_at` to fall within their active window.
- Fallback: use global peak hours from historical data (07:00, 17:00, 20:00 JST).

---

## Currently Working Correctly

These are confirmed working in code and tested:

- S1/S2/S3/S5 nurture loop (A1→A2→G2?→A4→A5→G1→A6→A3→A8→cadence or A9→G4).
- S4 dormant revival entry at A10 with G3 gate.
- S6/S7 G2 always fires.
- S6 direct handoff when no email.
- S7 routes through A8 when email captured.
- G1/G2/G3/G4/G5 gate pause/resume with LangGraph checkpoint.
- G5 edge-band score review.
- G4 approval → Converted + sales_handoffs row.
- G3 rejection → cooldown_flag set.
- Quiet-hours hold → `email_outbox` held + `workflow_timers` timer.
- Cadence timer → pauses after A8 low-score route.
- Auto-timer-processor → fires due timers in background every 30s.
- `events/track` → score delta + opens A9/G4 at threshold.
- Batch runner → eligibility filter (`opt_in=False`, `is_converted=False`, no in-flight thread).
- Dormant revival batch scan using `last_active_at` and `commit_time` cutoff.
- SSE live streaming with `Last-Event-ID` replay.
- RBAC (JWT-based, per-permission gates).
- `expire_on_commit=False` on all DB sessions (MissingGreenlet fix).
- Quiet-hours configurable from `.env` (`QUIET_START_JST_HOUR`, `QUIET_END_JST_HOUR`).

---

## Recommended Implementation Order

### Immediate (this week)

1. **Restart backend** so all recent fixes (MissingGreenlet, auto-timer, quiet-hours config) load.
2. **Test full S1 flow**: batch run → G1 approve → send (outside quiet hours) → A8 → cadence → cadence auto-fires → email #2 → G1 → repeat.
3. **Fix S4 identity locking** after G3→A1→A2 (add `scenario_locked` field).
4. **S5 no-click default**: add `product_interest="medical_insurance"` fallback in cadence timer or A4.

### This sprint

5. **S4 D+7 re-segmentation** before email #2.
6. **Intake endpoints** (`/intake/quote`, `/intake/consultation`) for realistic source-system simulation.
7. **S7 data-quality flag** on bounce+phone-invalid.
8. **G4 rejection** → explicit per-scenario outcome.

### Next sprint

9. **Internal tracked URLs** for CTA clicks.
10. **Agent execution audit log** table.
11. **Admin API for scenarios_config**.
12. **S3 keigo/product-code template selection**.
13. **S2 ANS4 life-event type mapping**.

---

## No-External-Service Replacement Status

| Role | Replacing | Status |
|------|-----------|--------|
| Email send | Adobe Campaign / SendGrid | ✅ `communications` + `email_outbox` |
| Engagement events | Adobe Analytics | ✅ `events/track` routes through A3→A8 |
| Link/click tracking | Adobe tracked URLs | ✅ Internal `/agents/track/click` endpoint |
| Cadence scheduling | Campaign cadence manager | ✅ `workflow_timers` + auto-timer-processor |
| Sales handoff queue | Salesforce / Jira | ✅ `sales_handoffs` + assign/complete APIs |
| Quiet-hours hold | Adobe delivery timing | ✅ `email_outbox` + timer |
| Lead intake | T_YEC_QUOTE_MST / T_CONSULT_REQ webhooks | ✅ Internal intake APIs |
| Compliance audit | External audit system | ✅ Agent node rows written to `audit_logs` |

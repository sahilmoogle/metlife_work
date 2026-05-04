# MetLife Agents Backend - File-Wise Explanation

This document is written as a tech-team speaking guide. It explains the backend file by file, with line-range level detail and every important class, function, endpoint, node, and table.

Use this rule while presenting:

- Start with `fastapi_application.py`: how the service boots.
- Move to `config/v1`: how environment and runtime behavior are controlled.
- Explain `model/database/v1`: what data is stored.
- Explain `core/v1/services/agents`: how the AI workflow runs.
- Explain `core/v1/api`: how the frontend talks to the backend.
- Explain `utils/v1`: shared auth, DB, permissions, and sync utilities.
- End with `scripts`: how local/demo data is seeded.

## 1. Project Metadata

### `pyproject.toml`

Purpose: central Python project configuration.

- Lines 1-6: Defines project name, version, description, README path, and Python version.
- Lines 7-25: Lists runtime dependencies.
- `fastapi`: HTTP API framework.
- `uvicorn`: ASGI server for running FastAPI.
- `sqlalchemy`: async ORM for DB models and queries.
- `pydantic` and `pydantic-settings`: request validation and environment config.
- `pyjwt` and `bcrypt`: authentication and password security.
- `langchain`, `langchain-openai`, `openai`: LLM integration.
- `langgraph`: stateful multi-step agent workflow.
- `langgraph-checkpoint-postgres/sqlite`: checkpoint persistence for workflow pause/resume.
- `psycopg`, `psycopg-pool`: PostgreSQL driver and pooling support.
- `sse-starlette`: server-sent events support.
- `pandas`, `openpyxl`: Excel import for seed data.
- `extract-msg`: Outlook `.msg` template parsing.
- Lines 27-31: Ruff per-file ignores for seed scripts because those scripts bootstrap import paths.

## 2. Application Entry

### `fastapi_application.py`

Purpose: main FastAPI application entry point.

- Lines 1-14: Imports async runtime, logging, FastAPI, SQLAlchemy, CORS, config, router, and DB connection helpers.
- Lines 26-30: Loads `config/v1/logging.conf`, so all application logs follow one format.
- `logger = logging.getLogger(__name__)`: gives this file a named logger.

Functions:

- `_reset_processing_timers()` lines 34-44:
  - Creates a short-lived DB session for the scheduler.
  - Changes timers stuck in `processing` back to `pending`.
  - This prevents a crash from permanently blocking cadence or quiet-hour timers.

- `_auto_timer_processor_loop(interval_s, limit)` lines 47-82:
  - Imports `process_due_workflow_timers` lazily to avoid circular imports.
  - Creates its own async DB session factory.
  - Logs that the timer loop is enabled.
  - Calls `_reset_processing_timers()` once at startup.
  - Runs forever while the app is alive.
  - Every loop checks due timers and resumes workflows.
  - If a timer processing error happens, it logs the error and resets stuck timers again.
  - Sleeps for `interval_s` seconds between runs.
  - Handles cancellation cleanly on shutdown.

- `lifespan(app)` lines 85-110:
  - Startup: creates DB connection and checks DB health.
  - Starts the background timer processor if enabled in config.
  - Shutdown: cancels timer task and disposes the DB engine.

- `application = FastAPI(...)` lines 112-116:
  - Creates the FastAPI app.
  - Uses project name from `api_config`.
  - Enables the lifespan startup/shutdown logic.

- `internal_server_exception_handler(...)` lines 120-125:
  - Converts custom `InternalServerException` into a JSON 500 response.

- `log_requests(...)` lines 128-139:
  - Middleware that runs around every request.
  - Generates a short request id.
  - Logs request path, duration, and response status.

- CORS block lines 142-153:
  - If `BACKEND_CORS_ORIGINS` is configured, allows frontend origins.

- Router mount line 156:
  - Mounts all v1 routes under `/api/v1`.

- `health_check()` lines 159-160:
  - Lightweight liveness endpoint returning service status.

## 3. Router Composition

### `core/fastapi_blueprint.py`

Purpose: registers all feature routers.

- Lines 1-4: Imports FastAPI dependency helper and global router object.
- Lines 5-14: Imports route modules for auth, agents, HITL, SSE, leads, dashboard, analytics, admin, and templates.
- Lines 17-18: Auth routes are public because login/register must work before a JWT exists.
- Lines 22-23: Creates a base auth dependency using `get_current_user`.
- Lines 25-44: Registers protected routers using the auth dependency.
- Lines 31-32: SSE is special because browser `EventSource` cannot send Authorization headers; it authenticates per route.

## 4. Configuration Files

### `config/v1/__init__.py`

Purpose: base settings class used by all config modules.

- Lines 1-3: Imports `Path` and Pydantic `BaseSettings`.
- `BaseSettingsWrapper` lines 6-11:
  - Sets `.env` path to the backend package root.
  - Makes environment keys case sensitive.
  - Allows extra `.env` keys without crashing.
  - This prevents each config file from repeating `.env` path logic.

### `config/v1/api_config.py`

Purpose: API behavior and workflow timing config.

- Lines 1-3: Imports optional typing and shared settings base.
- `APIConfig` lines 6-38:
  - `PROJECT_NAME`: FastAPI title.
  - `BACKEND_CORS_ORIGINS`: comma-separated frontend origins.
  - `API_VER_STR_V1`: route prefix, normally `/api/v1`.
  - `QUIET_START_JST_HOUR` and `QUIET_END_JST_HOUR`: email quiet-hour window.
  - `CADENCE_DAYS_S1` through `CADENCE_DAYS_S7`: default nurture delay per scenario.
  - `AUTO_TIMER_PROCESSOR_ENABLED`: turns background timer loop on/off.
  - `AUTO_TIMER_PROCESSOR_INTERVAL_SECONDS`: polling interval.
  - `AUTO_TIMER_PROCESSOR_LIMIT`: max due timers handled per tick.
- `api_config = APIConfig()` line 41: singleton config object imported by app code.

### `config/v1/database_config.py`

Purpose: chooses PostgreSQL when configured, otherwise SQLite.

- Lines 1-4: Imports types, paths, SQLAlchemy URL builder, and settings base.
- `DatabaseConfig` lines 7-61:
  - Postgres fields are optional: host, port, user, password, database name.
  - `SQLITE_DB_PATH` is the local fallback path.
  - `_resolve_sqlite_path()` lines 18-29:
    - Converts relative SQLite path to an absolute backend-root path.
    - Prevents different commands or working directories from accidentally using different SQLite files.
  - `get_database_url()` lines 31-51:
    - If all required Postgres settings exist, returns `postgresql+asyncpg` URL.
    - Otherwise returns `sqlite+aiosqlite:///...`.
  - `is_sqlite()` lines 53-61:
    - Returns true when Postgres is incomplete.
- `db_config = DatabaseConfig()` line 64: singleton DB config.

### `config/v1/llm_config.py`

Purpose: constructs the Azure OpenAI chat model used by agent nodes.

- Lines 1-6: Module docstring says this supports A3, A5, and A9.
- Lines 8-13: Imports logging, optional typing, and settings base.
- `AzureOpenAIConfig` lines 18-31:
  - Stores API key, endpoint, API version, deployment name, and temperature.
  - `is_configured()` returns true only if key and endpoint exist.
- `azure_openai_config = AzureOpenAIConfig()` line 34: singleton.
- `get_llm()` lines 37-61:
  - If Azure config is missing, logs warning and returns `None`.
  - If configured, imports `AzureChatOpenAI`.
  - Returns a LangChain-compatible chat model.
  - If package import fails, logs error and returns `None`.
  - This lets the workflow run in fallback mode without crashing.

### `config/v1/jwt_config.py`

Purpose: JWT secrets and expiry settings.

- `JWTConfig` lines 4-10:
  - `JWT_SECRET_KEY`: signing key.
  - `JWT_ALGORITHM`: signing algorithm.
  - `ACCESS_TOKEN_EXPIRE_MINUTES`: configured but current token function does not apply expiry.
  - `REFRESH_TOKEN_EXPIRE_DAYS`: reserved for refresh-token style auth.
- `jwt_config = JWTConfig()` line 13: singleton.

## 5. Database Model Files

### `model/database/v1/base.py`

Purpose: base SQLAlchemy model and cross-DB UUID type.

- Lines 1-8: Docstring explains PostgreSQL native UUID vs SQLite string UUID.
- `Base = declarative_base()` line 21: all ORM models inherit from this.
- `_utcnow()` lines 25-27:
  - Returns timezone-aware UTC timestamp.
- `GUID` class lines 30-52:
  - `impl = String(36)`: fallback DB representation.
  - `cache_ok = True`: SQLAlchemy can cache the type.
  - `load_dialect_impl()`: uses native Postgres UUID when possible.
  - `process_bind_param()`: converts Python values before storing.
  - `process_result_value()`: converts DB values back into `uuid.UUID`.

### `model/database/v1/leads.py`

Purpose: master lead table.

Class: `Lead`

- Identity: `id`, `quote_id`.
- Demographics: name, email, phone, age, gender, date of birth.
- Survey fields: `ans3`, `ans4`, `ans5`.
- Source fields: device, banner, product, plan, registration source, opt-in/suppression flag, mail error, analytics session.
- Scenario/persona fields: `scenario_id`, `persona_code`, `persona_confidence`, `keigo_level`.
- Score fields: `engagement_score`, `base_score`.
- Workflow fields: status, current node, sent count, max emails.
- S4 fields: revival segment, cooldown flag, converted flag.
- Completion fields: `workflow_completed`, `completed_at`.
- LangGraph link: `thread_id`.
- Timestamps: commit time, last active time, created/updated.
- Indexes: scenario, status, thread.

Why it matters: every workflow begins and ends around a `Lead`. It is the dashboard's main operational record.

### `model/database/v1/emails.py`

Purpose: approved templates and engagement events.

Class: `EmailTemplate`

- Stores approved email assets.
- A4 queries it by scenario, language, version, persona, product, or S4 segment.
- Contains subject, English subject label, HTML body, language, version, active flag.

Class: `EmailEvent`

- Stores engagement facts: sent, opened, clicked, bounced, unsubscribed.
- Holds score delta and click metadata.
- Feeds intent analysis and scoring.

### `model/database/v1/communications.py`

Purpose: permanent communication history.

Class: `Communication`

- One row per sent email.
- Stores subject, body preview, template name, email number, content type.
- Stores lifecycle timestamps: sent, delivered, opened, clicked, bounced, unsubscribed.
- Stores clicked CTA URL/label and campaign id.
- Used by lead detail and audit/history views.

### `model/database/v1/email_outbox.py`

Purpose: local provider boundary for pending/held/sent emails.

Class: `EmailOutbox`

- Holds drafted email content ready for send.
- `status`: pending, held, sent, cancelled.
- `hold_reason`: quiet hours or other reason.
- `scheduled_for`: when held email may be sent.
- `sent_at`: when dispatch completed.

### `model/database/v1/hitl.py`

Purpose: human review queue.

Class: `HITLQueue`

- Stores frozen workflow payload for G1-G5 review.
- G1 fields: draft subject/body, content type, email number.
- G2 fields: suggested persona and confidence.
- G3 fields: campaign batch size.
- G4 fields: handoff briefing and score snapshot.
- Review fields: status, reviewer, notes, edited subject/body, reviewed time.

### `model/database/v1/sales_handoffs.py`

Purpose: durable sales handoff queue.

Class: `SalesHandoff`

- Created after G4 approval or event-driven handoff.
- Stores lead, thread, scenario, score snapshot, briefing, source gate.
- Tracks assignment and completion.

### `model/database/v1/batch_runs.py`

Purpose: tracks one batch-run click.

Class: `BatchRun`

- Total new/dormant leads queued.
- Live processed/success/failure counters.
- Failed lead ids and error summary.
- Status and timestamps.
- Used by frontend progress screen.

### `model/database/v1/workflow_timers.py`

Purpose: durable scheduling table.

Class: `WorkflowTimer`

- Stores timers for quiet hours, cadence, and S4 response windows.
- `status`: pending, processing, completed, failed.
- `due_at`: resume time.
- `payload`: compact extra data like email number or outbox id.

### `model/database/v1/consultation.py`

Purpose: direct consultation/seminar requests.

Class: `ConsultationRequest`

- Stores form id, request id, request type.
- Stores contact info and memo.
- Drives S6/S7 routing.
- Tracks assignment and scheduling status.

### `model/database/v1/quotes.py`

Purpose: quote snapshot table.

Class: `Quote`

- Links quote to lead.
- Stores product category, product code, premium estimate.
- Preserves raw source reference for audit.

### `model/database/v1/scenarios.py`

Purpose: dynamic scenario settings.

Class: `ScenarioConfig`

- One row per S1-S7.
- Stores name, description, base score, handoff threshold, cadence days, max emails, default keigo/tone, active flag.
- A2 merges this over code defaults.

### `model/database/v1/sse_events.py`

Purpose: durable event replay log.

Class: `SSEEvent`

- Auto-increment integer id maps to SSE `id`.
- Stores event type, lead id, thread id, payload JSON.
- Lets browsers reconnect and replay missed events.

### `model/database/v1/users.py`

Purpose: internal RBAC user table.

Class: `User`

- Stores staff user id, name, email, password hash.
- Role: Admin, Manager, Reviewer, Viewer.
- Active/verified flags.
- `custom_permissions`: JSON text overriding role defaults.

### `model/database/v1/tokens.py`

Purpose: JWT blacklist for logout.

Class: `BlacklistedToken`

- Stores revoked token string.
- `load_authenticated_user()` rejects blacklisted tokens.

### `model/database/v1/audit_log.py`

Purpose: compliance and observability.

Class: `AuditLog`

- Stores user/action/resource/detail/IP.
- Agent wrapper in `graph.py` also writes node execution audit rows.

## 6. API Schema Files

### `model/api/v1/__init__.py`

Class: `APIResponse`

- Generic response wrapper used by many routes.
- Fields: `success`, `message`, `data`, `status_code`.

### `model/api/v1/authentication.py`

- `RegisterRequest`: email, password, full name.
- `LoginRequest`: email and password.
- `AuthResponse`: access token and token type.

### `model/api/v1/agents.py`

Purpose: request/response shapes for agent APIs.

- `StartWorkflowRequest`: lead id and target language.
- `StartWorkflowResponse`: thread id, lead id, scenario, node, score, status, HITL gate.
- `ResumeWorkflowRequest`: thread id and resume decision.
- `HITLApproveRequest`: action plus optional edited content, notes, persona override.
- `HITLQueueItem`: queue item shown in HITL UI.
- `EventTrackRequest`: event tracking payload for opens/clicks/etc.
- `IntakeQuoteRequest`: quote intake body.
- `IntakeConsultationRequest`: consultation/seminar intake body.
- `TrackClickRequest`: simplified click tracking request.
- `HandoffAssignRequest`: sales assignment body.
- `ScenarioConfigUpdateRequest`: editable scenario fields.
- `ExecutionLogEntry`: one workflow timeline entry.
- `WorkflowHistoryResponse`: execution log list for a thread.
- `BatchRunResponse`: batch progress snapshot.
- `BatchRunRequest`: optional selected lead ids.
- `WorkflowStateResponse`: full checkpoint state inspector response.

### `model/api/v1/leads.py`

- `CommunicationEntry`: communication history row.
- `LeadSummaryResponse`: all-leads table row.
- `LeadDetailResponse`: full lead detail plus AI state and communications.

### `model/api/v1/dashboard.py`

- `DashboardStatsResponse`: total/active/HITL/converted/dormant/suppressed counts, node counts, scenario breakdown.

### `model/api/v1/templates.py`

- `EmailTemplateResponse`: full template detail.
- `EmailTemplateSummary`: lightweight template list row.
- `EmailTemplateCreate`: create body.
- `EmailTemplateUpdate`: patch body.

### `model/api/v1/admin.py`

- Defines valid roles and permissions.
- `CreateUserRequest`: validates role.
- `UpdateUserRequest`: optional update fields.
- `UserPermissionRow`: resolved permission table row.
- `UserListResponse`: users plus role summary.
- `PermissionMatrixResponse`: role-to-permission matrix.
- `UpdateUserPermissionsRequest`: per-user overrides.
- `UserPermissionsResponse`: role defaults, overrides, and final effective permissions.

### `model/api/v1/analytics.py`

- Defines response rows for analytics overview.
- KPI cards, weekly bars, scenario conversion, agent performance, email performance, HITL stats, score buckets, LLM usage.

## 7. Authentication and Utility Files

### `core/v1/services/authentication/authentication.py`

Class: `AuthService`

- `hash_password(plain)`:
  - Hashes a plain password using bcrypt.
- `register_user(db, request)`:
  - Checks duplicate email.
  - Hashes password.
  - Inserts user.
  - Creates access token.
- `login_user(db, request)`:
  - Loads user by email.
  - Verifies password with bcrypt.
  - Creates access token.

### `utils/v1/connections.py`

Purpose: DB engine and sessions.

- Lines 8-15: Gets DB URL and SQLite connect args.
- Lines 17-20: Creates async SQLAlchemy engine.
- Lines 22-31: For SQLite, sets WAL mode, normal sync, and busy timeout.
- `SessionLocal`: async session factory.
- `get_db()`: FastAPI dependency that yields and closes a session.
- `create_connections()`: returns a new session.
- `check_connections()`: runs `SELECT 1`.
- `remove_connections()`: disposes engine on shutdown.

### `utils/v1/jwt_utils.py`

Functions:

- `create_access_token(data)`:
  - Copies payload and signs it using JWT secret/algorithm.
- `verify_token(token)`:
  - Decodes JWT.
  - Raises value errors for expired/invalid tokens.
- `load_authenticated_user(token, db)`:
  - Rejects blacklisted token.
  - Decodes token.
  - Loads active user from DB.
  - Parses custom permissions JSON.
  - Returns normalized current-user dict.
- `get_current_user(...)`:
  - FastAPI dependency for normal Bearer auth.
- `get_current_user_for_sse(...)`:
  - Supports either Bearer token or `access_token` query param for EventSource.

### `utils/v1/permissions.py`

Functions:

- `has_permission(user, permission)`:
  - Checks per-user override first.
  - Falls back to role permission matrix.
- `require_permission(permission)`:
  - Returns FastAPI dependency that raises 403 if missing permission.
- `require_any_role(*roles)`:
  - Coarse role-based guard.

### `utils/v1/db_sync.py`

Function: `sync_lead_state(db, lead_id, **fields)`

- Filters out `None` values to avoid accidental null updates.
- Updates only supplied Lead columns.
- Commits the update.
- Logs warning instead of crashing the node if sync fails.

### `utils/v1/errors.py`

Class: `InternalServerException`

- Small custom exception carrying an optional message.
- Handled by `fastapi_application.py`.

## 8. Agent State and Rules

### `core/v1/services/agents/state.py`

Purpose: documents and creates LangGraph workflow state.

- `create_log_entry(title, description, badges)`:
  - Returns a UI timeline row with timestamp.

- `LeadState` class:
  - Dict-like schema documentation for workflow state keys.
  - Covers identity, demographics, survey, scenario, S4, S6/S7, context, intent, scoring, email, HITL, workflow, language, handoff, messages, execution log.

- `create_initial_state(lead_id, thread_id, target_language)`:
  - Builds the starting dict for a new workflow.
  - Sets safe defaults for scores, email counts, workflow status, HITL status, language, and logs.

### `core/v1/services/agents/rules/scenario_rules.py`

Purpose: deterministic scenario classification.

- `SCENARIO_DEFAULTS`:
  - Default name, persona, base score, handoff threshold, cadence, max emails, keigo, and tone for S1-S7.

- `_survey_ans4_is_yes(ans4)`:
  - Normalizes yes-like values from source systems.

- `classify_scenario(...)`:
  - Priority:
    - Consultation request face-to-face -> S6.
    - Web-to-call/seminar -> S7.
    - Registration source markers -> S6/S7.
    - Banner position marker -> S7.
    - ANS3 A/B -> S5 active buyer.
    - ANS3 C + ANS4 yes -> S2 life event.
    - ANS3 C + age >= 35 -> S3.
    - Else -> S1.

- `resolve_keigo_level(age)`:
  - Maps age to Japanese formality tier.

- `get_scenario_config(scenario_id)`:
  - Returns a copy of defaults for a scenario.

### `core/v1/services/agents/rules/scoring_rules.py`

Purpose: rule-based scoring.

- `SCORE_DELTAS`: fixed score deltas per engagement event.
- `calculate_score_delta(event_type)`: returns event delta or 0.
- `evaluate_score_route(score, threshold, edge_band)`:
  - `handoff` if score >= threshold.
  - `edge` if score is close to threshold.
  - `continue` otherwise.
- `classify_dormant_segment(has_website_visits, has_product_views)`:
  - P3 if product viewed.
  - P2 if website visited.
  - P1 otherwise.

## 9. Agent Graph

### `core/v1/services/agents/graph.py`

Purpose: builds and runs the LangGraph workflow.

Important functions:

- `_with_agent_audit(node_id, node_fn, db_session)`:
  - Wraps node execution.
  - Measures latency.
  - Writes `AuditLog` for success/failure.
  - Re-raises node errors after audit.

- `get_checkpointer()`:
  - Chooses persistent checkpoint backend.
  - Uses Postgres saver if Postgres DB is configured.
  - Uses SQLite saver if available.
  - Falls back to `MemorySaver`.

- `prep_g1(state, db)`:
  - Saves content-compliance HITL row.
  - Marks state as pending G1.

- `prep_g2(state, db)`:
  - Saves persona-review HITL row.
  - Used when persona confidence is low.

- `prep_g3(state, db)`:
  - Saves dormant-revival campaign approval row.
  - Used for S4.

- `prep_g4(state, db)`:
  - Saves sales handoff review row.

- `prep_g5(state, db)`:
  - Saves edge-score review row.

- `mark_dormant(state, db)`:
  - Marks workflow dormant.
  - Persists completion.
  - For S4, sets cooldown flag.

- `schedule_cadence_timer(state, db)`:
  - Computes next send time.
  - Inserts `WorkflowTimer`.
  - Marks lead paused.
  - Ends current graph run until timer resumes it.

Router functions:

- `_route_after_classifier(state)`:
  - Suppressed -> end.
  - Low confidence -> G2.
  - Else -> A3 intent.

- `_route_after_g2(state)`:
  - Always continues to A3 after human review.

- `_route_after_intent(state)`:
  - After send/event -> scoring.
  - S6/S7 special direct-handoff behavior.
  - Default -> content strategy.

- `_route_after_scoring(state)`:
  - Consultation booked or score above threshold -> sales handoff.
  - Edge band -> G5.
  - Max emails -> dormant.
  - Else -> cadence timer or immediate loop.

- `_route_after_handoff(state)`:
  - Always goes to G4.

- `_route_after_g1(state)`:
  - Rejected -> A4 regenerate.
  - Approved/edited -> send.

- `_route_after_send(state)`:
  - Failed/paused/suppressed/deferred -> end.
  - Else -> intent and scoring.

- `_route_after_g5(state)`:
  - Hold -> cadence/dormant.
  - Otherwise -> sales handoff.

- `_route_after_g4(state)`:
  - Hold -> possibly continue nurture.
  - Approved -> end after handoff.

- `build_graph(db_session, checkpointer)`:
  - Creates LangGraph `StateGraph(dict)`.
  - Binds DB and LLM into nodes.
  - Registers agent nodes, prep nodes, and pause nodes.
  - Adds fixed and conditional edges.
  - Compiles graph with a checkpointer.

- `patch_checkpoint_state(graph, config, state_patch)`:
  - Loads current checkpoint state.
  - Merges patch into it.
  - Saves patched state.

- `start_workflow(lead_id, target_language, db_session, scenario, batch_id)`:
  - Creates new thread id.
  - Creates initial state.
  - Saves thread id on Lead.
  - Publishes workflow started event.
  - Builds graph and invokes it.

- `resume_workflow(thread_id, resume_value, state_patch, db_session)`:
  - Rebuilds graph with same checkpointer.
  - Optionally patches state.
  - Resumes from LangGraph interrupt.

- `jump_to_node(thread_id, node_name, state_patch, db_session)`:
  - Used by timers to resume a workflow at a specific node.

## 10. Agent Nodes

### `nodes/identity_unifier.py`

Function: `identity_unifier(state, db)`

- Loads Lead by id.
- If missing, marks workflow failed.
- Copies lead demographics, survey, source, score, opt-in, and email flags into state.
- Loads Quote and ConsultationRequest.
- Copies consultation memo and request fields.
- Loads latest campaign id from EmailEvent.
- Builds `context_block` for LLM prompts.
- Persists thread/current node/workflow status.
- Publishes SSE and execution log entries.

### `nodes/persona_classifier.py`

Function: `persona_classifier(state, db)`

- Publishes A2 start event.
- If opt-in/suppression flag is true, marks workflow suppressed and returns.
- If `scenario_locked` exists, keeps it.
- Otherwise calls `classify_scenario`.
- Loads default scenario config.
- Optionally merges DB `ScenarioConfig`.
- Resolves keigo level.
- Computes confidence.
- Writes scenario, persona, score floor, threshold, cadence, max emails.
- Flags G2 when confidence is below threshold.
- Persists lead state and logs completion.

### `nodes/intent_analyser.py`

Function: `intent_analyser(state, llm, db)`

- Builds prompt from scenario, persona, age, gender, score, email number, context, memo.
- If LLM exists, calls it and parses JSON.
- Stores `intent_summary`, `urgency`, and `product_interest`.
- If LLM is missing or fails, uses fallback values.
- Syncs current node and logs completion.

### `nodes/content_strategist.py`

Function: `content_strategist(state, db)`

- Determines next email number.
- Handles G1 rejection by forcing LLM rewrite without incrementing email number.
- Applies S5 default product interest for later emails.
- Re-segments S4 dormant revival into P1/P2/P3 after email 1.
- For first email:
  - S6/S7 always use LLM.
  - S1-S5 try approved template lookup.
  - If usable template found, fills draft subject/body.
  - If not, switches to LLM generation.
- For later emails:
  - Uses LLM generation.
  - May load template style reference for layout guidance.
- Syncs current node and publishes execution log.

### `nodes/generative_writer.py`

Function: `generative_writer(state, llm, db)`

- If `content_type` is `existing_asset`, passes through A4 draft unchanged.
- If LLM path:
  - Builds writer system/user prompts.
  - Calls LLM.
  - Expects JSON with `subject`, `body`, and `compliance_checklist`.
  - Stores draft subject/body and reviewer notes.
- If LLM is required but missing, raises runtime error.
- Syncs current node and logs completion.

### `nodes/send_engine.py`

Helper functions:

- `_quiet_start_hour()`: reads configured quiet start hour.
- `_quiet_end_hour()`: reads configured quiet end hour.
- `_is_quiet_hours()`: checks current JST time against quiet window.
- `_next_quiet_end_utc()`: computes UTC time when sending may resume.

Main function: `send_engine(state, db)`

- Re-checks opt-in/suppression.
- Fails if recipient email is missing.
- If quiet hours:
  - Creates held `EmailOutbox`.
  - Creates `WorkflowTimer`.
  - Marks lead paused.
  - Ends current run.
- Otherwise:
  - Creates `Communication`.
  - Creates or updates `EmailOutbox`.
  - Creates `EmailEvent` for `email_sent`.
  - Increments lead sent count.
  - Clears HITL flags.
  - Sets `post_send_route=True` so the graph scores next.

### `nodes/propensity_scorer.py`

Function: `propensity_scorer(state, db)`

- If the run came from external event tracking, avoids double-counting email send.
- Otherwise, if email number > 0, applies `email_sent` delta.
- Clears routing flags.
- Persists engagement score.
- Logs route hint: handoff, edge, or continue.

### `nodes/sales_handoff.py`

Function: `sales_handoff(state, llm, db)`

- Builds sales-advisor briefing.
- If LLM exists, uses A9 briefing prompt and parses JSON.
- If LLM fails/missing, uses plain fallback briefing.
- Sets `hitl_gate=G4`, `hitl_status=pending`.
- Syncs current node and logs G4 pending.

### `nodes/dormancy_agent.py`

Helper: `_to_utc(dt)`

- Normalizes timestamps for dormancy comparison.

Function: `dormancy_agent(state, db)`

- Runs S4 dormant revival eligibility.
- Loads Lead.
- Suppresses if consultation exists.
- Suppresses if opted out or cooldown is active.
- Checks 180-day dormancy based on `last_active_at` or `commit_time`.
- Copies DB scores into state.
- Assigns or preserves revival segment P1/P2/P3.
- Locks scenario to S4.
- Sets G3 campaign approval pending.
- Syncs lead and logs completion.

### `nodes/hitl_gates.py`

Function: `persist_hitl_record(state, gate_type, description, db)`

- Validates optional batch id.
- Creates a `HITLQueue` row.
- Copies draft, persona, campaign, and handoff fields from state.
- Commits row.
- Publishes `hitl_required` SSE event.

Gate helpers:

- `should_fire_g1(state)`: always true when called.
- `should_fire_g2(state)`: true when persona confidence is below 0.60.
- `should_fire_g3(state)`: true for S4.
- `should_fire_g4(state)`: always true when called.
- `should_fire_g5(state)`: true when score is within 0.10 below threshold.

## 11. Prompt Files

### `prompts/intent.py`

Purpose: A3 intent extraction prompt.

- Module docstring: explains intent analyzer goal.
- `A3_INTENT_SYSTEM`:
  - Tells model it is a MetLife Japan intent engine.
  - Lists evidence to consider: opens, clicks, MEMO, consultation requests, website behavior.
  - Requires JSON with urgency, product interest, pain points, topics, and summary.
- `A3_INTENT_USER`:
  - Injects scenario, persona, age, gender, score, email number, context block, memo.

### `prompts/writer.py`

Purpose: A5 email writing prompt.

- Module docstring: explains it generates subject/body respecting scenario tone and language.
- `A4A5_WRITER_SYSTEM`:
  - Sets role as MetLife Japan email strategist/writer.
  - Injects language, keigo, tone, scenario, email number, max emails, product focus, template style.
  - Requires brand-safe, CTA-oriented, unsubscribe-compliant email.
  - Requires JSON with subject, body, themes, CTA text, compliance checklist.
- `A4A5_WRITER_USER`:
  - Injects lead name, age, scenario, intent summary, pain points, previous topics.

### `prompts/briefing.py`

Purpose: A9 sales handoff briefing prompt.

- Lines 1-6: Docstring says this creates advisor briefing when a lead is escalated.
- `A9_BRIEFING_SYSTEM`:
  - Tells model it is a sales intelligence engine.
  - Requires actionable briefing for advisor.
  - Lists sections: lead summary, timeline, product interest, talking points, objections, cultural notes.
  - Injects output language.
  - Requires JSON with briefing summary, talking points, objections, recommended product, cultural notes, priority.
- `A9_BRIEFING_USER`:
  - Injects lead profile, scenario, persona, score, emails sent, intent summary, memo, and context block.

## 12. API Route Files

### `core/v1/api/authentication/authentication.py`

Endpoints:

- `POST /auth/register` -> `register()`:
  - Calls `AuthService.register_user`.
  - Returns token wrapper.
  - Converts duplicate email to 400.

- `POST /auth/login` -> `login()`:
  - Calls `AuthService.login_user`.
  - Returns token wrapper.
  - Converts invalid credentials to 401.

- `GET /auth/me` -> `get_me()`:
  - Returns current user from JWT dependency.

- `POST /auth/logout` -> `logout()`:
  - Inserts token into `blacklisted_tokens`.
  - Future calls with same JWT are rejected.

### `core/v1/api/leads/leads_api.py`

Endpoints:

- `GET /leads` -> `get_all_leads()`:
  - Selects all leads ordered by update time.
  - Maps DB rows into `LeadSummaryResponse`.

- `GET /leads/{lead_id}/detail` -> `get_lead_detail()`:
  - Loads Lead.
  - If thread exists, loads LangGraph checkpoint state for AI insights.
  - Loads communication history.
  - Returns combined DB + workflow + communication response.

### `core/v1/api/dashboard/dashboard_api.py`

Endpoint:

- `GET /dashboard/stats` -> `get_dashboard_stats()`:
  - Counts leads by workflow status.
  - Counts active leads by current agent node.
  - Counts scenario distribution.
  - Counts pending HITL rows.
  - Returns dashboard summary.

### `core/v1/api/templates/email_templates_api.py`

Helpers:

- `_to_summary(t)`: converts ORM template to list response.
- `_to_response(t)`: converts ORM template to full response.

Endpoints:

- `GET /templates`: list templates with scenario/language/active filters.
- `GET /templates/scenario/{scenario_id}`: list active templates for one scenario.
- `GET /templates/{template_id}`: full template detail.
- `POST /templates`: create template.
- `PATCH /templates/{template_id}`: update metadata or active flag.

### `core/v1/api/admin/admin_api.py`

Helpers:

- `_load_overrides(user)`: parses custom permission JSON.
- `_effective_permissions(user)`: merges role defaults and overrides.
- `_resolve_permissions(role)`: returns role default permission flags.
- `_user_to_row(user)`: maps DB user to UI permission row.

Endpoints:

- `GET /admin/users`: list users and role summary.
- `POST /admin/users`: create user with hashed password.
- `GET /admin/users/{user_id}`: return one user.
- `PATCH /admin/users/{user_id}`: update user fields.
- `DELETE /admin/users/{user_id}`: deactivate user.
- `GET /admin/users/permissions/matrix`: return global permission matrix.
- `GET /admin/users/{user_id}/permissions`: return defaults, overrides, effective permissions.
- `PATCH /admin/users/{user_id}/permissions`: update per-user overrides.

### `core/v1/api/agents/hitl_api.py`

Helper:

- `_g1_checkpoint_patch(request)`:
  - Builds state patch for edited G1 content.

Endpoints:

- `GET /hitl/queue`: returns pending/filtered HITL queue.
- `GET /hitl/{hitl_id}`: returns detailed review payload.
- `GET /hitl/handoffs`: lists sales handoff rows.
- `POST /hitl/handoffs/{handoff_id}/assign`: assigns advisor.
- `POST /hitl/handoffs/{handoff_id}/complete`: marks handoff completed.
- `POST /hitl/{hitl_id}/approve`: approves/edits/rejects/holds a gate and resumes workflow.

### `core/v1/api/agents/sse_api.py`

Endpoints:

- `GET /sse/stream` -> `sse_stream()`:
  - Authenticates SSE request.
  - Subscribes to `EventManager`.
  - Reads `Last-Event-ID`.
  - Streams missed and live events.

- `GET /sse/recent` -> `get_recent_events()`:
  - Returns recent in-memory events for debugging/admin UI.

### `core/v1/api/agents/agent_api.py`

This is the largest orchestration API file.

Functions/endpoints:

- `_is_valid_phone(phone)`:
  - Minimal phone validation helper for intake.

- `POST /agents/start` -> `start_agent_workflow()`:
  - Starts a workflow for one lead.
  - Requires start/run permission.
  - Returns initial workflow response.

- `POST /agents/resume` -> `resume_agent_workflow()`:
  - Resumes an interrupted workflow by thread id.

- `POST /agents/{thread_id}/resume` -> `retry_resume_workflow()`:
  - Retry-friendly resume endpoint.

- `POST /agents/intake/quote` -> `intake_quote()`:
  - Creates/updates Lead and Quote from quote payload.
  - Optionally starts workflow.

- `POST /agents/intake/consultation` -> `intake_consultation()`:
  - Creates lead and consultation request.
  - Routes into S6/S7-style workflow.

- `POST /agents/intake/seminar` -> `intake_seminar()`:
  - Specialized seminar intake wrapper.

- `POST /agents/track/click` -> `track_internal_click()`:
  - Records simplified internal click signal.

- `GET /agents/scenarios/config` -> `list_scenario_config()`:
  - Lists dynamic scenario config rows.

- `PATCH /agents/scenarios/config/{scenario_id}` -> `update_scenario_config()`:
  - Updates score/cadence/tone settings.

- `GET /agents/{thread_id}/status` -> `get_workflow_status()`:
  - Reads current workflow status by thread.

- `GET /agents/{thread_id}/history` -> `get_workflow_history()`:
  - Reads checkpoint execution log.

- `POST /agents/batch/run` -> `run_batch_orchestrator()`:
  - Selects new and dormant leads.
  - Creates `BatchRun`.
  - Starts workflows.
  - Updates batch success/failure counters.
  - Publishes batch progress SSE events.

- `GET /agents/batch/latest` -> `get_latest_batch()`:
  - Returns most recent batch progress.

- `GET /agents/batch/{batch_id}` -> `get_batch_status()`:
  - Returns one batch run status.

- `_batch_to_response(batch)`:
  - Converts DB `BatchRun` to API response.

- `_payload_value(payload, key)`:
  - Extracts compact timer payload values.

- `POST /agents/timers/process-due` -> `process_due_workflow_timers()`:
  - Finds due timers.
  - Marks them processing.
  - Resumes workflow at the correct node.
  - Completes or fails timer rows.

- `_open_event_driven_handoff_if_ready(...)`:
  - Creates handoff when event score makes lead hot enough.

- `POST /agents/events/track` -> `track_engagement_event()`:
  - Records open/click/etc.
  - Applies score delta.
  - Updates lead last activity.
  - May resume or hand off workflow depending on new score.

- `GET /agents/state/{thread_id}` -> `get_workflow_state()`:
  - Reads LangGraph checkpoint and returns inspectable state.

### `core/v1/api/analytics/analytics_api.py`

Helper functions:

- `_parse_range(range_key)`: converts range key into start date and label.
- `_prev_window_start(start, range_key)`: previous comparison window.
- `_count_converted_leads(...)`: converted count after start.
- `_count_converted_in_cohort(...)`: converted count among period cohort.
- `_count_leads_in_cohort(...)`: total leads in period cohort.
- `_conversion_rate_pair(...)`: current and previous conversion rates.
- `_avg_engagement_converted(...)`: average score of converted leads.
- `_hitl_review_minutes_avg(...)`: average review duration.
- `_email_rates(...)`: open/click/bounce style metrics.
- `_avg_days_to_convert(...)`: time from creation to conversion.
- `_weekly_progression(...)`: weekly new/engaged/converted bars.
- `_scenario_conversion(...)`: conversion by scenario.
- `_distinct_comm_leads(...)`: unique leads with communications.
- `_distinct_event_leads(...)`: unique leads with events.
- `_hitl_gate_rows(...)`: HITL gate statistics.
- `_score_distribution(...)`: score buckets.
- `_top_emails(...)`: top-performing emails.

Endpoint:

- `GET /analytics/overview` -> `get_analytics_overview()`:
  - Builds all analytics sections and returns one dashboard payload.

## 13. SSE Service

### `core/v1/services/sse/manager.py`

Class: `EventManager`

- Holds in-memory subscriber queues.
- Holds rolling event buffer.
- Syncs event id counter from DB.
- Publishes to live subscribers.
- Persists every event to `sse_events`.
- Replays missed events after reconnect.

Important methods:

- `_sync_counter()`: initializes counter from max DB event id.
- `subscribe()`: adds a new subscriber queue.
- `unsubscribe(queue)`: removes disconnected client.
- `publish(event)`: assigns id/timestamp, buffers, broadcasts, persists.
- `_persist(event)`: writes event to DB asynchronously.
- `_format(event)`: converts dict to SSE frame.
- `stream(queue, last_event_id)`: yields replay and live events.
- `_replay_from_db(last_event_id)`: DB fallback replay.
- `recent_events(n)`: returns latest buffered events.

Helper event factories:

- `node_transition_event(...)`
- `hitl_required_event(...)`
- `hitl_resolved_event(...)`
- `workflow_state_event(...)`
- `batch_progress_event(...)`
- `lead_converted_event(...)`

Global:

- `event_manager = EventManager()`: shared hub imported across app.

## 14. Seed Scripts

### `scripts/seed_users.py`

- `SEED_USERS`: fixed demo users by role.
- `seed_users()`:
  - Skips existing emails.
  - Hashes passwords.
  - Inserts active verified users.
- `main()`:
  - Runs async seeding from command line.

### `scripts/seed_database.py`

Helpers:

- `_consolidated_dir()`: finds consolidated Excel folder.
- `_str_val`, `_bool_val`, `_dt_val`: normalize messy Excel values.
- `_truncate`: safely trims text.
- `_norm_gender`: normalizes gender codes.
- `_age_from_dob`: computes age from date of birth.
- `_purge_consolidated_xlsx_leads`: deletes prior imported demo leads.
- `_seed_consolidated_workbooks`: imports quote, consultation, seminar, and campaign history workbooks.

Main functions:

- `seed_database()`:
  - Clears previous demo/import rows.
  - Seeds S1-S7 scenario config.
  - Imports consolidated Excel data if available.
- `main()`:
  - Runs the async seed.

### `scripts/seed_email_templates.py`

Helpers:

- `_load_html_from_eml(path)`: parses HTML body from `.eml`.
- `_load_html_from_msg(path)`: parses `.msg` using `extract-msg`.
- `_load_html(rel_path)`: chooses parser based on extension.
- `_fallback_html(...)`: creates inline fallback HTML.

Main functions:

- `seed(session)`:
  - Iterates template catalogue.
  - Skips existing template names.
  - Inserts active `EmailTemplate` rows.
- `main()`:
  - Opens DB session and runs seed.

## 15. End-To-End Flow Script

Use this exact explanation in front of the tech team:

1. The backend starts in `fastapi_application.py`, loads config, connects DB, mounts routers, and starts a timer processor.
2. Leads are stored in `leads`, quote data in `quotes`, and direct consultation data in `consultation_requests`.
3. A workflow starts through `/agents/start` or batch `/agents/batch/run`.
4. `graph.py` creates a LangGraph state machine and checkpoint thread.
5. A1 loads identity and builds lead context.
6. A2 classifies scenario and persona using deterministic rules plus DB scenario config.
7. If confidence is low, G2 pauses for human persona review.
8. A3 extracts intent using LLM JSON, or fallback logic if LLM is unavailable.
9. A4 decides template vs LLM content.
10. A5 generates the email draft if needed.
11. G1 pauses for compliance review before sending.
12. A6 sends immediately or holds during quiet hours using `email_outbox` and `workflow_timers`.
13. After send or engagement events, A8 updates score.
14. Score routing decides continue nurture, G5 edge review, sales handoff, or dormant.
15. A9 creates advisor briefing and G4 pauses for sales handoff approval.
16. SSE events keep the frontend updated live throughout the process.
17. Audit logs, communications, events, outbox rows, HITL rows, timers, and batch rows make the full workflow traceable.

## 16. Deep Line-By-Line: `core/v1/services/agents`

This section is the detailed explanation for the agent service folder. Use this when you need to explain line numbers directly, for example: "Lines 1-3 define the docstring, lines 8-14 import the dependencies, and line 17 defines the helper function."

Folder covered:

```text
core/v1/services/agents/
  graph.py
  state.py
  nodes/
    identity_unifier.py
    persona_classifier.py
    intent_analyser.py
    content_strategist.py
    generative_writer.py
    send_engine.py
    propensity_scorer.py
    sales_handoff.py
    dormancy_agent.py
    hitl_gates.py
  rules/
    scenario_rules.py
    scoring_rules.py
```

### How To Explain This Folder

Say:

> The `agents` service folder is the orchestration layer. `state.py` defines what the workflow remembers, `rules/` holds deterministic business logic, `nodes/` holds the individual agent steps, and `graph.py` connects everything into a resumable LangGraph workflow.

Short map:

| Area | Meaning |
|---|---|
| `state.py` | Workflow memory and default state |
| `rules/scenario_rules.py` | S1-S7 scenario routing defaults |
| `rules/scoring_rules.py` | Engagement score deltas and handoff routing |
| `nodes/*.py` | Agent steps A1, A2, A3, A4, A5, A6, A8, A9, A10 |
| `graph.py` | LangGraph wiring, HITL pause/resume, timers, edges |

Agent names:

| Agent | File | Responsibility |
|---|---|---|
| A1 | `identity_unifier.py` | Load DB data and build context |
| A2 | `persona_classifier.py` | Scenario/persona/scoring defaults |
| A3 | `intent_analyser.py` | LLM/fallback intent extraction |
| A4 | `content_strategist.py` | Template vs generated content strategy |
| A5 | `generative_writer.py` | Final email draft |
| A6 | `send_engine.py` | Send/hold email and persist history |
| A8 | `propensity_scorer.py` | Score update |
| A9 | `sales_handoff.py` | Advisor briefing |
| A10 | `dormancy_agent.py` | S4 revival eligibility and P1/P2/P3 |
| A11 | `graph.py` | Cadence timer |

### `state.py` Line-By-Line

Purpose:

> `state.py` defines the memory object carried through LangGraph. Every node reads and writes this state.

- Lines 1-6: Module docstring. It explains that this file defines workflow memory and that fields are checkpointed.
- Line 8: Enables future-style annotations.
- Line 10: Imports `Annotated` and `Optional` for state typing.
- Line 11: Imports `operator`; used for append-style list reducer.
- Line 12: Imports `datetime` for log timestamps.
- Line 14: Imports LangGraph `add_messages` reducer.

`create_log_entry`:

- Line 17: Defines `create_log_entry(title, description, badges)`.
- Line 18: Docstring says it appends a UI log row.
- Lines 19-24: Returns a dict with title, description, badges, and UTC timestamp.

`LeadState`:

- Line 27: Section comment for state definition.
- Line 28: Defines `LeadState(dict)`.
- Lines 29-34: Docstring explains it is the central state container.
- Lines 36-38: Identity fields: `lead_id`, `thread_id`.
- Lines 40-53: Demographics filled by A1: name, email, phone, age, gender, source fields, session id.
- Lines 55-59: Survey fields: `ans3`, `ans4`, `ans5`, `opt_in`.
- Lines 61-67: Scenario/persona fields set by A2.
- Lines 69-71: S4 revival fields: `revival_segment`, `cooldown_flag`.
- Lines 73-81: S6/S7 consultation fields: memo, request id, location, campaign code.
- Lines 83-84: `context_block`, assembled by A1 for prompts.
- Lines 86-89: Intent fields filled by A3.
- Lines 91-94: Score fields: base score, engagement score, threshold.
- Lines 96-103: Email fields: draft subject/body, content type, template name, email number, max emails.
- Lines 105-111: HITL fields: gate, status, reviewer notes, resume decision.
- Lines 113-120: Workflow and language fields.
- Lines 122-123: Sales handoff briefing field.
- Lines 125-129: Message and execution log reducer annotations.

`create_initial_state`:

- Lines 133-137: Function signature. It receives `lead_id`, `thread_id`, and language.
- Line 138: Docstring.
- Lines 139-217: Returns the initial state dict.
- Lines 140-141: Identity defaults.
- Lines 142-155: Demographic defaults.
- Lines 156-160: Survey defaults.
- Lines 161-167: Scenario/persona defaults.
- Lines 168-170: S4 defaults.
- Lines 171-180: S6/S7 consultation defaults.
- Lines 181-186: Context and intent defaults.
- Lines 187-190: Score defaults.
- Lines 191-198: Email defaults.
- Lines 199-203: HITL defaults.
- Lines 204-208: Workflow defaults.
- Lines 209-212: Language and handoff defaults.
- Lines 213-216: Empty logs/messages.

What to say:

> This file prevents missing-key errors. Every workflow starts with a predictable state shape.

### `rules/scenario_rules.py` Line-By-Line

Purpose:

> This file deterministically decides S1-S7 and stores default scenario behavior. No LLM is used here.

- Lines 1-6: Docstring explaining deterministic scenario routing.
- Line 8: Future annotations.
- Line 10: Optional typing.
- Line 12: Imports `api_config` so cadence days come from environment/config.

`SCENARIO_DEFAULTS`:

- Lines 15-16: Starts the scenario defaults dictionary.
- Lines 17-26: S1 Young Professional:
  - persona F-1, base 0.40, threshold 0.80, max 5 emails, casual tone.
- Lines 27-36: S2 Life Event:
  - persona E, base 0.45, threshold 0.80, empathetic tone.
- Lines 37-46: S3 Senior Citizen:
  - persona F-2, base 0.35, formal tone, keigo refined by age.
- Lines 47-56: S4 Dormant Revival:
  - base 0.30, threshold 0.90, max 2 emails, revival/check-in tone.
- Lines 57-66: S5 Active Buyer:
  - base 0.60, threshold 0.80, direct tone.
- Lines 67-76: S6 F2F Consultation:
  - base 0.85, threshold 0.85, max 1 email, cadence 0.
- Lines 77-86: S7 Web-to-Call:
  - base 0.88, threshold 0.85, max 1 email, cadence 0.
- Line 87: Ends defaults dictionary.

`_survey_ans4_is_yes`:

- Lines 90-94: Function and docstring.
- Lines 95-96: Missing answer returns false.
- Line 97: Normalizes answer to uppercase string.
- Lines 98-99: Empty answer returns false.
- Lines 100-110: Accepts yes variants like YES, Y, TRUE, 1, ON, X, and Japanese yes values.

`classify_scenario`:

- Lines 113-122: Function signature. Inputs are survey answers, age, source, banner code, and consultation request type.
- Lines 123-135: Docstring explains priority order.
- Lines 136-142: Consultation request type overrides normal survey logic:
  - `face_to_face` -> S6.
  - `web_to_call` -> S7.
  - `seminar` -> S7.
- Lines 144-148: Registration source can force S6/S7.
- Lines 150-153: Banner-code marker can force S7.
- Lines 155-157: ANS3 A/B -> S5 active buyer.
- Lines 159-166: ANS3 C path:
  - ANS4 yes -> S2.
  - Age >= 35 -> S3.
  - Otherwise -> S1.
- Lines 168-169: Fallback S1.

`resolve_keigo_level`:

- Lines 172-179: Function and docstring.
- Lines 180-181: Missing age -> casual.
- Lines 182-183: Age 65+ -> most respectful.
- Lines 184-185: Age 55-64 -> respectful.
- Lines 186-187: Age 35-54 -> polite.
- Line 188: Under 35 -> casual.

`get_scenario_config`:

- Lines 191-193: Returns a copy of scenario defaults, falling back to S1.

### `rules/scoring_rules.py` Line-By-Line

Purpose:

> This file defines fixed score increments and route labels for scoring.

- Lines 1-7: Docstring explaining rule-based scoring and possible future ML replacement.
- Line 9: Future annotations.
- Lines 12-25: `SCORE_DELTAS` dictionary.
- Line 14: Email sent gives +0.05.
- Line 15: Email delivered gives +0.02.
- Line 16: Email opened gives +0.10.
- Line 17: Email clicked gives +0.15.
- Line 18: Consultation page visit gives +0.40.
- Line 19: Consultation booked gives +0.50.
- Lines 20-24: Other event signals.

Functions:

- Lines 28-30: `calculate_score_delta(event_type)` returns matching delta or 0.
- Lines 33-37: `evaluate_score_route` signature.
- Lines 38-44: Docstring explaining `handoff`, `edge`, `continue`.
- Lines 45-46: Score >= threshold returns `handoff`.
- Lines 47-48: Score within edge band returns `edge`.
- Line 49: Otherwise returns `continue`.
- Lines 52-66: `classify_dormant_segment`.
- Lines 62-63: Product views -> P3.
- Lines 64-65: Website visits -> P2.
- Line 66: Otherwise P1.

### `nodes/identity_unifier.py` - A1 Line-By-Line

Purpose:

> A1 loads lead data and builds a single context block for later agents.

- Lines 1-6: Docstring says this is A1 Identity & Signal Unifier and no LLM is used.
- Lines 8-14: Imports future annotations, logging, timing, SQLAlchemy select, and async session type.
- Lines 16-19: Imports DB models: Lead, Quote, ConsultationRequest, EmailEvent.
- Lines 20-22: Imports SSE, execution log helper, and DB sync helper.
- Line 24: Logger.
- Line 26: `NODE_ID = "A1_Identity"`.

Function `identity_unifier`:

- Lines 29-30: Function definition and docstring.
- Line 31: Reads `lead_id` from state.
- Lines 32-36: Publishes SSE event that A1 started.
- Line 37: Starts latency timer.
- Lines 39-41: Queries Lead by id.
- Lines 43-53: If Lead not found, publish failed event and return failed state.
- Lines 55-73: Copies lead demographics, source fields, survey answers, opt-in, and email availability into state.
- Lines 75-82: Preserves higher DB engagement score so scoring starts from real baseline.
- Lines 84-86: Loads Quote.
- Lines 88-92: Loads ConsultationRequest.
- Lines 93-104: If consultation exists, copies memo/request/location/campaign fields.
- Lines 105-111: If no consultation, clears those fields.
- Lines 113-121: Loads latest non-null campaign id from EmailEvent.
- Lines 123-134: Builds context parts from lead profile.
- Lines 135-138: Adds mail-delivery flag and session id.
- Lines 139-145: Adds quote information.
- Lines 146-157: Adds consultation memo/request/location/campaign/status.
- Lines 158-159: Adds latest engagement campaign.
- Line 161: Joins context parts into `context_block`.
- Line 162: Sets current node.
- Lines 165-172: Syncs thread id/current node/status to Lead table.
- Lines 174-184: Logs and publishes completed SSE.
- Lines 185-196: Creates UI execution log.
- Line 198: Returns state.

### `nodes/persona_classifier.py` - A2 Line-By-Line

Purpose:

> A2 decides scenario, persona, keigo level, base score, handoff threshold, max emails, and whether G2 review is needed.

- Lines 1-6: Docstring. It says rules first and mentions fallback. In the current code, low confidence triggers G2; this file does not call an LLM.
- Lines 8-14: Imports annotations, logging, time, datetime/timezone, SQLAlchemy select.
- Lines 16-24: Imports ScenarioConfig, scenario rules, SSE, log helper, DB sync.
- Line 26: Logger.
- Line 28: `NODE_ID = "A2_Persona"`.
- Lines 30-31: G2 threshold is 0.60.

Function `persona_classifier`:

- Lines 34-42: Function start, lead id, started SSE, timer.
- Lines 44-73: Opt-in/suppression check. If `opt_in` true, mark suppressed, sync DB, publish SSE, log, and return.
- Lines 75-80: If `scenario_locked` exists, preserve it.
- Lines 82-90: Otherwise call `classify_scenario`.
- Line 92: Load default config.
- Lines 93-109: If active DB ScenarioConfig exists, override default config.
- Line 110: Resolve keigo from age.
- Lines 112-123: Calculate confidence:
  - S6/S7 -> 0.40.
  - survey + age -> 0.92.
  - one signal -> 0.70.
  - weak signal -> 0.40.
- Lines 125-137: Write scenario/persona/confidence/keigo/score/threshold/max emails/current node.
- Lines 139-155: If S2, set life event fields.
- Lines 157-158: If S5, set active buyer.
- Lines 160-162: If confidence below threshold, mark G2 pending.
- Lines 164-177: Sync Lead row.
- Lines 179-195: Log and publish completed SSE.
- Lines 196-212: Create execution logs.
- Line 214: Return state.

### `nodes/intent_analyser.py` - A3 Line-By-Line

Purpose:

> A3 extracts structured intent: summary, urgency, and product interest.

- Lines 1-6: Docstring explaining A3 intent analyzer.
- Lines 8-18: Imports JSON, logging, time, prompts, SSE, log helper, LangChain messages, DB sync.
- Line 20: Logger.
- Line 22: `NODE_ID = "A3_Intent"`.

Function `intent_analyser`:

- Lines 25-31: Function signature and docstring.
- Line 32: Reads lead id.
- Lines 33-37: Publishes started SSE.
- Line 38: Starts timer.
- Lines 40-50: Builds A3 user prompt from state fields.
- Lines 52-63: If LLM exists, calls LLM and parses JSON.
- Lines 64-68: If LLM fails, log and use default values.
- Lines 69-77: If no LLM, use rule-based fallback.
- Lines 79-83: Set current node and sync Lead row.
- Lines 85-95: Log and publish completed SSE.
- Lines 97-103: Create execution log.
- Line 104: Return state.

### `nodes/content_strategist.py` - A4 Line-By-Line

Purpose:

> A4 decides whether the current email uses an approved template or LLM generation.

- Lines 1-12: Docstring with blueprint rules:
  - S1-S5 email 1 uses template.
  - S6/S7 email 1 uses LLM.
  - emails 2-5 use LLM with optional style reference.
- Lines 14-25: Imports logging/time, SQLAlchemy select, EmailTemplate, S4 segment helper, SSE, log helper, DB sync.
- Line 27: Logger.
- Line 29: `NODE_ID = "A4_ContentStrategy"`.
- Lines 31-32: S6/S7 first email must be LLM-generated.

Function `content_strategist`:

- Lines 40-48: Function start, lead id, started SSE, timer.
- Lines 50-54: Detects G1 rejection.
- Lines 55-60: If rejected, reuse email number; otherwise increment sequence.
- Lines 61-62: Read scenario and language.
- Lines 64-65: S5 later emails default product interest if missing.
- Lines 67-83: S4 later emails re-segment P1/P2/P3 using score delta.
- Lines 85-90: G1 rejection forces LLM rewrite and clears draft.
- Lines 92-98: First email for S6/S7 becomes LLM-generated.
- Lines 99-117: First email for S1-S5 queries EmailTemplate.
- Lines 112-114: S4 filters template by revival segment.
- Lines 118-127: Inline-only template filter.
- Lines 128-139: If template found, set existing asset, subject, body, template name.
- Lines 140-144: If no template, route to LLM generation.
- Lines 146-150: Retry/later emails always LLM-generated.
- Lines 152-170: Load version-matched template as style reference.
- Lines 171-179: Store HTML style reference and template name.
- Lines 181-185: Sync current node.
- Lines 187-203: Log and publish completed SSE.
- Lines 205-215: Execution log.
- Line 217: Return state.

Implementation note:

> In this current file, line 120 references `INLINE_ONLY_TEMPLATE_NAMES`. Make sure that constant exists before demoing a path where a DB template is found.

### `nodes/generative_writer.py` - A5 Line-By-Line

Purpose:

> A5 either passes through approved template content or calls the LLM to write final email JSON.

- Lines 1-6: Docstring.
- Lines 8-21: Imports JSON/logging/time, AsyncSession, writer prompts, scenario defaults, SSE, log helper, DB sync, LangChain messages.
- Line 23: Logger.
- Line 25: `NODE_ID = "A5_Writer"`.

Function `generative_writer`:

- Lines 28-38: Function start, lead id, started SSE, timer.
- Line 40: Reads content type.
- Lines 42-44: Existing asset branch. A4 already created draft, so A5 passes through.
- Lines 45-48: LLM branch starts and loads scenario config.
- Lines 50-61: Builds system prompt with language, keigo, tone, scenario, sequence, product focus, style reference.
- Lines 63-71: Builds user prompt with lead context.
- Lines 73-79: Calls LLM.
- Lines 80-86: Parses JSON and stores subject, body, compliance checklist.
- Lines 87-89: LLM failure raises runtime error.
- Lines 90-91: If LLM required but not configured, raises runtime error.
- Lines 93-101: Sync current node to Lead.
- Lines 103-113: Log and publish completed SSE.
- Lines 115-128: Execution log.
- Line 129: Return state.

### `nodes/send_engine.py` - A6 Line-By-Line

Purpose:

> A6 is the dispatch boundary. It re-checks suppression, enforces quiet hours, records communication, outbox, and email event rows.

- Lines 1-6: Docstring.
- Lines 8-28: Imports logging/time/date, DB models, SSE helpers, log helper, API config.
- Line 30: Logger.
- Line 32: `NODE_ID = "A6_Send"`.
- Lines 34-35: Defines JST timezone.

Helper functions:

- Lines 38-39: `_quiet_start_hour` clamps configured start hour.
- Lines 42-43: `_quiet_end_hour` clamps configured end hour.
- Lines 46-51: `_is_quiet_hours` checks current JST time.
- Lines 54-62: `_next_quiet_end_utc` returns next allowed send time in UTC.

Function `send_engine`:

- Lines 65-73: Function start, lead id, started SSE, timer.
- Lines 75-101: If opt-in/suppressed, mark suppressed and return.
- Lines 103-129: If no email, mark failed and return.
- Lines 131-145: Quiet-hour check and due-time calculation.
- Lines 146-180: If quiet hours, create held EmailOutbox, WorkflowTimer, and mark Lead paused.
- Lines 181-194: Update state and execution log for quiet-hour hold.
- Lines 195-203: Publish paused SSE.
- Lines 205-207: Return if send was deferred.
- Lines 209-217: Read subject/body and log simulated send.
- Lines 219-236: Create Communication record.
- Lines 238-249: Update held outbox to sent if resuming.
- Lines 250-265: Otherwise create sent EmailOutbox record.
- Lines 267-274: Create EmailEvent `email_sent`.
- Lines 276-285: Increment lead email count and commit.
- Lines 287-291: Clear HITL and set `post_send_route=True`.
- Lines 293-305: Publish completed and workflow events.
- Lines 307-313: Execution log.
- Line 314: Return state.

### `nodes/propensity_scorer.py` - A8 Line-By-Line

Purpose:

> A8 updates engagement score. `graph.py` decides where to route after this score.

- Lines 1-6: Docstring.
- Lines 8-18: Imports logging/time, score delta helper, SSE, log helper, DB sync.
- Line 20: Logger.
- Line 22: `NODE_ID = "A8_Scoring"`.

Function `propensity_scorer`:

- Lines 25-33: Start, lead id, started SSE, timer.
- Lines 35-38: Comment and email number.
- Lines 40-41: If event route already changed score, clear flag.
- Lines 42-44: Otherwise add email-sent delta.
- Line 45: Clear post-send route.
- Line 47: Set current node.
- Lines 49-65: Sync engagement score/current node/status.
- Lines 67-76: Log score and threshold.
- Lines 77-85: Publish completed SSE.
- Lines 87-91: Build route hint.
- Lines 92-100: Execution log.
- Line 101: Return state.

### `nodes/sales_handoff.py` - A9 Line-By-Line

Purpose:

> A9 prepares a lead for sales escalation and creates an advisor briefing.

- Lines 1-7: Docstring.
- Lines 9-20: Imports JSON/logging/time, LangChain messages, briefing prompts, scenario defaults, SSE, log helper, DB sync.
- Line 22: Logger.
- Line 24: `NODE_ID = "A9_Handoff"`.

Function `sales_handoff`:

- Lines 27-35: Start, lead id, started SSE, timer.
- Lines 37-39: Load scenario config.
- Lines 40-57: If LLM exists, build system/user prompt.
- Lines 59-67: Call LLM and parse `briefing_summary`.
- Lines 68-74: On LLM failure, create fallback briefing.
- Lines 75-84: If no LLM, create fallback briefing.
- Lines 86-89: Set G4 pending and current node.
- Lines 90-93: Sync current node.
- Lines 95-105: Log and publish completed SSE.
- Lines 107-121: Execution log.
- Line 122: Return state.

### `nodes/dormancy_agent.py` - A10 Line-By-Line

Purpose:

> A10 is the S4 dormant revival authority. It re-checks eligibility and assigns P1/P2/P3.

- Lines 1-23: Docstring explaining S4, 180-day rule, opt-in/cooldown checks, and P1/P2/P3 logic.
- Lines 25-38: Imports logging/time/date, SQLAlchemy select, segment helper, SSE, log helper, DB sync, ConsultationRequest, Lead.
- Line 40: Logger.
- Line 42: `NODE_ID = "A10_Dormancy"`.
- Line 43: `DORMANCY_DAYS = 180`.

Helper:

- Lines 46-51: `_to_utc` normalizes datetimes to UTC.

Function `dormancy_agent`:

- Lines 54-60: Function and docstring.
- Lines 61-67: Lead id, started SSE, timer.
- Line 69: 180-day cutoff.
- Lines 71-75: Comment explaining authoritative re-validation.
- Lines 76-79: Load Lead.
- Lines 80-97: If consultation exists, suppress and return.
- Lines 99-110: If opt-in is true, suppress and return.
- Lines 112-126: If cooldown flag is true, suppress and return.
- Lines 128-153: Check last active or commit time against 180-day cutoff.
- Lines 155-159: Copy DB scores into state.
- Lines 161-167: Preserve existing segment if already P1/P2/P3.
- Lines 169-180: Compute score delta above base score.
- Lines 182-184: Convert delta to website/product-view proxy flags.
- Lines 186-194: Classify P1/P2/P3 and build reason.
- Lines 196-203: Set segment, scenario S4, scenario lock, G3 pending.
- Lines 205-213: Sync Lead row.
- Lines 215-227: Log and publish completed SSE.
- Lines 229-235: Execution log.
- Line 236: Return state.

### `nodes/hitl_gates.py` Line-By-Line

Purpose:

> This file persists human review work into `hitl_queue` and provides gate predicates.

- Lines 1-6: Docstring explaining the five HITL gates.
- Lines 8-17: Imports annotations, logging, uuid, AsyncSession, HITLQueue, SSE HITL event helper.
- Line 18: Logger.

`persist_hitl_record`:

- Lines 21-27: Function signature.
- Line 28: Docstring.
- Lines 29-30: If no DB session, return.
- Lines 32-39: Parse optional batch id safely.
- Lines 40-46: Create HITL row with ids and gate metadata.
- Lines 47-51: Copy G1 content fields.
- Lines 52-54: Copy G4 handoff fields.
- Lines 55-57: Copy G2 persona fields.
- Lines 58-59: Copy G3 campaign/segment field.
- Lines 60-63: Set review status and notes.
- Lines 64-66: Add, commit, log.
- Lines 68-76: Publish SSE event so UI knows review is required.

Gate checkers:

- Lines 82-84: `should_fire_g1`, always true when called.
- Lines 87-89: `should_fire_g2`, true when persona confidence < 0.60.
- Lines 92-94: `should_fire_g3`, true for S4.
- Lines 97-99: `should_fire_g4`, always true when called.
- Lines 102-111: `should_fire_g5`, true when score is within 0.10 below threshold.

### `graph.py` Line-By-Line

Purpose:

> `graph.py` is the orchestration brain. It connects all nodes, HITL gates, timers, checkpointing, and scenario routing.

Top of file:

- Lines 1-14: Module docstring. It summarizes the graph and scenario routing.
- Lines 16-24: Core Python imports.
- Lines 26-27: SQLAlchemy update/session imports.
- Lines 29-31: LangGraph imports: StateGraph, START, END, MemorySaver, interrupt, Command.
- Lines 32-35: DB config and models used by graph-level operations.
- Lines 37-46: Imports A1, A2, A3, A4, A5, A6, A8, A9, A10.
- Lines 47-51: Imports HITL helpers.
- Line 52: Imports score route evaluator.
- Line 53: Imports SSE workflow event helper.
- Line 54: Imports LLM factory.
- Line 55: Imports lead DB sync.
- Lines 57-66: Optional Postgres/SQLite checkpointer imports.
- Line 68: Logger.

`_with_agent_audit`:

- Line 71: Defines audit wrapper factory.
- Lines 72-75: Inner node starts timer and default status.
- Lines 76-81: Runs node; on exception marks failed and re-raises.
- Lines 82-107: Always attempts AuditLog write.
- Lines 85-103: Audit row stores node id, thread id, scenario, latency, error.
- Lines 105-107: Rollback/warn if audit write fails.
- Line 109: Return wrapped node.

`get_checkpointer`:

- Lines 115-125: Async context manager and docstring.
- Lines 126-128: Reads DB URL and Postgres flag.
- Lines 129-144: Try Postgres saver and call `setup()`.
- Lines 145-152: Else use SQLite saver and call `setup()`.
- Lines 154-158: Else use MemorySaver with warning.

HITL prep nodes:

- Lines 164-177: `prep_g1`, content compliance review.
- Lines 180-194: `prep_g2`, persona override review.
- Lines 197-210: `prep_g3`, S4 campaign approval.
- Lines 213-226: `prep_g4`, sales handoff review.
- Lines 229-243: `prep_g5`, edge score decision.

Dormant and timer nodes:

- Lines 246-300: `mark_dormant`.
  - Marks workflow dormant.
  - Sets completion fields.
  - For S4 sets cooldown.
  - Publishes event and log.
- Line 303: `CADENCE_NODE_ID = "A11_CadenceTimer"`.
- Lines 306-362: `schedule_cadence_timer`.
  - Computes JST due time.
  - Inserts WorkflowTimer.
  - Marks Lead paused.
  - Ends the current graph run.

Router functions:

- Lines 368-384: `_route_after_classifier`.
  - Suppressed -> end.
  - Low confidence -> G2.
  - Else -> A3.
- Lines 387-392: `_route_after_g2`.
  - Always resumes into A3.
- Lines 395-425: `_route_after_intent`.
  - After send/event -> A8.
  - S6: first email if email captured, otherwise handoff.
  - S7: no email -> handoff; email exists -> first email then scoring.
  - Default -> A4.
- Lines 428-450: `_route_after_scoring`.
  - Consultation booked -> handoff.
  - Score high -> handoff.
  - Edge band -> G5.
  - Max emails -> dormant.
  - Cadence 0 -> immediate loop.
  - Else -> cadence timer.
- Lines 453-455: `_route_after_handoff`, always G4.
- Lines 458-467: `_route_after_g1`, rejected -> A4, otherwise A6.
- Lines 470-482: `_route_after_send`, deferred/failed/paused/suppressed -> end, otherwise A3.
- Lines 485-499: `_route_after_g5`, hold -> cadence/dormant, else handoff.
- Lines 502-521: `_route_after_g4`, hold may continue nurture; otherwise end.

Graph builder:

- Lines 527-536: `build_graph` signature and docstring.
- Line 537: Creates LLM client once.
- Lines 540-572: Binds DB/LLM into nodes and wraps with audit.
- Lines 574-578: Binds DB into HITL prep nodes.
- Line 580: Creates `StateGraph(dict)`.
- Lines 583-593: Registers agent nodes.
- Lines 596-600: Registers HITL prep nodes.
- Lines 602-625: Defines pause nodes that call `interrupt()`.
- Lines 627-631: Registers pause nodes.
- Lines 637-643: START router: S4 goes to A10, all others go to A1.
- Line 646: A1 -> A2.
- Lines 649-658: A2 conditional route.
- Lines 660-670: G2 route.
- Lines 673-675: A4 -> A5 -> G1.
- Lines 678-682: G1 approved/edited/rejected route.
- Lines 685-698: A6 and A3 routes.
- Lines 701-710: A8 routes.
- Lines 712-715: Cadence and dormant terminate current run.
- Lines 718-727: G5 routes.
- Lines 730-744: A9/G4 routes.
- Lines 749-760: S4 A10 -> G3 -> A1 route.
- Lines 762-770: Compile graph with checkpointer.

Invocation helpers:

- Lines 776-787: `patch_checkpoint_state`.
  - Loads existing checkpoint, merges patch, saves merged state.
- Lines 790-844: `start_workflow`.
  - Creates thread id, initial state, saves thread id, publishes started event, invokes graph.
- Lines 847-885: `resume_workflow`.
  - Rebuilds graph and resumes from HITL interrupt.
- Lines 888-910: `jump_to_node`.
  - Used by timers to resume from a specific node.

Graph implementation note:

> `_route_after_scoring` can return `intent_analyser` when `cadence_days == 0`, but the A8 edge map currently does not include `intent_analyser`. If that branch is hit, add `"intent_analyser": "intent_analyser"` to the A8 conditional edge map.

## 17. Scenario Flow: Full Explanation

### Common Nurture Flow

```text
A1 Identity
-> A2 Persona/Scenario
-> optional G2 Persona Review
-> A3 Intent
-> A4 Content Strategy
-> A5 Writer
-> G1 Compliance Review
-> A6 Send or Quiet-Hour Hold
-> A3 Intent again
-> A8 Scoring
-> cadence / G5 / A9 Sales / Dormant
```

### S1 - Young Professional

Entry:

- ANS3 = C.
- ANS4 is not yes.
- Age under 35 or missing.

Flow:

```text
A1 -> A2(S1) -> A3 -> A4/A5/G1/A6 -> A8
score high -> A9/G4
score edge -> G5
low score -> cadence timer
max emails -> dormant
```

Explain:

> S1 is the normal young professional nurture flow. It starts casual, with base score 0.40 and max 5 emails.

### S2 - Life Event

Entry:

- ANS3 = C.
- ANS4 is yes-like.

Differences:

- A2 sets `life_event_flag=True`.
- A2 derives `life_event_type`.
- Tone is empathetic.
- Base score is 0.45.

Explain:

> S2 follows the same nurture graph but changes message tone because the trigger is emotionally relevant.

### S3 - Senior Citizen

Entry:

- ANS3 = C.
- ANS4 not yes.
- Age >= 35.

Differences:

- A2 resolves keigo level from age.
- Tone is more formal.
- A6 quiet-hour enforcement is especially important.

Explain:

> S3 mostly changes language style and timing safety, not the graph structure.

### S4 - Dormant Revival

Entry:

- Batch process starts workflow with `scenario="S4"`.

Flow:

```text
START -> A10 Dormancy
not eligible -> END
eligible -> G3 Campaign Approval
G3 approved -> A1 -> A2(S4 locked) -> A3 -> A4/A5/G1/A6 -> A8
continue -> S4 response timer
score high -> A9/G4
max 2 emails -> Dormant + cooldown_flag
```

Eligibility:

- Must be dormant for 180 days.
- Must not have consultation request.
- Must not be opted out/suppressed.
- Must not have cooldown flag.

Segments:

- P1: no meaningful engagement.
- P2: some engagement.
- P3: strong intent/product-consult signal.

Explain:

> S4 is special because it starts at A10, not A1. It needs G3 approval before sending revival emails.

### S5 - Active Buyer

Entry:

- ANS3 = A or B.

Differences:

- A2 sets `active_buyer=True`.
- Base score starts at 0.60.
- Tone is direct.
- It can reach handoff faster.

Explain:

> S5 is a hotter lead path because the customer already shows buying intent.

### S6 - Face-To-Face Consultation

Entry:

- Consultation request type `face_to_face`.
- Or source `f2f_form`.

Flow:

```text
A1 -> A2(S6, confidence 0.40) -> G2
G2 approved -> A3
if email captured and email_number=0 -> A4/A5/G1/A6
otherwise -> A9/G4
```

Differences:

- Base score 0.85.
- Threshold 0.85.
- Max emails 1.
- Cadence 0.
- A2 intentionally forces G2 review.

Explain:

> S6 is already high intent. The system reviews it and moves it toward sales quickly.

### S7 - Web-To-Call

Entry:

- Request type `web_to_call` or `seminar`.
- Or source `web_callback`.
- Or banner marker indicates web-to-call.

Flow if email exists:

```text
A1 -> A2(S7) -> G2 -> A3 -> A4/A5/G1/A6 -> A8 -> A9/G4 or END
```

Flow if email missing:

```text
A1 -> A2(S7) -> G2 -> A3 -> A9/G4
```

Explain:

> S7 can skip email entirely. If there is no email address, it directly prepares a sales handoff.

## 18. HITL Gate Flow

| Gate | Trigger | Purpose |
|---|---|---|
| G1 | Before every send | Compliance review of draft email |
| G2 | Persona confidence < 0.60 | Human confirms/overrides persona |
| G3 | S4 revival path | Campaign approval |
| G4 | Sales handoff | Human approves sales escalation |
| G5 | Score edge band | Human decides promote vs nurture |

Pause/resume explanation:

```text
prep_gX writes hitl_queue row
gX_pause calls interrupt()
LangGraph checkpoints full state
reviewer acts in frontend
resume_workflow sends Command(resume=value)
graph continues from that same pause node
```

## 19. Human-Like Explanation Script

Use this section when you want to explain the backend naturally in a meeting.

### Simple Opening

Say:

> I built this backend as an AI-assisted lead engagement system. It is not just one API and one LLM call. It is a full workflow system. A lead comes in, the backend understands who the person is, classifies the lead into a business scenario, decides what communication should happen next, asks a human reviewer when required, sends or schedules the email, tracks engagement, updates the score, and finally decides whether to continue nurturing, move to sales, or mark the lead dormant.

Then say:

> The important part is that every step is traceable. The system stores lead state, email history, HITL reviews, timers, score changes, SSE events, and audit logs in the database.

### Explain The Folder Structure Like A Human

Say:

> I divided the backend into clear layers. The `config` folder controls runtime behavior like database, API settings, JWT, quiet hours, and LLM configuration. The `model/database` folder defines all database tables. The `core/api` folder exposes FastAPI endpoints. The `core/services/agents` folder is the brain of the system. That is where LangGraph connects the AI agents and business rules.

Then:

> So when someone asks where the workflow logic lives, the answer is mainly `core/v1/services/agents/graph.py`. When someone asks what data the workflow carries, that is `state.py`. When someone asks how scenarios are selected, that is `rules/scenario_rules.py`. When someone asks how scoring works, that is `rules/scoring_rules.py`.

### Explain `state.py` Naturally

Say:

> `state.py` is basically the memory of one lead's journey. Every agent reads from this state and writes back into it. For example, A1 writes name, email, quote, and consultation information. A2 writes scenario and persona. A3 writes intent. A4 and A5 write email content. A6 writes send status. A8 writes engagement score. A9 writes sales briefing.

Then:

> The reason this state is important is because LangGraph checkpoints it. So if the workflow pauses for human approval, we do not lose anything. When the human approves, the workflow resumes from the same state.

### Explain `graph.py` Naturally

Say:

> `graph.py` is the traffic controller. The individual agent files do the work, but `graph.py` decides which agent runs next. It also decides where the workflow should pause for HITL review, where it should end, and where it should resume from timers.

Then:

> For example, after A2 classifies the lead, the graph checks persona confidence. If confidence is low, it goes to G2 for human review. If confidence is fine, it goes to A3 intent analysis. After an email is sent, the graph does not immediately send another email. It routes back through A3 and A8 so the score can be updated first.

Then:

> This is why the backend behaves like a controlled business process, not like a random AI chatbot.

### Explain A1 To A10 Naturally

Use this exact flow:

> A1 is the identity unifier. It collects all data about the lead from database tables like `leads`, `quotes`, `consultation_requests`, and `email_events`. Then it creates a readable context block for later LLM prompts.

> A2 is the persona classifier. It uses deterministic rules to decide the scenario, like S1, S2, S3, and so on. It also decides persona, base score, handoff threshold, cadence, max emails, and keigo level.

> A3 is the intent analyser. If the LLM is available, it reads the lead context and returns structured JSON like urgency, product interest, and intent summary. If the LLM is not configured, the backend still works using fallback text.

> A4 is the content strategist. It decides whether the email should come from an approved template or be generated by the LLM. For first emails in S1 to S5, it tries approved templates. For S6 and S7, it uses LLM because those are consultation or call-related flows.

> A5 is the writer. If A4 already selected a template, A5 simply passes it through. If A4 selected LLM generation, A5 calls the model and expects JSON with subject, body, CTA, and compliance checklist.

> A6 is the send engine. It checks opt-in again, checks if the email address exists, checks quiet hours, and then either sends the email or stores it in the outbox with a timer.

> A8 is the propensity scorer. It updates the engagement score using fixed business rules. For example, sent email adds a small score, opened email adds more, clicked email adds more, and consultation booked adds a lot.

> A9 is the sales handoff agent. When a lead becomes hot enough, A9 creates a briefing for a human advisor. That briefing explains who the lead is, what they clicked, what they may want, and how the advisor should approach the conversation.

> A10 is the dormancy agent. It is only for S4 dormant revival. It checks whether a lead has really been inactive for 180 days, whether they are allowed to be contacted, and which revival segment they belong to: P1, P2, or P3.

### Explain HITL Naturally

Say:

> HITL means Human in the Loop. The system does not blindly let AI make every decision. Some steps must be reviewed by a human.

Then explain the gates:

> G1 is content compliance. Every email goes through G1 before sending.

> G2 is persona review. If the classifier is not confident, a human can confirm or override the persona.

> G3 is campaign approval. It is used for S4 dormant revival campaigns.

> G4 is sales handoff approval. Before a lead is moved to sales, a human reviews the briefing.

> G5 is edge-score review. If the score is close to the handoff threshold but not fully there, a human decides whether to promote or continue nurture.

Then:

> Technically, the prep node writes a row into `hitl_queue`, then the pause node calls LangGraph `interrupt()`. That freezes the workflow. When the reviewer acts, `resume_workflow()` continues from the same point.

### Explain Scenario Flow Naturally

#### S1

Say:

> S1 is the young professional nurture flow. These leads are not urgent yet, so they go through normal email nurturing. The system sends approved or generated emails, waits for cadence, scores engagement, and eventually either hands off or marks dormant.

#### S2

Say:

> S2 is life-event based. If the survey suggests something like marriage, child birth, home purchase, or career change, the tone becomes more empathetic. The graph is mostly the same as S1, but the content strategy changes.

#### S3

Say:

> S3 is senior-focused. The key difference is language formality. The system uses age to choose keigo level, and the send engine respects quiet hours carefully.

#### S4

Say:

> S4 is different from the others. It is not selected by the normal questionnaire path. It starts from dormant batch processing. The workflow starts at A10, checks 180-day inactivity, assigns P1/P2/P3, then asks for G3 campaign approval. Only after that does it rejoin the normal flow.

#### S5

Say:

> S5 is active buyer. These leads already showed buying intent, so they start with a higher base score and a more direct tone. They can reach sales handoff faster than S1 or S2.

#### S6

Say:

> S6 is face-to-face consultation. This is already high intent, so the system gives it a high base score and forces human review. If email exists, it can send one pre-consultation email. Otherwise it moves toward sales handoff.

#### S7

Say:

> S7 is web-to-call or seminar. If the lead has an email, the system can send one follow-up email. If no email exists, it skips email and directly prepares the sales handoff.

### Explain Why This Design Is Strong

Say:

> The strength of this backend is that AI is controlled by business rules. The LLM is used where it adds value, like intent analysis, content generation, and briefing generation. But critical decisions like scenario routing, score thresholds, max emails, quiet hours, and human approvals are deterministic and auditable.

Then:

> That means the system is explainable to business teams, safe for compliance, and still flexible enough to personalize communication.

### Short 2-Minute Version

Use this if you have very little time:

> This backend takes MetLife leads and runs them through a LangGraph workflow. A1 loads all lead data. A2 classifies scenario and persona using rules. A3 analyzes intent using LLM or fallback. A4 decides template versus generated content. A5 writes the email. G1 pauses for human compliance review. A6 sends or schedules the email. A8 updates the score. If the score is high, A9 creates a sales briefing and G4 asks for sales approval. If the score is low, the system schedules cadence or eventually marks the lead dormant. S4 dormant revival starts separately at A10 and requires G3 campaign approval. Everything is stored in the database and pushed to the frontend using SSE.

## 20. Ultra Detailed Function Range Explanation: `graph.py` And `nodes/`

This section is written in the exact "function covers lines X-Y" style.

Use it like this in your explanation:

> Now I will explain this file by function. For example, `_with_agent_audit()` starts at line 71 and ends at line 109. Inside that function, lines 72-75 initialize audit tracking, lines 76-81 execute the actual node, and lines 82-107 write the audit log.

### `graph.py` Function Map

| Function / block | Lines | What it does |
|---|---:|---|
| Module docstring | 1-14 | Explains graph purpose and scenario summary |
| Imports and globals | 16-68 | Imports LangGraph, nodes, models, config, logger |
| `_with_agent_audit` | 71-109 | Wraps every node with audit logging |
| `get_checkpointer` | 115-158 | Chooses Postgres, SQLite, or memory checkpointing |
| `prep_g1` | 164-177 | Saves G1 content compliance review |
| `prep_g2` | 180-194 | Saves G2 persona review |
| `prep_g3` | 197-210 | Saves G3 S4 campaign approval |
| `prep_g4` | 213-226 | Saves G4 sales handoff review |
| `prep_g5` | 229-243 | Saves G5 edge score review |
| `mark_dormant` | 246-300 | Completes workflow as Dormant |
| `schedule_cadence_timer` | 306-362 | Creates timer and pauses workflow |
| `_route_after_classifier` | 368-384 | Decides route after A2 |
| `_route_after_g2` | 387-392 | Decides route after G2 resume |
| `_route_after_intent` | 395-425 | Decides route after A3 |
| `_route_after_scoring` | 428-450 | Decides route after A8 |
| `_route_after_handoff` | 453-455 | Sends A9 to G4 |
| `_route_after_g1` | 458-467 | Sends G1 approval to A6 or rejection to A4 |
| `_route_after_send` | 470-482 | Ends paused/failed sends or continues to A3 |
| `_route_after_g5` | 485-499 | Handles G5 promote/hold decision |
| `_route_after_g4` | 502-521 | Handles sales handoff review decision |
| `build_graph` | 527-770 | Registers nodes, edges, HITL pauses, and compiles graph |
| `patch_checkpoint_state` | 776-787 | Safely merges state patch into checkpoint |
| `start_workflow` | 790-844 | Creates thread and starts graph |
| `resume_workflow` | 847-885 | Resumes graph after HITL |
| `jump_to_node` | 888-910 | Resumes graph at a specific node for timers |

### `graph.py` Lines 1-68: Header, Imports, Globals

- Lines 1-5: File docstring says this file compiles the LangGraph workflow and wires nodes, HITL, timers, and checkpointing.
- Lines 7-13: Human-readable scenario summary:
  - S1-S3 and S5 use normal nurture loop.
  - S4 starts at dormancy agent.
  - S6 and S7 have consultation/call-specific behavior.
- Line 16: Future annotations.
- Lines 18-24: Standard Python imports for logging, ids, JSON, timing, partial function binding, dates, and async context manager.
- Lines 26-27: SQLAlchemy update and async session imports.
- Lines 29-31: LangGraph imports:
  - `StateGraph`: graph builder.
  - `START` and `END`: graph boundaries.
  - `MemorySaver`: fallback checkpointer.
  - `interrupt`: HITL pause.
  - `Command`: resume/goto command.
- Lines 32-35: DB config and models used directly by graph-level code.
- Lines 37-46: Imports all agent nodes A1, A2, A3, A4, A5, A6, A8, A9, A10.
- Lines 47-51: Imports HITL route helpers and persistence helper.
- Line 52: Imports score route function.
- Line 53: Imports SSE manager and workflow event helper.
- Line 54: Imports LLM factory.
- Line 55: Imports lead sync helper.
- Lines 57-60: Optional Postgres checkpointer import.
- Lines 62-66: Optional SQLite checkpointer import.
- Line 68: Creates module logger.

### `_with_agent_audit(): lines 71-109`

Purpose:

> This wrapper runs a node and writes an `AuditLog` row for success or failure.

- Line 71: Defines `_with_agent_audit(node_id, node_fn, db_session=None)`.
- Line 72: Defines inner async function `audited_node(state)`.
- Line 73: Starts performance timer.
- Line 74: Default status is `completed`.
- Line 75: Default error is `None`.
- Lines 76-77: Try to execute the actual node function.
- Lines 78-81: If node raises an error, mark status as `failed`, store error text, and re-raise.
- Line 82: `finally` block runs whether node succeeds or fails.
- Line 83: Only audit if DB session exists.
- Lines 84-85: Try to add audit record.
- Lines 86-103: Create `AuditLog` row:
  - action says `agent_node_completed` or `agent_node_failed`.
  - resource type is `agent_node`.
  - resource id is lead id.
  - details JSON stores node id, thread id, scenario, latency, and error.
- Line 104: Commit audit row.
- Lines 105-107: If audit write itself fails, roll back and log warning.
- Line 109: Return the wrapped audited node.

Human explanation:

> This means every agent execution is observable without repeating audit code in every node.

### `get_checkpointer(): lines 115-158`

Purpose:

> This decides where LangGraph stores workflow memory.

- Line 115: Marks this as an async context manager.
- Line 116: Defines `get_checkpointer()`.
- Lines 117-125: Docstring explains priority: Postgres first, then SQLite, then memory.
- Line 126: Reads database URL from config.
- Line 127: Determines if DB is Postgres.
- Lines 129-130: If Postgres saver exists and DB is Postgres, try Postgres.
- Line 132: Converts asyncpg URL to psycopg-compatible URL.
- Line 133: Opens Postgres saver.
- Lines 134-136: Calls `setup()` to create LangGraph checkpoint tables.
- Line 137: Logs Postgres checkpointer.
- Line 138: Yields saver to caller.
- Line 139: Returns after successful Postgres use.
- Lines 140-143: If Postgres fails, log warning and fall back.
- Lines 145-146: If SQLite saver is installed, choose SQLite.
- Line 147: Opens SQLite saver from connection string.
- Lines 148-149: Calls idempotent `setup()`.
- Line 150: Logs SQLite checkpointer.
- Line 151: Yields saver.
- Line 152: Returns after SQLite.
- Lines 154-157: Warns that memory saver loses state after restart.
- Line 158: Yields `MemorySaver`.

Human explanation:

> Checkpointer is why human pause/resume works. Without it, G1/G2/G3/G4/G5 could not safely resume later.

### `prep_g1(): lines 164-177`

Purpose:

> Save G1 review item before pausing for content compliance.

- Line 164: Defines async `prep_g1`.
- Line 165: Persists HITL row with gate `G1` and description `Content Compliance`.
- Line 166: Copies state and sets `hitl_gate=G1`, `hitl_status=pending`.
- Lines 167-176: Creates execution log saying G1 review is pending.
- Line 177: Returns new state.

### `prep_g2(): lines 180-194`

Purpose:

> Save persona override review item.

- Line 180: Defines async `prep_g2`.
- Line 181: Persists HITL row with gate `G2`.
- Line 182: Sets G2 pending in state.
- Lines 183-193: Execution log includes suggested persona and confidence.
- Line 194: Returns new state.

### `prep_g3(): lines 197-210`

Purpose:

> Save S4 revival campaign approval item.

- Line 197: Defines async `prep_g3`.
- Line 198: Persists HITL row with gate `G3`.
- Line 199: Sets G3 pending.
- Lines 200-209: Execution log includes revival segment.
- Line 210: Returns state.

### `prep_g4(): lines 213-226`

Purpose:

> Save sales handoff review item.

- Line 213: Defines async `prep_g4`.
- Line 214: Persists HITL row with gate `G4`.
- Line 215: Sets G4 pending.
- Lines 216-225: Execution log includes score and sales briefing readiness.
- Line 226: Returns state.

### `prep_g5(): lines 229-243`

Purpose:

> Save edge-score decision item.

- Line 229: Defines async `prep_g5`.
- Line 230: Persists HITL row with gate `G5`.
- Line 231: Sets G5 pending.
- Lines 232-242: Execution log explains score is near threshold.
- Line 243: Returns state.

### `mark_dormant(): lines 246-300`

Purpose:

> Terminal node when nurture sequence is exhausted.

- Line 246: Defines async `mark_dormant`.
- Lines 247-250: Docstring explains dormant behavior and S4 cooldown.
- Line 252: Reads lead id.
- Line 253: Sets in-memory status to `dormant`.
- Lines 255-259: Prepares DB update: status Dormant, workflow completed, completed timestamp.
- Lines 260-262: If S4, set cooldown flag in DB and state.
- Lines 264-265: Sync Lead row.
- Lines 267-271: Log dormant transition.
- Lines 272-278: Publish SSE workflow state event.
- Lines 279-286: Build badges and optional S4 cooldown note.
- Lines 288-299: Create execution log entry.
- Line 300: Return state.

### `schedule_cadence_timer(): lines 306-362`

Purpose:

> Pause workflow until the next scheduled nurture time.

- Line 303: Defines constant `CADENCE_NODE_ID = "A11_CadenceTimer"`.
- Line 306: Defines async function.
- Line 308: Reads lead id.
- Line 309: Reads cadence days and prevents negative values.
- Line 310: Gets current JST time.
- Line 311: Reads preferred send hour or defaults to 17.
- Line 312: Clamps preferred hour between 0 and 23.
- Lines 313-315: Creates due time in JST.
- Lines 316-317: If due time is already past, move it one day forward.
- Line 318: Converts due time to UTC for database.
- Line 319: S4 uses `s4_response_window`; all others use `cadence`.
- Lines 321-327: Publish paused workflow event.
- Lines 329-339: Insert `WorkflowTimer` row.
- Lines 340-345: Mark Lead as Paused and current node A11.
- Lines 347-351: Update in-memory state.
- Lines 352-361: Add execution log.
- Line 362: Return state.

### `_route_after_classifier(): lines 368-384`

- Line 368: Defines route function after A2.
- Lines 369-375: Docstring explains priority.
- Lines 376-377: Suppressed leads end immediately.
- Lines 379-381: Low persona confidence routes to G2.
- Lines 383-384: Otherwise route to A3 intent analysis.

### `_route_after_g2(): lines 387-392`

- Line 387: Defines route after G2 pause resumes.
- Lines 388-391: Docstring.
- Line 392: Always goes to A3.

### `_route_after_intent(): lines 395-425`

Purpose:

> Decides what happens after A3.

- Lines 395-402: Function and docstring.
- Line 403: Reads scenario.
- Line 404: Reads email number.
- Lines 406-410: If after send or external event, go to A8 scoring.
- Lines 412-415: S6 sends one email if email exists and email number is 0; otherwise handoff.
- Lines 417-422: S7:
  - no email -> handoff.
  - first email -> content strategy.
  - later -> scoring.
- Lines 424-425: Default route for S1-S5/S4 is content strategy.

### `_route_after_scoring(): lines 428-450`

Purpose:

> Decides after score update.

- Lines 428-433: Reads score, threshold, email number, max emails.
- Lines 435-436: Consultation booked forces sales handoff.
- Line 438: Calls `evaluate_score_route`.
- Lines 440-441: `handoff` -> sales handoff.
- Lines 442-443: `edge` -> G5 review.
- Lines 444-445: Max emails -> dormant.
- Lines 446-449: If cadence days is 0, loop immediately to A3.
- Line 450: Otherwise schedule cadence timer.

Important implementation note:

> This function can return `intent_analyser` on line 449, but the A8 edge map currently does not include `intent_analyser`. Add that mapping if cadence 0 scenarios should loop here.

### `_route_after_handoff(): lines 453-455`

- Line 453: Defines route after A9.
- Line 454: Docstring.
- Line 455: Always route to G4 prep.

### `_route_after_g1(): lines 458-467`

- Lines 458-463: Function and docstring.
- Line 464: Reads human decision.
- Lines 465-466: If rejected, return to A4 for rewrite.
- Line 467: Otherwise go to A6 send.

### `_route_after_send(): lines 470-482`

- Lines 470-475: Function and docstring.
- Lines 476-481: If send was deferred, failed, paused, or suppressed, end current run.
- Line 482: Otherwise go back to A3.

### `_route_after_g5(): lines 485-499`

- Lines 485-490: Function and docstring.
- Line 491: Reads human decision.
- Lines 492-498: If hold:
  - max emails -> dormant.
  - cadence 0 -> immediate A3.
  - otherwise cadence timer.
- Line 499: If not hold, promote to sales handoff.

### `_route_after_g4(): lines 502-521`

- Lines 502-508: Function and docstring.
- Line 509: Reads human decision.
- Lines 510-520: If hold:
  - S6/S7 without email -> end.
  - if under max emails -> cadence or immediate A3.
  - else dormant.
- Line 521: Non-hold decision ends graph.

### `build_graph(): lines 527-770`

Purpose:

> This is the main graph compiler.

- Lines 527-536: Function signature and docstring.
- Line 537: Creates LLM client once using `get_llm()`.
- Lines 539-572: Bind all agent nodes:
  - A1 gets DB.
  - A2 gets DB.
  - A3 gets LLM and DB.
  - A4 gets DB.
  - A5 gets LLM and DB.
  - A6 gets DB.
  - A8 gets DB.
  - A9 gets LLM and DB.
  - A10 gets DB.
  - dormant/timer nodes get DB.
- Lines 574-578: Bind DB to HITL prep nodes.
- Line 580: Create `StateGraph(dict)`.
- Lines 583-593: Register agent nodes.
- Lines 596-600: Register HITL prep nodes.
- Lines 602-606: Comment explains `interrupt()` pause pattern.
- Lines 607-609: `g1_pause` interrupts and writes resume decision.
- Lines 611-613: `g2_pause`.
- Lines 615-617: `g3_pause`.
- Lines 619-621: `g4_pause`.
- Lines 623-625: `g5_pause`.
- Lines 627-631: Register pause nodes.
- Lines 633-643: START router:
  - S4 -> dormancy agent.
  - everything else -> identity unifier.
- Line 646: A1 -> A2 edge.
- Lines 649-658: A2 conditional edges.
- Lines 660-670: G2 prep/pause/resume edges.
- Lines 673-675: Email loop A4 -> A5 -> G1.
- Lines 678-682: G1 route: approved to send, rejected to A4.
- Lines 685-689: A6 route: end or A3.
- Lines 690-698: A3 route: A8, A4, or A9.
- Lines 701-710: A8 route: cadence, G5, handoff, dormant.
- Line 712: Cadence ends current run.
- Line 715: Dormant ends current run.
- Lines 718-727: G5 route.
- Lines 730-744: A9 -> G4 -> end/cadence/dormant.
- Lines 746-760: S4 path:
  - nested `_route_after_dormancy` lines 749-752.
  - A10 suppressed/dormant -> end.
  - otherwise -> G3.
  - G3 approved -> A1.
- Lines 762-766: Comment explains compile behavior.
- Line 767: Chooses checkpointer or memory.
- Line 768: Compiles graph.
- Line 769: Logs node count.
- Line 770: Returns compiled graph.

### `patch_checkpoint_state(): lines 776-787`

- Lines 776-782: Function and docstring.
- Line 783: Loads current checkpoint.
- Line 784: Converts snapshot values to dict.
- Line 785: Merges current state and patch.
- Line 786: Saves merged state.
- Line 787: Returns merged state.

### `start_workflow(): lines 790-844`

- Lines 790-797: Function signature and arguments.
- Lines 798-805: Docstring.
- Line 806: Creates new thread id.
- Lines 807-811: Creates initial state.
- Lines 812-813: Adds batch id when present.
- Lines 814-816: Pre-set scenario, mainly for S4 routing.
- Line 818: Builds LangGraph config with thread id.
- Lines 820-829: Saves thread id and Active status on Lead.
- Lines 831-833: Publishes workflow started SSE.
- Lines 835-837: Opens checkpointer, builds graph, invokes graph.
- Lines 839-844: Returns thread id, lead id, state, and config.

### `resume_workflow(): lines 847-885`

- Lines 847-853: Function signature.
- Lines 854-870: Docstring explains resume behavior.
- Line 871: Builds config from thread id.
- Lines 873-874: Opens checkpointer and builds graph.
- Lines 875-876: Applies state patch if reviewer edited state.
- Lines 877-880: Resumes graph using `Command(resume=resume_value)`.
- Lines 882-885: Returns thread id and state.

### `jump_to_node(): lines 888-910`

- Lines 888-894: Function signature.
- Lines 895-898: Docstring: used by scheduler/timers.
- Line 899: Builds config.
- Lines 901-902: Opens checkpointer and builds graph.
- Lines 903-904: Applies optional state patch.
- Line 905: Invokes graph with `Command(goto=node_name)`.
- Lines 907-910: Returns thread id and state.

## 21. Ultra Detailed Node Folder Function Ranges

### `nodes/identity_unifier.py`

Function map:

| Function | Lines | Responsibility |
|---|---:|---|
| Module setup | 1-26 | Imports, logger, node id |
| `identity_unifier` | 29-198 | Load lead, quote, consult, event context |

`identity_unifier(): lines 29-198`

- Lines 29-30: Define async function and docstring.
- Line 31: Read lead id from state.
- Lines 32-36: Publish A1 started SSE.
- Line 37: Start latency timer.
- Lines 39-41: Query Lead row.
- Lines 43-53: If missing, publish failed event and return failed state.
- Lines 55-73: Copy demographics, source fields, survey answers, opt-in, email availability.
- Lines 75-82: Use DB engagement score if higher than current state.
- Lines 84-86: Load Quote row.
- Lines 88-92: Load ConsultationRequest row.
- Lines 93-104: If consultation exists, copy memo/request/location/campaign fields.
- Lines 105-111: If no consultation, clear consultation fields.
- Lines 113-121: Load latest campaign id from EmailEvent.
- Lines 123-134: Build basic context parts.
- Lines 135-138: Add mail/session details.
- Lines 139-145: Add quote details.
- Lines 146-157: Add consultation details.
- Lines 158-159: Add latest campaign id.
- Line 161: Join context parts into `context_block`.
- Line 162: Set current node.
- Lines 165-172: Sync thread id and current node to Lead table.
- Lines 174-184: Log and publish completed SSE.
- Lines 185-196: Create execution logs.
- Line 198: Return state.

### `nodes/persona_classifier.py`

Function map:

| Function | Lines | Responsibility |
|---|---:|---|
| Module setup | 1-31 | Imports, logger, node id, G2 threshold |
| `persona_classifier` | 34-214 | Scenario/persona classification |

`persona_classifier(): lines 34-214`

- Lines 34-35: Function definition and docstring.
- Line 36: Read lead id.
- Lines 37-41: Publish A2 started SSE.
- Line 42: Start timer.
- Lines 44-45: Check opt-in/suppression flag.
- Lines 46-56: If suppressed, update state and Lead row.
- Lines 57-65: Publish suppressed SSE.
- Lines 66-72: Add suppressed execution log.
- Line 73: Return early.
- Lines 75-80: Preserve locked scenario if present.
- Lines 82-90: Otherwise classify scenario from survey/source/consultation signals.
- Line 92: Load default scenario config.
- Lines 93-109: Merge DB ScenarioConfig if active.
- Line 110: Resolve keigo from age.
- Lines 112-123: Compute confidence.
- Lines 125-137: Write scenario/persona/score/threshold/max emails/current node into state.
- Lines 139-155: If S2, set life event fields.
- Lines 157-158: If S5, set active buyer flag.
- Lines 160-162: If confidence below 0.60, mark G2 pending.
- Lines 164-177: Sync scenario/persona/score to Lead table.
- Lines 179-186: Log classification.
- Lines 187-195: Publish completed SSE.
- Lines 196-212: Add execution logs.
- Line 214: Return state.

### `nodes/intent_analyser.py`

Function map:

| Function | Lines | Responsibility |
|---|---:|---|
| Module setup | 1-22 | Imports, logger, node id |
| `intent_analyser` | 25-104 | LLM/fallback intent extraction |

`intent_analyser(): lines 25-104`

- Lines 25-31: Function and docstring.
- Line 32: Read lead id.
- Lines 33-37: Publish A3 started SSE.
- Line 38: Start timer.
- Lines 40-50: Format prompt from state.
- Lines 52-59: If LLM exists, call model with system and human messages.
- Line 60: Parse JSON.
- Lines 61-63: Store intent summary, urgency, product interest.
- Lines 64-68: On LLM error, log warning and use defaults.
- Lines 69-77: If no LLM, use rule-based fallback.
- Lines 79-83: Set current node and sync Lead.
- Lines 85-95: Log and publish completed SSE.
- Lines 97-103: Add execution log.
- Line 104: Return state.

### `nodes/content_strategist.py`

Function map:

| Function | Lines | Responsibility |
|---|---:|---|
| Module setup | 1-32 | Imports, logger, node id, constants |
| `content_strategist` | 40-217 | Decide content strategy and template use |

`content_strategist(): lines 40-217`

- Lines 40-41: Function and docstring.
- Line 42: Read lead id.
- Lines 43-47: Publish A4 started SSE.
- Line 48: Start timer.
- Lines 50-54: Detect G1 rejection.
- Lines 55-60: Decide email number; rejection keeps same number, new send increments.
- Lines 61-62: Read scenario and language.
- Lines 64-65: S5 fallback product interest for later emails.
- Lines 67-83: S4 re-segmentation for later emails.
- Lines 85-90: G1 rejection clears draft and forces LLM generation.
- Lines 92-98: First email S6/S7 always LLM-generated.
- Lines 99-117: First email S1-S5 tries DB template lookup.
- Lines 112-114: S4 filters template by P1/P2/P3 segment.
- Lines 118-127: Inline-only template filtering.
- Lines 128-139: Existing template path: set subject/body/template name.
- Lines 140-144: No template path: set LLM generation.
- Lines 146-150: Later email/retry path: LLM generation.
- Lines 152-170: Look for template version N as style reference.
- Lines 171-179: Store style reference and template name.
- Lines 181-185: Set current node and sync Lead.
- Lines 187-194: Log strategy.
- Lines 195-203: Publish completed SSE.
- Lines 205-215: Add execution log.
- Line 217: Return state.

### `nodes/generative_writer.py`

Function map:

| Function | Lines | Responsibility |
|---|---:|---|
| Module setup | 1-25 | Imports, logger, node id |
| `generative_writer` | 28-129 | Pass through or generate email draft |

`generative_writer(): lines 28-129`

- Lines 28-31: Function signature and docstring.
- Line 32: Read lead id.
- Lines 33-37: Publish A5 started SSE.
- Line 38: Start timer.
- Line 40: Read content type.
- Lines 42-44: Existing asset path; A4 already filled draft.
- Lines 45-48: LLM path; load scenario and defaults.
- Lines 50-61: Format system prompt.
- Lines 63-71: Format user prompt.
- Lines 73-79: Call LLM.
- Lines 80-86: Parse JSON and store subject/body/compliance checklist.
- Lines 87-89: Raise runtime error on generation failure.
- Lines 90-91: Raise if LLM required but missing.
- Lines 93-101: Set current node and sync Lead.
- Lines 103-113: Log and publish completed SSE.
- Lines 115-128: Add execution log.
- Line 129: Return state.

### `nodes/send_engine.py`

Function map:

| Function | Lines | Responsibility |
|---|---:|---|
| Module setup | 1-35 | Imports, logger, node id, JST timezone |
| `_quiet_start_hour` | 38-39 | Read/clamp quiet start hour |
| `_quiet_end_hour` | 42-43 | Read/clamp quiet end hour |
| `_is_quiet_hours` | 46-51 | Check current JST quiet window |
| `_next_quiet_end_utc` | 54-62 | Compute next send time after quiet hours |
| `send_engine` | 65-314 | Send, hold, or fail email |

`_quiet_start_hour(): lines 38-39`

- Line 38: Defines helper.
- Line 39: Reads config and clamps value between 0 and 23.

`_quiet_end_hour(): lines 42-43`

- Line 42: Defines helper.
- Line 43: Reads config and clamps value between 0 and 23.

`_is_quiet_hours(): lines 46-51`

- Line 46: Defines helper.
- Line 47: Docstring.
- Line 48: Gets current JST time.
- Lines 49-50: Reads quiet start and end.
- Line 51: Returns true if current hour is inside quiet window.

`_next_quiet_end_utc(): lines 54-62`

- Line 54: Defines helper.
- Line 55: Docstring.
- Lines 56-58: Gets current JST and quiet config.
- Line 59: Builds next quiet-end timestamp.
- Lines 60-61: If already past quiet start, use tomorrow.
- Line 62: Convert to UTC.

`send_engine(): lines 65-314`

- Lines 65-66: Function and docstring.
- Line 67: Read lead id.
- Lines 68-72: Publish A6 started SSE.
- Line 73: Start timer.
- Lines 75-101: Opt-in suppression path.
- Lines 103-129: Missing email failure path.
- Lines 131-145: Quiet-hours check and logging.
- Lines 146-180: If quiet hours, insert held EmailOutbox and WorkflowTimer, mark Lead paused.
- Lines 181-194: Update state and execution log for hold.
- Lines 195-203: Publish paused SSE.
- Lines 205-207: If deferred, return.
- Lines 209-217: Prepare subject/body and log simulated send.
- Lines 219-236: Create Communication row.
- Lines 238-249: If held outbox id exists, update held outbox to sent.
- Lines 250-265: Else create sent EmailOutbox row.
- Lines 267-274: Create EmailEvent `email_sent`.
- Lines 276-285: Increment Lead sent count and commit.
- Lines 287-291: Clear HITL and set `post_send_route=True`.
- Lines 293-305: Publish completed and email-sent SSE events.
- Lines 307-313: Add execution log.
- Line 314: Return state.

### `nodes/propensity_scorer.py`

Function map:

| Function | Lines | Responsibility |
|---|---:|---|
| Module setup | 1-22 | Imports, logger, node id |
| `propensity_scorer` | 25-101 | Update engagement score |

`propensity_scorer(): lines 25-101`

- Lines 25-26: Function and docstring.
- Line 27: Read lead id.
- Lines 28-32: Publish A8 started SSE.
- Line 33: Start timer.
- Lines 35-38: Comment and email number.
- Lines 40-41: If event route, clear event flag without adding sent delta.
- Lines 42-44: Otherwise add email-sent score delta.
- Line 45: Clear post-send flag.
- Line 47: Set current node.
- Lines 49-65: Sync engagement score to Lead.
- Lines 67-76: Log score and threshold.
- Lines 77-85: Publish completed SSE.
- Lines 87-91: Build route hint.
- Lines 92-100: Add execution log.
- Line 101: Return state.

### `nodes/sales_handoff.py`

Function map:

| Function | Lines | Responsibility |
|---|---:|---|
| Module setup | 1-24 | Imports, logger, node id |
| `sales_handoff` | 27-122 | Build advisor briefing and set G4 |

`sales_handoff(): lines 27-122`

- Lines 27-28: Function and docstring.
- Line 29: Read lead id.
- Lines 30-34: Publish A9 started SSE.
- Line 35: Start timer.
- Lines 37-39: Load scenario defaults.
- Lines 40-57: If LLM exists, build briefing prompts.
- Lines 59-67: Call LLM and store `briefing_summary`.
- Lines 68-74: On LLM failure, build fallback briefing.
- Lines 75-84: If no LLM, build fallback briefing.
- Lines 86-89: Set G4 pending and current node.
- Lines 90-93: Sync current node to Lead.
- Lines 95-105: Log and publish completed SSE.
- Lines 107-121: Add execution log.
- Line 122: Return state.

### `nodes/dormancy_agent.py`

Function map:

| Function | Lines | Responsibility |
|---|---:|---|
| Module setup | 1-43 | Imports, logger, node id, dormancy days |
| `_to_utc` | 46-51 | Normalize timestamps |
| `dormancy_agent` | 54-236 | Validate S4 eligibility and assign P1/P2/P3 |

`_to_utc(): lines 46-51`

- Line 46: Defines helper.
- Lines 47-48: None stays None.
- Lines 49-50: Naive datetime becomes UTC-aware.
- Line 51: Already-aware datetime returned unchanged.

`dormancy_agent(): lines 54-236`

- Lines 54-60: Function and docstring.
- Line 61: Read lead id.
- Lines 62-66: Publish A10 started SSE.
- Line 67: Start timer.
- Line 69: Compute 180-day cutoff.
- Lines 71-75: Comment explaining authoritative DB re-validation.
- Lines 76-79: Load Lead row.
- Lines 80-97: If consultation exists, suppress and return.
- Lines 99-110: If opt-in active, suppress and return.
- Lines 112-126: If cooldown flag active, suppress and return.
- Lines 128-153: Check last active/commit time against cutoff; suppress if not stale.
- Lines 155-159: Copy DB score fields into state.
- Lines 161-167: Preserve existing P1/P2/P3 segment.
- Lines 169-180: Compute score delta above base score.
- Lines 182-184: Convert delta to website/product-view proxy.
- Lines 186-194: Classify P1/P2/P3 and build explanation reason.
- Lines 196-203: Set revival segment, scenario S4, scenario lock, G3 pending.
- Lines 205-213: Sync Lead row.
- Lines 215-227: Log and publish completed SSE.
- Lines 229-235: Add execution log.
- Line 236: Return state.

### `nodes/hitl_gates.py`

Function map:

| Function | Lines | Responsibility |
|---|---:|---|
| Module setup | 1-18 | Imports, logger |
| `persist_hitl_record` | 21-76 | Save HITL row and notify UI |
| `should_fire_g1` | 82-84 | Always content review |
| `should_fire_g2` | 87-89 | Low persona confidence |
| `should_fire_g3` | 92-94 | S4 campaign approval |
| `should_fire_g4` | 97-99 | Always sales handoff review |
| `should_fire_g5` | 102-111 | Edge score band |

`persist_hitl_record(): lines 21-76`

- Lines 21-27: Function signature.
- Line 28: Docstring.
- Lines 29-30: No DB means skip persistence.
- Lines 32-39: Parse batch id safely.
- Lines 40-46: Create HITL row identity and gate metadata.
- Lines 47-51: Copy G1 draft content fields.
- Lines 52-54: Copy G4 handoff fields.
- Lines 55-57: Copy G2 persona fields.
- Lines 58-59: Copy G3 revival segment/campaign field.
- Lines 60-63: Set review status and notes.
- Lines 64-66: Add, commit, log.
- Lines 68-76: Publish `hitl_required` SSE event.

Gate helpers:

- `should_fire_g1(): lines 82-84`: returns true.
- `should_fire_g2(): lines 87-89`: confidence below 0.60.
- `should_fire_g3(): lines 92-94`: scenario S4.
- `should_fire_g4(): lines 97-99`: returns true.
- `should_fire_g5(): lines 102-111`: score is between threshold minus 0.10 and threshold.

## 22. Simple Explanation: What Each Function Is Doing

This section is the plain-English companion to the line-by-line notes.

Use this when you are presenting and want to say the meaning naturally.

### `graph.py` Simple Explanation

#### `_with_agent_audit(): lines 71-109`

Simple way:

> This function is like a recorder around every agent step. Whenever an agent node runs, it records whether it completed or failed, how long it took, which lead it worked on, which thread it belonged to, and what error happened if something failed.

Why it exists:

> Instead of writing audit logic inside every node, we wrap the node once here. This keeps the system traceable and compliance-friendly.

#### `get_checkpointer(): lines 115-158`

Simple way:

> This function decides where LangGraph should save workflow memory. If PostgreSQL checkpointing is available, it uses that. If not, it uses SQLite. If neither persistent saver is available, it falls back to memory.

Why it exists:

> HITL pause and resume only works safely if the workflow state is saved. This function provides that saved memory.

#### `prep_g1(): lines 164-177`

Simple way:

> This prepares the email compliance review. It saves the draft email into the HITL queue and marks the workflow as waiting for G1 approval.

Why it exists:

> Every email must be reviewed before sending.

#### `prep_g2(): lines 180-194`
F
Simple way:

> This prepares a persona review. If the system is not confident about the persona or scenario, it asks a human to confirm or override it.

Why it exists:

> Low-confidence classification should not continue blindly.

#### `prep_g3(): lines 197-210`

Simple way:

> This prepares S4 dormant revival campaign approval. Before revival emails go out, a human must approve the campaign path.

Why it exists:

> Dormant revival is sensitive, so the campaign needs human approval.

#### `prep_g4(): lines 213-226`

Simple way:

> This prepares the sales handoff review. It saves the advisor briefing and score snapshot so a human can approve the escalation.

Why it exists:

> A lead should not be pushed to sales without review.

#### `prep_g5(): lines 229-243`

Simple way:

> This prepares a review for leads that are close to the handoff threshold but not clearly above it.

Why it exists:

> The human reviewer decides whether to promote the lead or continue nurturing.

#### `mark_dormant(): lines 246-300`

Simple way:

> This closes the workflow by marking the lead as dormant after the email sequence is exhausted.

Why it exists:

> If the lead does not engage enough after the allowed number of emails, the workflow should stop instead of sending forever.

#### `schedule_cadence_timer(): lines 306-362`

Simple way:

> This creates an alarm for the next email. Instead of sending all emails immediately, it pauses the workflow and stores a timer in the database.

Why it exists:

> Nurture emails need spacing, like waiting 2 or 3 days before the next touch.

#### `_route_after_classifier(): lines 368-384`

Simple way:

> This decides what happens after A2. If the lead is suppressed, stop. If persona confidence is low, go to G2. Otherwise continue to intent analysis.

Why it exists:

> It is the first major decision point after classification.

#### `_route_after_g2(): lines 387-392`

Simple way:

> After persona review finishes, continue to intent analysis.

Why it exists:

> Once the human has confirmed or corrected persona, the workflow can continue normally.

#### `_route_after_intent(): lines 395-425`

Simple way:

> This decides what happens after the system understands intent. Most scenarios go to email content strategy. S6 and S7 may go directly to sales handoff depending on whether email exists and whether one email was already sent.

Why it exists:

> Different scenarios need different behavior after intent analysis.

#### `_route_after_scoring(): lines 428-450`

Simple way:

> This checks the score after A8. If the lead is hot enough, send to sales. If the lead is almost hot enough, ask G5. If max emails are done, mark dormant. Otherwise schedule the next nurture email.

Why it exists:

> This is the main decision point for continue nurture vs sales handoff.

#### `_route_after_handoff(): lines 453-455`

Simple way:

> After A9 creates the sales briefing, always go to G4 review.

Why it exists:

> Sales handoff must be reviewed by a human.

#### `_route_after_g1(): lines 458-467`

Simple way:

> After email review, if the reviewer rejects it, go back to A4 to rewrite. If approved or edited, go to send engine.

Why it exists:

> Human feedback controls whether the draft is sent or regenerated.

#### `_route_after_send(): lines 470-482`

Simple way:

> After A6, if the email was held, failed, paused, or suppressed, stop this run. If it was sent successfully, continue to A3/A8 so scoring can happen.

Why it exists:

> Sending is not always the end. A successful send should trigger scoring logic.

#### `_route_after_g5(): lines 485-499`

Simple way:

> After edge-score review, if the human holds the lead, continue nurture or mark dormant. If not held, promote to sales handoff.

Why it exists:

> Humans decide what to do with borderline leads.

#### `_route_after_g4(): lines 502-521`

Simple way:

> After sales handoff review, approval usually ends the graph. If the reviewer chooses hold, the workflow may continue nurture if possible.

Why it exists:

> Sales reviewers can either accept handoff or send the lead back into nurture.

#### `build_graph(): lines 527-770`

Simple way:

> This builds the whole workflow machine. It registers all agent nodes, HITL prep nodes, pause nodes, and routing edges, then compiles the LangGraph app.

Why it exists:

> This is where individual Python functions become one connected business workflow.

#### `patch_checkpoint_state(): lines 776-787`

Simple way:

> This safely updates saved workflow memory. It first loads the full checkpoint, merges the patch, then saves it back.

Why it exists:

> If a reviewer edits only the email body, we should update only that field and not accidentally erase the rest of the workflow state.

#### `start_workflow(): lines 790-844`

Simple way:

> This starts a new lead journey. It creates a thread id, creates the initial state, saves the thread id on the lead, builds the graph, and runs it.

Why it exists:

> Every lead needs a unique workflow thread so it can be tracked and resumed.

#### `resume_workflow(): lines 847-885`

Simple way:

> This continues a workflow after a human reviewer makes a decision.

Why it exists:

> HITL gates pause the graph. This function unpauses it with the review decision.

#### `jump_to_node(): lines 888-910`

Simple way:

> This resumes a workflow from a specific node, usually when a timer becomes due.

Why it exists:

> Cadence and quiet-hour timers need to restart the workflow later without a human manually clicking through the graph.

### `nodes/identity_unifier.py` Simple Explanation

#### `identity_unifier(): lines 29-198`

Simple way:

> This is the profile builder. It reads the lead, quote, consultation, and campaign-event information from the database and puts it into one workflow state.

What it gives the next agents:

- Basic identity: name, email, phone, age, gender.
- Source data: product, plan, banner, registration source.
- Survey answers.
- Consultation memo if available.
- Quote details.
- Latest campaign id.
- A readable `context_block` for LLM prompts.

Why it exists:

> Later nodes should not each query many tables. A1 collects everything once and creates a clean context.

### `nodes/persona_classifier.py` Simple Explanation

#### `persona_classifier(): lines 34-214`

Simple way:

> This is the scenario and persona decision maker. It decides whether the lead is S1, S2, S3, S5, S6, or S7. For S4, it respects the scenario lock from A10.

What it sets:

- Scenario.
- Persona code.
- Persona confidence.
- Keigo level.
- Base score.
- Engagement score floor.
- Handoff threshold.
- Max emails.

Why it exists:

> Every later decision depends on scenario. Content, cadence, score threshold, and handoff behavior all come from A2.

### `nodes/intent_analyser.py` Simple Explanation

#### `intent_analyser(): lines 25-104`

Simple way:

> This function tries to understand what the lead wants. If the LLM is available, it asks the model to summarize intent, urgency, and product interest. If the LLM is not available, it creates a simple fallback summary.

Why it exists:

> Email writing and sales briefing need context about what the lead seems interested in.

### `nodes/content_strategist.py` Simple Explanation

#### `content_strategist(): lines 40-217`

Simple way:

> This function decides the email strategy. It asks: should we use an approved template, or should we ask the LLM to generate content?

Main decisions:

- First email for S1-S5: try approved template.
- First email for S6/S7: LLM-generated.
- Later emails: LLM-generated, optionally using a template as style reference.
- G1 rejection: rewrite same email number, do not advance sequence.
- S4 later emails: recalculate P1/P2/P3 segment from engagement delta.

Why it exists:

> A4 separates strategy from writing. It decides the content path; A5 writes or passes through the content.

### `nodes/generative_writer.py` Simple Explanation

#### `generative_writer(): lines 28-129`

Simple way:

> This function produces the final email draft. If A4 selected an existing template, A5 does nothing except pass it through. If A4 selected LLM generation, A5 calls the model and stores the subject and body.

Why it exists:

> Email writing needs a dedicated controlled step with strict JSON output and compliance checklist.

### `nodes/send_engine.py` Simple Explanation

#### `_quiet_start_hour(): lines 38-39`

Simple way:

> Reads the configured quiet-hour start time and makes sure it is a valid hour.

#### `_quiet_end_hour(): lines 42-43`

Simple way:

> Reads the configured quiet-hour end time and makes sure it is a valid hour.

#### `_is_quiet_hours(): lines 46-51`

Simple way:

> Checks whether the current time in Japan is inside the quiet-hours window.

#### `_next_quiet_end_utc(): lines 54-62`

Simple way:

> Calculates when quiet hours end and converts that time to UTC for storing in the database.

#### `send_engine(): lines 65-314`

Simple way:

> This function is the send boundary. It decides whether the email can be sent now, must be held, or must fail.

Main decisions:

- If opt-in/suppression says no contact, suppress workflow.
- If no email address exists, fail the send.
- If quiet hours are active, put the email in `email_outbox` and create a `workflow_timer`.
- Otherwise, record the email as sent in `communications`, `email_outbox`, and `email_events`.

Why it exists:

> A6 makes sending safe, traceable, and schedule-aware.

### `nodes/propensity_scorer.py` Simple Explanation

#### `propensity_scorer(): lines 25-101`

Simple way:

> This function updates the lead's engagement score. Usually after an email is sent, it adds the email-sent score delta. If an external event already updated the score, it avoids double-counting.

Why it exists:

> The graph needs a current score to decide nurture, edge review, handoff, or dormant.

### `nodes/sales_handoff.py` Simple Explanation

#### `sales_handoff(): lines 27-122`

Simple way:

> This function prepares the lead for a human sales advisor. It creates a briefing using the LLM if available, or fallback text if not.

What it produces:

- Lead summary.
- Intent summary.
- Score context.
- Advisor briefing.
- G4 pending state.

Why it exists:

> When a lead becomes hot, sales needs a clear explanation, not just a score.

### `nodes/dormancy_agent.py` Simple Explanation

#### `_to_utc(): lines 46-51`

Simple way:

> This helper normalizes dates so dormancy comparison is reliable.

#### `dormancy_agent(): lines 54-236`

Simple way:

> This function checks if a dormant lead is truly eligible for S4 revival. It also assigns the lead into P1, P2, or P3.

Main checks:

- Does the lead already have a consultation request? If yes, skip revival.
- Is the lead opted out or suppressed? If yes, skip.
- Is cooldown active? If yes, skip.
- Has the lead been inactive for 180 days? If no, skip.
- If eligible, assign P1/P2/P3 and require G3 approval.

Why it exists:

> S4 is sensitive. The system must not revive leads unless they pass strict eligibility rules.

### `nodes/hitl_gates.py` Simple Explanation

#### `persist_hitl_record(): lines 21-76`

Simple way:

> This function creates the human review task. It copies the relevant workflow data into `hitl_queue` and sends an SSE event so the frontend sees that review is needed.

Why it exists:

> The reviewer needs a durable queue item, not just temporary in-memory state.

#### `should_fire_g1(): lines 82-84`

Simple way:

> Says G1 should happen whenever the graph asks. In practice, every email goes through G1.

#### `should_fire_g2(): lines 87-89`

Simple way:

> Checks if persona confidence is below 0.60. If yes, human review is needed.

#### `should_fire_g3(): lines 92-94`

Simple way:

> Checks if the scenario is S4. S4 requires campaign approval.

#### `should_fire_g4(): lines 97-99`

Simple way:

> Says sales handoff review should happen whenever called.

#### `should_fire_g5(): lines 102-111`

Simple way:

> Checks if the score is close to the handoff threshold but still below it. That is the grey zone where a human should decide.

# MetLife Agentic AI Lead Nurturing Platform
## Complete Backend & AI Development Specifications

This document is the definitive blueprint for developing the MetLife Lead Nurturing backend. It covers the full API layout, LangGraph execution environment, strict scenario guidelines (S1–S7), and Server-Sent Events (SSE) logic required to power the real-time User Interface.

---

## 1. System Architecture overview

*   **Web Framework**: FastAPI (Python 3.11+)
*   **AI Framework**: LangGraph + LangChain core
*   **Real-time Protocol**: **Server-Sent Events (SSE)** via FastAPI `StreamingResponse`. (WebSockets are explicitly EXCLUDED to simplify unidirectional frontend state management).
*   **LLM Provider**: Azure OpenAI (GPT-4 for complex intent/generation, GPT-4o-mini for fast classification).
*   **Database**: PostgreSQL (via SQLAlchemy async).
*   **State Persistence**: LangGraph `PostgresSaver` for native HITL pause-and-resume.
*   **Event Broker**: In-Memory Python `asyncio.Queue` or Event Manager for local multi-threading (No external dependencies like Redis required).

---

## 2. Database Schema & Data Models

The system logic will be persisted across the following core PostgreSQL tables:

### User Configuration (`users`)
Tracks the MetLife operational staff capable of accessing the platform.
*   **id**: Primary Key (UUID)
*   **email**: String, Unique (Main login identifier)
*   **password_hash**: String (Secure credential storage)
*   **name**: String (e.g., "Singh Sahil")
*   **role**: String Enum [Admin, Manager, Reviewer, Viewer] (Enforces RBAC on the API layer)
*   **created_at**: Timestamp

### Lead Profile (`leads`)
Holds the core demographic information originally synced from the `T_YEC_QUOTE_MST` webhook.
*   **id**: Primary Key (UUID)
*   **quote_id**: String, Unique (References original MetLife quote system)
*   **first_name** & **last_name**: String
*   **age**: Integer
*   **scenario_id**: String Enum [S1, S2, S3, S4, S5, S6, S7] (Null initially, patched by Agent A2)
*   **engagement_score**: Float (Starts at 0.0, updated globally by Agent A8)
*   **workflow_status**: String Enum [Active, Pending_HITL, Converted, Dormant]

### Agent Execution Log (`agent_logs`)
Maintains an immutable paper trail of all agentic interventions for compliance and analytics.
*   **id**: Primary Key (UUID)
*   **lead_id**: Foreign Key linking to `leads.id`
*   **agent_node**: String (e.g., "A3_Intent", "A6_Send")
*   **action_summary**: String (Plain language record of the automation performed)
*   **latency_ms**: Integer (Performance tracking for the Dashboard metrics)
*   **created_at**: Timestamp

### Human-In-The-Loop Queue (`hitl_queue`)
Stores the frozen payloads for generative emails requiring compliance officer review.
*   **id**: Primary Key (UUID)
*   **lead_id**: Foreign Key linking to `leads.id`
*   **thread_id**: String (Connects directly to the LangGraph Checkpointer thread UUID)
*   **draft_subject**: String (The raw LLM-generated subject)
*   **draft_body**: Text (The raw LLM-generated email body)
*   **review_status**: String Enum [Awaiting, Approved, Edited]
*   **reviewed_by_user_id**: Foreign Key linking to `users.id` (Null until actioned)

### MetLife Master Quotes (`quotes`)
Historical snapshot of the raw data derived from the T_YEC_QUOTE_MST webhooks.
*   **id**: Primary Key (UUID)
*   **lead_id**: Foreign Key linking to `leads.id`
*   **product_category**: String (e.g., "Term Life", "Medical")
*   **premium_estimate_jpy**: Integer
*   **created_at**: Timestamp

### Orchestration Batches (`batch_runs`)
Tracks the status of the macro "Run All Workflows" jobs triggered from the UI.
*   **id**: Primary Key (UUID)
*   **started_by_user_id**: Foreign Key linking to `users.id`
*   **status**: String Enum [Processing, Paused, Completed]
*   **total_leads_targeted**: Integer
*   **leads_processed**: Integer
*   **started_at**: Timestamp
*   **finished_at**: Timestamp (Nullable)

### Dynamic Scenarios Config (`scenarios_config`)
Allows admins to hot-swap handoff thresholds or cadence constraints without deploying code.
*   **scenario_id**: Primary Key (String, e.g., "S1", "S2")
*   **name**: String (e.g., "Young Professional")
*   **handoff_threshold**: Float (e.g., 0.80)
*   **cadence_days**: Integer
*   **is_active**: Boolean (Default True)

### External Communications (`communications`)
Provides exact metrics on outbound emails sent via SendGrid / AWS SES.
*   **id**: Primary Key (UUID)
*   **lead_id**: Foreign Key linking to `leads.id`
*   **external_message_id**: String (Received from SMTP provider)
*   **subject**: String
*   **sent_at**: Timestamp
*   **opened_at**: Timestamp (Nullable)
*   **clicked_at**: Timestamp (Nullable)

### CRM Handoffs (`crm_handoffs`)
Logs the final result of Agent A9 successfully escalating the lead to Salesforce/Jira.
*   **id**: Primary Key (UUID)
*   **lead_id**: Foreign Key linking to `leads.id`
*   **crm_ticket_id**: String (e.g., "SF-99238" or "MET-4112")
*   **handoff_score_snapshot**: Float
*   **escalated_at**: Timestamp

### LangGraph State Checkpointers (`checkpoints` & `checkpoint_writes`)
Native tables automatically instantiated by `PostgresSaver` to persist graph memory and enable the HITL pause functionality.
*   **thread_id**: String (Primary Key / UUID linking to `hitl_queue.thread_id`)
*   **checkpoint_ns**: String (Namespace for the checkpoint)
*   **checkpoint_id**: String (UUID representing the exact snapshot in time)
*   **parent_checkpoint_id**: String (Allows rewinding agent loops)
*   **type**: String
*   **checkpoint**: JSONB (The serialized `LeadState` dictionary)
*   **metadata**: JSONB
*   *(Note: The underlying schema is maintained by LangGraph's native Postgres Checkpointer library, but is mapped here for visibility).*

---

## 3. Real-Time Execution with SSE (Server-Sent Events)

The user interface requires real-time progress of batch executions and individual agent statuses. The entire architecture relies on an SSE endpoint.

### A. The SSE Endpoint
`GET /api/v1/sse/workflows/stream`
*   **Description**: The frontend connects to this endpoint using the native JavaScript `EventSource` API.
*   **Implementation Strategy**: The SSE endpoint will leverage FastAPI's StreamingResponse and an in-memory asyncio EventManager class. Instead of Redis, a global broadcast manager will append subscribers (asyncio queues) when a client connects. As LangGraph BackgroundTasks run, they publish status payloads to the class, which places the events directly onto the active subscriber queues. The streaming response yields these messages continuously to the frontend using the standard text/event-stream format.

### B. Launching Batch Processing
`POST /api/v1/workflows/batch/run`
*   When trigged, the backend queues an asynchronous LangGraph job via FastAPI native `BackgroundTasks` (or `asyncio.create_task`) for the target `lead_ids`. 
*   As LangGraph executes each step, it publishes structured JSON payloads to the in-memory `event_manager.publish()`, broadcasting directly to the SSE streams.

**SSE Payload Specification for the frontend**:
The payload object pushed through the SSE stream must contain three keys: an "event_type" string (e.g., "batch_update"), a "batch_stats" internal object outlining processed/done/hitl/active tallies, and an "agent_stats" dictionary. The "agent_stats" maps individual agent IDs (a1, a2, etc.) to their current real-time counts and string statuses (e.g., "Processing...", "Classifying...").

---

## 4. Strict Scenario Logic (S1 - S7)

The `A2_Persona_Classifier` must enforce rigid logic mapped exactly to MetLife's specific scenarios. The classifier should use GPT-4o-mini with a structured tool/function call forcing the LLM to output an enum of `["S1", "S2", "S3", "S4", "S5", "S6", "S7"]`.

### S1: Young Professional
*   **Target Logic**: Demographics (Age < 35) + Single/Unknown + Intent (Medical/Term Life).
*   **Nurturing Strategy**: Short, casual tone. Focuses on "protecting career upside" and low monthly premiums.
*   **Cadence**: Rapid (3-day cycle).
*   **Handoff Threshold**: `0.80`
*   **Completion Condition**: Flow completes when the lead schedules a brief introductory call, applies online, or hits the `0.80` engagement score (triggering A9 Handoff).

### S2: Recently Married / Family Planning
*   **Target Logic**: Demographics (Age 25-45) + Signal (Recent marriage, change of address, joint account).
*   **Nurturing Strategy**: Focus on "Family Protection" and "Peace of Mind". Polite tone but empathetic.
*   **Cadence**: Medium (7-day cycle).
*   **Handoff Threshold**: `0.85`
*   **Completion Condition**: Flow completes when the lead books a joint family consultation session or hits the `0.85` score.

### S3: Senior Citizen
*   **Target Logic**: Demographics (Age ≥ 65). *Example: Mei Fujita from the UI.*
*   **Nurturing Strategy**: High-touch, extremely respectful `Keigo` tone. Focus on legacy, inheritance, and simple medical riders. No complex financial jargon.
*   **Cadence**: Slow (14-day cycle) to avoid pressure.
*   **Handoff Threshold**: `0.75` (Seniors need high-touch human intervention quickly).
*   **Completion Condition**: Flow completes when the lead requests a physical brochure mailer to be sent via post, schedules an in-home visit, or hits the `0.75` score.

### S4: Dormant Revival
*   **Target Logic**: Existing lead who has not interacted in > 6 months.
*   **Nurturing Strategy**: "Check-in" style. Offer new data, recent industry changes, or new product features point-blank.
*   **Cadence**: One-off trigger with 21-day follow loops.
*   **Handoff Threshold**: `0.90` (Only pass to sales if they show highly active engagement upon revival).
*   **Completion Condition**: Flow completes when the lead either opens two consecutive revival emails, replies directly, or permanently opts out.

### S5: Active Buyer
*   **Target Logic**: High interaction in the last 48 hours (Repeated website visits to pricing pages).
*   **Nurturing Strategy**: Direct closing strategies, comparative pricing sheets.
*   **Cadence**: Aggressive (24-hour cycle).
*   **Handoff Threshold**: `0.60` (Pass them to Humans immediately).
*   **Completion Condition**: Flow completes immediately upon the lead submitting a pre-screening application online or actively requesting exact pricing details.

### S6: F2F Consultation Request
*   **Target Logic**: The lead explicitly requested a Face-to-Face meeting via webform.
*   **Nurturing Strategy**: Agent A4 immediately drafts a calendar sync email with associate bios.
*   **Cadence**: Instant.
*   **Handoff Threshold**: `0.00` (Bypasses scoring — sent immediately to HITL / Handoff).
*   **Completion Condition**: Flow completes once the calendar sync is finalized and mutually confirmed by both the lead and the MetLife agent.

### S7: Web-to-Call (Urgent)
*   **Target Logic**: Lead triggered a "Request Call Back" signal.
*   **Nurturing Strategy**: A4 drafts a holding email, A9 immediately triggers an alert to the inbound sales desk CRM.
*   **Cadence**: Instant.
*   **Handoff Threshold**: `0.00` (Sent immediately to handoff).
*   **Completion Condition**: Flow completes instantly once the inbound sales desk accepts the CRM alert and initiates the dial attempt to the lead.

---

## 5. LangGraph Architecture & Nodes

We use a strictly typed memory state container.

### Core State Schema
The LangGraph State object is configured as a strict TypedDict (`LeadState`). This state will track:
- the `lead_id` string
- an auto-filled `scenario` field (S1 to S7)
- a cumulative float `base_score` incremented by agent A8
- an array of core `messages` managed by LangGraph's add_messages reducer
- payloads carrying the drafted email content (subject and body)
- status trackers for Human-In-The-Loop actions (idle, pending, approved, edited)
- a boolean flag `is_converted` activated upon sales handoff

### Complete Node Mapping

1.  **A1: Identity & Signal Unifier**
    *   **Action**: Reaches out to database table `T_YEC_QUOTE_MST`.
    *   **Logic**: Standard Python function. Merges quote data with behavioral tracking data into a master context block.
2.  **A2: Life-Stage & Persona Classifier**
    *   **Action**: LLM Call (GPT-4o-mini).
    *   **Prompt**: Parses A1 context and returns exactly one of `[S1, S2, S3, S4, S5, S6, S7]` based on the rules defined in Section 3.
3.  **A3: Intent Analyzer**
    *   **Action**: LLM Call (GPT-4).
    *   **Prompt**: Looks at the timeline array. Answers: *What is their urgency? Are they stalling? What is their core pain point?*
4.  **A4/A5: Content Strategy & Generative Writer**
    *   **Action**: Multi-step LLM chain.
    *   **Logic**: “You are writing to an {Scenario}. The tone must be {Tone}. Synthesize the intent {A3 output} into an email subject and body. Output locally formatted content in {"Japanese" or "English"} according to the global UI preference toggle via the frontend. Use MetLife Template X respectfully.”
5.  **G1–G5: HITL Gate (Human-In-The-Loop)**
    *   **Action**: `interrupt_before=["A6_Send"]` declared in LangGraph.
    *   **Logic**: The graph pauses state into PostgreSQL. The UI calls `GET /api/v1/hitl` and renders the payload. Admin clicks "Approve". `POST /api/v1/hitl/approve` is called, running `graph.invoke(Command(resume="approved"), config=thread_config)`.
6.  **A6: Send Engine**
    *   **Action**: External standard API call. Sends the actual payload via SMTP/SendGrid. Emits a timeline event to the DB.
7.  **A8: Intent & Propensity Scoring**
    *   **Action**: Increments the `state["base_score"]` based on recent interaction (e.g., Email Sent = +0.05, Email Opened = +0.15).
8.  **A9 & A10: Sales Handoff / Dormancy Batch**
    *   **Action**: Checks conditional edge -> `If base_score > scenario_threshold THEN go_to(A9) ELSE go_to(END)`
    *   `A9`: Calls the Salesforce/Jira API to create a ticket for an associate, marking the lead as "Converted".

---

## 6. Localization & Multi-Language Generation (EN/JA)

The platform natively supports English (EN) and Japanese (JA) via a centralized localization strategy that impacts both the UI and the AI backend concurrently.

1.  **UI State Handling**: The user interface features an **EN | JA** toggle in the top-navigation bar. Clicking this sets the global application language state and broadcasts it via API headers or payloads when triggering workflows.
2.  **Dynamic LLM Generation**:
    *   The `A4/A5` Content Strategy agents retrieve this language preference parameter dynamically.
    *   Instead of hardcoding the prompt to generate Japanese strings, the prompt leverages variables: `Output locally formatted content in {Target_Language} according to the global UI preference...`
    *   If Japanese is selected, the LLM will output highly respectful `Keigo` Japanese tailored for MetLife scenarios. If English is selected, the LLM adapts the context into native English formats, honoring cultural nuance equivalents.
3.  **Human-in-the-Loop Review**: Regardless of the language explicitly generated by the LLM, the entire raw output payload (including email standard text, subjects, and headers) is pushed to the HITL gate natively in that language. This allows compliance officers to review the raw generated text identically to how the customer will receive it.

---

## 7. REST API Specifications Complete List

### A. Authentication
*   `POST /api/v1/auth/login`: Issue JWT token.
*   `POST /api/v1/admin/users`: Enforce RBAC roles (Admin, Manager, Reviewer, Viewer).

### B. Lead Access (Standard CRUD)
*   `GET /api/v1/leads`: Returns array of leads. Support query params: `?scenario=S1&min_score=0.7&page=1`
*   `GET /api/v1/leads/{lead_id}`: Returns absolute details, timeline history events, and current metric nodes for a lead.

### C. Analytics (Supporting the Custom Dashboard)
*   `GET /api/v1/analytics/dashboard`: Returns aggregate KPI data including the master conversion rate, average handoff score, average review time in minutes, and an object mapping the total count for each active scenario (S1–S7) for UI charting.
*   `GET /api/v1/analytics/agents`: Performance data (Latencies: A1=0.3s, A2=0.8s, etc.).

### D. Workflow Orchestrator API
*   `POST /api/v1/workflows/batch/run`: Initiates the master batch job. Returns a `batch_id`.
*   `POST /api/v1/workflows/batch/pause`: Sets a global application flag `batch_paused=True`.
*   `POST /api/v1/workflows/batch/resume`: Sets a global application flag `batch_paused=False`.
*   `POST /api/v1/workflows/agent/{agent_id}/manual`: Admin triggers a single ad-hoc agent block.

### E. Human in the Loop (HITL) Queue API
*   `GET /api/v1/hitl/queue`: Queries the database for all nodes paused at the `G1–G5` steps.
*   `POST /api/v1/hitl/{thread_id}/approve`: Modifies the PostgreSQL saved state payload, marking `hitl_status` as approved, and then invokes the LangGraph instance with a resume command, allowing the agentic execution to move to A6.
*   `PUT /api/v1/hitl/{thread_id}/edit`: Extends the approve endpoint by first accepting new text strings for the `draft_email_subject` and `draft_email_body`, updating the State graph, and then resuming execution instantly.

---

## 8. Execution Flow Recap

1. **Intake**: A webhook fires a payload to `/api/v1/leads/webhook`. Lead is persisted in Postgres.
2. **Batch Orchestration**: Admin clicks "▶ Run All Workflows" in UI. `/api/v1/workflows/batch/run` is fired.
3. **Graph Initialization**: A background job spawns thousands of asynchronous LangGraph threads (one per lead).
4. **Processing**: The threads rush through A1, hit A2 to become assigned to `S1-S7`, fly through the LLMs in A3 and A4/A5, and hit the declarative `interrupt_before=["A6"]` wall.
5. **SSE Broadcasting**: While this is happening, the backend calls `await event_manager.publish()`. The `FastAPI StreamingResponse` consumes the in-memory queue and pushes real-time `data:` streams to the UI, spinning the frontend counters.
6. **HITL Review**: The admin switches to the HITL Review queue (`/api/v1/hitl/queue`). The LLM content is shown. Admin clicks "Approve".
7. **Graph Completion**: The thread is unpaused, content is verified, sent (A6), scored (A8), and dynamically passed to Sales (A9) if the metric exceeds the scenario threshold.

"""
Central model registry  –  every SQLAlchemy model must be imported here
so that Alembic autogenerate can detect all tables.
"""

from model.database.v1.base import Base, GUID  # noqa: F401

# ── Auth & RBAC ─────────────────────────────────────────────────────
from model.database.v1.users import User  # noqa: F401
from model.database.v1.tokens import BlacklistedToken  # noqa: F401

# ── Core domain ─────────────────────────────────────────────────────
from model.database.v1.leads import Lead  # noqa: F401
from model.database.v1.quotes import Quote  # noqa: F401
from model.database.v1.scenarios import ScenarioConfig  # noqa: F401

# ── HITL & orchestration ────────────────────────────────────────────
from model.database.v1.hitl import HITLQueue  # noqa: F401

# ── Communications ──────────────────────────────────────────────────
from model.database.v1.emails import EmailTemplate, EmailEvent  # noqa: F401
from model.database.v1.communications import Communication  # noqa: F401
from model.database.v1.consultation import ConsultationRequest  # noqa: F401
from model.database.v1.email_outbox import EmailOutbox  # noqa: F401
from model.database.v1.workflow_timers import WorkflowTimer  # noqa: F401
from model.database.v1.sales_handoffs import SalesHandoff  # noqa: F401

# ── Audit ───────────────────────────────────────────────────────────
from model.database.v1.audit_log import AuditLog  # noqa: F401

# ── SSE event store ──────────────────────────────────────────────────
from model.database.v1.sse_events import SSEEvent  # noqa: F401

# ── Batch orchestration ──────────────────────────────────────────────
from model.database.v1.batch_runs import BatchRun  # noqa: F401

__all__ = [
    "Base",
    "GUID",
    "User",
    "BlacklistedToken",
    "Lead",
    "Quote",
    "ScenarioConfig",
    "HITLQueue",
    "EmailTemplate",
    "EmailEvent",
    "Communication",
    "ConsultationRequest",
    "EmailOutbox",
    "WorkflowTimer",
    "SalesHandoff",
    "AuditLog",
    "SSEEvent",
    "BatchRun",
]

from fastapi import Depends

from core import connect_router
from utils.v1.jwt_utils import get_current_user

from core.v1.api.authentication.authentication import router as authentication
from core.v1.api.agents.agent_api import router as agent
from core.v1.api.agents.hitl_api import router as hitl
from core.v1.api.agents.sse_api import router as sse
from core.v1.api.leads.leads_api import router as leads
from core.v1.api.dashboard.dashboard_api import router as dashboard
from core.v1.api.admin.admin_api import router as admin

# Auth endpoints are public (register / login).
connect_router.include_router(authentication, prefix="/auth", tags=["Authentication"])

# All other routers require a valid Bearer JWT.
# Individual write/execute endpoints add their own require_permission() guard
# on top of this base auth requirement.
_auth = [Depends(get_current_user)]

connect_router.include_router(
    agent, prefix="/agents", tags=["Agent Workflow"], dependencies=_auth
)
connect_router.include_router(
    hitl, prefix="/hitl", tags=["HITL Queue"], dependencies=_auth
)
connect_router.include_router(
    sse, prefix="/sse", tags=["SSE Events"], dependencies=_auth
)
connect_router.include_router(
    leads, prefix="/leads", tags=["Leads"], dependencies=_auth
)
connect_router.include_router(
    dashboard, prefix="/dashboard", tags=["Dashboard"], dependencies=_auth
)
connect_router.include_router(
    admin, prefix="/admin/users", tags=["Admin · Access Control"], dependencies=_auth
)

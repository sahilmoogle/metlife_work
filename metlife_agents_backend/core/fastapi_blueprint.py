from core import connect_router

from core.v1.api.authentication.authentication import router as authentication
from core.v1.api.agents.agent_api import router as agent
from core.v1.api.agents.hitl_api import router as hitl
from core.v1.api.agents.sse_api import router as sse

connect_router.include_router(authentication, prefix="/auth", tags=["Authentication"])
connect_router.include_router(agent, prefix="/agents", tags=["Agent Workflow"])
connect_router.include_router(hitl, prefix="/hitl", tags=["HITL Queue"])
connect_router.include_router(sse, prefix="/sse", tags=["SSE Events"])

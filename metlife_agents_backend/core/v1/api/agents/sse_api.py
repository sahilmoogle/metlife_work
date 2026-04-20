"""
SSE Streaming API — single persistent endpoint for real-time events.
"""

import logging

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from core.v1.services.sse.manager import event_manager

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/stream")
async def sse_stream():
    """Server-Sent Events stream for real-time workflow updates.

    The frontend connects via ``EventSource`` API and receives
    events as they are published by agent nodes and HITL gates.

    Event types:
      - node_transition: Agent started/completed
      - hitl_required: Flow hit G1–G5
      - hitl_approved / hitl_edited: Approval received
      - workflow_state: Paused/Resumed/Completed/Error
    """
    queue = await event_manager.subscribe()
    logger.info("SSE client connected")

    return StreamingResponse(
        event_manager.stream(queue),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

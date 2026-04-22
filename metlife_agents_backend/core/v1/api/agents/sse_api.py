"""
SSE Streaming API — single persistent endpoint for real-time events.

Supports reconnect recovery via the standard ``Last-Event-ID`` header:
  1. Browser connects → receives live events, each frame carries ``id: N``
  2. Browser refreshes / network drops → EventSource reconnects automatically
  3. Browser sends ``Last-Event-ID: N`` on reconnect
  4. Server replays all events with id > N from in-memory buffer (or DB fallback)
  5. Browser is fully caught up before new live events arrive
"""

import logging

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from core.v1.services.sse.manager import event_manager
from utils.v1.dependencies import require_permission
from utils.v1.enums import DefaultPermission

logger = logging.getLogger(__name__)

router = APIRouter()
_HITL_APPROVE = DefaultPermission.HITL_APPROVE.value


@router.get("/stream")
async def sse_stream(
    request: Request,
    _: dict = Depends(require_permission(_HITL_APPROVE)),
):
    """Server-Sent Events stream for real-time workflow updates.

    The frontend connects via the browser ``EventSource`` API and receives
    events as they are published by agent nodes and HITL gates.  Every
    frame carries an ``id:`` field so the browser can resume cleanly
    after a refresh without losing events.

    Event types emitted:
      - ``node_transition``  — agent node started / completed
      - ``hitl_required``    — flow paused at G1–G5
      - ``hitl_approved``    — reviewer approved
      - ``hitl_edited``      — reviewer submitted edits
      - ``hitl_rejected``    — reviewer rejected
      - ``workflow_state``   — started / paused / resumed / dormant / error
      - ``lead_converted``   — G4 sales handoff approved
    """
    # Standard SSE reconnect header — browser sends the last id it received
    last_id_str = request.headers.get("Last-Event-ID", "0")
    try:
        last_event_id = int(last_id_str)
    except (ValueError, TypeError):
        last_event_id = 0

    queue = await event_manager.subscribe()
    logger.info(
        "SSE client connected (Last-Event-ID=%d, active_subscribers=%d)",
        last_event_id,
        len(event_manager._subscribers),
    )

    return StreamingResponse(
        event_manager.stream(queue, last_event_id=last_event_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

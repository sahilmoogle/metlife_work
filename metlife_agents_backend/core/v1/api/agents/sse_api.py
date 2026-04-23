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

import json

from fastapi import APIRouter, Depends, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from core.v1.services.sse.manager import event_manager
from model.api.v1 import APIResponse
from model.database.v1.sse_events import SSEEvent
from utils.v1.connections import get_db
from utils.v1.jwt_utils import get_current_user_for_sse

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/stream")
async def sse_stream(
    request: Request,
    _user: dict = Depends(get_current_user_for_sse),
):
    """Server-Sent Events stream for real-time workflow updates.

    The frontend connects via the browser ``EventSource`` API and receives
    events as they are published by agent nodes and HITL gates.  Every
    frame carries an ``id:`` field so the browser can resume cleanly
    after a refresh without losing events.

    Event types emitted:
      - ``batch_progress``   — batch run counters (processed / total / status)
      - ``node_transition``  — agent node started / completed
      - ``hitl_required``    — flow paused at G1–G5
      - ``hitl_approved``    — reviewer approved
      - ``hitl_edited``      — reviewer submitted edits
      - ``hitl_rejected``    — reviewer rejected
      - ``workflow_state``   — started / paused / resumed / dormant / error
      - ``lead_converted``   — G4 sales handoff approved

    Auth: ``Authorization: Bearer`` **or** query ``access_token=`` (required for browser ``EventSource``).
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


@router.get(
    "/recent",
    response_model=APIResponse[list[dict]],
    status_code=status.HTTP_200_OK,
)
async def get_recent_events(
    lead_id: str | None = Query(None, description="Filter by lead_id"),
    thread_id: str | None = Query(None, description="Filter by thread_id"),
    event_type: str | None = Query(None, description="Filter by event_type"),
    limit: int = Query(50, ge=1, le=500, description="Max events to return (1–500)"),
    _user: dict = Depends(get_current_user_for_sse),
    db=Depends(get_db),
):
    """Return the most recent persisted SSE events (debugging / per-lead trace).

    Notes:
    - Uses the durable ``sse_events`` table, not the in-memory buffer.
    - Results are returned newest-first.
    """
    query = select(SSEEvent).order_by(SSEEvent.id.desc()).limit(limit)
    if lead_id:
        query = query.where(SSEEvent.lead_id == str(lead_id))
    if thread_id:
        query = query.where(SSEEvent.thread_id == str(thread_id))
    if event_type:
        query = query.where(SSEEvent.event_type == str(event_type))

    result = await db.execute(query)
    rows = result.scalars().all()

    events: list[dict] = []
    for row in rows:
        try:
            payload = json.loads(row.payload) if row.payload else {}
        except Exception:
            payload = {}
        if isinstance(payload, dict):
            payload.setdefault("id", row.id)
            payload.setdefault("event_type", row.event_type)
            payload.setdefault("lead_id", row.lead_id)
            payload.setdefault("thread_id", row.thread_id)
            payload.setdefault(
                "persisted_at", str(row.created_at) if row.created_at else None
            )
            events.append(payload)

    return APIResponse(
        success=True,
        status_code=status.HTTP_200_OK,
        data=events,
        message=f"Returned {len(events)} event(s).",
    )

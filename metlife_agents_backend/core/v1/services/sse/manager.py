"""
SSE Event Manager — in-memory broadcast hub for real-time updates.

Manages asyncio.Queue subscribers.  Agent nodes call ``publish()``
and the FastAPI SSE endpoint consumes from subscriber queues.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import AsyncGenerator

logger = logging.getLogger(__name__)


class EventManager:
    """Singleton-style broadcast manager for SSE events."""

    def __init__(self) -> None:
        self._subscribers: list[asyncio.Queue[dict]] = []
        self._lock = asyncio.Lock()

    async def subscribe(self) -> asyncio.Queue[dict]:
        """Register a new subscriber and return its queue."""
        queue: asyncio.Queue[dict] = asyncio.Queue()
        async with self._lock:
            self._subscribers.append(queue)
        logger.info("SSE subscriber added.  Active: %d", len(self._subscribers))
        return queue

    async def unsubscribe(self, queue: asyncio.Queue[dict]) -> None:
        """Remove a subscriber queue."""
        async with self._lock:
            self._subscribers = [q for q in self._subscribers if q is not queue]
        logger.info("SSE subscriber removed.  Active: %d", len(self._subscribers))

    async def publish(self, event: dict) -> None:
        """Broadcast an event dict to all active subscribers."""
        event.setdefault("timestamp", datetime.now(timezone.utc).isoformat())
        async with self._lock:
            dead: list[asyncio.Queue] = []
            for queue in self._subscribers:
                try:
                    queue.put_nowait(event)
                except asyncio.QueueFull:
                    dead.append(queue)
            # Prune dead queues
            if dead:
                self._subscribers = [q for q in self._subscribers if q not in dead]

    async def stream(self, queue: asyncio.Queue[dict]) -> AsyncGenerator[str, None]:
        """Yield SSE-formatted strings from a subscriber queue."""
        try:
            while True:
                event = await queue.get()
                event_type = event.get("event_type", "message")
                data = json.dumps(event, default=str)
                yield f"event: {event_type}\ndata: {data}\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            await self.unsubscribe(queue)


# ── Helper factories for structured events ───────────────────────────


def node_transition_event(
    lead_id: str,
    node: str,
    status: str,
    detail: str = "",
) -> dict:
    """Create a node_transition event payload."""
    return {
        "event_type": "node_transition",
        "lead_id": lead_id,
        "node": node,
        "status": status,
        "detail": detail,
    }


def hitl_required_event(
    lead_id: str,
    thread_id: str,
    gate: str,
    detail: str = "",
) -> dict:
    """Create an hitl_required event payload."""
    return {
        "event_type": "hitl_required",
        "lead_id": lead_id,
        "thread_id": thread_id,
        "gate": gate,
        "detail": detail,
    }


def hitl_resolved_event(
    lead_id: str,
    thread_id: str,
    gate: str,
    resolution: str,
) -> dict:
    """Create an hitl_approved / hitl_edited event payload."""
    return {
        "event_type": f"hitl_{resolution}",
        "lead_id": lead_id,
        "thread_id": thread_id,
        "gate": gate,
    }


def workflow_state_event(
    lead_id: str,
    status: str,
    detail: str = "",
) -> dict:
    """Create a workflow_state event (paused / resumed / completed / error)."""
    return {
        "event_type": "workflow_state",
        "lead_id": lead_id,
        "status": status,
        "detail": detail,
    }


# ── Global singleton ─────────────────────────────────────────────────
event_manager = EventManager()

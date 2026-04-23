"""
SSE Event Manager — in-memory broadcast hub with durable event store.

Every event published via ``publish()`` is:
  1. Assigned a sequential integer ID (maps to the SSE ``id:`` frame field)
  2. Placed in an in-memory rolling buffer (last 1 000 events)
  3. Persisted to the ``sse_events`` DB table asynchronously
  4. Broadcast to all active subscriber queues

On browser refresh the client reconnects with ``Last-Event-ID: N``.
The ``stream()`` generator replays every buffered event with id > N
before switching to live delivery — no events are lost.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import AsyncGenerator

logger = logging.getLogger(__name__)

# Maximum events kept in the rolling in-memory buffer
_BUFFER_SIZE = 1000


class EventManager:
    """Singleton-style broadcast manager for SSE events."""

    def __init__(self) -> None:
        self._subscribers: list[asyncio.Queue[dict]] = []
        self._lock = asyncio.Lock()

        # Sequential counter — each event gets a unique monotone integer id.
        # Starts at 0; synced to DB max on first publish so server restarts
        # never collide with already-persisted IDs.
        self._counter: int = 0
        self._counter_synced: bool = False

        # Dedicated lock for the one-time DB sync.  Prevents the race where
        # 100 concurrent publish() calls all see _counter_synced=False and
        # each reset _counter back to max_id AFTER other coroutines have
        # already incremented it — producing duplicate IDs and UNIQUE errors.
        self._sync_lock = asyncio.Lock()

        # Rolling buffer: deque would be ideal but a list with slicing is fine
        # at 1 000 entries.  Each entry is the fully-enriched event dict.
        self._buffer: list[dict] = []

    async def _sync_counter(self) -> None:
        """Set counter to max(sse_events.id) from DB so restarts don't collide."""
        try:
            from sqlalchemy import text
            from utils.v1.connections import SessionLocal

            async with SessionLocal() as db:
                result = await db.execute(
                    text("SELECT COALESCE(MAX(id), 0) FROM sse_events")
                )
                max_id = result.scalar() or 0
                self._counter = int(max_id)
                logger.info("SSE counter initialised from DB max id: %d", self._counter)
        except Exception as exc:
            logger.warning("SSE counter DB sync failed (using 0): %s", exc)
        finally:
            self._counter_synced = True

    # ── Subscription management ──────────────────────────────────────

    async def subscribe(self) -> asyncio.Queue[dict]:
        """Register a new subscriber and return its dedicated queue."""
        queue: asyncio.Queue[dict] = asyncio.Queue(maxsize=500)
        async with self._lock:
            self._subscribers.append(queue)
        logger.info("SSE subscriber added.  Active: %d", len(self._subscribers))
        return queue

    async def unsubscribe(self, queue: asyncio.Queue[dict]) -> None:
        """Remove a subscriber queue when the client disconnects."""
        async with self._lock:
            self._subscribers = [q for q in self._subscribers if q is not queue]
        logger.info("SSE subscriber removed.  Active: %d", len(self._subscribers))

    # ── Publishing ───────────────────────────────────────────────────

    async def publish(self, event: dict) -> None:
        """Broadcast an event to all subscribers and persist it to DB.

        The event dict is mutated in-place to add:
          - ``id``        sequential integer (continues from DB max on restart)
          - ``timestamp`` UTC ISO-8601 string
        """
        event.setdefault("timestamp", datetime.now(timezone.utc).isoformat())

        # Sync the counter from DB exactly once after server start.
        # Double-checked locking: cheap flag check first, then acquire the
        # sync lock to ensure only one coroutine executes _sync_counter().
        # Without the lock, 100 concurrent publish() calls can all see
        # _counter_synced=False, each call _sync_counter(), and each reset
        # _counter back to max_id — producing duplicate sequential IDs.
        if not self._counter_synced:
            async with self._sync_lock:
                if not self._counter_synced:  # re-check after acquiring lock
                    await self._sync_counter()

        async with self._lock:
            self._counter += 1
            event["id"] = self._counter

            # Update rolling buffer
            self._buffer.append(event)
            if len(self._buffer) > _BUFFER_SIZE:
                self._buffer = self._buffer[-_BUFFER_SIZE:]

            # Broadcast to live subscribers; drop slow/dead queues
            dead: list[asyncio.Queue] = []
            for queue in self._subscribers:
                try:
                    queue.put_nowait(event)
                except asyncio.QueueFull:
                    dead.append(queue)
            if dead:
                self._subscribers = [q for q in self._subscribers if q not in dead]
                logger.warning("Pruned %d slow SSE subscriber(s)", len(dead))

        # Persist to DB without blocking the broadcast path
        asyncio.create_task(self._persist(event))

    async def _persist(self, event: dict) -> None:
        """Write event to ``sse_events`` table.  Errors are logged, not raised."""
        try:
            # Import here to avoid circular imports at module load time
            from utils.v1.connections import SessionLocal
            from model.database.v1.sse_events import SSEEvent

            async with SessionLocal() as db:
                db.add(
                    SSEEvent(
                        id=event["id"],
                        event_type=event.get("event_type", "message"),
                        lead_id=str(event["lead_id"]) if event.get("lead_id") else None,
                        thread_id=str(event["thread_id"])
                        if event.get("thread_id")
                        else None,
                        payload=json.dumps(event, default=str),
                    )
                )
                await db.commit()
        except Exception as exc:
            logger.warning(
                "SSE event DB persist failed (id=%s): %s", event.get("id"), exc
            )

    # ── Streaming ────────────────────────────────────────────────────

    def _format(self, event: dict) -> str:
        """Render one SSE frame (id / event / data lines)."""
        event_id = event.get("id", "")
        event_type = event.get("event_type", "message")
        data = json.dumps(event, default=str)
        return f"id: {event_id}\nevent: {event_type}\ndata: {data}\n\n"

    async def stream(
        self,
        queue: asyncio.Queue[dict],
        last_event_id: int = 0,
    ) -> AsyncGenerator[str, None]:
        """Yield SSE-formatted strings from a subscriber queue.

        Args:
            queue:          The subscriber's personal queue (from ``subscribe()``).
            last_event_id:  Value of the browser's ``Last-Event-ID`` header.
                            Events with id > last_event_id are replayed first.
        """
        try:
            # ── Replay phase ────────────────────────────────────────
            if last_event_id > 0:
                # Snapshot the buffer under lock to avoid races
                async with self._lock:
                    missed = [e for e in self._buffer if e.get("id", 0) > last_event_id]

                if missed:
                    logger.info(
                        "Replaying %d missed SSE event(s) after Last-Event-ID=%d",
                        len(missed),
                        last_event_id,
                    )
                    for event in missed:
                        yield self._format(event)
                else:
                    # Buffer might not go back far enough — query DB as fallback
                    replayed = await self._replay_from_db(last_event_id)
                    for event in replayed:
                        yield self._format(event)

            # ── Live phase ──────────────────────────────────────────
            while True:
                event = await queue.get()
                yield self._format(event)

        except asyncio.CancelledError:
            pass
        finally:
            await self.unsubscribe(queue)

    async def _replay_from_db(self, since_id: int) -> list[dict]:
        """Fetch events from DB for ``id > since_id`` (fallback after server restart)."""
        try:
            from sqlalchemy import select
            from utils.v1.connections import SessionLocal
            from model.database.v1.sse_events import SSEEvent

            async with SessionLocal() as db:
                result = await db.execute(
                    select(SSEEvent)
                    .where(SSEEvent.id > since_id)
                    .order_by(SSEEvent.id.asc())
                    .limit(500)
                )
                rows = result.scalars().all()
                events = []
                for row in rows:
                    try:
                        events.append(json.loads(row.payload))
                    except Exception:
                        pass
                return events
        except Exception as exc:
            logger.warning("SSE DB replay failed: %s", exc)
            return []

    # ── Utility: snapshot for tests / admin ─────────────────────────

    def recent_events(self, n: int = 50) -> list[dict]:
        """Return the last *n* events from the in-memory buffer (sync, safe)."""
        return self._buffer[-n:]


# ── Helper factories for structured events ───────────────────────────


def node_transition_event(
    lead_id: str,
    node: str,
    status: str,
    detail: str = "",
    batch_id: str | None = None,
) -> dict:
    """Create a node_transition event payload."""
    event = {
        "event_type": "node_transition",
        "lead_id": lead_id,
        "node": node,
        "status": status,
        "detail": detail,
    }
    if batch_id:
        event["batch_id"] = batch_id
    return event


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
    """Create an hitl_approved / hitl_edited / hitl_rejected event payload."""
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
    """Create a workflow_state event (started / paused / resumed / dormant / error)."""
    return {
        "event_type": "workflow_state",
        "lead_id": lead_id,
        "status": status,
        "detail": detail,
    }


def batch_progress_event(
    batch_id: str,
    processed: int,
    total: int,
    success: int,
    failed: int,
    status: str,
) -> dict:
    """Fires after each lead is processed in a batch run.

    Drives the progress bar on the Work Flow Engine 'Run' button screen.
    ``status`` is one of: running | completed | partial_failure | failed
    """
    return {
        "event_type": "batch_progress",
        "batch_id": batch_id,
        "processed": processed,
        "total": total,
        "success": success,
        "failed": failed,
        "status": status,
        "pct": round(processed / total * 100) if total else 0,
    }


def lead_converted_event(
    lead_id: str,
    thread_id: str,
    score: float,
    scenario_id: str = "",
) -> dict:
    """Create a lead_converted event — fires when G4 Sales Handoff is approved.

    Drives the Live Activity Feed entry:
    'Lead → Consultation booked → Score X.XX'
    """
    return {
        "event_type": "lead_converted",
        "lead_id": lead_id,
        "thread_id": thread_id,
        "score": score,
        "scenario_id": scenario_id,
        "detail": f"Sales handoff approved · Score {score:.2f}",
    }


# ── Global singleton ─────────────────────────────────────────────────
event_manager = EventManager()

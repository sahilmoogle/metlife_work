"""
SSE event store — persists every published event so the frontend
can replay missed events after a browser refresh or network blip.

Uses an auto-increment integer PK which maps directly to the SSE
``id:`` frame field and the browser's ``Last-Event-ID`` header.
"""

from sqlalchemy import Column, Integer, String, Text, TIMESTAMP
from sqlalchemy.sql import func

from model.database.v1.base import Base


class SSEEvent(Base):
    """Durable log of every event published through EventManager.

    On browser reconnect the frontend sends ``Last-Event-ID: N`` and
    the server replays all rows with ``id > N`` before streaming live.
    """

    __tablename__ = "sse_events"

    # Auto-increment integer — direct mapping to SSE protocol id field
    id = Column(Integer, primary_key=True, autoincrement=True)

    event_type = Column(String(60), nullable=False, index=True)

    # Denormalised for fast filtering (lead / thread queries)
    lead_id = Column(String(100), nullable=True, index=True)
    thread_id = Column(String(100), nullable=True, index=True)

    # Full JSON event payload (everything passed to publish())
    payload = Column(Text, nullable=False)

    created_at = Column(TIMESTAMP, server_default=func.now(), index=True)
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())

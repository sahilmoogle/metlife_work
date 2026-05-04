"""
Runtime settings service  –  thin async helpers for reading and writing
global system flags stored in the ``runtime_settings`` table.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from model.database.v1.runtime_settings import RuntimeSettings


async def get_intake_mode(db: AsyncSession) -> str:
    """Return the current workflow intake mode.

    Falls back to ``"automatic"`` if the row is missing (safe default
    that preserves the previous behaviour for all existing deployments).
    """
    result = await db.execute(
        select(RuntimeSettings).where(
            RuntimeSettings.key == RuntimeSettings.WORKFLOW_INTAKE_MODE
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        return RuntimeSettings.MODE_AUTOMATIC
    return row.value


async def set_intake_mode(db: AsyncSession, mode: str) -> str:
    """Persist the workflow intake mode and return the accepted value.

    Only ``"automatic"`` and ``"manual"`` are valid.  Raises ``ValueError``
    for anything else.
    """
    allowed = {RuntimeSettings.MODE_AUTOMATIC, RuntimeSettings.MODE_MANUAL}
    if mode not in allowed:
        raise ValueError(f"Invalid intake mode '{mode}'. Allowed: {allowed}")

    result = await db.execute(
        select(RuntimeSettings).where(
            RuntimeSettings.key == RuntimeSettings.WORKFLOW_INTAKE_MODE
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        import uuid as _uuid

        row = RuntimeSettings(
            id=str(_uuid.uuid4()),
            key=RuntimeSettings.WORKFLOW_INTAKE_MODE,
            value=mode,
        )
        db.add(row)
    else:
        row.value = mode

    await db.commit()
    await db.refresh(row)
    return row.value

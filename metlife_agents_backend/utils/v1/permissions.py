"""
RBAC Permission Matrix — MetLife Agents Backend.

Roles and their allowed actions match the Admin · Access Control UI screen:

  Admin    — full access
  Manager  — run workflow, start agent, HITL approve, edit lead
  Reviewer — HITL approve, edit lead
  Viewer   — read-only (authenticated but no write permissions)

Usage in a route:
    from utils.v1.permissions import require_permission

    @router.post("/run")
    async def run_batch(
        current_user: dict = Depends(require_permission("run_workflow")),
        ...
    ):
        ...
"""

from __future__ import annotations

from fastapi import Depends, HTTPException, status

from utils.v1.jwt_utils import get_current_user


# ── Permission → roles that hold it ──────────────────────────────────
ROLE_PERMISSIONS: dict[str, set[str]] = {
    "run_workflow": {"Admin", "Manager"},
    "start_agent":  {"Admin", "Manager"},
    "hitl_approve": {"Admin", "Manager", "Reviewer"},
    "edit_lead":    {"Admin", "Manager", "Reviewer"},
    "export_data":  {"Admin"},
    "manage_users": {"Admin"},
}

# Roles sorted by privilege level (most → least)
ROLE_HIERARCHY: list[str] = ["Admin", "Manager", "Reviewer", "Viewer"]


def has_permission(user: dict, permission: str) -> bool:
    """Return True if the user holds the given permission.

    Resolution order:
      1. Per-user override  (custom_permissions dict carried in the user payload)
         — explicit True/False set by an Admin for this specific user.
      2. Role default  (ROLE_PERMISSIONS matrix)
         — used when no override exists for this permission.

    This means an Admin can:
      • Grant  a Viewer  ``hitl_approve`` → True  (beyond their role)
      • Revoke a Manager ``run_workflow``  → False (below their role)
    """
    custom: dict = user.get("custom_permissions") or {}
    if permission in custom:
        return bool(custom[permission])
    role = user.get("role", "Viewer")
    return role in ROLE_PERMISSIONS.get(permission, set())


def require_permission(permission: str):
    """Return a FastAPI dependency that enforces the given permission.

    Checks per-user overrides first, then falls back to role defaults.
    Raises 403 when the user does not hold the permission.

    Example::

        @router.post("/run")
        async def run_batch(
            _: dict = Depends(require_permission("run_workflow")),
            db: AsyncSession = Depends(get_db),
        ):
            ...
    """

    async def _check(current_user: dict = Depends(get_current_user)) -> dict:
        if not has_permission(current_user, permission):
            role = current_user.get("role", "Viewer")
            allowed_roles = ROLE_PERMISSIONS.get(permission, set())
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Role '{role}' does not have the '{permission}' permission. "
                    f"Required roles: {sorted(allowed_roles)}. "
                    "An Admin can grant this permission individually."
                ),
            )
        return current_user

    # Unique name keeps FastAPI's dependency graph from collapsing
    # multiple require_permission() callsites into one resolver.
    _check.__name__ = f"require_{permission}"
    return _check


def require_any_role(*roles: str):
    """Require the user to have at least one of the given roles.

    Less granular than require_permission() — use for coarse guards.
    """

    async def _check(current_user: dict = Depends(get_current_user)) -> dict:
        role = current_user.get("role", "Viewer")
        if role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{role}' is not permitted here. Required: {list(roles)}.",
            )
        return current_user

    _check.__name__ = f"require_role_{'_or_'.join(roles)}"
    return _check

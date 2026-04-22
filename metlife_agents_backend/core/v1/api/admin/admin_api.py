"""
Admin · Access Control API — user management for the RBAC screen.

Endpoints match the UI table:
  GET  /admin/users              — list all users with their permissions
  POST /admin/users              — create a new user (+Add User)
  GET  /admin/users/{user_id}    — single user detail
  PATCH /admin/users/{user_id}   — update role / active toggle / name
  DELETE /admin/users/{user_id}  — deactivate (soft-delete) a user

All endpoints require the ``manage_users`` permission (Admin only).
GET list/detail also allowed for any authenticated user (read-only view).
"""

from __future__ import annotations

import json as _json
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from model.api.v1 import APIResponse
from model.api.v1.admin import (
    CreateUserRequest,
    UpdateUserRequest,
    UpdateUserPermissionsRequest,
    UserPermissionRow,
    UserListResponse,
    UserPermissionsResponse,
    PermissionMatrixResponse,
)
from model.database.v1.users import User
from utils.v1.connections import get_db
from utils.v1.jwt_utils import get_current_user
from utils.v1.permissions import ROLE_PERMISSIONS, ROLE_HIERARCHY, require_permission

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Helpers ──────────────────────────────────────────────────────────


def _load_overrides(user: User) -> dict[str, bool]:
    """Parse the custom_permissions JSON field; return {} on any error."""
    if not user.custom_permissions:
        return {}
    try:
        return {k: bool(v) for k, v in _json.loads(user.custom_permissions).items()}
    except Exception:
        return {}


def _effective_permissions(user: User) -> dict[str, bool]:
    """Merge role defaults with per-user overrides → final effective permissions."""
    defaults = _resolve_permissions(user.role)
    overrides = _load_overrides(user)
    return {**defaults, **overrides}


def _resolve_permissions(role: str) -> dict[str, bool]:
    """Return a dict of permission_name → bool for a given role."""
    return {perm: role in allowed for perm, allowed in ROLE_PERMISSIONS.items()}


def _user_to_row(user: User) -> UserPermissionRow:
    # Use effective (overrides applied) permissions for the UI table
    perms = _effective_permissions(user)
    return UserPermissionRow(
        user_id=str(user.user_id),
        name=user.name,
        email=user.email,
        role=user.role,
        is_active=bool(user.is_active),
        run_workflow=perms.get("run_workflow", False),
        start_agent=perms.get("start_agent", False),
        hitl_approve=perms.get("hitl_approve", False),
        edit_lead=perms.get("edit_lead", False),
        export_data=perms.get("export_data", False),
        manage_users=perms.get("manage_users", False),
    )


# ── Routes ───────────────────────────────────────────────────────────


@router.get(
    "",
    response_model=APIResponse[UserListResponse],
    status_code=status.HTTP_200_OK,
)
async def list_users(
    _: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all users with resolved permission flags.

    Accessible to all authenticated users (read-only).
    """
    result = await db.execute(select(User).order_by(User.role, User.name))
    users = result.scalars().all()

    rows = [_user_to_row(u) for u in users]

    roles_summary: dict[str, int] = {}
    for role in ROLE_HIERARCHY:
        count = sum(1 for u in users if u.role == role and u.is_active)
        if count:
            roles_summary[role] = count

    return APIResponse(
        success=True,
        status_code=status.HTTP_200_OK,
        message="User list retrieved.",
        data=UserListResponse(users=rows, total=len(rows), roles_summary=roles_summary),
    )


@router.post(
    "",
    response_model=APIResponse[UserPermissionRow],
    status_code=status.HTTP_201_CREATED,
)
async def create_user(
    request: CreateUserRequest,
    _: dict = Depends(require_permission("manage_users")),
    db: AsyncSession = Depends(get_db),
):
    """Create a new MetLife staff user (+Add User button).

    Requires Admin role (``manage_users`` permission).
    Password is hashed with bcrypt before storage.
    """
    from core.v1.services.authentication.authentication import AuthService

    existing = await db.execute(select(User).where(User.email == request.email))
    if existing.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Email '{request.email}' is already registered.",
        )

    hashed = AuthService.hash_password(request.password)
    user = User(
        user_id=uuid.uuid4(),
        name=request.name,
        email=request.email,
        password_hash=hashed,
        role=request.role,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    logger.info(
        "Admin created user %s (%s) with role %s", user.email, user.user_id, user.role
    )
    return APIResponse(
        success=True,
        status_code=status.HTTP_201_CREATED,
        message=f"User '{user.name}' created with role {user.role}.",
        data=_user_to_row(user),
    )


@router.get(
    "/{user_id}",
    response_model=APIResponse[UserPermissionRow],
    status_code=status.HTTP_200_OK,
)
async def get_user(
    user_id: str,
    _: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve a single user's detail and resolved permissions."""
    result = await db.execute(select(User).where(User.user_id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    return APIResponse(
        success=True,
        status_code=status.HTTP_200_OK,
        message="User retrieved.",
        data=_user_to_row(user),
    )


@router.patch(
    "/{user_id}",
    response_model=APIResponse[UserPermissionRow],
    status_code=status.HTTP_200_OK,
)
async def update_user(
    user_id: str,
    request: UpdateUserRequest,
    current_user: dict = Depends(require_permission("manage_users")),
    db: AsyncSession = Depends(get_db),
):
    """Update role, active status, or name for a user.

    Admins cannot deactivate themselves.
    Requires Admin role (``manage_users`` permission).
    """
    result = await db.execute(select(User).where(User.user_id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    # Prevent self-deactivation
    if str(user.user_id) == current_user.get("user_id") and request.is_active is False:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot deactivate your own account.",
        )

    if request.name is not None:
        user.name = request.name
    if request.role is not None:
        user.role = request.role
    if request.is_active is not None:
        user.is_active = request.is_active

    await db.commit()
    await db.refresh(user)

    action = "updated"
    if request.is_active is False:
        action = "deactivated"
    elif request.role:
        action = f"role changed to {user.role}"

    logger.info("Admin %s %s user %s", current_user.get("email"), action, user.email)
    return APIResponse(
        success=True,
        status_code=status.HTTP_200_OK,
        message=f"User {action} successfully.",
        data=_user_to_row(user),
    )


@router.delete(
    "/{user_id}",
    response_model=APIResponse[dict],
    status_code=status.HTTP_200_OK,
)
async def deactivate_user(
    user_id: str,
    current_user: dict = Depends(require_permission("manage_users")),
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete: set is_active=False.  User cannot log in afterwards.

    Requires Admin role.  Admins cannot delete themselves.
    """
    if str(user_id) == current_user.get("user_id"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot delete your own account.",
        )

    result = await db.execute(select(User).where(User.user_id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    user.is_active = False
    await db.commit()

    logger.info("Admin %s deactivated user %s", current_user.get("email"), user.email)
    return APIResponse(
        success=True,
        status_code=status.HTTP_200_OK,
        message=f"User '{user.name}' deactivated.",
        data={"user_id": user_id, "is_active": False},
    )


@router.get(
    "/permissions/matrix",
    response_model=APIResponse[PermissionMatrixResponse],
    status_code=status.HTTP_200_OK,
)
async def get_permission_matrix(_: dict = Depends(get_current_user)):
    """Return the full role→permission matrix for the UI table headers."""
    matrix = {role: _resolve_permissions(role) for role in ROLE_HIERARCHY}
    return APIResponse(
        success=True,
        status_code=status.HTTP_200_OK,
        message="Permission matrix retrieved.",
        data=PermissionMatrixResponse(roles=ROLE_HIERARCHY, matrix=matrix),
    )


# ── Per-user permission override endpoints ───────────────────────────


@router.get(
    "/{user_id}/permissions",
    response_model=APIResponse[UserPermissionsResponse],
    status_code=status.HTTP_200_OK,
)
async def get_user_permissions(
    user_id: str,
    _: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a user's role defaults, stored overrides, and effective permissions.

    The ``effective`` dict is what actually controls access — it merges
    role defaults with any Admin-set overrides for this specific user.
    """
    result = await db.execute(select(User).where(User.user_id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    return APIResponse(
        success=True,
        status_code=status.HTTP_200_OK,
        message="User permissions retrieved.",
        data=UserPermissionsResponse(
            user_id=str(user.user_id),
            name=user.name,
            email=user.email,
            role=user.role,
            role_defaults=_resolve_permissions(user.role),
            overrides=_load_overrides(user),
            effective=_effective_permissions(user),
        ),
    )


@router.patch(
    "/{user_id}/permissions",
    response_model=APIResponse[UserPermissionsResponse],
    status_code=status.HTTP_200_OK,
)
async def update_user_permissions(
    user_id: str,
    request: UpdateUserPermissionsRequest,
    current_user: dict = Depends(require_permission("manage_users")),
    db: AsyncSession = Depends(get_db),
):
    """Grant or revoke individual permissions for a user (Admin only).

    Send only the permissions you want to change:
    - ``true``  → grant this permission regardless of role
    - ``false`` → revoke this permission regardless of role
    - ``null``  → remove the override, revert to role default

    Admins cannot revoke their own ``manage_users`` permission.

    Example — give a specific Viewer the ability to approve HITL gates::

        PATCH /admin/users/{viewer_id}/permissions
        {"hitl_approve": true}

    Example — revoke export_data from one Manager::

        PATCH /admin/users/{manager_id}/permissions
        {"export_data": false}
    """
    # Prevent self-revocation of manage_users
    if str(user_id) == current_user.get("user_id") and request.manage_users is False:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot revoke your own manage_users permission.",
        )

    result = await db.execute(select(User).where(User.user_id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    # Load existing overrides, apply the requested changes
    overrides = _load_overrides(user)
    changes: dict[str, str] = {}

    for field, value in request.model_dump().items():
        if value is True:
            overrides[field] = True
            changes[field] = "granted"
        elif value is False:
            overrides[field] = False
            changes[field] = "revoked"
        else:
            # null → remove override, revert to role default
            if field in overrides:
                del overrides[field]
                changes[field] = "reset to role default"

    user.custom_permissions = _json.dumps(overrides) if overrides else None
    await db.commit()
    await db.refresh(user)

    logger.info(
        "Admin %s updated permissions for %s: %s",
        current_user.get("email"),
        user.email,
        changes,
    )
    return APIResponse(
        success=True,
        status_code=status.HTTP_200_OK,
        message=f"Permissions updated for '{user.name}': {changes}",
        data=UserPermissionsResponse(
            user_id=str(user.user_id),
            name=user.name,
            email=user.email,
            role=user.role,
            role_defaults=_resolve_permissions(user.role),
            overrides=_load_overrides(user),
            effective=_effective_permissions(user),
        ),
    )

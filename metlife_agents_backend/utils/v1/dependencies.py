from enum import Enum

from fastapi import Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.v1.services.rbac.rbac import RBACService
from utils.v1.connections import get_db
from utils.v1.jwt_utils import get_current_user


def _format_roles_for_message(roles: list[str]) -> str:
    if not roles:
        return "admin"
    if len(roles) == 1:
        return roles[0]
    if len(roles) == 2:
        return f"{roles[0]} or {roles[1]}"
    return f"{', '.join(roles[:-1])}, or {roles[-1]}"


def _roles_noun(roles: list[str]) -> str:
    return "role" if len(roles) == 1 else "roles"


def _roles_verb(roles: list[str]) -> str:
    return "is" if len(roles) == 1 else "are"


def require_permission(required_permission: str | Enum):
    """Dependency factory enforcing a permission on the authenticated user.

    Accepts either a raw permission name or a ``DefaultPermission`` enum
    member — the latter is preferred for type safety at call sites.
    """
    perm_name = (
        required_permission.value
        if isinstance(required_permission, Enum)
        else required_permission
    )

    async def check_permission(
        current_user: dict = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ):
        allowed = await RBACService.has_permission(
            db, current_user["user_id"], perm_name
        )
        if not allowed:
            roles = await RBACService.get_roles_for_permission(db, perm_name)
            roles_text = _format_roles_for_message(roles)
            roles_word = _roles_noun(roles if roles else ["admin"])
            roles_verb = _roles_verb(roles if roles else ["admin"])
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Authentication required. Only {roles_text} {roles_word} {roles_verb} allowed.",
            )
        return current_user

    return check_permission

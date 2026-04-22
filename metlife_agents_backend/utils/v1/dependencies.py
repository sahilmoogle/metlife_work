from enum import Enum

from fastapi import Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.v1.services.rbac.rbac import RBACService
from utils.v1.connections import get_db
from utils.v1.jwt_utils import get_current_user


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
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: {perm_name}",
            )
        return current_user

    return check_permission
"""Admin-only RBAC management endpoints."""

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from model.api.v1 import APIResponse
from model.api.v1.rbac import UserWithPermissionsView
from utils.v1.connections import get_db
from utils.v1.dependencies import require_permission
from utils.v1.enums import DefaultPermission
from core.v1.services.rbac.rbac import RBACService

router = APIRouter()

_MANAGE_USERS = DefaultPermission.MANAGE_USERS.value


@router.post(
    "/roles/{role_id}/permissions/{permission_id}",
    response_model=APIResponse[dict],
)
async def assign_permission_to_role(
    role_id: str,
    permission_id: str,
    _: dict = Depends(require_permission(_MANAGE_USERS)),
    db: AsyncSession = Depends(get_db),
):
    data = await RBACService.assign_permission_to_role(
        db=db,
        role_id=role_id,
        permission_id=permission_id,
    )   

    return APIResponse(
        success=True,
        status_code=status.HTTP_200_OK,
        message="Permission assigned successfully",
        data=data,
    )


@router.delete(
    "/roles/{role_id}/permissions/{permission_id}",
    response_model=APIResponse[dict],
)
async def remove_permission_from_role(
    role_id: str,
    permission_id: str,
    _: dict = Depends(require_permission(_MANAGE_USERS)),
    db: AsyncSession = Depends(get_db),
):
    data = await RBACService.remove_permission_from_role(
        db=db,
        role_id=role_id,
        permission_id=permission_id,
    )

    return APIResponse(
        success=True,
        status_code=status.HTTP_200_OK,
        message="Permission removed successfully",
        data=data,
    )


@router.post(
    "/users/{user_id}/role/{role_id}",
    response_model=APIResponse[dict],
)
async def assign_role_to_user(
    user_id: str,
    role_id: str,
    admin: dict = Depends(require_permission(_MANAGE_USERS)),
    db: AsyncSession = Depends(get_db),
):
    data = await RBACService.assign_role_to_user(
        db=db,
        user_id=user_id,
        role_id=role_id,
        admin_user_id=admin["user_id"],
    )

    return APIResponse(
        success=True,
        status_code=status.HTTP_200_OK,
        message="Role assigned successfully",
        data=data,
    )


@router.get(
    "/users",
    response_model=APIResponse[list[UserWithPermissionsView]],
)
async def list_all_users_with_permissions(
    db: AsyncSession = Depends(get_db),
):
    data = await RBACService.list_all_users_with_permissions(db=db)

    if not data:
        return APIResponse(
            success=True,
            status_code=status.HTTP_200_OK,
            message="No users found",
            data=[],
        )

    return APIResponse(
        success=True,
        status_code=status.HTTP_200_OK,
        message="Users retrieved successfully",
        data=data,
    )
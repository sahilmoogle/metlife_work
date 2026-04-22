from fastapi import HTTPException
from sqlalchemy import func, select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from model.database.v1.permissions import Permission
from model.database.v1.roles import Role, RolePermission
from model.database.v1.users import User
from model.api.v1.rbac import (
    PermissionDetail,
    RoleDetail,
    UserWithPermissionsView,
)
from utils.v1.enums import DefaultPermission


_MANAGE_USERS = DefaultPermission.MANAGE_USERS.value


class RBACService:
    @staticmethod
    async def get_user(db: AsyncSession, user_id: str) -> User | None:
        stmt = select(User).where(User.user_id == user_id)
        result = await db.execute(stmt)
        return result.scalars().first()

    @staticmethod
    async def get_user_or_404(db: AsyncSession, user_id: str) -> User:
        user = await RBACService.get_user(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return user

    @staticmethod
    async def get_role_or_404(db: AsyncSession, role_id: str) -> Role:
        stmt = select(Role).where(Role.role_id == role_id)
        result = await db.execute(stmt)
        role = result.scalars().first()

        if not role:
            raise HTTPException(status_code=404, detail="Role not found")
        return role

    @staticmethod
    async def get_permission_or_404(db: AsyncSession, permission_id: str) -> Permission:
        stmt = select(Permission).where(Permission.permission_id == permission_id)
        result = await db.execute(stmt)
        permission = result.scalars().first()

        if not permission:
            raise HTTPException(status_code=404, detail="Permission not found")
        return permission

    @staticmethod
    async def get_user_role(db: AsyncSession, user_id: str) -> str | None:
        stmt = (
            select(Role.name)
            .join(User, User.role_id == Role.role_id)
            .where(User.user_id == user_id, Role.is_active.is_(True))
        )
        result = await db.execute(stmt)
        return result.scalars().first()

    @staticmethod
    async def get_user_permissions(db: AsyncSession, user_id: str) -> set[str]:
        stmt = (
            select(Permission.name)
            .join(RolePermission, RolePermission.permission_id == Permission.permission_id)
            .join(Role, Role.role_id == RolePermission.role_id)
            .join(User, User.role_id == Role.role_id)
            .where(
                User.user_id == user_id,
                Role.is_active.is_(True),
                Permission.is_active.is_(True),
            )
        )
        result = await db.execute(stmt)
        return set(result.scalars().all())

    @staticmethod
    async def has_permission(db: AsyncSession, user_id: str, permission_name: str) -> bool:
        permissions = await RBACService.get_user_permissions(db, user_id)
        return permission_name in permissions

    @staticmethod
    async def count_roles_with_permission(db: AsyncSession, permission_name: str) -> int:
        stmt = (
            select(func.count())
            .select_from(RolePermission)
            .join(Permission, Permission.permission_id == RolePermission.permission_id)
            .where(Permission.name == permission_name)
        )
        result = await db.execute(stmt)
        return result.scalar() or 0

    @staticmethod
    async def assign_permission_to_role(
        db: AsyncSession,
        role_id: str,
        permission_id: str,
    ) -> dict:
        await RBACService.get_role_or_404(db, role_id)
        await RBACService.get_permission_or_404(db, permission_id)

        existing_stmt = select(RolePermission).where(
            RolePermission.role_id == role_id,
            RolePermission.permission_id == permission_id,
        )
        existing_result = await db.execute(existing_stmt)
        existing = existing_result.scalars().first()

        if existing:
            raise HTTPException(status_code=400, detail="Permission already assigned")

        db.add(RolePermission(role_id=role_id, permission_id=permission_id))
        await db.commit()

        return {
            "role_id": role_id,
            "permission_id": permission_id,
        }

    @staticmethod
    async def remove_permission_from_role(
        db: AsyncSession,
        role_id: str,
        permission_id: str,
    ) -> dict:
        permission = await RBACService.get_permission_or_404(db, permission_id)

        existing_stmt = select(RolePermission).where(
            RolePermission.role_id == role_id,
            RolePermission.permission_id == permission_id,
        )
        existing_result = await db.execute(existing_stmt)
        existing_link = existing_result.scalars().first()

        if not existing_link:
            raise HTTPException(status_code=404, detail="Role-permission mapping not found")

        if permission.name == _MANAGE_USERS:
            remaining = await RBACService.count_roles_with_permission(db, _MANAGE_USERS)
            if remaining <= 1:
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot remove the last {_MANAGE_USERS} permission",
                )

        stmt = delete(RolePermission).where(
            RolePermission.role_id == role_id,
            RolePermission.permission_id == permission_id,
        )
        await db.execute(stmt)
        await db.commit()

        return {
            "role_id": role_id,
            "permission_id": permission_id,
        }

    @staticmethod
    async def assign_role_to_user(
        db: AsyncSession,
        user_id: str,
        role_id: str,
        admin_user_id: str,
    ) -> dict:
        if admin_user_id == user_id:
            raise HTTPException(
                status_code=400,
                detail="You cannot change your own role.",
            )

        user = await RBACService.get_user_or_404(db, user_id)
        role = await RBACService.get_role_or_404(db, role_id)

        if not role.is_active:
            raise HTTPException(
                status_code=400,
                detail="Cannot assign an inactive role",
            )

        user.role_id = role.role_id
        await db.commit()
        await db.refresh(user)

        return {
            "user_id": str(user.user_id),
            "role_id": str(role.role_id),
            "role_name": role.name,
        }

    @staticmethod
    def build_user_permissions_view(user: User) -> UserWithPermissionsView | None:
        if not user.role:
            return None

        permissions = []
        for role_permission in user.role.permissions:
            permission = role_permission.permission
            if not permission:
                continue

            permissions.append(
                PermissionDetail(
                    permission_id=str(permission.permission_id),
                    name=permission.name,
                    description=permission.description,
                )
            )

        return UserWithPermissionsView(
            user_id=str(user.user_id),
            name=user.name,
            email=user.email,
            is_active=user.is_active,
            role=RoleDetail(
                role_id=str(user.role.role_id),
                name=user.role.name,
                description=user.role.description,
                is_active=user.role.is_active,
            ),
            permissions=permissions,
        )

    @staticmethod
    async def list_all_users_with_permissions(
        db: AsyncSession,
    ) -> list[UserWithPermissionsView]:
        stmt = (
            select(User)
            .options(
                selectinload(User.role),
                selectinload(User.role)
                .selectinload(Role.permissions)
                .selectinload(RolePermission.permission),
            )
        )

        result = await db.execute(stmt)
        users = result.scalars().all()

        if not users:
            return []

        response_data = []
        for user in users:
            user_view = RBACService.build_user_permissions_view(user)
            if user_view:
                response_data.append(user_view)

        return response_data
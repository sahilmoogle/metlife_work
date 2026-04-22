
from typing import Optional

from pydantic import BaseModel

# ── Request / Response models ────────────────────────────────────────


class RoleView(BaseModel):
    role_id: str
    name: str
    description: Optional[str] = None
    is_active: bool


class PermissionView(BaseModel):
    permission_id: str
    name: str
    description: Optional[str] = None
    is_active: bool


class RoleDetail(BaseModel):
    role_id: str
    name: str
    description: Optional[str] = None
    is_active: bool


class PermissionDetail(BaseModel):
    permission_id: str
    name: str
    description: Optional[str] = None
    is_active: bool


class UserWithPermissionsView(BaseModel):
    user_id: str
    name: str
    email: str
    is_active: bool
    role: RoleDetail
    permissions: list[PermissionDetail]
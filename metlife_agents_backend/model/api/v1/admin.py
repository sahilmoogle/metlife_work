"""
Pydantic schemas for the Admin · Access Control API.

REQUEST  models: CreateUserRequest, UpdateUserRequest
RESPONSE models: UserPermissionRow, UserListResponse, PermissionMatrixResponse
"""

from __future__ import annotations

from pydantic import BaseModel, EmailStr, field_validator

VALID_ROLES = {"Admin", "Manager", "Reviewer", "Viewer"}
VALID_PERMISSIONS = {
    "run_workflow", "start_agent", "hitl_approve",
    "edit_lead", "export_data", "manage_users",
}


# ── REQUEST MODELS ───────────────────────────────────────────────────

class CreateUserRequest(BaseModel):
    """Body for POST /admin/users (+Add User button)."""

    name: str
    email: EmailStr
    password: str
    role: str = "Viewer"

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        if v not in VALID_ROLES:
            raise ValueError(f"role must be one of {sorted(VALID_ROLES)}")
        return v


class UpdateUserRequest(BaseModel):
    """Body for PATCH /admin/users/{user_id} — all fields optional."""

    name: str | None = None
    role: str | None = None
    is_active: bool | None = None

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str | None) -> str | None:
        if v is not None and v not in VALID_ROLES:
            raise ValueError(f"role must be one of {sorted(VALID_ROLES)}")
        return v


# ── RESPONSE MODELS ──────────────────────────────────────────────────

class UserPermissionRow(BaseModel):
    """Single row in the Access Control permissions table.

    Mirrors the UI columns:
      User | Role | Run Workflow | Start Agent | HITL Approve |
      Edit Lead | Export Data | Manage Users | Active
    """

    user_id: str
    name: str
    email: str
    role: str
    is_active: bool
    # Resolved boolean permission flags for each UI column
    run_workflow: bool
    start_agent: bool
    hitl_approve: bool
    edit_lead: bool
    export_data: bool
    manage_users: bool


class UserListResponse(BaseModel):
    """Response for GET /admin/users.

    Includes the full user table plus a role count summary for the
    four stat cards at the top of the Access Control screen.
    """

    users: list[UserPermissionRow]
    total: int
    # e.g. {"Admin": 2, "Manager": 3, "Reviewer": 4, "Viewer": 6}
    roles_summary: dict[str, int]


class PermissionMatrixResponse(BaseModel):
    """Response for GET /admin/users/permissions/matrix.

    Provides the raw role → permission mapping so the frontend
    can render the table headers dynamically.
    """

    roles: list[str]
    # e.g. {"Admin": {"run_workflow": True, ...}, "Viewer": {...}}
    matrix: dict[str, dict[str, bool]]


class UpdateUserPermissionsRequest(BaseModel):
    """Body for PATCH /admin/users/{user_id}/permissions.

    Send only the permissions you want to change.
    Pass ``null`` / omit a key to remove its override and revert to
    the role default.

    Example — give a Viewer the ability to approve HITL gates::

        {"hitl_approve": true}

    Example — revoke run_workflow from a Manager::

        {"run_workflow": false}

    Example — clear ALL overrides (revert user to pure role defaults)::

        {"run_workflow": null, "start_agent": null, ...}
    """

    run_workflow: bool | None = None
    start_agent:  bool | None = None
    hitl_approve: bool | None = None
    edit_lead:    bool | None = None
    export_data:  bool | None = None
    manage_users: bool | None = None


class UserPermissionsResponse(BaseModel):
    """Response for GET/PATCH /admin/users/{user_id}/permissions."""

    user_id: str
    name: str
    email: str
    role: str
    # Role default flags (what the role gives by default)
    role_defaults: dict[str, bool]
    # Explicit overrides stored for this user (only present keys are overrides)
    overrides: dict[str, bool]
    # Final resolved flags (defaults merged with overrides) — used by UI checkboxes
    effective: dict[str, bool]

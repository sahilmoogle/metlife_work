from enum import Enum


class DefaultRole(str, Enum):
    ADMIN = "admin"
    MANAGER = "manager"
    REVIEWER = "reviewer"
    VIEWER = "viewer"


class DefaultPermission(str, Enum):
    RUN_WORKFLOW = "run_workflow"
    START_AGENT = "start_agent"
    HITL_APPROVE = "hitl_approve"
    HITL_REJECT = "hitl_reject"
    EDIT_LEAD = "edit_lead"
    EXPORT_DATA = "export_data"
    MANAGE_USERS = "manage_users"
    VIEW_AUDIT_LOG = "view_audit_log"
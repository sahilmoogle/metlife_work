import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "react-i18next";
import {
  createAdminUser,
  deactivateAdminUser,
  getAdminUser,
  getAdminUserPermissions,
  getPermissionMatrix,
  listAdminUsers,
  updateAdminUser,
  updateAdminUserPermissions,
} from "../src/services/adminApi";
import { getIntakeMode, intakeConsultation, intakeQuote, setIntakeMode } from "../src/services/agentsApi";
import { fetchRecentSseEvents } from "../src/services/sseStream";
import {
  SCENARIO_DEMO_CREATABLE_IDS,
  SCENARIO_DEMO_ORDER,
  SCENARIO_DEMO_PRESETS,
} from "../src/utils/scenarioDemoPresets";
import { formatRelativeTime } from "../src/utils/relativeTime";
import { useRelativeClock } from "../src/hooks/useRelativeClock";

// â”€â”€ Audit log helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const EVENT_DOT = {
  workflow_state:   "bg-emerald-500",
  hitl_approved:    "bg-emerald-500",
  hitl_edited:      "bg-amber-500",
  hitl_required:    "bg-violet-500",
  hitl_rejected:    "bg-rose-500",
  node_transition:  "bg-sky-500",
  batch_progress:   "bg-indigo-500",
  lead_converted:   "bg-teal-500",
};

/** Map an SSE event row from the backend â†’ the shape the UI list expects. */
const sseEventToAuditRow = (ev) => {
  const actor = ev.actor_name || ev.actor_email || "System";
  const role  = ev.actor_role  || "System";
  const lead  = ev.lead_name   || ev.lead_id || "";

  let text;
  switch (ev.event_type) {
    case "workflow_state":
      text = `${actor} ${ev.status || "updated"} workflow${lead ? ` for ${lead}` : ""}`;
      break;
    case "hitl_required":
      text = `${actor ? actor + " triggered" : "System triggered"} HITL gate ${ev.gate || ""}${lead ? ` for ${lead}` : ""}`;
      break;
    case "hitl_approved":
      text = `${actor} approved ${ev.gate || "HITL gate"}${lead ? ` for ${lead}` : ""}`;
      break;
    case "hitl_edited":
      text = `${actor} submitted edits on ${ev.gate || "HITL gate"}${lead ? ` for ${lead}` : ""}`;
      break;
    case "hitl_rejected":
      text = `${actor} rejected ${ev.gate || "HITL gate"}${lead ? ` for ${lead}` : ""}${ev.reason ? ` â€” ${ev.reason}` : ""}`;
      break;
    case "node_transition":
      text = `${actor ? actor + ": " : ""}Node ${ev.node || ""} ${ev.status || "transitioned"}${lead ? ` (${lead})` : ""}`;
      break;
    case "batch_progress":
      text = `Batch run: ${ev.processed ?? "?"}/${ev.total ?? "?"} leads processed`;
      break;
    case "lead_converted":
      text = `${actor} confirmed sales handoff${lead ? ` for ${lead}` : ""}`;
      break;
    default:
      text = ev.event_type?.replace(/_/g, " ") || "System event";
  }

  return {
    dot:  EVENT_DOT[ev.event_type] || "bg-gray-400",
    text,
    at:   ev.persisted_at || ev.created_at || new Date().toISOString(),
    role,
  };
};

const roles = [
  {
    key: "admin",
    label: "Admins",
    subtitle: "Full access",
    tone: "bg-rose-50 text-rose-700 ring-rose-100 dark:bg-rose-500/10 dark:text-rose-200 dark:ring-rose-500/20",
    topBar: "bg-rose-500",
  },
  {
    key: "manager",
    label: "Managers",
    subtitle: "Run + HITL",
    tone: "bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-500/20",
    topBar: "bg-emerald-500",
  },
  {
    key: "reviewer",
    label: "Reviewers",
    subtitle: "HITL only",
    tone: "bg-violet-50 text-violet-700 ring-violet-100 dark:bg-violet-500/10 dark:text-fuchsia-200 dark:ring-violet-500/20",
    topBar: "bg-violet-500",
  },
  {
    key: "viewer",
    label: "Viewers",
    subtitle: "Read-only",
    tone: "bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/20",
    topBar: "bg-amber-500",
  },
];

const roleDefinitions = {
  admin: {
    badge: "ADMIN",
    badgeTone: "bg-rose-50 text-rose-700 ring-1 ring-rose-100",
    title: "Full platform access",
    description:
      "Run/stop workflows, start any agent, approve all HITL gates, manage users, export data, configure scenarios. Can modify RBAC roles.",
  },
  manager: {
    badge: "MANAGER",
    badgeTone: "bg-violet-50 text-violet-700 ring-1 ring-violet-100",
    title: "Workflow + HITL",
    description:
      'Start/pause/resume workflows, click "Run from here" on agents, approve G1â€“G5 gates, edit leads. Cannot manage users.',
  },
  reviewer: {
    badge: "REVIEWER",
    badgeTone: "bg-amber-50 text-amber-700 ring-1 ring-amber-100",
    title: "HITL only",
    description:
      "Review and approve/reject HITL gates (G1â€“G5). Can view lead details and edit content. Cannot start workflows or agents.",
  },
  viewer: {
    badge: "VIEWER",
    badgeTone: "bg-gray-100 text-gray-700 ring-1 ring-gray-200",
    title: "Read-only",
    description:
      "View dashboard, lead list, workflow status, analytics. No edit or action permissions.",
  },
};

const roleBadge = {
  admin: "bg-rose-50 text-rose-700 ring-rose-100 dark:bg-rose-500/10 dark:text-rose-200 dark:ring-rose-500/20",
  manager: "bg-violet-50 text-violet-700 ring-violet-100 dark:bg-violet-500/10 dark:text-fuchsia-200 dark:ring-violet-500/20",
  reviewer: "bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/20",
  viewer: "bg-gray-100 text-gray-700 ring-gray-200 dark:bg-white/10 dark:text-volt-text dark:ring-volt-borderSoft",
};

const avatarTone = {
  admin: "bg-rose-500",
  manager: "bg-violet-500",
  reviewer: "bg-amber-500",
  viewer: "bg-slate-500",
};

const permissionCols = [
  { key: "run_workflow", label: "Run Workflow" },
  { key: "start_agent", label: "Start Agent" },
  { key: "hitl_approve", label: "HITL Approve" },
  { key: "edit_lead", label: "Edit Lead" },
  { key: "export_data", label: "Export Data" },
  { key: "manage_users", label: "Manage Users" },
];

const normalizeRoleKey = (role) => String(role || "").trim().toLowerCase();

const roleCanManageUsers = (user) => {
  if (!user) return false;
  const override = user.custom_permissions?.manage_users;
  if (override === true) return true;
  if (override === false) return false;
  return user.role === "Admin";
};

/** Matches backend `has_permission` for `start_agent` (Admin/Manager by default, per-user override). */
const roleCanStartAgent = (user) => {
  if (!user) return false;
  const override = user.custom_permissions?.start_agent;
  if (override === true) return true;
  if (override === false) return false;
  const r = String(user.role || "").trim();
  return r === "Admin" || r === "Manager";
};

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());

const roleOptions = [
  { value: "Admin", label: "Admin" },
  { value: "Manager", label: "Manager" },
  { value: "Reviewer", label: "Reviewer" },
  { value: "Viewer", label: "Viewer" },
];

const permKeys = permissionCols.map((c) => c.key);

const Toggle = ({ checked, onChange, ariaLabel }) => {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={checked}
      onClick={onChange}
      title={ "Deactivate user" }
      className={`relative inline-flex h-5 w-9 items-center rounded-full border transition ${
        checked
          ? "border-emerald-200 bg-emerald-500"
          : "border-gray-200 bg-gray-100 dark:border-volt-borderSoft dark:bg-white/10"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition ${
          checked ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
};

const Check = () => (
  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-500/20">
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d="M20 6 9 17l-5-5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </span>
);

const Dash = () => (
  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-50 text-gray-400 ring-1 ring-gray-200 dark:bg-white/5 dark:text-volt-muted2 dark:ring-volt-borderSoft">
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d="M6 12h12"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  </span>
);

const Settings = () => {
  useRelativeClock(30000);
  const { token, user: currentUser } = useAuth();
  const { t } = useTranslation();

  const [accessAuditLog, setAccessAuditLog] = useState([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditError, setAuditError] = useState("");
  const [auditVisibleCount, setAuditVisibleCount] = useState(6);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("Viewer");

  const [isViewOpen, setIsViewOpen] = useState(false);
  const [viewUserId, setViewUserId] = useState("");
  const [viewUser, setViewUser] = useState(null);
  const [viewLoading, setViewLoading] = useState(false);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editUserId, setEditUserId] = useState("");
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("Viewer");
  const [editActive, setEditActive] = useState(true);

  const [isPermOpen, setIsPermOpen] = useState(false);
  const [permUserId, setPermUserId] = useState("");
  const [permLoading, setPermLoading] = useState(false);
  const [permMatrix, setPermMatrix] = useState(null);
  const [permDetail, setPermDetail] = useState(null);
  const [permOverridesUi, setPermOverridesUi] = useState(() => ({}));

  const canManage = roleCanManageUsers(currentUser);
  const canStartAgent = roleCanStartAgent(currentUser);

  // â”€â”€ Workflow Intake Mode â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [intakeMode, setIntakeModeState] = useState(null); // "automatic" | "manual" | null (loading)
  const [intakeModeLoading, setIntakeModeLoading] = useState(true);
  const [intakeModeError, setIntakeModeError] = useState("");
  const [intakeModeSaving, setIntakeModeSaving] = useState(false);
  const [intakeModeInfoOpen, setIntakeModeInfoOpen] = useState(false);
  const [demoSelectedScenarios, setDemoSelectedScenarios] = useState(() => [...SCENARIO_DEMO_CREATABLE_IDS]);
  const [demoSubmitting, setDemoSubmitting] = useState(false);
  const [demoSubmitProgress, setDemoSubmitProgress] = useState(null); // { current: 1, total: 6 }
  const [demoResults, setDemoResults] = useState(null); // { scenario, ok, data?, error? }[]
  const [demoError, setDemoError] = useState("");
  const [openRoleInfo, setOpenRoleInfo] = useState(null); // "admin"|"manager"|"reviewer"|"viewer"|null

  const fetchIntakeMode = useCallback(async () => {
    if (!token) return;
    setIntakeModeLoading(true);
    setIntakeModeError("");
    try {
      const data = await getIntakeMode(token);
      setIntakeModeState(data?.mode ?? "automatic");
    } catch (e) {
      setIntakeModeError(e.message || "Failed to load intake mode.");
    } finally {
      setIntakeModeLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void fetchIntakeMode();
  }, [fetchIntakeMode]);

  const handleToggleIntakeMode = async () => {
    if (!token || !canStartAgent || intakeModeSaving || intakeModeLoading) return;
    const next = intakeMode === "automatic" ? "manual" : "automatic";
    setIntakeModeSaving(true);
    setIntakeModeError("");
    try {
      const data = await setIntakeMode(token, next);
      setIntakeModeState(data?.mode ?? next);
    } catch (e) {
      setIntakeModeError(e.message || "Failed to update intake mode.");
    } finally {
      setIntakeModeSaving(false);
    }
  };

  const toggleDemoScenario = useCallback((id) => {
    if (id === "S4") return;
    setDemoSelectedScenarios((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      const next = [...prev, id];
      next.sort((a, b) => SCENARIO_DEMO_ORDER.indexOf(a) - SCENARIO_DEMO_ORDER.indexOf(b));
      return next;
    });
    setDemoError("");
    setDemoResults(null);
  }, []);

  const selectAllCreatableScenarios = useCallback(() => {
    setDemoSelectedScenarios([...SCENARIO_DEMO_CREATABLE_IDS]);
    setDemoError("");
    setDemoResults(null);
  }, []);

  const clearDemoScenarios = useCallback(() => {
    setDemoSelectedScenarios([]);
    setDemoError("");
    setDemoResults(null);
  }, []);

  const handleDemoScenarioIntake = async (e) => {
    e.preventDefault();
    if (!token || !canStartAgent || demoSubmitting) return;

    const ids = demoSelectedScenarios.filter((id) => SCENARIO_DEMO_PRESETS[id]?.path !== "none");
    if (ids.length === 0) {
      setDemoError("Select at least one scenario (S4 cannot be created here).");
      return;
    }

    setDemoSubmitting(true);
    setDemoError("");
    setDemoResults(null);
    const baseTs = Date.now();
    const results = [];

    try {
      for (let i = 0; i < ids.length; i++) {
        const sid = ids[i];
        setDemoSubmitProgress({ current: i + 1, total: ids.length });
        const preset = SCENARIO_DEMO_PRESETS[sid];
        const suffix = `${baseTs}-${i}-${sid}`;
        const email = `demo.${sid.toLowerCase()}.${baseTs}.${i}@example.com`;
        const first = "Demo";
        const last = `Lead ${sid}`;
        try {
          let data;
          if (preset.path === "quote") {
            data = await intakeQuote(token, {
              quote_id: `settings-demo-${suffix}`,
              first_name: first,
              last_name: last,
              email,
              registration_source: `settings_demo_${sid.toLowerCase()}`,
              product_code: "DEMO",
              ...preset.build(),
            });
          } else {
            data = await intakeConsultation(token, {
              request_id: `settings-demo-${suffix}`,
              first_name: first,
              last_name: last,
              email,
              ...preset.build(),
            });
          }
          results.push({ scenario: sid, ok: true, data });
        } catch (err) {
          results.push({
            scenario: sid,
            ok: false,
            error: err.message || "Intake failed.",
          });
        }
      }
      setDemoResults(results);
    } finally {
      setDemoSubmitting(false);
      setDemoSubmitProgress(null);
    }
  };

  const hasDemoSelection = demoSelectedScenarios.some((id) => SCENARIO_DEMO_PRESETS[id]?.path !== "none");

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoadError("");
    setLoading(true);
    try {
      const data = await listAdminUsers(token);
      setUsers(Array.isArray(data?.users) ? data.users : []);
    } catch (e) {
      setUsers([]);
      setLoadError(e.message || "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const fetchAuditLog = useCallback(async () => {
    if (!token) return;
    setAuditError("");
    setAuditLoading(true);
    try {
      const rows = await fetchRecentSseEvents(token, { limit: 24 });
      setAccessAuditLog(
        (Array.isArray(rows) ? rows : [])
          .filter((ev) => ev?.event_type)
          .map(sseEventToAuditRow)
      );
      setAuditVisibleCount(6);
    } catch (e) {
      setAuditError(e.message || "Failed to load audit log.");
    } finally {
      setAuditLoading(false);
    }
  }, [token]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchAuditLog();
  }, [fetchAuditLog]);

  const roleCounts = useMemo(() => {
    const counts = { admin: 0, manager: 0, reviewer: 0, viewer: 0 };
    users.forEach((u) => {
      const roleKey = normalizeRoleKey(u.role);
      if (counts[roleKey] != null && u.is_active) counts[roleKey] += 1;
    });
    return counts;
  }, [users]);

  const totals = useMemo(() => {
    const totalUsers = users.length;
    const totalRoles = new Set(users.map((u) => u.role).filter(Boolean)).size;
    return { totalUsers, totalRoles };
  }, [users]);

  const totalRows = users.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = Math.min(totalRows, startIndex + pageSize);

  const pagedUsers = useMemo(() => users.slice(startIndex, endIndex), [endIndex, startIndex, users]);

  useEffect(() => {
    // Reset to first page when page size changes or dataset changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
  }, [pageSize, totalRows]);

  useEffect(() => {
    // Clamp page when dataset changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  const toggleUserActive = async (row) => {
    if (!token) return;
    if (!canManage) return;
    setActionError("");
    setActionLoading(true);
    try {
      const updated = await updateAdminUser(token, row.user_id, { is_active: !row.is_active });
      setUsers((prev) => prev.map((u) => (u.user_id === updated.user_id ? updated : u)));
    } catch (e) {
      setActionError(e.message || "Failed to update user.");
    } finally {
      setActionLoading(false);
    }
  };

  const openView = async (row) => {
    if (!token) return;
    setActionError("");
    setIsViewOpen(true);
    setViewUserId(row?.user_id || "");
    setViewUser(null);
    setViewLoading(true);
    try {
      const data = await getAdminUser(token, row.user_id);
      setViewUser(data || null);
    } catch (e) {
      setActionError(e.message || "Failed to load user.");
      setViewUser(null);
    } finally {
      setViewLoading(false);
    }
  };

  const openEdit = (row) => {
    setActionError("");
    setEditUserId(row?.user_id || "");
    setEditName(String(row?.name || ""));
    setEditRole(row?.role || "Viewer");
    setEditActive(Boolean(row?.is_active));
    setIsEditOpen(true);
  };

  const submitEdit = async () => {
    if (!token) return;
    if (!canManage) return;
    setActionError("");

    const name = editName.trim();
    if (!name) {
      setActionError("Name is required.");
      return;
    }

    setActionLoading(true);
    try {
      const updated = await updateAdminUser(token, editUserId, { name, role: editRole, is_active: editActive });
      setUsers((prev) => prev.map((u) => (u.user_id === updated.user_id ? updated : u)));
      setIsEditOpen(false);
    } catch (e) {
      setActionError(e.message || "Failed to update user.");
    } finally {
      setActionLoading(false);
    }
  };

  const confirmDeactivate = async (row) => {
    if (!token) return;
    if (!canManage) return;
    if (!row?.user_id) return;

    const ok = window.confirm(`Deactivate user '${row.name}' (${row.email})?`);
    if (!ok) return;

    setActionError("");
    setActionLoading(true);
    try {
      await deactivateAdminUser(token, row.user_id);
      setUsers((prev) => prev.map((u) => (u.user_id === row.user_id ? { ...u, is_active: false } : u)));
    } catch (e) {
      setActionError(e.message || "Failed to deactivate user.");
    } finally {
      setActionLoading(false);
    }
  };

  const openPermissions = async (row) => {
    if (!token) return;
    setActionError("");
    setIsPermOpen(true);
    setPermUserId(row?.user_id || "");
    setPermDetail(null);
    setPermLoading(true);
    try {
      const [matrix, detail] = await Promise.all([
        permMatrix ? Promise.resolve(permMatrix) : getPermissionMatrix(token),
        getAdminUserPermissions(token, row.user_id),
      ]);

      setPermMatrix(matrix);
      setPermDetail(detail);

      const overrides = detail?.overrides || {};
      const ui = {};
      permKeys.forEach((k) => {
        if (overrides[k] === true) ui[k] = "grant";
        else if (overrides[k] === false) ui[k] = "revoke";
        else ui[k] = "default";
      });
      setPermOverridesUi(ui);
    } catch (e) {
      setActionError(e.message || "Failed to load permissions.");
      setPermDetail(null);
    } finally {
      setPermLoading(false);
    }
  };

  const effectiveFromUi = useCallback(
    (key) => {
      const defaults = permDetail?.role_defaults || {};
      const ui = permOverridesUi?.[key] || "default";
      if (ui === "grant") return true;
      if (ui === "revoke") return false;
      return Boolean(defaults[key]);
    },
    [permDetail, permOverridesUi]
  );

  const submitPermissions = async () => {
    if (!token) return;
    if (!canManage) return;
    if (!permUserId) return;
    setActionError("");
    setActionLoading(true);
    try {
      const body = {};
      permKeys.forEach((k) => {
        const ui = permOverridesUi?.[k] || "default";
        body[k] = ui === "grant" ? true : ui === "revoke" ? false : null;
      });

      const updated = await updateAdminUserPermissions(token, permUserId, body);
      setPermDetail(updated);

      // Update the list row (table uses resolved effective flags).
      await refresh();
      setIsPermOpen(false);
    } catch (e) {
      setActionError(e.message || "Failed to update permissions.");
    } finally {
      setActionLoading(false);
    }
  };

  const openAdd = () => {
    setActionError("");
    setNewName("");
    setNewEmail("");
    setNewPassword("");
    setNewRole("Viewer");
    setIsAddOpen(true);
  };

  const submitAdd = async () => {
    if (!token) return;
    if (!canManage) return;
    setActionError("");

    const name = newName.trim();
    const email = newEmail.trim().toLowerCase();
    const password = newPassword;

    if (!name) {
      setActionError("Name is required.");
      return;
    }
    if (!email || !isValidEmail(email)) {
      setActionError("Enter a valid email address.");
      return;
    }
    if (!password || password.length < 8) {
      setActionError("Password must be at least 8 characters.");
      return;
    }

    setActionLoading(true);
    try {
      const created = await createAdminUser(token, { name, email, password, role: newRole });
      setUsers((prev) => [created, ...prev]);
      setIsAddOpen(false);
    } catch (e) {
      setActionError(e.message || "Failed to create user.");
    } finally {
      setActionLoading(false);
    }
  };

  const isAutomatic = intakeMode === "automatic";

  return (
    <section className="space-y-3">
      {/* â”€â”€ Workflow Intake Mode â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="app-surface-panel p-3">
        <div className="flex items-center justify-between gap-4">

          {/* Left: icon + title + i button */}
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`inline-flex h-8 w-8 flex-none items-center justify-center rounded-xl ring-1 transition-colors ${
                isAutomatic
                  ? "bg-emerald-50 text-emerald-600 ring-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-200 dark:ring-emerald-500/20"
                  : "bg-amber-50 text-amber-600 ring-amber-100 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-500/20"
              }`}
            >
              {isAutomatic ? (
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
                  <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M12 8v4l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              )}
            </span>

            <p className="text-sm font-semibold text-[#1e2a52] dark:text-white whitespace-nowrap">
              Workflow Intake Mode
            </p>

            {/* Info button + popover */}
            <div className="relative">
              <button
                type="button"
                aria-label="Learn about intake modes"
                onClick={() => setIntakeModeInfoOpen((v) => !v)}
                className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 transition hover:border-indigo-200 hover:text-indigo-500 dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-muted2 dark:hover:text-indigo-300"
              >
                <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                  <path d="M12 16v-4M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>

              {intakeModeInfoOpen ? (
                <>
                  {/* Backdrop */}
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setIntakeModeInfoOpen(false)}
                  />
                  {/* Popover */}
                  <div className="absolute left-0 top-7 z-40 w-72 rounded-2xl border border-gray-100 bg-white p-4 shadow-lg dark:border-volt-borderSoft dark:bg-volt-card">
                    <p className="mb-3 text-xs font-semibold text-gray-700 dark:text-white">
                      Intake Mode Definitions
                    </p>
                    <div className="space-y-3">
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-emerald-500 text-white">
                          <svg viewBox="0 0 24 24" fill="none" className="h-2.5 w-2.5" aria-hidden="true">
                            <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </span>
                        <div>
                          <p className="text-[11px] font-semibold text-gray-800 dark:text-white">Automatic</p>
                          <p className="mt-0.5 text-[11px] text-gray-500 dark:text-volt-muted2">
                            Every new lead from an intake form immediately triggers the full AI agent workflow â€” scenario routing, content generation, and HITL queue.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-amber-500 text-white">
                          <svg viewBox="0 0 24 24" fill="none" className="h-2.5 w-2.5" aria-hidden="true">
                            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.2" />
                            <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                          </svg>
                        </span>
                        <div>
                          <p className="text-[11px] font-semibold text-gray-800 dark:text-white">Manual</p>
                          <p className="mt-0.5 text-[11px] text-gray-500 dark:text-volt-muted2">
                            Leads are saved but no workflow starts. A manager must go to the lead detail page and click "Start Workflow" to run the agent.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : null}
            </div>

            {intakeModeError ? (
              <p className="text-xs font-medium text-rose-600 dark:text-rose-300">{intakeModeError}</p>
            ) : null}
          </div>

          {/* Right: badge + toggle */}
          <div className="flex flex-none items-center gap-3">
            <span
              className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold ring-1 transition-colors ${
                intakeModeLoading
                  ? "bg-gray-50 text-gray-400 ring-gray-100 dark:bg-white/5 dark:text-volt-muted2 dark:ring-volt-borderSoft"
                  : isAutomatic
                  ? "bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-500/20"
                  : "bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/20"
              }`}
            >
              {intakeModeLoading ? "â€”" : isAutomatic ? "AUTOMATIC" : "MANUAL"}
            </span>

            <button
              type="button"
              aria-label="Toggle workflow intake mode"
              aria-pressed={isAutomatic}
              disabled={!canStartAgent || intakeModeLoading || intakeModeSaving}
              onClick={handleToggleIntakeMode}
              title={
                !canStartAgent
                  ? "You need Start Agent permission (Admin/Manager) to change this."
                  : isAutomatic
                  ? "Switch to Manual mode"
                  : "Switch to Automatic mode"
              }
              className={`relative inline-flex h-6 w-11 flex-none items-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-50 ${
                isAutomatic
                  ? "border-emerald-200 bg-emerald-500"
                  : "border-gray-200 bg-gray-100 dark:border-volt-borderSoft dark:bg-white/10"
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                  isAutomatic ? "translate-x-5" : "translate-x-0.5"
                } ${intakeModeSaving ? "animate-pulse" : ""}`}
              />
            </button>
          </div>
        </div>
      </div>

      {canStartAgent && token ? (
        <div className="app-surface-panel p-4">
          <p className="text-sm font-semibold text-[#1e2a52] dark:text-white">Demo scenario lead</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-volt-muted">
            Select scenarios — each creates one lead with preset survey/consultation data for{" "}
            <span className="font-medium text-gray-700 dark:text-volt-text">A2</span>. Names and email are generated
            automatically (e.g. Demo Lead S1, <span className="font-mono text-[11px]">demo.s1…@example.com</span>). In{" "}
            <span className="font-medium text-gray-700 dark:text-volt-text">Automatic</span> mode workflows start
            immediately.
          </p>
          <form onSubmit={handleDemoScenarioIntake} className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-gray-600 dark:text-volt-muted2">Scenarios</span>
                <button
                  type="button"
                  onClick={selectAllCreatableScenarios}
                  className="text-[11px] font-semibold text-[#004EB2] underline hover:text-[#003B86] dark:text-indigo-300"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={clearDemoScenarios}
                  className="text-[11px] font-semibold text-gray-500 underline hover:text-gray-700 dark:text-volt-muted2"
                >
                  Clear
                </button>
                <span className="text-[11px] text-gray-400 dark:text-volt-muted2">
                  ({demoSelectedScenarios.length} selected)
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                {SCENARIO_DEMO_ORDER.map((id) => {
                  const p = SCENARIO_DEMO_PRESETS[id];
                  const blocked = p?.path === "none";
                  const checked = demoSelectedScenarios.includes(id);
                  return (
                    <label
                      key={id}
                      title={blocked ? p?.help : p?.description}
                      className={`inline-flex cursor-pointer items-center gap-2 text-xs ${
                        blocked ? "cursor-not-allowed opacity-60" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked && !blocked}
                        disabled={blocked}
                        onChange={() => toggleDemoScenario(id)}
                        className="h-3.5 w-3.5 rounded border-gray-300 text-[#004EB2] focus:ring-[#004EB2]"
                      />
                      <span className={blocked ? "text-gray-400 line-through" : "text-gray-700 dark:text-volt-text"}>
                        {p?.label ?? id}
                        {blocked ? " (batch only)" : ""}
                      </span>
                    </label>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] text-amber-800/90 dark:text-amber-200/90">
                S4 is only assigned via dormant batch revival — not from this form.{" "}
                <Link to="/campaigns" className="font-semibold text-[#004EB2] underline hover:text-[#003B86] dark:text-indigo-300">
                  Campaigns
                </Link>
              </p>
            </div>
            <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={demoSubmitting || intakeModeLoading || !hasDemoSelection}
                className="inline-flex h-9 items-center rounded-full bg-[#004EB2] px-4 text-xs font-semibold text-white shadow-[0_10px_25px_rgba(0,78,178,0.16)] transition hover:bg-[#003B86] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {demoSubmitting
                  ? demoSubmitProgress
                    ? `Creating ${demoSubmitProgress.current}/${demoSubmitProgress.total}…`
                    : "Starting…"
                  : `Create demo leads (${demoSelectedScenarios.filter((id) => SCENARIO_DEMO_PRESETS[id]?.path !== "none").length})`}
              </button>
              {demoError ? (
                <span className="text-xs font-medium text-rose-600 dark:text-rose-300">{demoError}</span>
              ) : null}
            </div>
          </form>
          {demoResults && demoResults.length > 0 ? (
            <ul className="mt-3 space-y-2 rounded-xl border border-emerald-100 bg-emerald-50/80 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100">
              {demoResults.map((row) => (
                <li key={row.scenario} className="border-b border-emerald-100/80 pb-2 last:border-b-0 last:pb-0 dark:border-emerald-500/20">
                  <span className="font-semibold">{row.scenario}</span>
                  {row.ok && row.data ? (
                    <>
                      {" "}
                      — started: {row.data.started ? "yes" : "no"}, intake_mode: {row.data.intake_mode ?? "—"}
                      {row.data.lead_id ? (
                        <>
                          {" · "}
                          <Link
                            to={`/leads/${encodeURIComponent(row.data.lead_id)}`}
                            className="font-semibold text-[#004EB2] underline hover:text-[#003B86] dark:text-indigo-300"
                          >
                            Open lead
                          </Link>
                          {row.data.thread_id ? (
                            <span className="text-emerald-800/90 dark:text-emerald-200/90">
                              {" "}
                              (thread {String(row.data.thread_id).slice(0, 8)}…)
                            </span>
                          ) : null}
                        </>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-rose-700 dark:text-rose-300"> — {row.error}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {loadError ? (
        <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
          {loadError}{" "}
          <button type="button" className="ml-2 font-semibold underline" onClick={refresh}>
            {t("common.retry")}
          </button>
        </div>
      ) : null}
      {actionError ? (
        <div className="rounded-2xl border border-amber-100 bg-amber-50/80 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          {actionError}
        </div>
      ) : null}

      <div className="app-surface-panel p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[#1e2a52] dark:text-white">{t("settings.accessControlTitle")}</h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-volt-muted">
              {t("settings.accessControlSubtitle")}
            </p>
          </div>

          <button
            type="button"
            disabled={!canManage || actionLoading}
            onClick={openAdd}
            className="inline-flex h-9 items-center gap-2 rounded-full bg-[#004EB2] px-4 text-xs font-semibold text-white shadow-[0_10px_25px_rgba(0,78,178,0.16)] transition hover:bg-[#003B86] disabled:cursor-not-allowed disabled:opacity-60"
            title={canManage ? "Add user" : "You do not have permission to manage users"}
          >
            {t("settings.addUser")}
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {roles.map((r) => (
            <div
              key={r.key}
              className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-4 shadow-[inset_0_1px_0_rgba(0,0,0,0.02)] dark:border-volt-borderSoft dark:bg-volt-card/60 dark:shadow-none"
            >
              <div className={`absolute left-0 top-0 h-1 w-full ${r.topBar}`} />
              <p className="text-2xl font-semibold tracking-tight text-[#1e2a52] dark:text-white">
                {loading ? "â€”" : roleCounts[r.key]}
              </p>
              <p className="mt-1 text-xs font-medium text-gray-600 dark:text-volt-muted">{r.label}</p>
              <span className={`mt-3 inline-flex rounded-full px-3 py-1 text-[11px] font-semibold ring-1 ${r.tone}`}>
                {r.subtitle}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="app-surface-panel p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-700 ring-1 ring-amber-100 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-500/20">
              ðŸ”
            </span>
            <p className="text-sm font-semibold text-[#1e2a52] dark:text-white">{t("settings.permissionsMatrixTitle")}</p>
          </div>
          <p className="text-xs text-gray-400 dark:text-volt-muted2">
            {totals.totalUsers} users â€¢ {totals.totalRoles} roles
          </p>
        </div>

        {/* Mobile cards */}
        <div className="sm:hidden space-y-2">
          {loading ? (
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-500 dark:border-volt-borderSoft dark:bg-white/5 dark:text-volt-muted">
              {t("common.loading")}
            </div>
          ) : null}

          {!loading && users.length === 0 ? (
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-500 dark:border-volt-borderSoft dark:bg-white/5 dark:text-volt-muted">
              {t("common.noItems")}
            </div>
          ) : null}

          {!loading ? (
            pagedUsers.map((u) => {
              const keyPerms = permissionCols.slice(0, 4);
              const enabledCount = permissionCols.reduce((acc, c) => acc + (u[c.key] ? 1 : 0), 0);
              return (
                <div
                  key={u.user_id}
                  className="rounded-3xl border border-gray-100 bg-white p-4 shadow-sm dark:border-volt-borderSoft dark:bg-volt-card/60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`flex h-10 w-10 flex-none items-center justify-center rounded-2xl text-[11px] font-bold text-white ${avatarTone[normalizeRoleKey(u.role)] || avatarTone.viewer}`}>
                        {u.name
                          .split(" ")
                          .slice(0, 2)
                          .map((s) => s[0])
                          .join("")}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{u.name}</p>
                        <p className="truncate text-[11px] text-gray-500 dark:text-volt-muted2 break-all">{u.email}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold ring-1 ${roleBadge[normalizeRoleKey(u.role)] || roleBadge.viewer}`}>
                            {String(u.role || "Viewer").toUpperCase()}
                          </span>
                          <span className="inline-flex rounded-full bg-gray-100 px-3 py-1 text-[11px] font-semibold text-gray-700 dark:bg-white/10 dark:text-volt-text">
                            {enabledCount} perms enabled
                          </span>
                        </div>
                      </div>
                    </div>
                    <Toggle
                      checked={Boolean(u.is_active)}
                      onChange={() => toggleUserActive(u)}
                      ariaLabel={`Toggle ${u.name} active`}
                    />
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {keyPerms.map((c) => (
                      <div
                        key={`${u.user_id}-${c.key}`}
                        className="flex items-center justify-between rounded-2xl border border-gray-100 bg-gray-50 px-3 py-2 text-xs dark:border-volt-borderSoft dark:bg-white/5"
                      >
                        <span className="font-medium text-gray-600 dark:text-volt-muted">{c.label}</span>
                        <span className="text-gray-700 dark:text-volt-text">{u[c.key] ? "âœ“" : "â€”"}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => openView(u)}
                      className="inline-flex h-9 flex-1 items-center justify-center rounded-2xl border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 transition hover:border-indigo-200 hover:text-indigo-700 dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-text dark:hover:bg-white/10"
                    >
                      View
                    </button>
                    <button
                      type="button"
                      onClick={() => openPermissions(u)}
                      className="inline-flex h-9 flex-1 items-center justify-center rounded-2xl border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 transition hover:border-violet-200 hover:text-violet-700 dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-text dark:hover:bg-white/10"
                    >
                      Permissions
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(u)}
                      className="inline-flex h-9 flex-1 items-center justify-center rounded-2xl border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 transition hover:border-emerald-200 hover:text-emerald-700 dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-text dark:hover:bg-white/10"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              );
            })
          ) : null}
        </div>

        {/* Desktop table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="min-w-[980px] w-full border-separate border-spacing-0">
            <thead>
              <tr className="text-left text-[11px] font-semibold text-gray-500 dark:text-volt-muted2">
                <th className="px-3 py-3">User</th>
                <th className="px-3 py-3">Role</th>
                {permissionCols.map((c) => (
                  <th key={c.key} className="px-3 py-3">
                    {c.label}
                  </th>
                ))}
                <th className="px-3 py-3 text-right">Active</th>
                <th className="px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={permissionCols.length + 4} className="px-3 py-8 text-center text-sm text-gray-500 dark:text-volt-muted">
                    {t("common.loading")}
                  </td>
                </tr>
              ) : null}

              {!loading && users.length === 0 ? (
                <tr>
                  <td colSpan={permissionCols.length + 4} className="px-3 py-8 text-center text-sm text-gray-500 dark:text-volt-muted">
                    {t("common.noItems")}
                  </td>
                </tr>
              ) : null}

              {!loading ? pagedUsers.map((u) => (
                <tr key={u.user_id} className="border-t border-gray-100 text-xs text-gray-700 hover:bg-gray-50/60 dark:border-volt-borderSoft dark:text-volt-text dark:hover:bg-white/10">
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-lg text-[11px] font-bold text-white ${avatarTone[normalizeRoleKey(u.role)] || avatarTone.viewer}`}>
                        {u.name
                          .split(" ")
                          .slice(0, 2)
                          .map((s) => s[0])
                          .join("")}
                      </div>
                      <div className="leading-tight">
                        <p className="text-sm font-semibold text-gray-800 dark:text-white">{u.name}</p>
                        <p className="text-[11px] text-gray-400 dark:text-volt-muted2">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold ring-1 ${roleBadge[normalizeRoleKey(u.role)] || roleBadge.viewer}`}>
                      {String(u.role || "Viewer").toUpperCase()}
                    </span>
                  </td>
                  {permissionCols.map((c) => (
                    <td key={`${u.user_id}-${c.key}`} className="px-3 py-3">
                      {u[c.key] ? <Check /> : <Dash />}
                    </td>
                  ))}
                  <td className="px-3 py-3 text-right">
                    <Toggle
                      checked={Boolean(u.is_active)}
                      onChange={() => toggleUserActive(u)}
                      ariaLabel={`Toggle ${u.name} active`}
                    />
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {/* View */}
                      <button
                        type="button"
                        onClick={() => openView(u)}
                        title="View user"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:border-[#a7c4f2] hover:bg-[#eaf2ff] hover:text-[#004EB2] dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-muted2 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-300"
                      >
                        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
                          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                      {/* Permissions */}
                      <button
                        type="button"
                        onClick={() => openPermissions(u)}
                        title="Manage permissions"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-600 dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-muted2 dark:hover:border-violet-500/40 dark:hover:bg-violet-500/10 dark:hover:text-violet-300"
                      >
                        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
                          <path d="M12 2L4 6v6c0 5.25 3.5 10.15 8 11.35C16.5 22.15 20 17.25 20 12V6l-8-4Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                      {/* Edit */}
                      <button
                        type="button"
                        disabled={!canManage || actionLoading}
                        onClick={() => openEdit(u)}
                        title={canManage ? "Edit user" : "You do not have permission to manage users"}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:border-amber-200 hover:bg-amber-50 hover:text-amber-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-muted2 dark:hover:border-amber-500/40 dark:hover:bg-amber-500/10 dark:hover:text-amber-300"
                      >
                        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                      {/* Deactivate */}
                      {/* <button
                        type="button"
                        disabled={!canManage || actionLoading || !u.is_active}
                        onClick={() => confirmDeactivate(u)}
                        title={canManage ? "Delete user" : "You do not have permission to manage users"}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-500 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-500/30 dark:bg-volt-card/60 dark:text-rose-400 dark:hover:border-rose-400/50 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
                      >
                        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M4.93 4.93l14.14 14.14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button> */}
                    </div>
                  </td>
                </tr>
              )) : null}
            </tbody>
          </table>
        </div>

        {!loading && users.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500 dark:text-volt-muted2">
            <div className="flex items-center gap-2">
              <span>{t("common.perPage")}</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="h-8 rounded-full border border-gray-200 bg-white px-3 text-xs text-gray-700 outline-none dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-text"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-gray-500 dark:text-volt-muted2">
                {t("reviews.showing", {
                  from: totalRows ? startIndex + 1 : 0,
                  to: endIndex,
                  total: totalRows,
                })}
              </span>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={safePage === 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="inline-flex h-8 items-center justify-center rounded-full border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-600 transition hover:border-[#a7c4f2] hover:text-[#004EB2] disabled:cursor-not-allowed disabled:opacity-40 dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-muted"
                >
                  {t("common.prev")}
                </button>
                <span className="px-2 text-xs text-gray-500 dark:text-volt-muted2">
                  {safePage} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={safePage === totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="inline-flex h-8 items-center justify-center rounded-full border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-600 transition hover:border-[#a7c4f2] hover:text-[#004EB2] disabled:cursor-not-allowed disabled:opacity-40 dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-muted"
                >
                  {t("common.next")}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {isViewOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-[560px] app-surface-dialog p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[#1e2a52] dark:text-white">{t("settings.userDetail")}</p>
                <p className="mt-1 text-xs text-gray-500 font-medium dark:text-volt-muted2">User ID: {viewUserId}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsViewOpen(false)}
                className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-600 hover:border-[#a7c4f2] hover:text-[#004EB2] dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-muted"
              >
                {t("common.close")}
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-700 dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-text">
              {viewLoading ? (
                <p className="text-sm text-gray-500 dark:text-volt-muted">Loadingâ€¦</p>
              ) : viewUser ? (
                <div className="space-y-2">
                  <p><span className="font-semibold">Name:</span> {viewUser.name}</p>
                  <p><span className="font-semibold">Email:</span> {viewUser.email}</p>
                  <p><span className="font-semibold">Role:</span> {viewUser.role}</p>
                  <p><span className="font-semibold">Active:</span> {String(Boolean(viewUser.is_active))}</p>
                </div>
              ) : (
                <p className="text-sm text-gray-500 dark:text-volt-muted">No data.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {isEditOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-[560px] app-surface-dialog p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[#1e2a52] dark:text-white">{t("settings.editUser")}</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-volt-muted2">User ID: {editUserId}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsEditOpen(false)}
                className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-600 hover:border-[#a7c4f2] hover:text-[#004EB2] dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-muted"
              >
                {t("common.close")}
              </button>
            </div>

            <div className="mt-4 grid gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-600 dark:text-volt-muted">Name</label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-800 outline-none focus:border-indigo-300 dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-text"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 dark:text-volt-muted">Role</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-800 outline-none focus:border-indigo-300 dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-text"
                >
                  {roleOptions.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-3 dark:border-volt-borderSoft dark:bg-volt-card/60">
                <p className="text-xs font-semibold text-gray-700 dark:text-volt-text">Active</p>
                <Toggle checked={editActive} onChange={() => setEditActive((v) => !v)} ariaLabel="Toggle active" />
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsEditOpen(false)}
                className="inline-flex h-9 items-center justify-center rounded-full border border-gray-200 bg-white px-4 text-xs font-semibold text-gray-700 hover:border-[#a7c4f2] hover:text-[#004EB2] dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-text"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                disabled={!canManage || actionLoading}
                onClick={submitEdit}
                className="inline-flex h-9 items-center justify-center rounded-full bg-[#004EB2] px-4 text-xs font-semibold text-white hover:bg-[#003B86] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {actionLoading ? "Savingâ€¦" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isPermOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-[760px] app-surface-dialog p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[#1e2a52] dark:text-white">{t("settings.userPermissions")}</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-volt-muted2">User ID: {permUserId}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsPermOpen(false)}
                className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-600 hover:border-[#a7c4f2] hover:text-[#004EB2] dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-muted"
              >
                {t("common.close")}
              </button>
            </div>

            {permLoading ? (
              <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-500 dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-muted">
                Loading permissionsâ€¦
              </div>
            ) : permDetail ? (
              <>
                <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-700 dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-text">
                  <p className="text-xs font-semibold">User: {permDetail.name} â€¢ {permDetail.email} â€¢ Role: {permDetail.role}</p>
                  <p className="mt-1 text-[11px] text-gray-500 dark:text-volt-muted2">
                    Overrides are tri-state: Default (role), Grant, Revoke.
                  </p>
                </div>

                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[680px] border-separate border-spacing-0">
                    <thead>
                      <tr className="text-left text-[11px] font-semibold text-gray-500 dark:text-volt-muted2">
                        <th className="px-3 py-2">Permission</th>
                        <th className="px-3 py-2">Role default</th>
                        <th className="px-3 py-2">Override</th>
                        <th className="px-3 py-2">Effective</th>
                      </tr>
                    </thead>
                    <tbody>
                      {permissionCols.map((c) => {
                        const roleDefault = Boolean(permDetail?.role_defaults?.[c.key]);
                        const effective = effectiveFromUi(c.key);
                        const override = permOverridesUi?.[c.key] || "default";
                        return (
                          <tr key={c.key} className="border-t border-gray-100 text-xs text-gray-700 dark:border-volt-borderSoft dark:text-volt-text">
                            <td className="px-3 py-2 font-semibold">{c.label}</td>
                            <td className="px-3 py-2">{roleDefault ? <Check /> : <Dash />}</td>
                            <td className="px-3 py-2">
                              <select
                                value={override}
                                disabled={!canManage || actionLoading}
                                onChange={(e) => setPermOverridesUi((prev) => ({ ...prev, [c.key]: e.target.value }))}
                                className="h-9 rounded-xl border border-gray-200 bg-white px-3 text-xs text-gray-700 outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-text"
                              >
                                <option value="default">Default</option>
                                <option value="grant">Grant</option>
                                <option value="revoke">Revoke</option>
                              </select>
                            </td>
                            <td className="px-3 py-2">{effective ? <Check /> : <Dash />}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 flex items-center justify-between gap-2">
                  <p className="text-[11px] text-gray-500 dark:text-volt-muted2">
                    Matrix loaded: {permMatrix ? "yes" : "no"}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsPermOpen(false)}
                      className="inline-flex h-9 items-center justify-center rounded-full border border-gray-200 bg-white px-4 text-xs font-semibold text-gray-700 hover:border-[#a7c4f2] hover:text-[#004EB2] dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-text"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={!canManage || actionLoading}
                      onClick={submitPermissions}
                      className="inline-flex h-9 items-center justify-center rounded-full bg-[#004EB2] px-4 text-xs font-semibold text-white hover:bg-[#003B86] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {actionLoading ? "Savingâ€¦" : "Save permissions"}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-500 dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-muted">
                No permission data.
              </div>
            )}
          </div>
        </div>
      ) : null}

      {isAddOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-[520px] app-surface-dialog p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[#1e2a52] dark:text-white">Add user</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-volt-muted2">Create a MetLife operational staff account.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddOpen(false)}
                className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-600 hover:border-[#a7c4f2] hover:text-[#004EB2] dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-muted"
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-600 dark:text-volt-muted">Name</label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-800 outline-none focus:border-indigo-300 dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-text"
                  placeholder="Full name"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 dark:text-volt-muted">Email</label>
                <input
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-800 outline-none focus:border-indigo-300 dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-text"
                  placeholder="name@metlife.co.jp"
                  inputMode="email"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 dark:text-volt-muted">Password</label>
                <input
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-800 outline-none focus:border-indigo-300 dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-text"
                  placeholder="Min 8 characters"
                  type="password"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 dark:text-volt-muted">Role</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-800 outline-none focus:border-indigo-300 dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-text"
                >
                  <option value="Admin">Admin</option>
                  <option value="Manager">Manager</option>
                  <option value="Reviewer">Reviewer</option>
                  <option value="Viewer">Viewer</option>
                </select>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAddOpen(false)}
                className="inline-flex h-9 items-center justify-center rounded-full border border-gray-200 bg-white px-4 text-xs font-semibold text-gray-700 hover:border-[#a7c4f2] hover:text-[#004EB2] dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-text"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={submitAdd}
                className="inline-flex h-9 items-center justify-center rounded-full bg-[#004EB2] px-4 text-xs font-semibold text-white hover:bg-[#003B86] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {actionLoading ? "Creatingâ€¦" : "Create user"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="app-surface-panel p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-[#1e2a52] dark:text-white">Role Definitions</p>
          </div>

          <div className="space-y-2">
            {Object.entries(roleDefinitions).map(([key, def]) => (
              <div
                key={key}
                className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-3 py-2.5 dark:border-volt-borderSoft dark:bg-white/5"
              >
                <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold ${def.badgeTone}`}>
                  {def.badge}
                </span>
                <p className="flex-1 text-xs font-semibold text-gray-700 dark:text-volt-text">{def.title}</p>
                <div className="relative">
                  <button
                    type="button"
                    aria-label={`Info for ${def.badge}`}
                    onClick={() => setOpenRoleInfo((v) => (v === key ? null : key))}
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 transition hover:border-indigo-200 hover:text-indigo-500 dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-muted2 dark:hover:text-indigo-300"
                  >
                    <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                      <path d="M12 16v-4M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </button>
                  {openRoleInfo === key ? (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setOpenRoleInfo(null)} />
                      <div className="absolute right-0 top-7 z-40 w-64 rounded-2xl border border-gray-100 bg-white p-3 shadow-lg dark:border-volt-borderSoft dark:bg-volt-card">
                        <p className={`mb-2 inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${def.badgeTone}`}>{def.badge}</p>
                        <p className="text-[11px] text-gray-600 dark:text-volt-muted2">{def.description}</p>
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="app-surface-panel p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-[#1e2a52] dark:text-white">Access Audit Log</p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 dark:text-volt-muted2">Last 24h</span>
              <button
                type="button"
                onClick={fetchAuditLog}
                disabled={auditLoading}
                title="Refresh audit log"
                className="inline-flex h-6 w-6 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-400 transition hover:border-[#a7c4f2] hover:text-[#004EB2] disabled:cursor-not-allowed disabled:opacity-40 dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-muted2 dark:hover:border-indigo-500/40 dark:hover:text-indigo-300"
              >
                <svg viewBox="0 0 24 24" fill="none" className={`h-3.5 w-3.5 ${auditLoading ? "animate-spin" : ""}`} aria-hidden="true">
                  <path d="M23 4v6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M1 20v-6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>

          {auditError ? (
            <div className="mb-2 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
              {auditError}{" "}
              <button type="button" className="font-semibold underline" onClick={fetchAuditLog}>
                Retry
              </button>
            </div>
          ) : null}

          <div className="space-y-2">
            {auditLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="flex animate-pulse items-start gap-3 rounded-2xl border border-gray-100 bg-white px-3 py-3 dark:border-volt-borderSoft dark:bg-volt-card/60"
                >
                  <span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-gray-200 dark:bg-white/10" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-3 w-3/4 rounded-full bg-gray-200 dark:bg-white/10" />
                    <div className="h-2.5 w-1/3 rounded-full bg-gray-100 dark:bg-white/5" />
                  </div>
                </div>
              ))
            ) : !auditLoading && accessAuditLog.length === 0 ? (
              <p className="py-4 text-center text-xs text-gray-400 dark:text-volt-muted2">
                No audit events in the last 24h.
              </p>
            ) : (
              accessAuditLog.slice(0, auditVisibleCount).map((item, idx) => (
                <div
                  key={`${item.at}-${idx}`}
                  className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-white px-3 py-3 shadow-[inset_0_1px_0_rgba(0,0,0,0.02)] dark:border-volt-borderSoft dark:bg-volt-card/60 dark:shadow-none"
                >
                  <span className={`mt-1.5 h-2 w-2 flex-none rounded-full ${item.dot}`} />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-800 dark:text-white">{item.text}</p>
                    <p
                      className="mt-1 text-xs font-medium text-gray-500 dark:text-volt-muted2"
                      title={new Date(item.at).toLocaleString()}
                    >
                      {formatRelativeTime(item.at)} â€¢ {item.role}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          {!auditLoading && accessAuditLog.length > auditVisibleCount ? (
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                onClick={() => setAuditVisibleCount((n) => Math.min(accessAuditLog.length, n + 20))}
                className="inline-flex h-9 items-center justify-center rounded-full border border-gray-200 bg-white px-4 text-xs font-semibold text-gray-700 shadow-sm transition hover:border-[#a7c4f2] hover:text-[#004EB2] dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-text dark:shadow-none dark:hover:border-volt-border dark:hover:text-white"
              >
                Read more
              </button>
            </div>
          ) : null}

          {!auditLoading && accessAuditLog.length > 6 && auditVisibleCount >= accessAuditLog.length ? (
            <div className="mt-2 flex justify-center">
              <button
                type="button"
                onClick={() => setAuditVisibleCount(6)}
                className="text-xs font-semibold text-gray-500 hover:underline dark:text-volt-muted2"
              >
                Show less
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
};

export default Settings;

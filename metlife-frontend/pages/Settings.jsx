import { useCallback, useEffect, useMemo, useState } from "react";
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

const roles = [
  {
    key: "admin",
    label: "Admins",
    subtitle: "Full access",
    tone: "bg-rose-50 text-rose-700 ring-rose-100",
    topBar: "bg-rose-500",
  },
  {
    key: "manager",
    label: "Managers",
    subtitle: "Run + HITL",
    tone: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    topBar: "bg-emerald-500",
  },
  {
    key: "reviewer",
    label: "Reviewers",
    subtitle: "HITL only",
    tone: "bg-violet-50 text-violet-700 ring-violet-100",
    topBar: "bg-violet-500",
  },
  {
    key: "viewer",
    label: "Viewers",
    subtitle: "Read-only",
    tone: "bg-amber-50 text-amber-700 ring-amber-100",
    topBar: "bg-amber-500",
  },
];

const roleBadge = {
  admin: "bg-rose-50 text-rose-700 ring-rose-100",
  manager: "bg-violet-50 text-violet-700 ring-violet-100",
  reviewer: "bg-amber-50 text-amber-700 ring-amber-100",
  viewer: "bg-gray-100 text-gray-700 ring-gray-200",
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
  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
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
  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-50 text-gray-400 ring-1 ring-gray-200">
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
  const { token, user: currentUser } = useAuth();
  const { t } = useTranslation();
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

  return (
    <section className="space-y-3">
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

      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.03)] dark:border-volt-borderSoft dark:bg-volt-panel dark:shadow-none">
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
            className="inline-flex h-9 items-center gap-2 rounded-full bg-indigo-600 px-4 text-xs font-semibold text-white shadow-[0_10px_25px_rgba(79,70,229,0.18)] transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
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
                {loading ? "—" : roleCounts[r.key]}
              </p>
              <p className="mt-1 text-xs font-medium text-gray-600 dark:text-volt-muted">{r.label}</p>
              <span className={`mt-3 inline-flex rounded-full px-3 py-1 text-[11px] font-semibold ring-1 ${r.tone}`}>
                {r.subtitle}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.03)] dark:border-volt-borderSoft dark:bg-volt-panel dark:shadow-none">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-700 ring-1 ring-amber-100 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-500/20">
              🔐
            </span>
            <p className="text-sm font-semibold text-[#1e2a52] dark:text-white">{t("settings.permissionsMatrixTitle")}</p>
          </div>
          <p className="text-xs text-gray-400 dark:text-volt-muted2">
            {totals.totalUsers} users • {totals.totalRoles} roles
          </p>
        </div>

        <div className="overflow-x-auto">
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
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600 dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-muted2 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-300"
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
                  className="inline-flex h-8 items-center justify-center rounded-full border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-600 transition hover:border-indigo-200 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-muted"
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
                  className="inline-flex h-8 items-center justify-center rounded-full border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-600 transition hover:border-indigo-200 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-muted"
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
          <div className="w-full max-w-[560px] rounded-2xl border border-gray-100 bg-white p-4 shadow-xl dark:border-volt-borderSoft dark:bg-volt-panel">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[#1e2a52] dark:text-white">{t("settings.userDetail")}</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-volt-muted2">User ID: {viewUserId}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsViewOpen(false)}
                className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-600 hover:border-indigo-200 hover:text-indigo-700 dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-muted"
              >
                {t("common.close")}
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-700 dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-text">
              {viewLoading ? (
                <p className="text-sm text-gray-500 dark:text-volt-muted">Loading…</p>
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
          <div className="w-full max-w-[560px] rounded-2xl border border-gray-100 bg-white p-4 shadow-xl dark:border-volt-borderSoft dark:bg-volt-panel">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[#1e2a52] dark:text-white">{t("settings.editUser")}</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-volt-muted2">User ID: {editUserId}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsEditOpen(false)}
                className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-600 hover:border-indigo-200 hover:text-indigo-700 dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-muted"
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
                className="inline-flex h-9 items-center justify-center rounded-full border border-gray-200 bg-white px-4 text-xs font-semibold text-gray-700 hover:border-indigo-200 hover:text-indigo-700 dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-text"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                disabled={!canManage || actionLoading}
                onClick={submitEdit}
                className="inline-flex h-9 items-center justify-center rounded-full bg-indigo-600 px-4 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {actionLoading ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isPermOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-[760px] rounded-2xl border border-gray-100 bg-white p-4 shadow-xl dark:border-volt-borderSoft dark:bg-volt-panel">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[#1e2a52] dark:text-white">{t("settings.userPermissions")}</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-volt-muted2">User ID: {permUserId}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsPermOpen(false)}
                className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-600 hover:border-indigo-200 hover:text-indigo-700 dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-muted"
              >
                {t("common.close")}
              </button>
            </div>

            {permLoading ? (
              <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-500 dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-muted">
                Loading permissions…
              </div>
            ) : permDetail ? (
              <>
                <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-700 dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-text">
                  <p className="text-xs font-semibold">User: {permDetail.name} • {permDetail.email} • Role: {permDetail.role}</p>
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
                      className="inline-flex h-9 items-center justify-center rounded-full border border-gray-200 bg-white px-4 text-xs font-semibold text-gray-700 hover:border-indigo-200 hover:text-indigo-700 dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-text"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={!canManage || actionLoading}
                      onClick={submitPermissions}
                      className="inline-flex h-9 items-center justify-center rounded-full bg-indigo-600 px-4 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {actionLoading ? "Saving…" : "Save permissions"}
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
          <div className="w-full max-w-[520px] rounded-2xl border border-gray-100 bg-white p-4 shadow-xl dark:border-volt-borderSoft dark:bg-volt-panel">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[#1e2a52] dark:text-white">Add user</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-volt-muted2">Create a MetLife operational staff account.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddOpen(false)}
                className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-600 hover:border-indigo-200 hover:text-indigo-700 dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-muted"
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
                className="inline-flex h-9 items-center justify-center rounded-full border border-gray-200 bg-white px-4 text-xs font-semibold text-gray-700 hover:border-indigo-200 hover:text-indigo-700 dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-text"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={submitAdd}
                className="inline-flex h-9 items-center justify-center rounded-full bg-indigo-600 px-4 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {actionLoading ? "Creating…" : "Create user"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.03)] dark:border-volt-borderSoft dark:bg-volt-panel dark:shadow-none">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-[#1e2a52] dark:text-white">Role Definitions</p>
          </div>

          <div className="space-y-3">
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-volt-borderSoft dark:bg-white/5">
              <div className="flex items-center gap-3">
                <span className="inline-flex rounded-full bg-rose-50 px-3 py-1 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-100">
                  ADMIN
                </span>
                <p className="text-xs font-semibold text-gray-700 dark:text-volt-text">Full platform access</p>
              </div>
              <p className="mt-2 text-xs text-gray-500 dark:text-volt-muted2">
                Run/stop workflows, start any agent, approve all HITL gates, manage users, export data,
                configure scenarios. Can modify RBAC roles.
              </p>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-volt-borderSoft dark:bg-white/5">
              <div className="flex items-center gap-3">
                <span className="inline-flex rounded-full bg-violet-50 px-3 py-1 text-[11px] font-semibold text-violet-700 ring-1 ring-violet-100">
                  MANAGER
                </span>
                <p className="text-xs font-semibold text-gray-700 dark:text-volt-text">Workflow + HITL</p>
              </div>
              <p className="mt-2 text-xs text-gray-500 dark:text-volt-muted2">
                Start/pause/resume workflows, click “Run from here” on agents, approve G1–G5 gates,
                edit leads. Cannot manage users.
              </p>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-volt-borderSoft dark:bg-white/5">
              <div className="flex items-center gap-3">
                <span className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-100">
                  REVIEWER
                </span>
                <p className="text-xs font-semibold text-gray-700 dark:text-volt-text">HITL only</p>
              </div>
              <p className="mt-2 text-xs text-gray-500 dark:text-volt-muted2">
                Review and approve/reject HITL gates (G1–G5). Can view lead details and edit content.
                Cannot start workflows or agents.
              </p>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-volt-borderSoft dark:bg-white/5">
              <div className="flex items-center gap-3">
                <span className="inline-flex rounded-full bg-gray-100 px-3 py-1 text-[11px] font-semibold text-gray-700 ring-1 ring-gray-200">
                  VIEWER
                </span>
                <p className="text-xs font-semibold text-gray-700 dark:text-volt-text">Read-only</p>
              </div>
              <p className="mt-2 text-xs text-gray-500 dark:text-volt-muted2">
                View dashboard, lead list, workflow status, analytics. No edit or action permissions.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.03)] dark:border-volt-borderSoft dark:bg-volt-panel dark:shadow-none">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-[#1e2a52] dark:text-white">Access Audit Log</p>
            <span className="text-xs text-gray-400 dark:text-volt-muted2">Last 24h</span>
          </div>

          <div className="space-y-2">
            {[
              {
                dot: "bg-emerald-500",
                text: "Singh Sahil started workflow S1 for Masaki Tanaka",
                meta: "2 min ago • Admin",
              },
              {
                dot: "bg-amber-500",
                text: "Nakamura Aiko approved G1 - Content Compliance for Kana Suzuki",
                meta: "8 min ago • Reviewer",
              },
              {
                dot: "bg-violet-500",
                text: "Kobayashi Mei clicked “Run from A3” on lead Tomoko Sato",
                meta: "15 min ago • Manager",
              },
              {
                dot: "bg-sky-500",
                text: "Suzuki Hiro paused workflow for Riku Endo at G4",
                meta: "22 min ago • Manager",
              },
              {
                dot: "bg-rose-500",
                text: "Ito Takeshi rejected G1 for Kenji Yamada — tone mismatch",
                meta: "34 min ago • Reviewer",
              },
              {
                dot: "bg-gray-400",
                text: "Tanaka Yoshi added Yamada Fumiko as Viewer",
                meta: "48 min ago • Admin",
              },
            ].map((item) => (
              <div
                key={item.text}
                className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-white px-3 py-3 shadow-[inset_0_1px_0_rgba(0,0,0,0.02)] dark:border-volt-borderSoft dark:bg-volt-card/60 dark:shadow-none"
              >
                <span className={`mt-1.5 h-2 w-2 flex-none rounded-full ${item.dot}`} />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-800 dark:text-white">{item.text}</p>
                  <p className="mt-1 text-[11px] text-gray-400 dark:text-volt-muted2">{item.meta}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Settings;
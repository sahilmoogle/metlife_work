import { useMemo, useState } from "react";

const roles = [
  {
    key: "admin",
    label: "Admins",
    count: 2,
    subtitle: "Full access",
    tone: "bg-rose-50 text-rose-700 ring-rose-100",
    topBar: "bg-rose-500",
  },
  {
    key: "manager",
    label: "Managers",
    count: 3,
    subtitle: "Run + HITL",
    tone: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    topBar: "bg-emerald-500",
  },
  {
    key: "reviewer",
    label: "Reviewers",
    count: 4,
    subtitle: "HITL only",
    tone: "bg-violet-50 text-violet-700 ring-violet-100",
    topBar: "bg-violet-500",
  },
  {
    key: "viewer",
    label: "Viewers",
    count: 6,
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
  { key: "runWorkflow", label: "Run Workflow" },
  { key: "startAgent", label: "Start Agent" },
  { key: "hitlApprove", label: "HITL Approve" },
  { key: "editLead", label: "Edit Lead" },
  { key: "exportData", label: "Export Data" },
  { key: "manageUsers", label: "Manage Users" },
];

const seedUsers = [
  {
    id: "u1",
    name: "Singh Sahil",
    email: "s.sahil@metlife.jp",
    role: "admin",
    permissions: {
      runWorkflow: true,
      startAgent: true,
      hitlApprove: true,
      editLead: true,
      exportData: true,
      manageUsers: true,
    },
    active: true,
  },
  {
    id: "u2",
    name: "Tanaka Yoshi",
    email: "t.yoshi@metlife.jp",
    role: "admin",
    permissions: {
      runWorkflow: true,
      startAgent: true,
      hitlApprove: true,
      editLead: true,
      exportData: true,
      manageUsers: true,
    },
    active: true,
  },
  {
    id: "u3",
    name: "Kobayashi Mei",
    email: "k.mei@metlife.jp",
    role: "manager",
    permissions: {
      runWorkflow: true,
      startAgent: true,
      hitlApprove: true,
      editLead: true,
      exportData: true,
      manageUsers: false,
    },
    active: true,
  },
  {
    id: "u4",
    name: "Suzuki Hiro",
    email: "s.hiro@metlife.jp",
    role: "manager",
    permissions: {
      runWorkflow: true,
      startAgent: true,
      hitlApprove: true,
      editLead: true,
      exportData: true,
      manageUsers: false,
    },
    active: true,
  },
  {
    id: "u5",
    name: "Nakamura Aiko",
    email: "n.aiko@metlife.jp",
    role: "reviewer",
    permissions: {
      runWorkflow: false,
      startAgent: false,
      hitlApprove: true,
      editLead: true,
      exportData: false,
      manageUsers: false,
    },
    active: true,
  },
  {
    id: "u6",
    name: "Ito Takeshi",
    email: "i.takeshi@metlife.jp",
    role: "reviewer",
    permissions: {
      runWorkflow: false,
      startAgent: false,
      hitlApprove: true,
      editLead: true,
      exportData: false,
      manageUsers: false,
    },
    active: true,
  },
  {
    id: "u7",
    name: "Yamada Fumiko",
    email: "y.fumiko@metlife.jp",
    role: "viewer",
    permissions: {
      runWorkflow: false,
      startAgent: false,
      hitlApprove: false,
      editLead: false,
      exportData: false,
      manageUsers: false,
    },
    active: true,
  },
];

const Toggle = ({ checked, onChange, ariaLabel }) => {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={checked}
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 items-center rounded-full border transition ${
        checked
          ? "border-emerald-200 bg-emerald-500"
          : "border-gray-200 bg-gray-100 dark:border-white/15 dark:bg-white/10"
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
  const [users, setUsers] = useState(seedUsers);

  const roleCounts = useMemo(() => {
    const counts = { admin: 0, manager: 0, reviewer: 0, viewer: 0 };
    users.forEach((u) => {
      counts[u.role] += 1;
    });
    return counts;
  }, [users]);

  const totals = useMemo(() => {
    const totalUsers = users.length;
    const totalRoles = new Set(users.map((u) => u.role)).size;
    return { totalUsers, totalRoles };
  }, [users]);

  const toggleUserActive = (userId) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, active: !u.active } : u))
    );
  };

  return (
    <section className="space-y-3">
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.03)] dark:border-white/10 dark:bg-slate-900 dark:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[#1e2a52] dark:text-white">Admin - Access Control</h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
              RBAC permissions for workflow execution, HITL approvals, and lead management
            </p>
          </div>

          <button
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded-full bg-indigo-600 px-4 text-xs font-semibold text-white shadow-[0_10px_25px_rgba(79,70,229,0.18)] transition hover:bg-indigo-700"
          >
            + Add User
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {roles.map((r) => (
            <div
              key={r.key}
              className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-4 shadow-[inset_0_1px_0_rgba(0,0,0,0.02)] dark:border-white/10 dark:bg-slate-950/40 dark:shadow-none"
            >
              <div className={`absolute left-0 top-0 h-1 w-full ${r.topBar}`} />
              <p className="text-2xl font-semibold tracking-tight text-[#1e2a52] dark:text-white">
                {roleCounts[r.key]}
              </p>
              <p className="mt-1 text-xs font-medium text-gray-600 dark:text-slate-300">{r.label}</p>
              <span className={`mt-3 inline-flex rounded-full px-3 py-1 text-[11px] font-semibold ring-1 ${r.tone}`}>
                {r.subtitle}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.03)] dark:border-white/10 dark:bg-slate-900 dark:shadow-none">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-700 ring-1 ring-amber-100 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-500/20">
              🔐
            </span>
            <p className="text-sm font-semibold text-[#1e2a52] dark:text-white">User Permissions Matrix</p>
          </div>
          <p className="text-xs text-gray-400 dark:text-slate-400">
            {totals.totalUsers} users • {totals.totalRoles} roles
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full border-separate border-spacing-0">
            <thead>
              <tr className="text-left text-[11px] font-semibold text-gray-500 dark:text-slate-400">
                <th className="px-3 py-3">User</th>
                <th className="px-3 py-3">Role</th>
                {permissionCols.map((c) => (
                  <th key={c.key} className="px-3 py-3">
                    {c.label}
                  </th>
                ))}
                <th className="px-3 py-3 text-right">Active</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-gray-100 text-xs text-gray-700 hover:bg-gray-50/60 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5">
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-lg text-[11px] font-bold text-white ${avatarTone[u.role]}`}>
                        {u.name
                          .split(" ")
                          .slice(0, 2)
                          .map((s) => s[0])
                          .join("")}
                      </div>
                      <div className="leading-tight">
                        <p className="text-sm font-semibold text-gray-800 dark:text-white">{u.name}</p>
                        <p className="text-[11px] text-gray-400 dark:text-slate-400">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold ring-1 ${roleBadge[u.role]}`}>
                      {u.role.toUpperCase()}
                    </span>
                  </td>
                  {permissionCols.map((c) => (
                    <td key={`${u.id}-${c.key}`} className="px-3 py-3">
                      {u.permissions[c.key] ? <Check /> : <Dash />}
                    </td>
                  ))}
                  <td className="px-3 py-3 text-right">
                    <Toggle
                      checked={u.active}
                      onChange={() => toggleUserActive(u.id)}
                      ariaLabel={`Toggle ${u.name} active`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.03)] dark:border-white/10 dark:bg-slate-900 dark:shadow-none">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-[#1e2a52] dark:text-white">Role Definitions</p>
          </div>

          <div className="space-y-3">
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-white/10 dark:bg-white/5">
              <div className="flex items-center gap-3">
                <span className="inline-flex rounded-full bg-rose-50 px-3 py-1 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-100">
                  ADMIN
                </span>
                <p className="text-xs font-semibold text-gray-700 dark:text-slate-200">Full platform access</p>
              </div>
              <p className="mt-2 text-xs text-gray-500 dark:text-slate-400">
                Run/stop workflows, start any agent, approve all HITL gates, manage users, export data,
                configure scenarios. Can modify RBAC roles.
              </p>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-white/10 dark:bg-white/5">
              <div className="flex items-center gap-3">
                <span className="inline-flex rounded-full bg-violet-50 px-3 py-1 text-[11px] font-semibold text-violet-700 ring-1 ring-violet-100">
                  MANAGER
                </span>
                <p className="text-xs font-semibold text-gray-700 dark:text-slate-200">Workflow + HITL</p>
              </div>
              <p className="mt-2 text-xs text-gray-500 dark:text-slate-400">
                Start/pause/resume workflows, click “Run from here” on agents, approve G1–G5 gates,
                edit leads. Cannot manage users.
              </p>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-white/10 dark:bg-white/5">
              <div className="flex items-center gap-3">
                <span className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-100">
                  REVIEWER
                </span>
                <p className="text-xs font-semibold text-gray-700 dark:text-slate-200">HITL only</p>
              </div>
              <p className="mt-2 text-xs text-gray-500 dark:text-slate-400">
                Review and approve/reject HITL gates (G1–G5). Can view lead details and edit content.
                Cannot start workflows or agents.
              </p>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-white/10 dark:bg-white/5">
              <div className="flex items-center gap-3">
                <span className="inline-flex rounded-full bg-gray-100 px-3 py-1 text-[11px] font-semibold text-gray-700 ring-1 ring-gray-200">
                  VIEWER
                </span>
                <p className="text-xs font-semibold text-gray-700 dark:text-slate-200">Read-only</p>
              </div>
              <p className="mt-2 text-xs text-gray-500 dark:text-slate-400">
                View dashboard, lead list, workflow status, analytics. No edit or action permissions.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.03)] dark:border-white/10 dark:bg-slate-900 dark:shadow-none">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-[#1e2a52] dark:text-white">Access Audit Log</p>
            <span className="text-xs text-gray-400 dark:text-slate-400">Last 24h</span>
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
                className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-white px-3 py-3 shadow-[inset_0_1px_0_rgba(0,0,0,0.02)] dark:border-white/10 dark:bg-slate-950/40 dark:shadow-none"
              >
                <span className={`mt-1.5 h-2 w-2 flex-none rounded-full ${item.dot}`} />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-800 dark:text-white">{item.text}</p>
                  <p className="mt-1 text-[11px] text-gray-400 dark:text-slate-400">{item.meta}</p>
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
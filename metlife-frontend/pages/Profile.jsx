import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import userIcon from "../src/assets/images/user.jpg";

const Profile = () => {
  const { user, updateUser } = useAuth();

  const displayName = user?.name || "Takashi Yamamoto";
  const displayEmail = user?.email || "takashi.yamamoto@metlife.co.jp";
  const displayRole = user?.role || "Admin";
  const displayId = user?.id || "—";
  const timezone = user?.timezone || "Asia/Tokyo";
  const department = user?.department || "Distribution / Sales";
  const location = user?.location || "Tokyo, JP";
  const manager = user?.manager || "—";
  const phone = user?.phone || "—";
  const status = user?.status || "Active";
  const lastLogin = user?.lastLogin || "Today, 09:14";

  const initialForm = useMemo(
    () => ({
      name: displayName,
      email: displayEmail,
    }),
    [displayEmail, displayName]
  );

  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isEditing) return;
    setForm(initialForm);
  }, [initialForm, isEditing]);

  const onSave = () => {
    setError("");
    const nextName = String(form.name || "").trim();
    const nextEmail = String(form.email || "").trim();

    if (!nextName) {
      setError("Name is required.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      setError("Please enter a valid email.");
      return;
    }

    updateUser({ name: nextName, email: nextEmail });
    setIsEditing(false);
  };

  return (
    <div className="mx-auto max-w-6xl">
      <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-volt-borderSoft dark:bg-volt-panel">
        {/* Hero */}
        <div className="relative border-b border-gray-100 bg-[linear-gradient(135deg,rgba(59,130,246,0.10),rgba(124,58,237,0.10),rgba(15,23,42,0.02))] px-6 py-6 dark:border-volt-borderSoft/70 dark:bg-[linear-gradient(135deg,rgba(59,130,246,0.18),rgba(124,58,237,0.16),rgba(2,6,23,0.55))]">
          <div className="pointer-events-none absolute inset-0 opacity-70">
            <div className="absolute -left-28 -top-28 h-72 w-72 rounded-full bg-indigo-300/30 blur-3xl dark:bg-indigo-400/15" />
            <div className="absolute right-[-120px] top-8 h-80 w-80 rounded-full bg-cyan-300/25 blur-3xl dark:bg-cyan-400/10" />
          </div>

          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                <img
                  src={userIcon}
                  alt="User avatar"
                  className="h-16 w-16 rounded-2xl object-cover ring-1 ring-gray-200 shadow-sm dark:ring-volt-borderSoft"
                />
                <span
                  className="absolute -bottom-1 -right-1 inline-flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-emerald-500 shadow-sm dark:border-volt-panel"
                  aria-label="Online"
                  title="Online"
                />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-xl font-semibold text-gray-900 dark:text-volt-text">
                    {displayName}
                  </h3>
                  <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 dark:border-indigo-400/25 dark:bg-indigo-500/10 dark:text-indigo-200">
                    {displayRole}
                  </span>
                  <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-500/10 dark:text-emerald-200">
                    {status}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-sm text-gray-600 dark:text-volt-muted">
                  {displayEmail}
                </p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500 dark:text-volt-muted2">
                  <span className="rounded-full border border-gray-200 bg-white/70 px-2 py-1 dark:border-volt-borderSoft/70 dark:bg-volt-card/40">
                    {department}
                  </span>
                  <span className="rounded-full border border-gray-200 bg-white/70 px-2 py-1 dark:border-volt-borderSoft/70 dark:bg-volt-card/40">
                    {location}
                  </span>
                  <span className="rounded-full border border-gray-200 bg-white/70 px-2 py-1 dark:border-volt-borderSoft/70 dark:bg-volt-card/40">
                    Timezone: {timezone}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
              <button
                type="button"
                onClick={() => window.open(`mailto:${displayEmail}`, "_blank", "noopener,noreferrer")}
                className="inline-flex h-10 flex-1 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 shadow-sm transition hover:border-indigo-200 hover:text-indigo-700 sm:flex-none dark:border-volt-borderSoft/80 dark:bg-volt-card/50 dark:text-volt-text dark:hover:bg-white/10"
              >
                Email
              </button>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText?.(displayEmail)}
                className="inline-flex h-10 flex-1 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 shadow-sm transition hover:border-indigo-200 hover:text-indigo-700 sm:flex-none dark:border-volt-borderSoft/80 dark:bg-volt-card/50 dark:text-volt-text dark:hover:bg-white/10"
              >
                Copy email
              </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <section className="rounded-3xl border border-gray-200 bg-white p-5 dark:border-volt-borderSoft dark:bg-volt-panel">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-volt-text">Profile details</h4>
                  <p className="mt-1 text-xs text-gray-500 dark:text-volt-muted">
                    Core identity and organization fields.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {isEditing ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setError("");
                          setForm(initialForm);
                          setIsEditing(false);
                        }}
                        className="inline-flex h-9 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 shadow-sm transition hover:border-gray-300 dark:border-volt-borderSoft/80 dark:bg-volt-card/50 dark:text-volt-text dark:hover:bg-white/10"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={onSave}
                        className="inline-flex h-9 items-center justify-center rounded-xl bg-gradient-to-r from-[#4c27ff] via-[#3b1fe8] to-[#2a20b8] px-3 text-xs font-semibold text-white shadow-sm transition hover:brightness-[1.04]"
                      >
                        Save
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsEditing(true)}
                      className="inline-flex h-9 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 shadow-sm transition hover:border-indigo-200 hover:text-indigo-700 dark:border-volt-borderSoft/80 dark:bg-volt-card/50 dark:text-volt-text dark:hover:bg-white/10"
                    >
                      Edit
                    </button>
                  )}
                </div>
              </div>

              {error ? (
                <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-200">
                  {error}
                </p>
              ) : null}

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 dark:border-volt-borderSoft/70 dark:bg-volt-card/60">
                  <p className="text-[11px] font-semibold text-gray-500 dark:text-volt-muted">Full name</p>
                  {isEditing ? (
                    <input
                      value={form.name}
                      onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))}
                      className="mt-2 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-volt-borderSoft dark:bg-volt-panel dark:text-volt-text dark:focus:ring-indigo-500/15"
                    />
                  ) : (
                    <p className="mt-1 truncate text-sm font-medium text-gray-900 dark:text-volt-text">{displayName}</p>
                  )}
                </div>

                <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 dark:border-volt-borderSoft/70 dark:bg-volt-card/60">
                  <p className="text-[11px] font-semibold text-gray-500 dark:text-volt-muted">Email</p>
                  {isEditing ? (
                    <input
                      value={form.email}
                      onChange={(e) => setForm((v) => ({ ...v, email: e.target.value }))}
                      className="mt-2 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-volt-borderSoft dark:bg-volt-panel dark:text-volt-text dark:focus:ring-indigo-500/15"
                    />
                  ) : (
                    <p className="mt-1 truncate text-sm font-medium text-gray-900 dark:text-volt-text">{displayEmail}</p>
                  )}
                </div>

                {[
                  { label: "Role", value: displayRole },
                  { label: "User ID", value: displayId },
                  { label: "Department", value: department },
                  { label: "Manager", value: manager },
                  { label: "Phone", value: phone },
                  { label: "Location", value: location },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 dark:border-volt-borderSoft/70 dark:bg-volt-card/60"
                  >
                    <p className="text-[11px] font-semibold text-gray-500 dark:text-volt-muted">{item.label}</p>
                    <p className="mt-1 truncate text-sm font-medium text-gray-900 dark:text-volt-text">
                      {item.value || "—"}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-gray-200 bg-white p-5 dark:border-volt-borderSoft dark:bg-volt-panel">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-volt-text">Preferences</h4>
              <p className="mt-1 text-xs text-gray-500 dark:text-volt-muted">
                Personalization and defaults for your workspace.
              </p>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 dark:border-volt-borderSoft/70 dark:bg-volt-card/60">
                  <p className="text-[11px] font-semibold text-gray-500 dark:text-volt-muted">Language</p>
                  <p className="mt-1 text-sm font-medium text-gray-900 dark:text-volt-text">
                    {user?.language || "Japanese (JP)"}
                  </p>
                </div>
                <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 dark:border-volt-borderSoft/70 dark:bg-volt-card/60">
                  <p className="text-[11px] font-semibold text-gray-500 dark:text-volt-muted">Theme</p>
                  <p className="mt-1 text-sm font-medium text-gray-900 dark:text-volt-text">
                    {user?.theme || "System / Dark"}
                  </p>
                </div>
                <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 dark:border-volt-borderSoft/70 dark:bg-volt-card/60">
                  <p className="text-[11px] font-semibold text-gray-500 dark:text-volt-muted">Timezone</p>
                  <p className="mt-1 text-sm font-medium text-gray-900 dark:text-volt-text">{timezone}</p>
                </div>
                <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 dark:border-volt-borderSoft/70 dark:bg-volt-card/60">
                  <p className="text-[11px] font-semibold text-gray-500 dark:text-volt-muted">Notifications</p>
                  <p className="mt-1 text-sm font-medium text-gray-900 dark:text-volt-text">
                    {user?.notifications || "Email + In-app"}
                  </p>
                </div>
              </div>
            </section>
          </div>

          <aside className="space-y-6">
            <section className="rounded-3xl border border-gray-200 bg-white p-5 dark:border-volt-borderSoft dark:bg-volt-panel">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-volt-text">Security</h4>
              <p className="mt-1 text-xs text-gray-500 dark:text-volt-muted">Account posture and recent sign-in.</p>

              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 dark:border-volt-borderSoft/70 dark:bg-volt-card/60">
                  <div>
                    <p className="text-[11px] font-semibold text-gray-500 dark:text-volt-muted">Last login</p>
                    <p className="mt-1 text-sm font-medium text-gray-900 dark:text-volt-text">{lastLogin}</p>
                  </div>
                  <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-500/10 dark:text-emerald-200">
                    Verified
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 dark:border-volt-borderSoft/70 dark:bg-volt-card/60">
                  <div>
                    <p className="text-[11px] font-semibold text-gray-500 dark:text-volt-muted">Two-factor</p>
                    <p className="mt-1 text-sm font-medium text-gray-900 dark:text-volt-text">
                      {user?.mfaEnabled ? "Enabled" : "Not enabled"}
                    </p>
                  </div>
                  <span className="inline-flex rounded-full border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-700 dark:border-volt-borderSoft/70 dark:bg-volt-card/40 dark:text-volt-text">
                    Recommended
                  </span>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-gray-200 bg-white p-5 dark:border-volt-borderSoft dark:bg-volt-panel">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-volt-text">Recent activity</h4>
              <p className="mt-1 text-xs text-gray-500 dark:text-volt-muted">Latest actions in your workspace.</p>

              <div className="mt-4 space-y-3">
                {[
                  { title: "Signed in", meta: lastLogin },
                  { title: "Viewed lead profile", meta: "Leads • 11:02" },
                  { title: "Opened analytics dashboard", meta: "Analytics • 12:20" },
                ].map((row) => (
                  <div
                    key={row.title}
                    className="flex items-start justify-between gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 dark:border-volt-borderSoft/70 dark:bg-volt-card/60"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900 dark:text-volt-text">{row.title}</p>
                      <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-volt-muted">{row.meta}</p>
                    </div>
                    <span className="mt-0.5 inline-flex h-2 w-2 flex-none rounded-full bg-indigo-400/80" />
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default Profile;


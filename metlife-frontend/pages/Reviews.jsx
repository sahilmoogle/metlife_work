import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { fetchHitlQueue } from "../src/services/hitlApi";
import { buildSseStreamUrl } from "../src/services/sseStream";

const queueTabs = [
  { key: "pending", label: "Pending" },
  { key: "resolved", label: "Resolved" },
];

const chipStyles = {
  pending: "bg-amber-50 text-amber-700",
  resolved: "bg-emerald-50 text-emerald-700",
};

const formatAge = (iso) => {
  if (!iso) return "";
  const dt = new Date(iso);
  const ms = Date.now() - dt.getTime();
  if (!Number.isFinite(ms)) return "";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
};

const Reviews = () => {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState("pending");
  const [pendingItems, setPendingItems] = useState([]);
  const [resolvedItems, setResolvedItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoadError("");
      setLoading(true);
      try {
        const [pending, resolved] = await Promise.all([
          fetchHitlQueue(token, { queue: "pending" }),
          fetchHitlQueue(token, { queue: "resolved" }),
        ]);
        if (!cancelled) {
          setPendingItems(Array.isArray(pending) ? pending : []);
          setResolvedItems(Array.isArray(resolved) ? resolved : []);
        }
      } catch (e) {
        if (!cancelled) {
          setPendingItems([]);
          setResolvedItems([]);
          setLoadError(e.message || "Failed to load HITL queue.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [token, refreshKey]);

  useEffect(() => {
    if (!token || typeof EventSource === "undefined") return;

    let es;
    try {
      es = new EventSource(buildSseStreamUrl(token));
    } catch {
      return;
    }

    const relevant = ["hitl_required", "hitl_approved", "hitl_edited", "hitl_rejected"];
    let last = 0;
    const refreshSoon = () => {
      const t = Date.now();
      if (t - last < 800) return;
      last = t;
      setRefreshKey((k) => k + 1);
    };

    for (const t of relevant) es.addEventListener(t, refreshSoon);
    return () => {
      es.close();
    };
  }, [token]);

  const counts = useMemo(
    () => ({
      pending: pendingItems.length,
      resolved: resolvedItems.length,
    }),
    [pendingItems.length, resolvedItems.length]
  );

  const visible = useMemo(() => {
    return activeTab === "resolved" ? resolvedItems : pendingItems;
  }, [activeTab, pendingItems, resolvedItems]);

  return (
    <section className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm sm:p-4 dark:border-white/10 dark:bg-slate-900 dark:shadow-none">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-[#1e2a52] dark:text-white">HITL Review Queue</h3>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">
          Human-in-the-loop gates awaiting review
        </p>
      </div>

      <div className="mb-3 rounded-lg bg-gray-50 p-2 dark:bg-white/5">
        <div className="flex flex-wrap items-center gap-2">
          {queueTabs.map((tab) => {
            const isActive = activeTab === tab.key;
            const count = counts[tab.key];
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  isActive ? "bg-white shadow-sm dark:bg-slate-950/40 dark:shadow-none" : "hover:bg-white/60 dark:hover:bg-white/10"
                }`}
              >
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    chipStyles[tab.key]
                  }`}
                >
                  {count} {tab.label.toLowerCase()}
                </span>
                <span className={`${isActive ? "text-gray-900 dark:text-white" : "text-gray-600 dark:text-slate-300"}`}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        {loadError ? (
          <div className="rounded-xl border border-amber-100 bg-amber-50/80 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
            <p className="text-sm text-amber-900 dark:text-amber-100">{loadError}</p>
            <button
              type="button"
              className="mt-2 text-sm font-semibold text-indigo-700 underline"
              onClick={() => setRefreshKey((k) => k + 1)}
            >
              Retry
            </button>
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-xl border border-gray-100 bg-white p-4 dark:border-white/10 dark:bg-slate-950/40">
            <p className="text-sm text-gray-600 dark:text-slate-300">Loading queue…</p>
          </div>
        ) : null}

        {!loading &&
          !loadError &&
          visible.map((item) => {
            const name = `${item.first_name || ""} ${item.last_name || ""}`.trim() || "Unknown";
            const step = item.gate_description
              ? `${item.gate_type} — ${item.gate_description}`
              : item.gate_type;

            return (
          <article
            key={item.id || item.thread_id}
            className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-[0_1px_0_rgba(0,0,0,0.02)] hover:bg-gray-50/60 dark:border-white/10 dark:bg-slate-950/40 dark:shadow-none dark:hover:bg-white/5"
            onClick={() => navigate(`/reviews/${item.thread_id}`)}
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-500/15">
                <div className="h-4 w-1.5 rounded-full bg-amber-400" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-800 dark:text-white">{name}</p>
                <p className="truncate text-xs text-gray-400 dark:text-slate-400">
                  {item.scenario_id || "—"} • Score: {(item.engagement_score ?? 0).toFixed(2)}
                </p>
              </div>
            </div>

            <div className="flex flex-none items-center gap-3">
              <span className="hidden rounded-full bg-indigo-50 px-3 py-1 text-[11px] font-semibold text-indigo-700 sm:inline-flex">
                {step}
              </span>
              <span className="text-xs text-gray-400 dark:text-slate-400">{formatAge(item.created_at)}</span>
            </div>
          </article>
            );
          })}

        {!loading && !loadError && visible.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center dark:border-white/10 dark:bg-white/5">
            <p className="text-sm font-medium text-gray-700 dark:text-slate-200">No items</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
              {activeTab === "resolved"
                ? "No resolved reviews in the selected window."
                : "Nothing in this queue right now."}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
};

export default Reviews;
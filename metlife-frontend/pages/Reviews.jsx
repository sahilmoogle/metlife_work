import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { fetchHitlQueue } from "../src/services/hitlApi";

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
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoadError("");
      setLoading(true);
      try {
        const data = await fetchHitlQueue(token);
        if (!cancelled) setItems(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!cancelled) {
          setItems([]);
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

  const counts = useMemo(() => {
    // Backend exposes only Awaiting items in /hitl/queue currently.
    const pending = items.length;
    const resolved = 0;
    return { pending, resolved };
  }, [items.length]);

  const visible = useMemo(() => {
    if (activeTab === "resolved") return [];
    return items;
  }, [activeTab, items]);

  return (
    <section className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm sm:p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-[#1e2a52]">HITL Review Queue</h3>
        <p className="mt-0.5 text-xs text-gray-500">
          Human-in-the-loop gates awaiting review
        </p>
      </div>

      <div className="mb-3 rounded-lg bg-gray-50 p-2">
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
                  isActive ? "bg-white shadow-sm" : "hover:bg-white/60"
                }`}
              >
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    chipStyles[tab.key]
                  }`}
                >
                  {count} {tab.label.toLowerCase()}
                </span>
                <span className={`${isActive ? "text-gray-900" : "text-gray-600"}`}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        {loadError ? (
          <div className="rounded-xl border border-amber-100 bg-amber-50/80 p-4">
            <p className="text-sm text-amber-900">{loadError}</p>
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
          <div className="rounded-xl border border-gray-100 bg-white p-4">
            <p className="text-sm text-gray-600">Loading queue…</p>
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
            key={item.thread_id}
            className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-[0_1px_0_rgba(0,0,0,0.02)] hover:bg-gray-50/60"
            onClick={() => navigate(`/reviews/${item.thread_id}`)}
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-amber-50">
                <div className="h-4 w-1.5 rounded-full bg-amber-400" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-800">{name}</p>
                <p className="truncate text-xs text-gray-400">
                  {item.scenario_id || "—"} • Score: {(item.engagement_score ?? 0).toFixed(2)}
                </p>
              </div>
            </div>

            <div className="flex flex-none items-center gap-3">
              <span className="hidden rounded-full bg-indigo-50 px-3 py-1 text-[11px] font-semibold text-indigo-700 sm:inline-flex">
                {step}
              </span>
              <span className="text-xs text-gray-400">{formatAge(item.created_at)}</span>
            </div>
          </article>
            );
          })}

        {!loading && !loadError && visible.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center">
            <p className="text-sm font-medium text-gray-700">No items</p>
            <p className="mt-1 text-xs text-gray-500">
              {activeTab === "resolved"
                ? "Resolved queue is not exposed by the backend yet."
                : "Nothing in this queue right now."}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
};

export default Reviews;
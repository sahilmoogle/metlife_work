import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { approveHitl, fetchHitlQueue } from "../src/services/hitlApi";
import { useTranslation } from "react-i18next";
import { buildSseStreamUrl } from "../src/services/sseStream";
import { formatRelativeTime } from "../src/utils/relativeTime";
import { useRelativeClock } from "../src/hooks/useRelativeClock";
import GuidePanel from "../components/GuidePanel";

const queueTabs = [
  { key: "pending", label: "Pending" },
  { key: "resolved", label: "Resolved" },
];

const chipStyles = {
  pending: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200",
  resolved: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200",
};

const gateFilters = [
  { key: "all", labelKey: "reviews.allGates" },
  { key: "G1", labelKey: "reviews.gates.g1" },
  { key: "G2", labelKey: "reviews.gates.g2" },
  { key: "G3", labelKey: "reviews.gates.g3" },
  { key: "G4", labelKey: "reviews.gates.g4" },
  { key: "G5", labelKey: "reviews.gates.g5" },
];

const hitlGateLegend = [
  ["G1", "Compliance", "Review the drafted email before it can be sent."],
  ["G2", "Persona", "Confirm or override low-confidence persona/scenario decisions."],
  ["G3", "Campaign", "Approve dormant revival campaign before S4 resumes."],
  ["G4", "Sales Handoff", "Accept or reject the sales briefing after A9."],
  ["G5", "Score Override", "Force handoff or hold nurture when score is near threshold."],
];

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50];

const Reviews = () => {
  useRelativeClock(30000);
  const navigate = useNavigate();
  const { token } = useAuth();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("pending");
  const [activeGate, setActiveGate] = useState("all");
  const [pendingItems, setPendingItems] = useState([]);
  const [resolvedItems, setResolvedItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedThreads, setSelectedThreads] = useState(() => new Set());
  const [bulkApproving, setBulkApproving] = useState(false);
  const [bulkMessage, setBulkMessage] = useState("");
  const [bulkError, setBulkError] = useState("");

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

  // Reset page when filters change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
  }, [activeTab, activeGate, pageSize, searchQuery]);

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

  const gateCounts = useMemo(() => {
    const result = { all: visible.length };
    gateFilters.slice(1).forEach(({ key }) => {
      result[key] = visible.filter((it) =>
        String(it.gate_type || "").toUpperCase().startsWith(key)
      ).length;
    });
    return result;
  }, [visible]);

  const filtered = useMemo(() => {
    let result = visible;
    if (activeGate !== "all") {
      result = result.filter((it) =>
        String(it.gate_type || "").toUpperCase().startsWith(activeGate)
      );
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((it) => {
        const name = `${it.first_name || ""} ${it.last_name || ""}`.toLowerCase();
        return (
          name.includes(q) ||
          String(it.thread_id || "").toLowerCase().includes(q) ||
          String(it.scenario_id || "").toLowerCase().includes(q) ||
          String(it.gate_description || "").toLowerCase().includes(q)
        );
      });
    }
    return result;
  }, [activeGate, visible, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);

  const paged = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safePage, pageSize]);

  const selectablePaged = useMemo(
    () => (activeTab === "pending" ? paged.filter((item) => item.thread_id) : []),
    [activeTab, paged]
  );

  const selectedItems = useMemo(() => {
    if (!selectedThreads.size) return [];
    return pendingItems.filter((item) => selectedThreads.has(item.thread_id));
  }, [pendingItems, selectedThreads]);

  const selectedGateSummary = useMemo(() => {
    const countsByGate = selectedItems.reduce((acc, item) => {
      const gate = item.gate_type || "Unknown";
      acc[gate] = (acc[gate] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(countsByGate)
      .map(([gate, count]) => `${gate}: ${count}`)
      .join(", ");
  }, [selectedItems]);

  const allPagedSelected =
    selectablePaged.length > 0 && selectablePaged.every((item) => selectedThreads.has(item.thread_id));

  const toggleThread = (threadId) => {
    setBulkMessage("");
    setBulkError("");
    setSelectedThreads((current) => {
      const next = new Set(current);
      if (next.has(threadId)) next.delete(threadId);
      else next.add(threadId);
      return next;
    });
  };

  const togglePagedSelection = () => {
    setBulkMessage("");
    setBulkError("");
    setSelectedThreads((current) => {
      const next = new Set(current);
      if (allPagedSelected) {
        selectablePaged.forEach((item) => next.delete(item.thread_id));
      } else {
        selectablePaged.forEach((item) => next.add(item.thread_id));
      }
      return next;
    });
  };

  const handleBulkApprove = async () => {
    if (!selectedItems.length || bulkApproving) return;
    const summary = selectedGateSummary || `${selectedItems.length} selected`;
    const ok = window.confirm(
      `Bulk approve ${selectedItems.length} pending HITL item(s)?\n\n${summary}\n\nEach item will resume its workflow as approved.`
    );
    if (!ok) return;

    setBulkApproving(true);
    setBulkMessage("");
    setBulkError("");

    const successes = [];
    const failures = [];
    for (const item of selectedItems) {
      try {
        await approveHitl(token, item.thread_id, {
          action: "approved",
          reviewer_notes: "Bulk approved by reviewer",
        });
        successes.push(item.thread_id);
      } catch (e) {
        failures.push({
          threadId: item.thread_id,
          message: e.message || "Approval failed.",
        });
      }
    }

    setSelectedThreads((current) => {
      const next = new Set(current);
      successes.forEach((threadId) => next.delete(threadId));
      return next;
    });
    setBulkMessage(`Bulk approval complete: ${successes.length} approved, ${failures.length} failed.`);
    setBulkError(failures.length ? failures.map((f) => `${f.threadId}: ${f.message}`).join(" | ") : "");
    setRefreshKey((k) => k + 1);
    setBulkApproving(false);
  };

  const pageNumbers = useMemo(() => {
    const nums = [];
    const delta = 2;
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= safePage - delta && i <= safePage + delta)) {
        nums.push(i);
      } else if (
        (i === safePage - delta - 1 && i > 1) ||
        (i === safePage + delta + 1 && i < totalPages)
      ) {
        nums.push("...");
      }
    }
    return nums;
  }, [safePage, totalPages]);

  return (
    <section className="space-y-3">
      <div className="app-surface-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[#1e2a52] dark:text-white">{t("reviews.title")}</h3>
            <p className="mt-0.5 text-xs font-medium text-gray-500 dark:text-volt-muted2">
              {t("reviews.subtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-600 transition hover:border-[#a7c4f2] hover:text-[#004EB2] dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-muted"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
              <path d="M4 4v5h5M20 20v-5h-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4.06 9A9 9 0 1 1 4 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {t("common.refresh")}
          </button>
        </div>
      </div>

      <GuidePanel
        title="HITL gateway guide"
        subtitle="G1-G5 review gates and queue states"
        tone="amber"
      >
        <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-500 dark:text-volt-muted2">
          <span>Pending = waiting now</span>
          <span>Resolved = decision already recorded</span>
          <span>Approval resumes the workflow from the paused gate</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {hitlGateLegend.map(([gate, label, detail]) => (
            <div
              key={gate}
              className="rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-2 text-[11px] transition duration-200 ease-out hover:shadow-sm motion-safe:hover:-translate-y-0.5 dark:border-volt-borderSoft dark:bg-white/[0.05]"
            >
              <span className="font-semibold text-amber-900 dark:text-amber-200">
                {gate} · {label}
              </span>
              <p className="mt-0.5 text-amber-900/80 dark:text-volt-muted2">{detail}</p>
            </div>
          ))}
        </div>
      </GuidePanel>

      {/* Pending / Resolved tabs */}
      <div className="app-surface-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          {queueTabs.map((tab) => {
            const isActive = activeTab === tab.key;
            const count = counts[tab.key];
            const tabLabel = tab.key === "pending" ? t("reviews.pending") : t("reviews.resolved");
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  isActive
                    ? "bg-[#004EB2] text-white shadow-sm"
                    : "border border-gray-200 bg-white text-gray-600 hover:border-[#a7c4f2] hover:text-[#004EB2] dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-muted"
                }`}
              >
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    isActive ? "bg-white/20 text-white" : chipStyles[tab.key]
                  }`}
                >
                  {count}
                </span>
                {tabLabel}
              </button>
            );
          })}
        </div>
      </div>

      {/* Gate filters */}
      <div className="app-surface-card p-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-volt-muted2">
          {t("reviews.filterByGate")}
        </p>
        <div className="flex flex-wrap gap-2">
          {gateFilters.map((g) => {
            const isActive = activeGate === g.key;
            const cnt = gateCounts[g.key] ?? 0;
            return (
              <button
                key={g.key}
                type="button"
                onClick={() => setActiveGate(g.key)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  isActive
                    ? "border-[#cfe0ff] bg-[#eaf2ff] text-[#004EB2] dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-300"
                    : "border-gray-200 bg-white text-gray-600 hover:border-[#a7c4f2] hover:bg-[#eaf2ff]/60 hover:text-[#004EB2] dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-muted dark:hover:border-indigo-500/30"
                }`}
              >
                {t(g.labelKey)}
                <span
                  className={`inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                    isActive
                      ? "bg-[#cfe0ff] text-[#003B86] dark:bg-indigo-500/30 dark:text-indigo-200"
                      : "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-volt-muted2"
                  }`}
                >
                  {cnt}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* List */}
      <div className="app-surface-card p-3">
        {/* Header: Search and Stats */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3 dark:border-volt-borderSoft">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-volt-muted2"
              aria-hidden="true"
            >
              <path d="M21 21l-4.35-4.35M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, thread ID, or scenario..."
              className="h-9 w-full rounded-full border border-gray-200 bg-gray-50 pl-9 pr-4 text-xs text-gray-800 outline-none transition focus:border-indigo-300 focus:bg-white dark:border-volt-borderSoft dark:bg-white/5 dark:text-volt-text dark:focus:border-indigo-500/40 dark:focus:bg-volt-card"
            />
          </div>
          {activeTab === "pending" ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!selectablePaged.length || bulkApproving}
                onClick={togglePagedSelection}
                className="inline-flex h-8 items-center gap-2 rounded-full border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-600 transition hover:border-[#a7c4f2] hover:text-[#004EB2] disabled:cursor-not-allowed disabled:opacity-50 dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-muted"
              >
                {allPagedSelected ? "Clear visible" : "Select visible"}
              </button>
              <button
                type="button"
                disabled={!selectedItems.length || bulkApproving}
                onClick={handleBulkApprove}
                title={selectedGateSummary ? `Selected gates: ${selectedGateSummary}` : "Select pending reviews first"}
                className="inline-flex h-8 items-center gap-2 rounded-full bg-[#004EB2] px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-[#003f93] disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
              >
                {bulkApproving ? "Approving..." : `Bulk approve (${selectedItems.length})`}
              </button>
            </div>
          ) : null}
          <div className="flex items-center gap-4">
            <p className="text-xs text-gray-500 dark:text-volt-muted2">
              {filtered.length === 0
                ? `${t("common.noItems")}`
                : t("reviews.showing", {
                    from: (safePage - 1) * pageSize + 1,
                    to: Math.min(safePage * pageSize, filtered.length),
                    total: filtered.length,
                  })}
            </p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-volt-muted">{t("common.perPage")}</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="h-8 rounded-full border border-gray-200 bg-white px-3 text-xs text-gray-700 outline-none dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-text"
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          </div>
        </div>

        {bulkMessage ? (
          <div className="mb-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-200">
            {bulkMessage}
          </div>
        ) : null}
        {bulkError ? (
          <div className="mb-3 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-200">
            {bulkError}
          </div>
        ) : null}

        <div className="space-y-2">
          {loadError ? (
            <div className="rounded-xl border border-amber-100 bg-amber-50/80 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
              <p className="text-sm text-amber-900 dark:text-amber-100">{loadError}</p>
              <button
                type="button"
                className="mt-2 text-sm font-semibold text-[#004EB2] underline"
                onClick={() => setRefreshKey((k) => k + 1)}
              >
                {t("common.retry")}
              </button>
            </div>
          ) : null}

          {loading ? (
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-6 text-center dark:border-volt-borderSoft dark:bg-volt-card/60">
              <p className="text-sm text-gray-500 dark:text-volt-muted">{t("common.loading")}</p>
            </div>
          ) : null}

          {!loading && !loadError && paged.map((item) => {
            const name = `${item.first_name || ""} ${item.last_name || ""}`.trim() || "Unknown";
            const step = item.gate_description
              ? `${item.gate_type} — ${item.gate_description}`
              : item.gate_type;

            return (
              <article
                key={item.thread_id}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-4 py-3 shadow-[0_1px_0_rgba(0,0,0,0.02)] transition hover:border-[#cfe0ff] hover:bg-[#eaf2ff]/40 dark:border-volt-borderSoft dark:bg-volt-card/60 dark:shadow-none dark:hover:border-indigo-500/20 dark:hover:bg-white/10 ${
                  selectedThreads.has(item.thread_id)
                    ? "border-[#a7c4f2] bg-[#eaf2ff]/50 dark:border-indigo-500/30 dark:bg-indigo-500/10"
                    : "border-gray-100 bg-white"
                }`}
                onClick={() => navigate(`/reviews/${item.thread_id}`)}
              >
                <div className="flex min-w-0 items-center gap-3">
                  {activeTab === "pending" ? (
                    <input
                      type="checkbox"
                      checked={selectedThreads.has(item.thread_id)}
                      onChange={() => toggleThread(item.thread_id)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Select ${name} for bulk approval`}
                      className="h-4 w-4 flex-none rounded border-gray-300 text-[#004EB2] focus:ring-[#004EB2]"
                    />
                  ) : null}
                  <div className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-500/15">
                    <div className="h-4 w-1.5 rounded-full bg-amber-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-800 dark:text-white">{name}</p>
                    <p className="truncate text-xs text-gray-600 dark:text-volt-muted2">
                      {item.scenario_id || "—"} • Score: {(item.engagement_score ?? 0).toFixed(2)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-none items-center gap-3">
                  <span className="hidden rounded-full bg-[#eaf2ff] px-3 py-1 text-[11px] font-semibold text-[#004EB2] sm:inline-flex dark:bg-indigo-500/15 dark:text-indigo-300">
                    {step}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-volt-muted2" title={item.created_at ? new Date(item.created_at).toLocaleString() : undefined}>
                    {formatRelativeTime(item.created_at) || "—"}
                  </span>
                  <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-gray-300 dark:text-volt-muted2" aria-hidden="true">
                    <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </article>
            );
          })}

          {!loading && !loadError && filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-10 text-center dark:border-volt-borderSoft dark:bg-white/5">
              <p className="text-sm font-medium text-gray-700 dark:text-volt-text">{t("common.noItems")}</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-volt-muted">
                {activeTab === "resolved"
                  ? t("reviews.resolvedNotExposed")
                  : activeGate !== "all"
                  ? t("reviews.noGateItems", { gate: activeGate })
                  : t("reviews.nothingInQueue")}
              </p>
            </div>
          ) : null}
        </div>

        {/* Pagination */}
        {!loading && !loadError && totalPages > 1 ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              disabled={safePage === 1}
              onClick={() => setPage((p) => p - 1)}
            className="inline-flex h-8 items-center gap-1 rounded-full border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-600 transition hover:border-[#a7c4f2] hover:text-[#004EB2] disabled:cursor-not-allowed disabled:opacity-40 dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-muted"
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
                <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {t("common.prev")}
            </button>

            <div className="flex items-center gap-1">
              {pageNumbers.map((n, idx) =>
                n === "..." ? (
                  <span key={`dots-${idx}`} className="px-1 text-xs text-gray-400 dark:text-volt-muted2">…</span>
                ) : (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPage(n)}
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition ${
                      n === safePage
                        ? "bg-[#004EB2] text-white shadow-sm"
                        : "border border-gray-200 bg-white text-gray-600 hover:border-[#a7c4f2] hover:text-[#004EB2] dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-muted"
                    }`}
                  >
                    {n}
                  </button>
                )
              )}
            </div>

            <button
              type="button"
              disabled={safePage === totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="inline-flex h-8 items-center gap-1 rounded-full border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-600 transition hover:border-[#a7c4f2] hover:text-[#004EB2] disabled:cursor-not-allowed disabled:opacity-40 dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-muted"
            >
              {t("common.next")}
              <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
                <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
};

export default Reviews;
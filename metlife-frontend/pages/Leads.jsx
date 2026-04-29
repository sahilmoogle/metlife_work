import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { fetchLeadsList } from "../src/services/leadsApi";
import { fetchHitlQueue } from "../src/services/hitlApi";
import { downloadBlob, leadsToCsv } from "../src/utils/exportFile";
import { useTranslation } from "react-i18next";
import { formatRelativeTime } from "../src/utils/relativeTime";
import { useRelativeClock } from "../src/hooks/useRelativeClock";

const leadFilters = ["All", "Active", "HITL", "Converted", "Dormant"];

const statusStyles = {
  Active: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200",
  Processing: "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-200",
  New: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200",
  Pending_HITL: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-200",
  HITL: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-200",
  Converted: "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-200",
  Dormant: "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-volt-muted2",
  Suppressed: "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-volt-muted2",
};

const scenarioStyles = {
  S1: "text-purple-700 dark:text-fuchsia-200",
  S2: "text-emerald-700 dark:text-emerald-200",
  S3: "text-amber-700 dark:text-amber-200",
  S4: "text-blue-700 dark:text-sky-200",
  S5: "text-fuchsia-700 dark:text-fuchsia-200",
  S6: "text-lime-700 dark:text-lime-200",
  S7: "text-rose-700 dark:text-rose-200",
};

/** Backend keeps most HITL pauses as ``workflow_status=Active``; queue membership defines HITL filter. */
const DORMANCY_NODE = "A10_Dormancy";

const matchesFilter = (lead, filter, pendingHitlLeadIds) => {
  const status = lead.workflow_status || "New";
  const id = lead.id ? String(lead.id) : "";
  if (filter === "All") return true;
  if (filter === "Active") return status === "Active" || status === "Processing";
  if (filter === "HITL") {
    return (
      status === "Pending_HITL" ||
      status === "HITL" ||
      (id && pendingHitlLeadIds.has(id))
    );
  }
  if (filter === "Converted") return status === "Converted";
  if (filter === "Dormant") {
    return status === "Dormant" || lead.current_agent_node === DORMANCY_NODE;
  }
  return true;
};

const Leads = () => {
  useRelativeClock(30000);
  const navigate = useNavigate();
  const { token } = useAuth();
  const { t } = useTranslation();
  const [leads, setLeads] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(() => new Set());
  const [refreshKey, setRefreshKey] = useState(0);
  const [pendingHitlLeadIds, setPendingHitlLeadIds] = useState(() => new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadError("");
      setLoading(true);
      try {
        const [listRes, hitlRes] = await Promise.allSettled([fetchLeadsList(token), fetchHitlQueue(token)]);
        if (!cancelled) {
          if (listRes.status !== "fulfilled") {
            setLeads([]);
            setPendingHitlLeadIds(new Set());
            const err = listRes.reason;
            setLoadError(err?.message || String(err || "Failed to load leads."));
          } else {
            const data = listRes.value;
            setLeads(Array.isArray(data) ? data : []);
            if (hitlRes.status === "fulfilled") {
              const rows = Array.isArray(hitlRes.value) ? hitlRes.value : [];
              setPendingHitlLeadIds(
                new Set(rows.map((r) => (r.lead_id != null ? String(r.lead_id) : "")).filter(Boolean)),
              );
            } else {
              setPendingHitlLeadIds(new Set());
            }
            setSelected(new Set());
          }
        }
      } catch (e) {
        if (!cancelled) {
          setLeads([]);
          setPendingHitlLeadIds(new Set());
          setLoadError(e.message || "Failed to load leads.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, refreshKey]);

  const filteredLeads = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads
      .filter((lead) => matchesFilter(lead, activeFilter, pendingHitlLeadIds))
      .filter((lead) => {
        if (!q) return true;
        const hay = [
          lead.name,
          lead.email,
          lead.scenario_id,
          lead.persona_code,
          lead.current_agent_node,
          lead.workflow_status,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
  }, [activeFilter, leads, pendingHitlLeadIds, query]);

  const totalRows = filteredLeads.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));

  useEffect(() => {
    // Reset to first page when dataset shape changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
    setSelected(new Set());
  }, [activeFilter, query, rowsPerPage]);

  useEffect(() => {
    // Clamp page if current page becomes invalid (e.g., after filter changes).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  const startIndex = (page - 1) * rowsPerPage;
  const endIndex = Math.min(totalRows, startIndex + rowsPerPage);

  const pagedLeads = useMemo(() => filteredLeads.slice(startIndex, endIndex), [endIndex, filteredLeads, startIndex]);

  const allVisibleSelected =
    pagedLeads.length > 0 && pagedLeads.every((lead) => selected.has(lead.id));

  const toggleAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        pagedLeads.forEach((lead) => next.delete(lead.id));
        return next;
      }
      pagedLeads.forEach((lead) => next.add(lead.id));
      return next;
    });
  };

  const toggleOne = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExport = () => {
    const rows =
      selected.size > 0 ? leads.filter((lead) => selected.has(lead.id)) : filteredLeads;
    if (!rows.length) return;
    const filename =
      selected.size > 0
        ? `leads-selected-${rows.length}-${Date.now()}.csv`
        : `leads-filtered-${rows.length}-${Date.now()}.csv`;
    downloadBlob(filename, leadsToCsv(rows), "text/csv;charset=utf-8");
  };

  return (
    <section className="app-surface-card p-3 sm:p-4">
      {loadError ? (
        <div className="mb-3 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
          {loadError}{" "}
          <button type="button" className="font-semibold underline" onClick={() => setRefreshKey((k) => k + 1)}>
            {t("common.retry")}
          </button>
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {leadFilters.map((filter) => {
            const isActive = activeFilter === filter;
            const label =
              filter === "All"
                ? t("leads.all")
                : filter === "Active"
                ? t("leads.active")
                : filter === "HITL"
                ? t("leads.hitl")
                : filter === "Converted"
                ? t("leads.converted")
                : t("leads.dormant");
            return (
              <button
                key={filter}
                type="button"
                onClick={() => setActiveFilter(filter)}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold outline-none transition duration-200 ease-out active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[#004EB2]/35 ${
                  isActive
                    ? "bg-[#004EB2] text-white shadow-md shadow-blue-900/15 dark:shadow-black/40"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-white/10 dark:text-volt-muted dark:hover:bg-white/15"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
          <div className="flex h-10 w-full items-center gap-2 rounded-full border border-gray-200 bg-white px-3 text-sm text-gray-400 shadow-sm transition duration-200 ease-out focus-within:border-indigo-300 focus-within:shadow-md focus-within:ring-2 focus-within:ring-indigo-200/50 sm:w-[320px] dark:border-volt-borderSoft dark:bg-volt-panel/60 dark:text-volt-muted2 dark:shadow-none dark:focus-within:border-volt-accent/50 dark:focus-within:ring-volt-accent/25">
            <span className="select-none text-gray-400 dark:text-volt-muted2">Q</span>
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("common.search")}
              className="w-full bg-transparent text-sm text-gray-700 outline-none dark:text-volt-text"
            />
          </div>
          <button
            type="button"
            disabled={loading || !filteredLeads.length}
            onClick={handleExport}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#0b4aa6] via-[#004EB2] to-[#003B86] px-5 text-xs font-semibold text-white shadow-[0_12px_30px_rgba(0,78,178,0.22)] transition duration-200 ease-out hover:brightness-[1.06] hover:shadow-[0_14px_34px_rgba(0,78,178,0.28)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#004EB2]/50 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 dark:shadow-[0_12px_30px_rgba(0,0,0,0.35)]"
            title={
              selected.size > 0
                ? `Export ${selected.size} selected lead(s)`
                : "Export all leads matching current filters"
            }
          >
            {t("common.export")}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[980px] w-full border-separate border-spacing-0">
          <thead>
            <tr className="text-left text-xs font-semibold text-gray-500 dark:text-volt-muted2">
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisible}
                  disabled={!pagedLeads.length}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-200 dark:border-white/20 dark:bg-volt-card/60"
                />
              </th>
              <th className="w-16 px-3 py-3">Sr. No</th>
              <th className="min-w-[220px] px-3 py-3">Lead</th>
              <th className="w-24 px-3 py-3">Scenario</th>
              <th className="min-w-[220px] px-3 py-3">Persona</th>
              <th className="min-w-[220px] px-3 py-3">Current Step</th>
              <th className="w-24 px-3 py-3">Score</th>
              <th className="w-28 px-3 py-3">Status</th>
              <th className="w-28 px-3 py-3">Last Activity</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-sm text-gray-500 dark:text-volt-muted">
                  Loading leads…
                </td>
              </tr>
            ) : null}
            {!loading && !pagedLeads.length ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-sm text-gray-500 dark:text-volt-muted">
                  No leads match your filters.
                </td>
              </tr>
            ) : null}
            {!loading
              ? pagedLeads.map((lead, index) => {
                  const scenario = lead.scenario_id || "—";
                  const status = lead.workflow_status || "New";
                  return (
                    <tr
                      key={lead.id}
                      className="cursor-pointer border-t border-gray-100  text-sm text-gray-700 transition-colors duration-150 ease-out hover:bg-gray-50/90 dark:border-volt-borderSoft dark:text-volt-text dark:hover:bg-white/10"
                      onClick={() => navigate(`/leads/${lead.id}`)}
                    >
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(lead.id)}
                          onChange={() => toggleOne(lead.id)}
                          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-200 dark:border-white/20 dark:bg-volt-card/60"
                        />
                      </td>
                      <td className="px-3 py-3 text-gray-600 dark:text-volt-muted">{startIndex + index + 1}</td>
                      <td className="px-3 py-3">
                        <div className="leading-tight">
                          <p className="font-medium text-gray-800 dark:text-white">{lead.name}</p>
                          <p className="text-xs text-gray-400 dark:text-volt-muted2">{lead.email}</p>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`text-xs font-semibold ${scenarioStyles[scenario] || "text-gray-700"}`}
                        >
                          {scenario}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-gray-700 dark:text-volt-text">{lead.persona_code || "—"}</td>
                      <td className="px-3 py-3 text-gray-700 dark:text-volt-text">{lead.current_agent_node || "—"}</td>
                      <td className="px-3 py-3 font-medium text-gray-800 dark:text-white">
                        {(lead.engagement_score ?? 0).toFixed(2)}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                            statusStyles[status] || "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {status}
                        </span>
                      </td>
                      <td
                        className="px-3 py-3 text-gray-500 dark:text-volt-muted2"
                        title={
                          lead.last_activity && Number.isFinite(new Date(lead.last_activity).getTime())
                            ? new Date(lead.last_activity).toLocaleString()
                            : undefined
                        }
                      >
                        {lead.last_activity ? formatRelativeTime(lead.last_activity) || lead.last_activity : "—"}
                      </td>
                    </tr>
                  );
                })
              : null}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500 dark:text-volt-muted2">
        <div className="flex items-center gap-2">
          <span>{t("leads.rowsPerPage")}</span>
          <select
            value={rowsPerPage}
            onChange={(event) => setRowsPerPage(Number(event.target.value))}
            className="h-8 cursor-pointer rounded-full border border-gray-200 bg-white px-3 text-xs text-gray-700 outline-none transition duration-200 hover:border-indigo-300 focus-visible:ring-2 focus-visible:ring-indigo-300/60 dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-text dark:hover:border-volt-accent/40"
          >
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={25}>25</option>
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
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="h-8 rounded-full border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 transition duration-200 ease-out hover:border-indigo-200 hover:text-indigo-700 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/60 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-text dark:hover:border-volt-border dark:hover:text-white"
            >
              {t("common.prev")}
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => {
                // show first, last, current +/- 1
                if (p === 1 || p === totalPages) return true;
                return Math.abs(p - page) <= 1;
              })
              .reduce((acc, p) => {
                const last = acc[acc.length - 1];
                if (last && typeof last === "number" && p - last > 1) acc.push("…");
                acc.push(p);
                return acc;
              }, [])
              .map((p, idx) =>
                p === "…" ? (
                  <span key={`dots-${idx}`} className="px-2 text-gray-400 dark:text-volt-muted2">
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPage(p)}
                    disabled={loading}
                    className={`h-8 min-w-8 rounded-full border px-3 text-xs font-semibold outline-none transition duration-200 ease-out active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-[#004EB2]/40 disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100 ${
                      p === page
                        ? "border-[#004EB2] bg-[#004EB2] text-white shadow-sm"
                        : "border-gray-200 bg-white text-gray-700 hover:border-[#a7c4f2] hover:text-[#004EB2] dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-text dark:hover:border-volt-border dark:hover:text-white"
                    }`}
                  >
                    {p}
                  </button>
                )
              )}

            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="h-8 rounded-full border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 transition duration-200 ease-out hover:border-indigo-200 hover:text-indigo-700 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/60 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-text dark:hover:border-volt-border dark:hover:text-white"
            >
              {t("common.next")}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Leads;

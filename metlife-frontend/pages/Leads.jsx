import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { fetchLeadsList } from "../src/services/leadsApi";
import { downloadBlob, leadsToCsv } from "../src/utils/exportFile";
import { useTranslation } from "react-i18next";

const leadFilters = ["All", "Active", "HITL", "Converted", "Dormant"];

const statusStyles = {
  Active: "bg-emerald-50 text-emerald-700",
  Processing: "bg-sky-50 text-sky-700",
  New: "bg-amber-50 text-amber-700",
  Pending_HITL: "bg-rose-50 text-rose-700",
  HITL: "bg-rose-50 text-rose-700",
  Converted: "bg-indigo-50 text-indigo-700",
  Dormant: "bg-gray-100 text-gray-600",
  Suppressed: "bg-gray-100 text-gray-500",
};

const scenarioStyles = {
  S1: "text-purple-700",
  S2: "text-emerald-700",
  S3: "text-amber-700",
  S4: "text-blue-700",
  S5: "text-fuchsia-700",
  S6: "text-lime-700",
  S7: "text-rose-700",
};

const matchesFilter = (status, filter) => {
  if (filter === "All") return true;
  if (filter === "Active") return status === "Active" || status === "Processing";
  if (filter === "HITL") return status === "Pending_HITL" || status === "HITL";
  if (filter === "Converted") return status === "Converted";
  if (filter === "Dormant") return status === "Dormant";
  return true;
};

const Leads = () => {
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadError("");
      setLoading(true);
      try {
        const data = await fetchLeadsList(token);
        if (!cancelled) {
          setLeads(Array.isArray(data) ? data : []);
          setSelected(new Set());
        }
      } catch (e) {
        if (!cancelled) {
          setLeads([]);
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
      .filter((lead) => matchesFilter(lead.workflow_status || "New", activeFilter))
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
  }, [activeFilter, leads, query]);

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
    <section className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm sm:p-4 dark:border-white/10 dark:bg-slate-900 dark:shadow-none">
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
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                  isActive
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
          <div className="flex h-9 w-full items-center gap-2 rounded-full border border-gray-200 bg-white px-3 text-sm text-gray-400 sm:w-[320px] dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-400">
            <span className="select-none text-gray-400 dark:text-slate-400">Q</span>
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("common.search")}
              className="w-full bg-transparent text-sm text-gray-700 outline-none dark:text-slate-200"
            />
          </div>
          <button
            type="button"
            disabled={loading || !filteredLeads.length}
            onClick={handleExport}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-full bg-indigo-600 px-4 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
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
            <tr className="text-left text-xs font-semibold text-gray-500 dark:text-slate-400">
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisible}
                  disabled={!pagedLeads.length}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-200 dark:border-white/20 dark:bg-slate-950/40"
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
                <td colSpan={9} className="px-3 py-8 text-center text-sm text-gray-500 dark:text-slate-400">
                  Loading leads…
                </td>
              </tr>
            ) : null}
            {!loading && !pagedLeads.length ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-sm text-gray-500 dark:text-slate-400">
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
                      className="cursor-pointer border-t border-gray-100 text-sm text-gray-700 hover:bg-gray-50/60 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5"
                      onClick={() => navigate(`/leads/${lead.id}`)}
                    >
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(lead.id)}
                          onChange={() => toggleOne(lead.id)}
                          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-200 dark:border-white/20 dark:bg-slate-950/40"
                        />
                      </td>
                      <td className="px-3 py-3 text-gray-600 dark:text-slate-300">{startIndex + index + 1}</td>
                      <td className="px-3 py-3">
                        <div className="leading-tight">
                          <p className="font-medium text-gray-800 dark:text-white">{lead.name}</p>
                          <p className="text-xs text-gray-400 dark:text-slate-400">{lead.email}</p>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`text-xs font-semibold ${scenarioStyles[scenario] || "text-gray-700"}`}
                        >
                          {scenario}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-gray-700 dark:text-slate-200">{lead.persona_code || "—"}</td>
                      <td className="px-3 py-3 text-gray-700 dark:text-slate-200">{lead.current_agent_node || "—"}</td>
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
                      <td className="px-3 py-3 text-gray-500 dark:text-slate-400">{lead.last_activity || "—"}</td>
                    </tr>
                  );
                })
              : null}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500 dark:text-slate-400">
        <div className="flex items-center gap-2">
          <span>{t("leads.rowsPerPage")}</span>
          <select
            value={rowsPerPage}
            onChange={(event) => setRowsPerPage(Number(event.target.value))}
            className="h-8 rounded-full border border-gray-200 bg-white px-3 text-xs text-gray-700 outline-none dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-200"
          >
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={25}>25</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-gray-500 dark:text-slate-400">
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
              className="h-8 rounded-full border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 transition hover:border-indigo-200 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-200 dark:hover:border-white/20 dark:hover:text-white"
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
                  <span key={`dots-${idx}`} className="px-2 text-gray-400 dark:text-slate-500">
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPage(p)}
                    disabled={loading}
                    className={`h-8 min-w-8 rounded-full border px-3 text-xs font-semibold transition ${
                      p === page
                        ? "border-indigo-600 bg-indigo-600 text-white"
                        : "border-gray-200 bg-white text-gray-700 hover:border-indigo-200 hover:text-indigo-700 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-200 dark:hover:border-white/20 dark:hover:text-white"
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    {p}
                  </button>
                )
              )}

            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="h-8 rounded-full border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 transition hover:border-indigo-200 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-200 dark:hover:border-white/20 dark:hover:text-white"
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

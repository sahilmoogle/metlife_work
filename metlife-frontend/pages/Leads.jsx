import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { fetchLeadsList } from "../src/services/leadsApi";
import { downloadBlob, leadsToCsv } from "../src/utils/exportFile";

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
  const [leads, setLeads] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [rowsPerPage, setRowsPerPage] = useState(10);
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

  const pagedLeads = useMemo(
    () => filteredLeads.slice(0, rowsPerPage),
    [filteredLeads, rowsPerPage]
  );

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
    <section className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm sm:p-4">
      {loadError ? (
        <div className="mb-3 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {loadError}{" "}
          <button type="button" className="font-semibold underline" onClick={() => setRefreshKey((k) => k + 1)}>
            Retry
          </button>
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {leadFilters.map((filter) => {
            const isActive = activeFilter === filter;
            return (
              <button
                key={filter}
                type="button"
                onClick={() => setActiveFilter(filter)}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                  isActive
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {filter}
              </button>
            );
          })}
        </div>

        <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
          <div className="flex h-9 w-full items-center gap-2 rounded-full border border-gray-200 bg-white px-3 text-sm text-gray-400 sm:w-[320px]">
            <span className="select-none text-gray-400">Q</span>
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search"
              className="w-full bg-transparent text-sm text-gray-700 outline-none"
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
            Export
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[980px] w-full border-separate border-spacing-0">
          <thead>
            <tr className="text-left text-xs font-semibold text-gray-500">
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisible}
                  disabled={!pagedLeads.length}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-200"
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
                <td colSpan={9} className="px-3 py-8 text-center text-sm text-gray-500">
                  Loading leads…
                </td>
              </tr>
            ) : null}
            {!loading && !pagedLeads.length ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-sm text-gray-500">
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
                      className="cursor-pointer border-t border-gray-100 text-sm text-gray-700 hover:bg-gray-50/60"
                      onClick={() => navigate(`/leads/${lead.id}`)}
                    >
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(lead.id)}
                          onChange={() => toggleOne(lead.id)}
                          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-200"
                        />
                      </td>
                      <td className="px-3 py-3 text-gray-600">{index + 1}</td>
                      <td className="px-3 py-3">
                        <div className="leading-tight">
                          <p className="font-medium text-gray-800">{lead.name}</p>
                          <p className="text-xs text-gray-400">{lead.email}</p>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`text-xs font-semibold ${scenarioStyles[scenario] || "text-gray-700"}`}
                        >
                          {scenario}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-gray-700">{lead.persona_code || "—"}</td>
                      <td className="px-3 py-3 text-gray-700">{lead.current_agent_node || "—"}</td>
                      <td className="px-3 py-3 font-medium text-gray-800">
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
                      <td className="px-3 py-3 text-gray-500">{lead.last_activity || "—"}</td>
                    </tr>
                  );
                })
              : null}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500">
        <div className="flex items-center gap-2">
          <span>Rows per page</span>
          <select
            value={rowsPerPage}
            onChange={(event) => setRowsPerPage(Number(event.target.value))}
            className="h-8 rounded-full border border-gray-200 bg-white px-3 text-xs text-gray-700 outline-none"
          >
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={25}>25</option>
          </select>
        </div>

        <div className="text-gray-500">
          Showing 1 to {Math.min(rowsPerPage, filteredLeads.length)} of {filteredLeads.length} Entries
        </div>
      </div>
    </section>
  );
};

export default Leads;

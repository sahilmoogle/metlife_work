import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { leadsSeed } from "../src/data/leads";

const leadFilters = ["All", "Active", "HITL", "Converted", "Dormant"];

const statusStyles = {
  Active: "bg-emerald-50 text-emerald-700",
  Pending: "bg-amber-50 text-amber-700",
  HITL: "bg-rose-50 text-rose-700",
  Converted: "bg-indigo-50 text-indigo-700",
  Dormant: "bg-gray-100 text-gray-600",
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

const Leads = () => {
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [selected, setSelected] = useState(() => new Set());

  const filteredLeads = useMemo(() => {
    const q = query.trim().toLowerCase();

    return leadsSeed
      .filter((lead) => {
        if (activeFilter === "All") return true;
        if (activeFilter === "HITL") return lead.status === "HITL";
        return lead.status === activeFilter;
      })
      .filter((lead) => {
        if (!q) return true;
        return (
          lead.name.toLowerCase().includes(q) ||
          lead.email.toLowerCase().includes(q) ||
          lead.persona.toLowerCase().includes(q) ||
          lead.currentStep.toLowerCase().includes(q) ||
          lead.scenario.toLowerCase().includes(q) ||
          lead.status.toLowerCase().includes(q)
        );
      });
  }, [activeFilter, query]);

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

  return (
    <section className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm sm:p-4">
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
            className="inline-flex h-9 items-center justify-center gap-2 rounded-full bg-indigo-600 px-4 text-xs font-semibold text-white hover:bg-indigo-700"
            onClick={() => {}}
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
            {pagedLeads.map((lead, index) => (
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
                  <span className={`text-xs font-semibold ${scenarioStyles[lead.scenario] || "text-gray-700"}`}>
                    {lead.scenario}
                  </span>
                </td>
                <td className="px-3 py-3 text-gray-700">{lead.persona}</td>
                <td className="px-3 py-3 text-gray-700">{lead.currentStep}</td>
                <td className="px-3 py-3 font-medium text-gray-800">
                  {lead.score.toFixed(2)}
                </td>
                <td className="px-3 py-3">
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                      statusStyles[lead.status] || "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {lead.status}
                  </span>
                </td>
                <td className="px-3 py-3 text-gray-500">{lead.lastActivity}</td>
              </tr>
            ))}
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
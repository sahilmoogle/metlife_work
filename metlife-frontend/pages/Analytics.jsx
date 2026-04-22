import { useMemo, useState } from "react";

const ranges = [
  { key: "30d", label: "30 Days" },
  { key: "90d", label: "90 Days" },
  { key: "all", label: "All Time" },
];

const kpis = [
  {
    title: "Conversion Rate",
    value: "12.0%",
    sub: "↑ 2.3% vs last month",
    valueTone: "text-emerald-700",
    subTone: "text-emerald-700",
    bar: "bg-emerald-500",
  },
  {
    title: "Avg Handoff Score",
    value: "0.84",
    sub: "Threshold: ≥ 0.80",
    valueTone: "text-blue-700",
    subTone: "text-gray-400",
    bar: "bg-blue-500",
  },
  {
    title: "HITL Avg Review",
    value: "2.4m",
    sub: "● Below 5m target",
    valueTone: "text-amber-700",
    subTone: "text-emerald-700",
    bar: "bg-amber-500",
  },
  {
    title: "Email Open Rate",
    value: "38.7%",
    sub: "↑ 4.1% vs industry avg",
    valueTone: "text-cyan-700",
    subTone: "text-emerald-700",
    bar: "bg-cyan-500",
  },
  {
    title: "LLM Cost / Lead",
    value: "¥12.4",
    sub: "↓ 18% from last month",
    valueTone: "text-violet-700",
    subTone: "text-emerald-700",
    bar: "bg-violet-500",
  },
  {
    title: "Avg Days to Convert",
    value: "14.2",
    sub: "Median: 11 days",
    valueTone: "text-teal-700",
    subTone: "text-gray-400",
    bar: "bg-teal-500",
  },
];

const weeklyBars = [
  { label: "W1", newLeads: 62, engaged: 44, converted: 18 },
  { label: "W2", newLeads: 70, engaged: 48, converted: 20 },
  { label: "W3", newLeads: 66, engaged: 46, converted: 19 },
  { label: "W4", newLeads: 74, engaged: 52, converted: 22 },
];

const scenarioConversion = [
  { id: "S5", label: "Buyer", pct: 24, count: 31, bar: "bg-cyan-500" },
  { id: "S6", label: "F2F", pct: 22, count: 11, bar: "bg-teal-500" },
  { id: "S7", label: "W2C", pct: 18, count: 7, bar: "bg-amber-500" },
  { id: "S3", label: "Senior", pct: 15, count: 18, bar: "bg-violet-500" },
  { id: "S1", label: "Young", pct: 10, count: 27, bar: "bg-blue-500" },
  { id: "S2", label: "Married", pct: 8, count: 12, bar: "bg-fuchsia-500" },
  { id: "S4", label: "Dormant", pct: 5, count: 4, bar: "bg-rose-500" },
];

const agentRows = [
  { agent: "A1 · Identity", tone: "text-cyan-700", processed: "2,847", latency: "0.3s", success: "100%" },
  { agent: "A2 · Persona", tone: "text-cyan-700", processed: "2,847", latency: "0.8s", success: "99.8%" },
  { agent: "A3 · Intent (LLM)", tone: "text-amber-700", processed: "1,368", latency: "2.1s", success: "98.5%" },
  { agent: "A4+A5 · Content", tone: "text-amber-700", processed: "2,050", latency: "3.4s", success: "97.2%" },
  { agent: "A6 · Send", tone: "text-blue-700", processed: "2,050", latency: "1.2s", success: "99.9%" },
  { agent: "A8 · Scoring", tone: "text-violet-700", processed: "1,368", latency: "0.5s", success: "100%" },
  { agent: "A9 · Handoff", tone: "text-emerald-700", processed: "342", latency: "4.8s", success: "96.5%" },
];

const emailBars = [
  { label: "Delivered", value: 99.2, color: "bg-emerald-500", track: "bg-emerald-50" },
  { label: "Open Rate", value: 38.7, color: "bg-cyan-500", track: "bg-cyan-50" },
  { label: "Click Rate", value: 12.4, color: "bg-violet-500", track: "bg-violet-50" },
  { label: "Unsubscribe", value: 0.3, color: "bg-rose-500", track: "bg-rose-50" },
];

const hitlGates = [
  {
    title: "G1 · Compliance",
    meta: "814 reviewed · 1.8m avg",
    pct: "92%",
    pctTone: "text-emerald-700",
    tone: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-100",
  },
  {
    title: "G3 · Campaign",
    meta: "85 reviewed · 3.2m avg",
    pct: "78%",
    pctTone: "text-amber-700",
    tone: "bg-amber-50 text-amber-700 ring-amber-100",
  },
  {
    title: "G4 · Sales Handoff",
    meta: "342 reviewed · 2.1m avg",
    pct: "88%",
    pctTone: "text-emerald-700",
    tone: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-100",
  },
  {
    title: "G5 · Score Override",
    meta: "198 reviewed · 1.4m avg",
    pct: "95%",
    pctTone: "text-emerald-700",
    tone: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-100",
  },
];

const scoreBuckets = [
  { label: "0-0.2", h: 18, color: "bg-rose-500" },
  { label: "0.2-0.4", h: 28, color: "bg-orange-500" },
  { label: "0.4-0.6", h: 40, color: "bg-amber-400" },
  { label: "0.6-0.8", h: 62, color: "bg-blue-500" },
  { label: "0.8-1.0", h: 86, color: "bg-emerald-500" },
];

const Analytics = () => {
  const [range, setRange] = useState("30d");

  const rangeLabel = useMemo(() => {
    if (range === "30d") return "Last 30 days";
    if (range === "90d") return "Last 90 days";
    return "All time";
  }, [range]);

  return (
    <section className="space-y-3">
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.03)] dark:border-white/10 dark:bg-slate-900 dark:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[#1e2a52] dark:text-white">Analytics</h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
              Performance metrics across all 7 scenarios • {rangeLabel}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-full border border-gray-200 bg-gray-50 p-1 dark:border-white/10 dark:bg-white/5">
              {ranges.map((r) => {
                const active = range === r.key;
                return (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => setRange(r.key)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                      active
                        ? "bg-white text-indigo-700 shadow-sm dark:bg-slate-950/40 dark:shadow-none"
                        : "text-gray-600 hover:text-gray-800 dark:text-slate-300 dark:hover:text-white"
                    }`}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              className="inline-flex h-9 items-center gap-2 rounded-full border border-gray-200 bg-white px-4 text-xs font-semibold text-gray-700 hover:border-indigo-200 hover:text-indigo-700 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-200 dark:hover:border-white/20 dark:hover:text-white"
            >
              Export
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
                <path d="M12 4v12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                <path
                  d="M8 14l4 4 4-4"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path d="M6 20h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {kpis.map((k) => (
            <div
              key={k.title}
              className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-4 shadow-[inset_0_1px_0_rgba(0,0,0,0.02)] dark:border-white/10 dark:bg-slate-950/40 dark:shadow-none"
            >
              <div className={`absolute left-0 top-0 h-1 w-full ${k.bar}`} />
              <p className="text-xs font-medium text-gray-500 dark:text-slate-400">{k.title}</p>
              <p className={`mt-2 text-2xl font-semibold tracking-tight ${k.valueTone}`}>{k.value}</p>
              <p className={`mt-1 text-[11px] font-medium ${k.subTone}`}>{k.sub}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[2fr_1fr]">
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.03)] dark:border-white/10 dark:bg-slate-900 dark:shadow-none">
          <div className="mb-3">
            <p className="text-sm font-semibold text-[#1e2a52] dark:text-white">Weekly Lead Progression</p>
            <p className="mt-1 text-[11px] text-gray-400 dark:text-slate-400">New leads, engaged, and converted per week</p>
          </div>

          <div className="flex items-end justify-between gap-3">
            {weeklyBars.map((w) => {
              const total = w.newLeads + w.engaged + w.converted;
              const hNew = Math.round((w.newLeads / total) * 100);
              const hEng = Math.round((w.engaged / total) * 100);
              const hConv = Math.max(0, 100 - hNew - hEng);
              return (
                <div key={w.label} className="flex flex-1 flex-col items-center gap-2">
                  <div className="flex h-44 w-full max-w-[120px] items-end justify-center rounded-2xl bg-gray-50 p-2 ring-1 ring-gray-100 dark:bg-white/5 dark:ring-white/10">
                    <div className="flex h-full w-10 flex-col-reverse overflow-hidden rounded-xl bg-white ring-1 ring-gray-100 dark:bg-slate-950/40 dark:ring-white/10">
                      <div className="w-full bg-emerald-500" style={{ height: `${hConv}%` }} />
                      <div className="w-full bg-violet-500" style={{ height: `${hEng}%` }} />
                      <div className="w-full bg-blue-500" style={{ height: `${hNew}%` }} />
                    </div>
                  </div>
                  <p className="text-[11px] font-semibold text-gray-500 dark:text-slate-400">{w.label}</p>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-[11px] text-gray-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-blue-500" /> New Leads
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-violet-500" /> Engaged
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Converted
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.03)] dark:border-white/10 dark:bg-slate-900 dark:shadow-none">
          <div className="mb-3">
            <p className="text-sm font-semibold text-[#1e2a52] dark:text-white">Conversion by Scenario</p>
            <p className="mt-1 text-[11px] text-gray-400 dark:text-slate-400">% of leads converted per scenario</p>
          </div>

          <div className="space-y-3">
            {scenarioConversion.map((s) => (
              <div key={s.id} className="flex items-center gap-3">
                <div className="w-28 shrink-0">
                  <p className="text-xs font-semibold text-gray-700 dark:text-slate-200">
                    {s.id} <span className="text-gray-400">·</span> {s.label}
                  </p>
                </div>
                <div className="flex-1">
                  <div className="h-2 rounded-full bg-gray-100 dark:bg-white/10">
                    <div className={`h-full rounded-full ${s.bar}`} style={{ width: `${s.pct}%` }} />
                  </div>
                </div>
                <div className="w-10 text-right text-xs font-semibold text-gray-700 dark:text-slate-200">{s.pct}%</div>
                <div className="w-10 text-right text-xs text-gray-400 dark:text-slate-400">{s.count}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.03)] dark:border-white/10 dark:bg-slate-900 dark:shadow-none">
          <div className="mb-3">
            <p className="text-sm font-semibold text-[#1e2a52] dark:text-white">Agent Performance</p>
            <p className="mt-1 text-[11px] text-gray-400 dark:text-slate-400">Throughput and latency per agent</p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[640px] w-full border-separate border-spacing-0">
              <thead>
                <tr className="text-left text-[11px] font-semibold text-gray-500 dark:text-slate-400">
                  <th className="px-3 py-2">Agent</th>
                  <th className="px-3 py-2">Processed</th>
                  <th className="px-3 py-2">Avg Latency</th>
                  <th className="px-3 py-2">Success</th>
                </tr>
              </thead>
              <tbody>
                {agentRows.map((row) => (
                  <tr key={row.agent} className="border-t border-gray-100 text-xs text-gray-700 hover:bg-gray-50/60 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5">
                    <td className={`px-3 py-2 font-semibold ${row.tone}`}>{row.agent}</td>
                    <td className="px-3 py-2 font-medium text-gray-800 dark:text-white">{row.processed}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-slate-300">{row.latency}</td>
                    <td className="px-3 py-2 font-semibold text-emerald-700">{row.success}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.03)] dark:border-white/10 dark:bg-slate-900 dark:shadow-none">
          <div className="mb-3">
            <p className="text-sm font-semibold text-[#1e2a52] dark:text-white">Email Performance</p>
            <p className="mt-1 text-[11px] text-gray-400 dark:text-slate-400">Across all campaigns</p>
          </div>

          <div className="space-y-3">
            {emailBars.map((b) => (
              <div key={b.label}>
                <div className="mb-1 flex items-center justify-between text-[11px] text-gray-500 dark:text-slate-400">
                  <span>{b.label}</span>
                  <span className="font-semibold text-gray-700 dark:text-slate-200">{b.value.toFixed(1)}%</span>
                </div>
                <div className={`h-2 rounded-full ${b.track}`}>
                  <div className={`h-full rounded-full ${b.color}`} style={{ width: `${Math.min(100, b.value)}%` }} />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50 p-3 dark:border-white/10 dark:bg-white/5">
            <p className="text-[11px] font-semibold text-gray-500 dark:text-slate-400">Top performing</p>
            <div className="mt-2 space-y-2">
              <div className="flex items-center justify-between rounded-xl bg-white px-3 py-2 ring-1 ring-gray-100 dark:bg-slate-950/40 dark:ring-white/10">
                <p className="text-xs font-semibold text-gray-800 dark:text-white">S3 Welcome Email</p>
                <p className="text-xs font-semibold text-emerald-700">52% open</p>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-white px-3 py-2 ring-1 ring-gray-100 dark:bg-slate-950/40 dark:ring-white/10">
                <p className="text-xs font-semibold text-gray-800 dark:text-white">S5 Product Nudge</p>
                <p className="text-xs font-semibold text-amber-700">18% click</p>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.03)] dark:border-white/10 dark:bg-slate-900 dark:shadow-none">
          <div className="mb-3">
            <p className="text-sm font-semibold text-[#1e2a52] dark:text-white">HITL Gate Stats</p>
            <p className="mt-1 text-[11px] text-gray-400 dark:text-slate-400">Approval metrics by gate</p>
          </div>

          <div className="space-y-2">
            {hitlGates.map((g) => (
              <div
                key={g.title}
                className="rounded-2xl border border-gray-100 bg-white p-3 shadow-[inset_0_1px_0_rgba(0,0,0,0.02)] dark:border-white/10 dark:bg-slate-950/40 dark:shadow-none"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold ring-1 ${g.tone}`}>
                      {g.title}
                    </span>
                    <p className="mt-2 text-[11px] text-gray-400 dark:text-slate-400">{g.meta}</p>
                  </div>
                  <p className={`text-lg font-semibold ${g.pctTone}`}>{g.pct}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 rounded-2xl bg-teal-900 p-4 text-center text-white">
            <p className="text-[11px] font-semibold tracking-wide text-teal-100">
              AUTO-APPROVED (G1 PRE-APPROVED)
            </p>
            <p className="mt-2 text-3xl font-semibold text-emerald-300">1,236</p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.03)] dark:border-white/10 dark:bg-slate-900 dark:shadow-none">
          <div className="mb-3">
            <p className="text-sm font-semibold text-[#1e2a52] dark:text-white">Lead Score Distribution</p>
            <p className="mt-1 text-[11px] text-gray-400 dark:text-slate-400">Current score spread across all active leads</p>
          </div>

          <div className="flex h-44 items-end justify-between gap-2 rounded-2xl bg-gray-50 p-3 ring-1 ring-gray-100 dark:bg-white/5 dark:ring-white/10">
            {scoreBuckets.map((b) => (
              <div key={b.label} className="flex flex-1 flex-col items-center gap-2">
                <div className="flex h-32 w-full items-end justify-center">
                  <div className={`w-10 rounded-xl ${b.color}`} style={{ height: `${b.h}%` }} />
                </div>
                <p className="text-[11px] font-semibold text-gray-500 dark:text-slate-400">{b.label}</p>
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between text-[11px] text-gray-500 dark:text-slate-400">
            <span>85 leads below 0.40</span>
            <span className="font-semibold text-emerald-700">798 leads above 0.70</span>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.03)] dark:border-white/10 dark:bg-slate-900 dark:shadow-none">
          <div className="mb-3">
            <p className="text-sm font-semibold text-[#1e2a52] dark:text-white">LLM Token Usage</p>
            <p className="mt-1 text-[11px] text-gray-400 dark:text-slate-400">GPT-4 and GPT-4 mini consumption this month</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-gray-100 bg-amber-50 p-4 ring-1 ring-amber-100">
              <p className="text-xs font-semibold text-amber-800">GPT-4</p>
              <p className="mt-2 text-2xl font-semibold text-amber-900">1.2M</p>
              <p className="mt-1 text-[11px] text-amber-800/80">tokens · ¥8,400</p>
              <p className="mt-2 text-[11px] text-amber-900/70">A3 Intent · A4 Content · A9 Handoff</p>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-blue-50 p-4 ring-1 ring-blue-100">
              <p className="text-xs font-semibold text-blue-800">GPT-4 mini</p>
              <p className="mt-2 text-2xl font-semibold text-blue-900">4.8M</p>
              <p className="mt-1 text-[11px] text-blue-800/80">tokens · ¥2,880</p>
              <p className="mt-2 text-[11px] text-blue-900/70">A3 Intent (bulk) · Classification</p>
            </div>
          </div>

          <div className="mt-3 rounded-2xl bg-slate-900 p-4">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
              <span>Total monthly cost</span>
              <span className="text-lg font-semibold text-white">¥11,280</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-slate-800">
              <div className="h-full w-[72%] rounded-full bg-emerald-400" />
            </div>
            <p className="mt-2 text-[11px] font-semibold text-emerald-300">↓ 18% vs last month (¥13,750)</p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Analytics;

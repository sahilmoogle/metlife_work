import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { fetchDashboardStats } from "../src/services/dashboardApi";

const MetricIcon = ({ variant }) => {
  const common = "h-4 w-4";
  if (variant === "leads") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={common} aria-hidden="true">
        <path
          d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-9Z"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <path
          d="M7 9.25h10M7 12h6.5M7 14.75h8"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (variant === "workflows") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={common} aria-hidden="true">
        <path
          d="M7.5 6.5h9M7.5 17.5h9"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M7.25 12h9.5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M5 6.5a1 1 0 1 0 0 .01V6.5ZM5 12a1 1 0 1 0 0 .01V12ZM5 17.5a1 1 0 1 0 0 .01v-.01Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (variant === "converted") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={common} aria-hidden="true">
        <path
          d="M6 15.5 10 11.5 12.75 14.25 18 9"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M5 19h14"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M6 19V6.5A2.5 2.5 0 0 1 8.5 4h7A2.5 2.5 0 0 1 18 6.5V19"
          stroke="currentColor"
          strokeWidth="1.6"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" className={common} aria-hidden="true">
      <path
        d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M12 7v6l4 2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

const formatInt = (n) => new Intl.NumberFormat().format(n ?? 0);

const pct = (num, den) => {
  if (!den || den <= 0) return 0;
  return Math.round((num / den) * 1000) / 10;
};

const scenarioMeta = {
  S1: { label: "Young Prof" },
  S2: { label: "Married" },
  S3: { label: "Senior" },
  S4: { label: "Dormant" },
  S5: { label: "Buyer" },
  S6: { label: "F2F" },
  S7: { label: "W2C" },
};

const Dashboard = () => {
  const { token } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setError("");
      setLoading(true);
      try {
        const data = await fetchDashboardStats(token);
        if (!cancelled) setStats(data);
      } catch (e) {
        if (!cancelled) {
          setStats(null);
          setError(e.message || "Failed to load dashboard.");
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

  const refresh = () => setRefreshKey((k) => k + 1);

  const total = stats?.total_leads ?? 0;
  const active = stats?.active_leads ?? 0;
  const hitl = stats?.hitl_leads ?? 0;
  const converted = stats?.converted_leads ?? 0;
  const dormant = stats?.dormant_leads ?? 0;
  const suppressed = stats?.suppressed_leads ?? 0;

  const scenarioRows = useMemo(() => {
    const breakdown = stats?.scenario_breakdown || {};
    return ["S1", "S2", "S3", "S4", "S5", "S6", "S7"].map((id) => ({
      id,
      value: formatInt(breakdown[id] ?? 0),
      label: scenarioMeta[id]?.label || "—",
    }));
  }, [stats]);

  const funnelBars = useMemo(() => {
    const t = total || 0;
    return [
      {
        label: `Total Leads ${formatInt(t)}`,
        value: t ? 100 : 0,
        color: "bg-violet-600",
        track: "bg-violet-50",
      },
      {
        label: `Active / Processing ${formatInt(active)}`,
        value: pct(active, t),
        color: "bg-emerald-600",
        track: "bg-emerald-50",
      },
      {
        label: `HITL queue ${formatInt(hitl)}`,
        value: pct(hitl, t),
        color: "bg-amber-500",
        track: "bg-amber-50",
      },
      {
        label: `Converted ${formatInt(converted)}`,
        value: pct(converted, t),
        color: "bg-fuchsia-600",
        track: "bg-fuchsia-50",
      },
      {
        label: `Dormant ${formatInt(dormant)}`,
        value: pct(dormant, t),
        color: "bg-blue-600",
        track: "bg-blue-50",
      },
    ];
  }, [active, converted, dormant, hitl, total]);

  const kpiCards = useMemo(
    () => [
      {
        title: "Total Leads",
        value: formatInt(total),
        change: suppressed ? `${formatInt(suppressed)} suppressed` : "All records",
        icon: "leads",
        chip: "bg-violet-50 text-violet-700 ring-violet-100",
        iconWrap: "bg-violet-50 text-violet-700",
      },
      {
        title: "Active Workflows",
        value: formatInt(active),
        change: total ? `${pct(active, total)}% of total` : "—",
        icon: "workflows",
        chip: "bg-emerald-50 text-emerald-700 ring-emerald-100",
        iconWrap: "bg-emerald-50 text-emerald-700",
      },
      {
        title: "Converted",
        value: formatInt(converted),
        change: total ? `${pct(converted, total)}% of total` : "—",
        icon: "converted",
        chip: "bg-amber-50 text-amber-700 ring-amber-100",
        iconWrap: "bg-amber-50 text-amber-700",
      },
      {
        title: "Pending HITL",
        value: formatInt(hitl),
        change: total ? `${pct(hitl, total)}% of total` : "—",
        icon: "pending",
        chip: "bg-rose-50 text-rose-700 ring-rose-100",
        iconWrap: "bg-rose-50 text-rose-700",
      },
    ],
    [active, converted, hitl, suppressed, total]
  );

  const feedItems = useMemo(() => {
    const nodes = stats?.node_counts || {};
    return Object.entries(nodes)
      .filter(([k]) => k)
      .sort((a, b) => (b[1] || 0) - (a[1] || 0))
      .slice(0, 6)
      .map(([node, count]) => ({
        title: `${node} — ${formatInt(count)} active leads`,
        meta: "Active pipeline",
      }));
  }, [stats]);

  return (
    <>
      {error ? (
        <div className="mb-3 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}{" "}
          <button type="button" className="ml-2 font-semibold underline" onClick={refresh}>
            Retry
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="mb-3 rounded-2xl border border-gray-100 bg-white px-4 py-3 text-sm text-gray-500">
          Loading dashboard…
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpiCards.map((item) => (
          <article
            key={item.title}
            className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.03)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${item.iconWrap}`}>
                  <MetricIcon variant={item.icon} />
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500">{item.title}</p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight text-[#1e2a52]">{item.value}</p>
                </div>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ring-1 ${item.chip}`}>
                {item.change}
              </span>
            </div>
          </article>
        ))}
      </section>

      <section className="mt-4 grid gap-3 xl:grid-cols-2">
        <article className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.03)]">
          <h3 className="text-sm font-semibold text-[#1e2a52]">Conversion Funnel</h3>
          <p className="mb-4 text-[11px] text-gray-400">Lead journey from database aggregates</p>
          <div className="space-y-3">
            {funnelBars.map((bar) => (
              <div key={bar.label}>
                <div className="mb-1 flex justify-between text-[11px] text-gray-500">
                  <span>{bar.label}</span>
                  <span>{bar.value}%</span>
                </div>
                <div className={`h-2 rounded-full ${bar.track}`}>
                  <div
                    className={`h-full rounded-full ${bar.color}`}
                    style={{ width: `${Math.min(100, bar.value)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.03)]">
          <h3 className="text-sm font-semibold text-[#1e2a52]">Scenario Distribution</h3>
          <p className="mb-4 text-[11px] text-gray-400">All leads by scenario_id</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {scenarioRows.map((scenario) => (
              <div
                key={scenario.id}
                className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-3 shadow-[inset_0_1px_0_rgba(0,0,0,0.02)]"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-50 text-xs font-semibold text-indigo-700 ring-1 ring-indigo-100">
                  {scenario.id}
                </span>
                <div>
                  <p className="text-sm font-semibold text-gray-800">{scenario.value}</p>
                  <p className="text-xs text-gray-400">{scenario.label}</p>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="mt-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.03)]">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#1e2a52]">Live Activity Feed</h3>
          <span className="inline-flex items-center gap-2 text-xs text-gray-400">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            From active agent nodes
          </span>
        </div>
        <div className="space-y-3">
          {feedItems.length ? (
            feedItems.map((item) => (
              <div
                key={item.title}
                className="flex items-start gap-3 border-b border-gray-100 pb-3 text-sm text-gray-600 last:border-none last:pb-0"
              >
                <span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-violet-500" />
                <div className="min-w-0">
                  <p className="truncate text-sm text-gray-700">{item.title}</p>
                  <p className="mt-0.5 text-[11px] text-gray-400">{item.meta}</p>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-gray-500">No active pipeline nodes with counts yet.</p>
          )}
        </div>
      </section>
    </>
  );
};

export default Dashboard;

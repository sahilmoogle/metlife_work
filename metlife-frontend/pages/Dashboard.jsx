import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { fetchDashboardStats } from "../src/services/dashboardApi";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

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
  S1: { key: "S1" },
  S2: { key: "S2" },
  S3: { key: "S3" },
  S4: { key: "S4" },
  S5: { key: "S5" },
  S6: { key: "S6" },
  S7: { key: "S7" },
};

const Dashboard = () => {
  const { token } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
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
          setError(e.message || t("dashboard.failed"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  // t is stable from react-i18next; include for lint correctness.
  }, [token, refreshKey, t]);

  const refresh = () => setRefreshKey((k) => k + 1);

  const total = stats?.total_leads ?? 0;
  const active = stats?.active_leads ?? 0;
  const hitlRows = stats?.hitl_leads ?? 0;
  const hitlDistinct =
    stats?.hitl_distinct_leads ??
    Math.min(hitlRows, typeof stats?.total_leads === "number" ? stats.total_leads : hitlRows);
  const converted = stats?.converted_leads ?? 0;
  const dormant = stats?.dormant_leads ?? 0;
  const suppressed = stats?.suppressed_leads ?? 0;

  const kpiShareOfTotal = useCallback(
    (num, den) => {
      if (!den || den <= 0) return "—";
      const rawPct = (num / den) * 100;
      if (num > 0 && rawPct < 0.1) return t("dashboard.kpi.ltTenthPct");
      return t("dashboard.kpi.ofTotal", { pct: Math.round(rawPct * 10) / 10 });
    },
    [t],
  );

  const scenarioRows = useMemo(() => {
    const breakdown = stats?.scenario_breakdown || {};
    return ["S1", "S2", "S3", "S4", "S5", "S6", "S7"].map((id) => ({
      id,
      value: formatInt(breakdown[id] ?? 0),
      label: scenarioMeta[id]?.key ? t(`dashboard.scenarioLabels.${scenarioMeta[id].key}`) : "—",
    }));
  }, [stats, t]);

  const funnelBars = useMemo(() => {
    const totalCount = total || 0;
    const hitlBarPct = Math.min(100, pct(hitlDistinct, totalCount));
    return [
      {
        label: `${t("dashboard.funnel.totalLeads")} ${formatInt(totalCount)}`,
        value: totalCount ? 100 : 0,
        color: "bg-blue-600",
        track: "bg-blue-50",
      },
      {
        label: `${t("dashboard.funnel.activeProcessing")} ${formatInt(active)}`,
        value: pct(active, totalCount),
        color: "bg-emerald-600",
        track: "bg-emerald-50",
      },
      {
        label: `${t("dashboard.funnel.hitlQueue")} · ${t("dashboard.funnel.hitlQueueBar", {
          items: formatInt(hitlRows),
          leads: formatInt(hitlDistinct),
        })}`,
        value: hitlBarPct,
        color: "bg-amber-500",
        track: "bg-amber-50",
      },
      {
        label: `${t("dashboard.funnel.converted")} ${formatInt(converted)}`,
        value: pct(converted, totalCount),
        color: "bg-indigo-600",
        track: "bg-indigo-50",
      },
      {
        label: `${t("dashboard.funnel.dormant")} ${formatInt(dormant)}`,
        value: pct(dormant, totalCount),
        color: "bg-blue-600",
        track: "bg-blue-50",
      },
    ];
  }, [active, converted, dormant, hitlDistinct, hitlRows, t, total]);

  const kpiCards = useMemo(
    () => [
      {
        title: t("dashboard.kpi.totalLeads"),
        value: formatInt(total),
        footer: suppressed
          ? t("dashboard.kpi.suppressed", { count: formatInt(suppressed) })
          : t("dashboard.kpi.allRecords", { defaultValue: "All records →" }),
        footerAction: "/leads",
        icon: "leads",
        iconBadge:
          "bg-blue-50 text-blue-700 ring-blue-100 dark:bg-blue-500/15 dark:text-blue-200 dark:ring-blue-500/25",
        footerClass: "text-[#004EB2] dark:text-blue-300",
      },
      {
        title: t("dashboard.kpi.activeWorkflows"),
        value: formatInt(active),
        footer: total ? kpiShareOfTotal(active, total) : "—",
        icon: "workflows",
        iconBadge:
          "bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-200 dark:ring-emerald-500/25",
        footerClass: "text-gray-500 dark:text-volt-muted",
      },
      {
        title: t("dashboard.kpi.converted"),
        value: formatInt(converted),
        footer: total ? kpiShareOfTotal(converted, total) : "—",
        icon: "converted",
        iconBadge:
          "bg-indigo-50 text-indigo-700 ring-indigo-100 dark:bg-blue-500/15 dark:text-blue-200 dark:ring-blue-500/25",
        footerClass: "text-gray-500 dark:text-volt-muted",
      },
      {
        title: t("dashboard.kpi.pendingHitl"),
        value: formatInt(hitlRows),
        footer: t("dashboard.kpi.pendingHitlCaptionShort", {
          defaultValue: `${formatInt(hitlRows)} review items`,
          count: formatInt(hitlRows),
        }),
        footerAction: "/reviews",
        icon: "pending",
        iconBadge:
          "bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-500/25",
        footerClass: "text-amber-700 dark:text-amber-300",
      },
      {
        title: t("dashboard.kpi.queueAwaiting", { defaultValue: "Queue Awaiting" }),
        value: formatInt(hitlDistinct),
        footer: t("dashboard.kpi.queueAwaitingCaption", {
          defaultValue: `${formatInt(hitlDistinct)} leads`,
          count: formatInt(hitlDistinct),
        }),
        footerAction: "/reviews",
        icon: "queue",
        iconBadge:
          "bg-rose-50 text-rose-700 ring-rose-100 dark:bg-rose-500/15 dark:text-rose-200 dark:ring-rose-500/25",
        footerClass: "text-rose-700 dark:text-rose-300",
      },
    ],
    [active, converted, hitlDistinct, hitlRows, kpiShareOfTotal, suppressed, t, total]
  );

  const feedItems = useMemo(() => {
    const nodes = stats?.node_counts || {};
    return Object.entries(nodes)
      .filter(([k]) => k)
      .sort((a, b) => (b[1] || 0) - (a[1] || 0))
      .slice(0, 6)
      .map(([node, count]) => ({
        title: `${node} — ${t("dashboard.feed.activeLeads", { count: formatInt(count) })}`,
        meta: t("dashboard.feed.activePipeline"),
      }));
  }, [stats, t]);

  return (
    <>
      {error ? (
        <div className="mb-3 rounded-3xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
          {error}{" "}
          <button type="button" className="ml-2 font-semibold underline" onClick={refresh}>
            {t("common.retry")}
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="app-surface-card mb-3 px-4 py-3 text-sm text-gray-500 dark:text-volt-muted">
          {t("dashboard.loading")}
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {kpiCards.map((item) => (
          <article
            key={item.title}
            className="app-surface-card p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className={`flex h-10 w-10 flex-none items-center justify-center rounded-2xl ring-1 ${item.iconBadge}`}>
                  <MetricIcon variant={item.icon} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-500 dark:text-volt-muted">{item.title}</p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
                    {item.value}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-2">
              {item.footerAction ? (
                <button
                  type="button"
                  onClick={() => navigate(item.footerAction)}
                  className={`text-xs font-semibold ${item.footerClass} hover:underline`}
                >
                  {item.footer}
                </button>
              ) : (
                <p className={`text-xs font-medium ${item.footerClass}`}>{item.footer}</p>
              )}
            </div>

          </article>
        ))}
      </section>

      <section className="mt-4 grid gap-3 xl:grid-cols-2">
        <article className="app-surface-card p-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 ring-1 ring-blue-100">
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
                <path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            </span>
            <h3 className="text-sm font-semibold text-[#1e2a52] dark:text-white">{t("dashboard.funnel.title")}</h3>
          </div>
          <p className="mb-4 text-xs font-medium text-gray-500 dark:text-volt-muted">{t("dashboard.funnel.subtitle")}</p>
          <div className="space-y-3">
            {funnelBars.map((bar) => (
              <div key={bar.label}>
                <div className="mb-1 flex justify-between text-[11px] text-gray-500 dark:text-volt-muted">
                  <span className="truncate pr-3">{bar.label}</span>
                  <span>{bar.value}%</span>
                </div>
                <div className={`h-2 rounded-full ${bar.track} dark:bg-white/5`}>
                  <div
                    className={`h-full rounded-full ${bar.color} dark:opacity-90`}
                    style={{ width: `${Math.min(100, bar.value)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="app-surface-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
                  <path
                    d="M4 7h16M4 12h10M4 17h14"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <h3 className="text-sm font-semibold text-[#1e2a52] dark:text-white">{t("dashboard.scenarios.title")}</h3>
            </div>

            <button
              type="button"
              onClick={() => navigate("/analytics")}
              className="text-xs font-semibold text-[#004EB2] hover:underline dark:text-indigo-300"
            >
              {t("dashboard.scenarios.viewAnalytics", { defaultValue: "View analytics →" })}
            </button>
          </div>
          <p className="mb-4 text-[11px] text-gray-500 dark:text-volt-muted">{t("dashboard.scenarios.subtitle")}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {scenarioRows.map((scenario) => (
              <div
                key={scenario.id}
                className="app-surface-nested flex items-center gap-3 p-3"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#eaf2ff] text-xs font-semibold text-[#004EB2] ring-1 ring-[#cfe0ff]">
                  {scenario.id}
                </span>
                <div>
                  <p className="text-sm font-semibold text-gray-800 dark:text-white">{scenario.value}</p>
                  <p className="text-xs text-gray-600 dark:text-volt-muted">{scenario.label}</p>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="app-surface-card mt-4 p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
                  <path
                    d="M4 17h16M6 14l3-3 3 3 6-6"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <h3 className="text-sm font-semibold text-[#1e2a52] dark:text-white">{t("dashboard.feed.title")}</h3>
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-volt-muted">{t("dashboard.feed.subtitle", { defaultValue: "Real-time pipeline node activity" })}</p>
          </div>

          <span className="inline-flex flex-none items-center gap-2 text-xs text-gray-400 dark:text-volt-muted2">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            {t("dashboard.feed.fromActiveNodes")}
          </span>
        </div>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch lg:justify-between">
          <div className="min-w-0 flex-1 space-y-3">
            {feedItems.length ? (
              feedItems.map((item) => (
                <div
                  key={item.title}
                  className="flex items-start gap-3 border-b border-gray-100 pb-3 text-sm text-gray-600 last:border-none last:pb-0 dark:border-volt-borderSoft dark:text-volt-muted"
                >
                  <span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-blue-500" />
                  <div className="min-w-0">
                    <p className="truncate text-sm text-gray-700 dark:text-volt-text">{item.title}</p>
                    <p className="mt-0.5 text-xs font-medium text-gray-500 dark:text-volt-muted">{item.meta}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500 dark:text-volt-muted">{t("dashboard.feed.empty")}</p>
            )}
          </div>

          {/* <div className="app-surface-nested w-full flex-none p-3 lg:w-[420px]">
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-volt-muted">
              <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white/60 px-2.5 py-1 text-[11px] font-semibold text-gray-700 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-white">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                {t("dashboard.feed.live", { defaultValue: "Live" })}
              </span>
              <span>{t("dashboard.feed.fromActiveNodes")}</span>
            </div>
            <svg
              viewBox="0 0 420 120"
              className="mt-2 h-[120px] w-full"
              role="img"
              aria-label="Live activity chart"
            >
              <defs>
                <linearGradient id="dashLine" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0" stopColor="#2563eb" stopOpacity="0.9" />
                  <stop offset="1" stopColor="#60a5fa" stopOpacity="0.95" />
                </linearGradient>
              </defs>
              <path
                d="M10 90 C 60 20, 120 110, 170 70 S 280 20, 330 60 S 380 110, 410 55"
                fill="none"
                stroke="url(#dashLine)"
                strokeWidth="3.5"
                strokeLinecap="round"
              />
              <path
                d="M10 90 C 60 20, 120 110, 170 70 S 280 20, 330 60 S 380 110, 410 55 L410 118 L10 118 Z"
                fill="#2563eb"
                opacity="0.06"
              />
            </svg>
          </div> */}
        </div>
      </section>
    </>
  );
};

export default Dashboard;

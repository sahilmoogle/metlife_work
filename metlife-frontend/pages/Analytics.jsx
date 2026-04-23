import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { fetchAnalyticsOverview } from "../src/services/analyticsApi";
import { useTranslation } from "react-i18next";

const ranges = [
  { key: "30d", labelKey: "analytics.ranges.d30" },
  { key: "90d", labelKey: "analytics.ranges.d90" },
  { key: "all", labelKey: "analytics.ranges.all" },
];

/** Visual tokens for KPI cards (API returns data only; styling stays in UI). */
const KPI_CARD_STYLES = [
  { bar: "bg-emerald-500", valueTone: "text-emerald-700", subTone: "text-gray-500" },
  { bar: "bg-blue-500", valueTone: "text-blue-700", subTone: "text-gray-400" },
  { bar: "bg-amber-500", valueTone: "text-amber-700", subTone: "text-emerald-700" },
  { bar: "bg-cyan-500", valueTone: "text-cyan-700", subTone: "text-gray-400" },
  { bar: "bg-violet-500", valueTone: "text-violet-700", subTone: "text-gray-400" },
  { bar: "bg-teal-500", valueTone: "text-teal-700", subTone: "text-gray-400" },
];

const SCENARIO_BAR = {
  S1: "bg-blue-500",
  S2: "bg-fuchsia-500",
  S3: "bg-violet-500",
  S4: "bg-rose-500",
  S5: "bg-cyan-500",
  S6: "bg-teal-500",
  S7: "bg-amber-500",
};

const AGENT_ROW_TONE = {
  A1_Identity: "text-cyan-700",
  A2_Persona: "text-cyan-700",
  A3_Intent: "text-amber-700",
  A4_A5_Content: "text-amber-700",
  A6_Send: "text-blue-700",
  A8_Scoring: "text-violet-700",
  A9_Handoff: "text-emerald-700",
};

const EMAIL_METRIC_LABEL = {
  delivered: "Delivered",
  open_rate: "Open Rate",
  click_rate: "Click Rate",
  unsubscribe: "Unsubscribe",
};

const EMAIL_METRIC_STYLE = {
  delivered: { color: "bg-emerald-500", track: "bg-emerald-50" },
  open_rate: { color: "bg-cyan-500", track: "bg-cyan-50" },
  click_rate: { color: "bg-violet-500", track: "bg-violet-50" },
  unsubscribe: { color: "bg-rose-500", track: "bg-rose-50" },
};

const SCORE_BUCKET_COLORS = ["bg-rose-500", "bg-orange-500", "bg-amber-400", "bg-blue-500", "bg-emerald-500"];

const formatInt = (n) => new Intl.NumberFormat().format(Number(n) || 0);

const Analytics = () => {
  const { token } = useAuth();
  const { t } = useTranslation();
  const [range, setRange] = useState("30d");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const d = await fetchAnalyticsOverview(token, range);
      setData(d);
    } catch (e) {
      setData(null);
      setError(e.message || "Failed to load analytics.");
    } finally {
      setLoading(false);
    }
  }, [token, range]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const rangeLabel = useMemo(() => data?.range_label || "—", [data]);

  const kpisWithStyle = useMemo(() => {
    const list = data?.kpis ?? [];
    return list.map((k, i) => ({
      ...k,
      ...(KPI_CARD_STYLES[i] || KPI_CARD_STYLES[0]),
    }));
  }, [data]);

  const weeklyBars = data?.weekly_progression ?? [];

  const exportJson = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `analytics-${data.range_key || range}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const scoreBars = useMemo(() => {
    const buckets = data?.score_distribution ?? [];
    const max = Math.max(1, ...buckets.map((b) => b.count));
    return buckets.map((b) => ({
      ...b,
      heightPct: Math.round((b.count / max) * 100),
      color: SCORE_BUCKET_COLORS[b.range_index] ?? "bg-gray-400",
    }));
  }, [data]);

  const llmTracked = data?.llm_usage?.some((r) => r.tracked);

  return (
    <section className="space-y-3">
      {error ? (
        <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100">
          {error}{" "}
          <button type="button" className="ml-2 font-semibold underline" onClick={() => void load()}>
            {t("common.retry")}
          </button>
        </div>
      ) : null}

      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.03)] dark:border-white/10 dark:bg-slate-900 dark:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[#1e2a52] dark:text-white">{t("analytics.title")}</h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
              {t("analytics.subtitle", { range: loading ? t("common.loading") : rangeLabel })}
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
                    disabled={loading}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                      active
                        ? "bg-white text-indigo-700 shadow-sm dark:bg-slate-950/40 dark:shadow-none"
                        : "text-gray-600 hover:text-gray-800 dark:text-slate-300 dark:hover:text-white"
                    }`}
                  >
                    {t(r.labelKey)}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={exportJson}
              disabled={!data}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-gray-200 bg-white px-4 text-xs font-semibold text-gray-700 hover:border-indigo-200 hover:text-indigo-700 disabled:opacity-50 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-200 dark:hover:border-white/20 dark:hover:text-white"
            >
              {t("common.export")}
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
          {loading
            ? Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="relative h-28 animate-pulse rounded-2xl border border-gray-100 bg-gray-100 dark:border-white/10 dark:bg-white/10"
                />
              ))
            : kpisWithStyle.map((k) => (
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
            <p className="text-sm font-semibold text-[#1e2a52] dark:text-white">{t("analytics.weekly.title")}</p>
            <p className="mt-1 text-[11px] text-gray-400 dark:text-slate-400">{t("analytics.weekly.subtitle")}</p>
          </div>

          <div className="flex items-end justify-between gap-3">
            {(weeklyBars.length ? weeklyBars : []).map((w) => {
              const total = Math.max(1, w.new_leads + w.engaged + w.converted);
              const hNew = Math.round((w.new_leads / total) * 100);
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
            {!loading && weeklyBars.length === 0 ? (
              <p className="w-full py-8 text-center text-sm text-gray-400">{t("analytics.noWeeklyData")}</p>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-[11px] text-gray-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-blue-500" /> {t("analytics.weekly.newLeads")}
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-violet-500" /> {t("analytics.weekly.engaged")}
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> {t("analytics.weekly.converted")}
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.03)] dark:border-white/10 dark:bg-slate-900 dark:shadow-none">
          <div className="mb-3">
            <p className="text-sm font-semibold text-[#1e2a52] dark:text-white">{t("analytics.scenarioConversion.title")}</p>
            <p className="mt-1 text-[11px] text-gray-400 dark:text-slate-400">{t("analytics.scenarioConversion.subtitle")}</p>
          </div>

          <div className="space-y-3">
            {(data?.scenario_conversion ?? []).map((s) => (
              <div key={s.scenario_id} className="flex items-center gap-3">
                <div className="w-28 shrink-0">
                  <p className="text-xs font-semibold text-gray-700 dark:text-slate-200">
                    {s.scenario_id} <span className="text-gray-400">·</span> {s.label}
                  </p>
                </div>
                <div className="flex-1">
                  <div className="h-2 rounded-full bg-gray-100 dark:bg-white/10">
                    <div
                      className={`h-full rounded-full ${SCENARIO_BAR[s.scenario_id] || "bg-gray-400"}`}
                      style={{ width: `${Math.min(100, s.conversion_pct)}%` }}
                    />
                  </div>
                </div>
                <div className="w-10 text-right text-xs font-semibold text-gray-700 dark:text-slate-200">
                  {s.conversion_pct.toFixed(1)}%
                </div>
                <div className="w-14 text-right text-xs text-gray-400 dark:text-slate-400">
                  {formatInt(s.converted_count)}/{formatInt(s.total_leads_in_period)}
                </div>
              </div>
            ))}
            {!loading && !(data?.scenario_conversion?.length) ? (
              <p className="text-sm text-gray-400">{t("analytics.scenarioConversion.empty")}</p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.03)] dark:border-white/10 dark:bg-slate-900 dark:shadow-none">
          <div className="mb-3">
            <p className="text-sm font-semibold text-[#1e2a52] dark:text-white">{t("analytics.agentPerf.title")}</p>
            <p className="mt-1 text-[11px] text-gray-400 dark:text-slate-400">
              {t("analytics.agentPerf.subtitle")}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[640px] w-full border-separate border-spacing-0">
              <thead>
                <tr className="text-left text-[11px] font-semibold text-gray-500 dark:text-slate-400">
                  <th className="px-3 py-2">{t("analytics.agentPerf.agent")}</th>
                  <th className="px-3 py-2">{t("analytics.agentPerf.processed")}</th>
                  <th className="px-3 py-2">{t("analytics.agentPerf.avgLatency")}</th>
                  <th className="px-3 py-2">{t("analytics.agentPerf.success")}</th>
                </tr>
              </thead>
              <tbody>
                {(data?.agent_performance ?? []).map((row) => (
                  <tr
                    key={row.node_key}
                    className="border-t border-gray-100 text-xs text-gray-700 hover:bg-gray-50/60 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5"
                  >
                    <td className={`px-3 py-2 font-semibold ${AGENT_ROW_TONE[row.node_key] || "text-gray-700"}`}>
                      {row.name}
                    </td>
                    <td className="px-3 py-2 font-medium text-gray-800 dark:text-white">{formatInt(row.processed_count)}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-slate-300">
                      {row.latency_seconds != null ? `${row.latency_seconds.toFixed(1)}s` : "—"}
                    </td>
                    <td className="px-3 py-2 font-semibold text-emerald-700">
                      {row.success_rate_pct != null ? `${row.success_rate_pct.toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && !(data?.agent_performance?.length) ? (
              <p className="py-4 text-center text-sm text-gray-400">{t("analytics.agentPerf.empty")}</p>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.03)] dark:border-white/10 dark:bg-slate-900 dark:shadow-none">
          <div className="mb-3">
            <p className="text-sm font-semibold text-[#1e2a52] dark:text-white">{t("analytics.emailPerf.title")}</p>
            <p className="mt-1 text-[11px] text-gray-400 dark:text-slate-400">{t("analytics.emailPerf.subtitle")}</p>
          </div>

          <div className="space-y-3">
            {(data?.email_performance ?? []).map((b) => {
              const label = EMAIL_METRIC_LABEL[b.metric] || b.metric;
              const st = EMAIL_METRIC_STYLE[b.metric] || { color: "bg-gray-500", track: "bg-gray-100" };
              return (
                <div key={b.metric}>
                  <div className="mb-1 flex items-center justify-between text-[11px] text-gray-500 dark:text-slate-400">
                    <span>{label}</span>
                    <span className="font-semibold text-gray-700 dark:text-slate-200">{b.value_pct.toFixed(1)}%</span>
                  </div>
                  <div className={`h-2 rounded-full ${st.track}`}>
                    <div className={`h-full rounded-full ${st.color}`} style={{ width: `${Math.min(100, b.value_pct)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50 p-3 dark:border-white/10 dark:bg-white/5">
            <p className="text-[11px] font-semibold text-gray-500 dark:text-slate-400">{t("analytics.emailPerf.topPerforming")}</p>
            <div className="mt-2 space-y-2">
              {(data?.email_top_performing ?? []).map((t, idx) => (
                <div
                  key={`${t.scenario_id}-${t.rank_type}-${idx}`}
                  className="flex items-center justify-between rounded-xl bg-white px-3 py-2 ring-1 ring-gray-100 dark:bg-slate-950/40 dark:ring-white/10"
                >
                  <p className="text-xs font-semibold text-gray-800 dark:text-white">
                    {t.scenario_id}
                    {t.rank_type === "best_open" ? ` ${t("analytics.emailPerf.bestOpen")}` : ` ${t("analytics.emailPerf.bestClick")}`}
                  </p>
                  <p className={`text-xs font-semibold ${t.rank_type === "best_open" ? "text-emerald-700" : "text-amber-700"}`}>
                    {t.rank_type === "best_open" && t.open_rate_pct != null
                      ? `${t.open_rate_pct.toFixed(1)}${t("analytics.emailPerf.openSuffix")}`
                      : t.click_rate_pct != null
                        ? `${t.click_rate_pct.toFixed(1)}${t("analytics.emailPerf.clickSuffix")}`
                        : "—"}
                  </p>
                </div>
              ))}
              {!data?.email_top_performing?.length && !loading ? (
                <p className="text-xs text-gray-400">{t("analytics.emailPerf.notEnough")}</p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.03)] dark:border-white/10 dark:bg-slate-900 dark:shadow-none">
          <div className="mb-3">
            <p className="text-sm font-semibold text-[#1e2a52] dark:text-white">{t("analytics.hitlGate.title")}</p>
            <p className="mt-1 text-[11px] text-gray-400 dark:text-slate-400">{t("analytics.hitlGate.subtitle")}</p>
          </div>

          <div className="space-y-2">
            {(data?.hitl_gate_stats ?? []).map((g) => {
              const meta =
                g.reviewed_count === 0
                  ? t("analytics.hitlGate.noReviews")
                  : t("analytics.hitlGate.reviewedAvg", {
                      count: g.reviewed_count,
                      mins: g.avg_review_minutes != null ? g.avg_review_minutes.toFixed(1) : "—",
                    });
              const pct =
                g.approval_rate_pct != null ? `${g.approval_rate_pct.toFixed(0)}%` : "—";
              const pctTone =
                g.approval_rate_pct == null
                  ? "text-gray-400"
                  : g.approval_rate_pct >= 80
                    ? "text-emerald-700"
                    : "text-amber-700";
              const chipTone =
                g.approval_rate_pct == null || g.approval_rate_pct >= 80
                  ? "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-100"
                  : "bg-amber-50 text-amber-700 ring-amber-100";
              return (
                <div
                  key={g.gate}
                  className="rounded-2xl border border-gray-100 bg-white p-3 shadow-[inset_0_1px_0_rgba(0,0,0,0.02)] dark:border-white/10 dark:bg-slate-950/40 dark:shadow-none"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold ring-1 ${chipTone}`}>
                        {g.title}
                      </span>
                      <p className="mt-2 text-[11px] text-gray-400 dark:text-slate-400">{meta}</p>
                    </div>
                    <p className={`text-lg font-semibold ${pctTone}`}>{pct}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 rounded-2xl bg-teal-900 p-4 text-center text-white">
            <p className="text-[11px] font-semibold tracking-wide text-teal-100">{t("analytics.hitlGate.autoApproved")}</p>
            <p className="mt-2 text-3xl font-semibold text-emerald-300">{formatInt(data?.hitl_auto_approved_estimate ?? 0)}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.03)] dark:border-white/10 dark:bg-slate-900 dark:shadow-none">
          <div className="mb-3">
            <p className="text-sm font-semibold text-[#1e2a52] dark:text-white">{t("analytics.scoreDist.title")}</p>
            <p className="mt-1 text-[11px] text-gray-400 dark:text-slate-400">{t("analytics.scoreDist.subtitle")}</p>
          </div>

          <div className="flex h-44 items-end justify-between gap-2 rounded-2xl bg-gray-50 p-3 ring-1 ring-gray-100 dark:bg-white/5 dark:ring-white/10">
            {scoreBars.map((b) => (
              <div key={b.score_range_label} className="flex flex-1 flex-col items-center gap-2">
                <div className="flex h-32 w-full items-end justify-center">
                  <div className={`w-10 rounded-xl ${b.color}`} style={{ height: `${Math.max(8, b.heightPct)}%` }} />
                </div>
                <p className="text-[11px] font-semibold text-gray-500 dark:text-slate-400">{b.score_range_label}</p>
              </div>
            ))}
            {!loading && scoreBars.length === 0 ? (
              <p className="w-full py-6 text-center text-sm text-gray-400">{t("analytics.scoreDist.empty")}</p>
            ) : null}
          </div>

          <div className="mt-3 flex items-center justify-between text-[11px] text-gray-500 dark:text-slate-400">
            <span>{t("analytics.scoreDist.below", { count: formatInt(data?.score_insights?.below_0_40 ?? 0) })}</span>
            <span className="font-semibold text-emerald-700">
              {t("analytics.scoreDist.above", { count: formatInt(data?.score_insights?.above_0_70 ?? 0) })}
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.03)] dark:border-white/10 dark:bg-slate-900 dark:shadow-none">
          <div className="mb-3">
            <p className="text-sm font-semibold text-[#1e2a52] dark:text-white">{t("analytics.llm.title")}</p>
            <p className="mt-1 text-[11px] text-gray-400 dark:text-slate-400">{t("analytics.llm.subtitle")}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {(data?.llm_usage ?? []).map((row, i) => (
              <div
                key={row.model}
                className={`rounded-2xl border border-gray-100 p-4 ring-1 ${
                  i === 0 ? "bg-amber-50 ring-amber-100" : "bg-blue-50 ring-blue-100"
                }`}
              >
                <p className={`text-xs font-semibold ${i === 0 ? "text-amber-800" : "text-blue-800"}`}>{row.model}</p>
                <p className={`mt-2 text-2xl font-semibold ${i === 0 ? "text-amber-900" : "text-blue-900"}`}>
                  {row.tokens_millions != null ? `${row.tokens_millions.toFixed(2)}M` : "—"}
                </p>
                <p className={`mt-1 text-[11px] ${i === 0 ? "text-amber-800/80" : "text-blue-800/80"}`}>
                  {t("analytics.llm.tokens")}
                  {row.cost_jpy != null ? ` · ¥${formatInt(Math.round(row.cost_jpy))}` : ""}
                </p>
                <p className={`mt-2 text-[11px] ${i === 0 ? "text-amber-900/70" : "text-blue-900/70"}`}>{row.note}</p>
              </div>
            ))}
          </div>

          <div className="mt-3 rounded-2xl bg-slate-900 p-4">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
              <span>{t("analytics.llm.totalMonthly")}</span>
              <span className="text-lg font-semibold text-white">
                {data?.llm_total_monthly_jpy != null ? `¥${formatInt(Math.round(data.llm_total_monthly_jpy))}` : "—"}
              </span>
            </div>
            {!llmTracked ? (
              <p className="mt-2 text-[11px] text-slate-400">{t("analytics.llm.notPersisted")}</p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Analytics;

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { fetchAnalyticsOverview } from "../src/services/analyticsApi";
import { useTranslation } from "react-i18next";

const ranges = [
  { key: "30d", labelKey: "analytics.ranges.d30" },
  { key: "90d", labelKey: "analytics.ranges.d90" },
  { key: "all", labelKey: "analytics.ranges.all" },
];

const HeaderIcon = ({ variant }) => {
  const common = "h-4 w-4";
  if (variant === "trend") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={common} aria-hidden="true">
        <path
          d="M4 16l5-5 4 4 7-7"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M15 8h5v5"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (variant === "bars") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={common} aria-hidden="true">
        <path d="M5 19V9m5 10V5m5 14v-8m4 8V8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  if (variant === "mail") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={common} aria-hidden="true">
        <path d="M5 7h14v10H5V7Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        <path d="M6 8l6 5 6-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (variant === "shield") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={common} aria-hidden="true">
        <path d="M12 3 20 7v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V7l8-4Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        <path d="M9.5 12.5 11.2 14.2 14.8 10.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" className={common} aria-hidden="true">
      <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Z" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 7v6l4 2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

const KpiIcon = ({ idx }) => {
  const common = "h-4 w-4";
  const i = idx % 6;
  if (i === 0) {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={common} aria-hidden="true">
        <path d="M7 7h10M7 12h6M7 17h8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v11A2.5 2.5 0 0 1 16.5 20h-9A2.5 2.5 0 0 1 5 17.5v-11Z" stroke="currentColor" strokeWidth="1.7" />
      </svg>
    );
  }
  if (i === 1) {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={common} aria-hidden="true">
        <path d="M7.5 6.5h9M7.5 17.5h9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <path d="M7.25 12h9.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <path d="M5 6.5a1 1 0 1 0 0 .01V6.5ZM5 12a1 1 0 1 0 0 .01V12ZM5 17.5a1 1 0 1 0 0 .01v-.01Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  if (i === 2) {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={common} aria-hidden="true">
        <path d="M6 15.5 10 11.5 12.75 14.25 18 9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 19h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <path d="M6 19V6.5A2.5 2.5 0 0 1 8.5 4h7A2.5 2.5 0 0 1 18 6.5V19" stroke="currentColor" strokeWidth="1.7" />
      </svg>
    );
  }
  if (i === 3) {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={common} aria-hidden="true">
        <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Z" stroke="currentColor" strokeWidth="1.7" />
      </svg>
    );
  }
  if (i === 4) {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={common} aria-hidden="true">
        <path d="M12 3 20 7v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V7l8-4Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        <path d="M9.5 12.5 11.2 14.2 14.8 10.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" className={common} aria-hidden="true">
      <path d="M7 7h10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M7 12h10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M7 17h10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M5 6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6Z" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
};

/** Visual tokens for KPI cards (API returns data only; styling stays in UI). */
const KPI_CARD_STYLES = [
  { bar: "bg-emerald-500", valueTone: "text-emerald-700 dark:text-emerald-200", subTone: "text-gray-500 dark:text-volt-muted" },
  { bar: "bg-blue-500", valueTone: "text-blue-700 dark:text-sky-200", subTone: "text-gray-500 dark:text-volt-muted" },
  { bar: "bg-amber-500", valueTone: "text-amber-700 dark:text-amber-200", subTone: "text-gray-500 dark:text-volt-muted" },
  { bar: "bg-cyan-500", valueTone: "text-cyan-700 dark:text-cyan-200", subTone: "text-gray-500 dark:text-volt-muted" },
  { bar: "bg-violet-500", valueTone: "text-violet-700 dark:text-fuchsia-200", subTone: "text-gray-500 dark:text-volt-muted" },
  { bar: "bg-teal-500", valueTone: "text-teal-700 dark:text-teal-200", subTone: "text-gray-500 dark:text-volt-muted" },
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
  A1_Identity: "text-cyan-700 dark:text-cyan-200",
  A2_Persona: "text-cyan-700 dark:text-cyan-200",
  A3_Intent: "text-amber-700 dark:text-amber-200",
  A4_A5_Content: "text-amber-700 dark:text-amber-200",
  A6_Send: "text-blue-700 dark:text-sky-200",
  A8_Scoring: "text-violet-700 dark:text-fuchsia-200",
  A9_Handoff: "text-emerald-700 dark:text-emerald-200",
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
const toNum = (v) => {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const cleaned = v.replaceAll(",", "").trim();
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const Analytics = () => {
  const { token } = useAuth();
  const { t: translate } = useTranslation();
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
      index: i,
      ...(KPI_CARD_STYLES[i] || KPI_CARD_STYLES[0]),
    }));
  }, [data]);

  const weeklyBars = data?.weekly_progression ?? [];
  const weeklyChart = useMemo(() => {
    const rows = Array.isArray(weeklyBars) ? weeklyBars : [];
    const maxVal = Math.max(
      1,
      ...rows.flatMap((w) => [toNum(w?.new_leads), toNum(w?.engaged), toNum(w?.converted)]),
    );
    const sum = (key) => rows.reduce((acc, r) => acc + (Number(r?.[key]) || 0), 0);
    return {
      rows,
      maxVal,
      totals: {
        new: rows.reduce((acc, r) => acc + toNum(r?.new_leads), 0),
        engaged: rows.reduce((acc, r) => acc + toNum(r?.engaged), 0),
        converted: rows.reduce((acc, r) => acc + toNum(r?.converted), 0),
      },
    };
  }, [weeklyBars]);

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
            {translate("common.retry")}
          </button>
        </div>
      ) : null}

      <div className="app-surface-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[#1e2a52] dark:text-white">{translate("analytics.title")}</h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-volt-muted dark:opacity-95">
              {translate("analytics.subtitle", { range: loading ? translate("common.loading") : rangeLabel })}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-full border border-gray-200 bg-gray-50 p-1 shadow-sm dark:border-volt-borderSoft dark:bg-white/5 dark:shadow-none">
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
                        ? "bg-white text-[#004EB2] shadow-sm dark:bg-volt-card/60 dark:shadow-none"
                        : "text-gray-600 hover:text-gray-800 dark:text-volt-muted dark:hover:text-volt-text"
                    }`}
                  >
                    {translate(r.labelKey)}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={exportJson}
              disabled={!data}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-gray-200 bg-white px-4 text-xs font-semibold text-gray-700 hover:border-[#a7c4f2] hover:text-[#004EB2] disabled:opacity-50 dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-text dark:hover:border-volt-border dark:hover:text-white"
            >
              {translate("common.export")}
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
                  className="relative h-28 animate-pulse rounded-2xl border border-gray-100 bg-gray-100 dark:border-volt-borderSoft dark:bg-white/10"
                />
              ))
            : kpisWithStyle.map((k) => (
                <div
                  key={k.title}
                  className="group relative overflow-hidden rounded-3xl border border-gray-200/90 bg-[linear-gradient(180deg,#ffffff_0%,#f7faff_100%)] p-4 shadow-[0_1px_0_rgba(15,23,42,0.02)] transition hover:-translate-y-[1px] hover:shadow-[0_18px_55px_rgba(15,23,42,0.08)] dark:border-volt-borderSoft dark:bg-volt-card/75 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] dark:hover:shadow-[0_28px_70px_rgba(0,0,0,0.55)] dark:ring-1 dark:ring-white/[0.06]"
                >
                  <div className={`absolute left-0 top-0 h-1 w-full dark:h-0.5 dark:opacity-90 ${k.bar}`} />
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-500 dark:text-volt-muted">{k.title}</p>
                      <p className={`mt-2 text-2xl font-semibold tracking-tight ${k.valueTone}`}>{k.value}</p>
                      <p className={`mt-1 text-[11px] font-medium ${k.subTone}`}>{k.sub}</p>
                    </div>
                    <div
                      className={`flex h-10 w-10 flex-none items-center justify-center rounded-2xl ring-1 ${k.bar} bg-opacity-10 text-gray-700 ring-gray-200 group-hover:bg-opacity-[0.14] dark:bg-opacity-15 dark:text-white dark:ring-white/10`}
                      aria-hidden="true"
                    >
                      <KpiIcon idx={k.index ?? 0} />
                    </div>
                  </div>
                </div>
              ))}
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[2fr_1fr]">
        <div className="app-surface-card p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 ring-1 ring-blue-100 dark:bg-blue-500/15 dark:text-blue-200 dark:ring-blue-500/25">
                  <HeaderIcon variant="bars" />
                </span>
                <p className="text-sm font-semibold text-[#1e2a52] dark:text-white">{translate("analytics.weekly.title")}</p>
              </div>
              <p className="mt-1 text-[11px] font-medium text-gray-500 dark:text-volt-muted2">{translate("analytics.weekly.subtitle")}</p>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-center gap-4 text-[11px] text-gray-500 dark:text-volt-muted2">
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-fuchsia-600" /> {translate("analytics.weekly.newLeads")}
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-indigo-600" /> {translate("analytics.weekly.engaged")}
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> {translate("analytics.weekly.converted")}
            </span>
          </div>

          <div className="mt-3 overflow-x-auto">
            <div className="min-w-[620px] rounded-3xl border border-gray-100 bg-white p-3 shadow-sm dark:border-volt-borderSoft dark:bg-white/5 dark:shadow-none">
              <div className="flex h-[220px] items-end justify-between gap-3 px-2">
                {weeklyChart.rows.map((w) => {
                  const vNew = toNum(w?.new_leads);
                  const vEng = toNum(w?.engaged);
                  const vConv = toNum(w?.converted);
                  const pctNew = Math.max(3, Math.round((vNew / weeklyChart.maxVal) * 100));
                  const pctEng = Math.max(3, Math.round((vEng / weeklyChart.maxVal) * 100));
                  const pctConv = Math.max(3, Math.round((vConv / weeklyChart.maxVal) * 100));
                  return (
                    <div key={w.label} className="flex flex-1 flex-col items-center gap-2">
                      <div className="flex w-full max-w-[120px] items-end justify-center gap-3">
                        <div className="flex flex-col items-center gap-1">
                          <p className="text-[11px] font-semibold text-fuchsia-700 dark:text-fuchsia-200">
                            {formatInt(vNew)}
                          </p>
                          <div
                            className="w-4 rounded-xl bg-fuchsia-600 shadow-[0_10px_20px_rgba(192,38,211,0.18)] dark:shadow-[0_12px_24px_rgba(0,0,0,0.35)]"
                            style={{ height: `${pctNew}%` }}
                          />
                        </div>
                        <div className="flex flex-col items-center gap-1">
                          <p className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-200">
                            {formatInt(vEng)}
                          </p>
                          <div
                            className="w-4 rounded-xl bg-indigo-600 shadow-[0_10px_20px_rgba(79,70,229,0.18)] dark:shadow-[0_12px_24px_rgba(0,0,0,0.35)]"
                            style={{ height: `${pctEng}%` }}
                          />
                        </div>
                        <div className="flex flex-col items-center gap-1">
                          <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-200">
                            {formatInt(vConv)}
                          </p>
                          <div
                            className="w-4 rounded-xl bg-emerald-500 shadow-[0_10px_20px_rgba(16,185,129,0.18)] dark:shadow-[0_12px_24px_rgba(0,0,0,0.35)]"
                            style={{ height: `${pctConv}%` }}
                          />
                        </div>
                      </div>
                      <p className="text-[11px] font-semibold text-gray-500 dark:text-volt-muted2">{w.label}</p>
                    </div>
                  );
                })}

                {!loading && weeklyChart.rows.length === 0 ? (
                  <p className="w-full py-10 text-center text-sm text-gray-400">{translate("analytics.noWeeklyData")}</p>
                ) : null}
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div className="rounded-2xl bg-fuchsia-50 px-4 py-3 text-center ring-1 ring-fuchsia-100 dark:bg-fuchsia-500/10 dark:ring-fuchsia-500/20">
                  <p className="text-xl font-semibold text-fuchsia-700 dark:text-fuchsia-200">{formatInt(weeklyChart.totals.new)}</p>
                  <p className="mt-0.5 text-[11px] font-medium text-fuchsia-700/80 dark:text-fuchsia-200/80">
                    Total New Leads
                  </p>
                </div>
                <div className="rounded-2xl bg-indigo-50 px-4 py-3 text-center ring-1 ring-indigo-100 dark:bg-indigo-500/10 dark:ring-indigo-500/20">
                  <p className="text-xl font-semibold text-indigo-700 dark:text-indigo-200">{formatInt(weeklyChart.totals.engaged)}</p>
                  <p className="mt-0.5 text-[11px] font-medium text-indigo-700/80 dark:text-indigo-200/80">
                    Total Engaged
                  </p>
                </div>
                <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-center ring-1 ring-emerald-100 dark:bg-emerald-500/10 dark:ring-emerald-500/20">
                  <p className="text-xl font-semibold text-emerald-700 dark:text-emerald-200">{formatInt(weeklyChart.totals.converted)}</p>
                  <p className="mt-0.5 text-[11px] font-medium text-emerald-700/80 dark:text-emerald-200/80">
                    Total Converted
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="app-surface-card p-4">
          <div className="mb-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-200 dark:ring-emerald-500/25">
                <HeaderIcon variant="trend" />
              </span>
              <p className="text-sm font-semibold text-[#1e2a52] dark:text-white">{translate("analytics.scenarioConversion.title")}</p>
            </div>
            <p className="mt-1 text-[11px] text-gray-500 font-medium dark:text-volt-muted2">{translate("analytics.scenarioConversion.subtitle")}</p>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[520px] space-y-3">
              {(data?.scenario_conversion ?? []).map((s) => (
                <div key={s.scenario_id} className="flex items-center gap-3">
                  <div className="w-24 shrink-0 sm:w-28">
                    <p className="text-xs font-semibold text-gray-700 dark:text-volt-text">
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
                  <div className="w-10 text-right text-xs font-semibold text-gray-700 dark:text-volt-text">
                    {s.conversion_pct.toFixed(1)}%
                  </div>
                  <div className="w-16 text-right text-xs text-gray-500 font-medium dark:text-volt-muted2">
                    {formatInt(s.converted_count)}/{formatInt(s.total_leads_in_period)}
                  </div>
                </div>
              ))}
              {!loading && !(data?.scenario_conversion?.length) ? (
                <p className="text-sm text-gray-400">{translate("analytics.scenarioConversion.empty")}</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <div className="app-surface-card p-4">
          <div className="mb-3">
            <p className="text-sm font-semibold text-[#1e2a52] dark:text-white">{translate("analytics.agentPerf.title")}</p>
            <p className="mt-1 text-[11px]  font-medium text-gray-500 dark:text-volt-muted2">
              {translate("analytics.agentPerf.subtitle")}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[640px] w-full border-separate border-spacing-0">
              <thead>
                <tr className="text-left text-[11px] font-semibold text-gray-500 dark:text-volt-muted2">
                  <th className="px-3 py-2">{translate("analytics.agentPerf.agent")}</th>
                  <th className="px-3 py-2">{translate("analytics.agentPerf.processed")}</th>
                  <th className="px-3 py-2">{translate("analytics.agentPerf.avgLatency")}</th>
                  <th className="px-3 py-2">{translate("analytics.agentPerf.success")}</th>
                </tr>
              </thead>
              <tbody>
                {(data?.agent_performance ?? []).map((row) => (
                  <tr
                    key={row.node_key}
                    className="border-t border-gray-100 text-xs text-gray-700 hover:bg-gray-50/60 dark:border-volt-borderSoft dark:text-volt-text dark:hover:bg-white/10"
                  >
                    <td className={`px-3 py-2 font-semibold ${AGENT_ROW_TONE[row.node_key] || "text-gray-700"}`}>
                      {row.name}
                    </td>
                    <td className="px-3 py-2 font-medium text-gray-800 dark:text-white">{formatInt(row.processed_count)}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-volt-muted">
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
              <p className="py-4 text-center text-sm text-gray-400">{translate("analytics.agentPerf.empty")}</p>
            ) : null}
          </div>
        </div>

        <div className="app-surface-card p-4">
          <div className="mb-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700 ring-1 ring-cyan-100 dark:bg-cyan-500/15 dark:text-cyan-200 dark:ring-cyan-500/25">
                <HeaderIcon variant="mail" />
              </span>
              <p className="text-sm font-semibold text-[#1e2a52] dark:text-white">{translate("analytics.emailPerf.title")}</p>
            </div>
            <p className="mt-1 text-[11px] text-gray-500 font-medium dark:text-volt-muted2">{translate("analytics.emailPerf.subtitle")}</p>
          </div>

          <div className="space-y-3">
            {(data?.email_performance ?? []).map((b) => {
              const label = EMAIL_METRIC_LABEL[b.metric] || b.metric;
              const st = EMAIL_METRIC_STYLE[b.metric] || { color: "bg-gray-500", track: "bg-gray-100" };
              return (
                <div key={b.metric}>
                  <div className="mb-1 flex items-center justify-between text-[11px] text-gray-500 dark:text-volt-muted2">
                    <span>{label}</span>
                    <span className="font-semibold text-gray-700 dark:text-volt-text">{b.value_pct.toFixed(1)}%</span>
                  </div>
                  <div className={`h-2 rounded-full ${st.track}`}>
                    <div className={`h-full rounded-full ${st.color}`} style={{ width: `${Math.min(100, b.value_pct)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50 p-3 dark:border-volt-borderSoft dark:bg-white/5">
            <p className="text-[11px] font-semibold text-gray-500 dark:text-volt-muted2">{translate("analytics.emailPerf.topPerforming")}</p>
            <div className="mt-2 space-y-2">
              {(data?.email_top_performing ?? []).map((row, idx) => (
                <div
                  key={`${row.scenario_id}-${row.rank_type}-${idx}`}
                  className="flex items-center justify-between rounded-xl bg-white px-3 py-2 ring-1 ring-gray-100 dark:bg-volt-card/60 dark:ring-volt-borderSoft"
                >
                  <p className="text-xs font-semibold text-gray-800 dark:text-white">
                    {row.scenario_id}
                    {row.rank_type === "best_open"
                      ? ` ${translate("analytics.emailPerf.bestOpen")}`
                      : ` ${translate("analytics.emailPerf.bestClick")}`}
                  </p>
                  <p
                    className={`text-xs font-semibold ${
                      row.rank_type === "best_open" ? "text-emerald-700" : "text-amber-700"
                    }`}
                  >
                    {row.rank_type === "best_open" && row.open_rate_pct != null
                      ? `${row.open_rate_pct.toFixed(1)}${translate("analytics.emailPerf.openSuffix")}`
                      : row.click_rate_pct != null
                        ? `${row.click_rate_pct.toFixed(1)}${translate("analytics.emailPerf.clickSuffix")}`
                        : "—"}
                  </p>
                </div>
              ))}
              {!data?.email_top_performing?.length && !loading ? (
                <p className="text-xs text-gray-400">{translate("analytics.emailPerf.notEnough")}</p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="app-surface-card p-4">
          <div className="mb-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-2xl bg-violet-50 text-violet-700 ring-1 ring-violet-100 dark:bg-violet-500/15 dark:text-fuchsia-200 dark:ring-violet-500/25">
                <HeaderIcon variant="shield" />
              </span>
              <p className="text-sm font-semibold text-[#1e2a52] dark:text-white">{translate("analytics.hitlGate.title")}</p>
            </div>
            <p className="mt-1 text-[11px] text-gray-500 font-medium dark:text-volt-muted2">{translate("analytics.hitlGate.subtitle")}</p>
          </div>

          <div className="space-y-2">
            {(data?.hitl_gate_stats ?? []).map((g) => {
              const meta =
                g.reviewed_count === 0
                  ? translate("analytics.hitlGate.noReviews")
                  : translate("analytics.hitlGate.reviewedAvg", {
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
                  className="app-surface-nested p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold ring-1 ${chipTone}`}>
                        {g.title}
                      </span>
                      <p className="mt-2 text-[11px] text-gray-500 font-medium dark:text-volt-muted2">{meta}</p>
                    </div>
                    <p className={`text-lg font-semibold ${pctTone}`}>{pct}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 rounded-2xl bg-teal-900 p-4 text-center text-white">
            <p className="text-[11px] font-semibold tracking-wide text-teal-100">{translate("analytics.hitlGate.autoApproved")}</p>
            <p className="mt-2 text-3xl font-semibold text-emerald-300">{formatInt(data?.hitl_auto_approved_estimate ?? 0)}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="app-surface-card p-4">
          <div className="mb-3">
            <p className="text-sm font-semibold text-[#1e2a52] dark:text-white">{translate("analytics.scoreDist.title")}</p>
            <p className="mt-1 text-[11px] text-gray-500 font-medium dark:text-volt-muted2">{translate("analytics.scoreDist.subtitle")}</p>
          </div>

          <div className="flex h-44 items-end justify-between gap-2 rounded-2xl bg-gray-50 p-3 ring-1 ring-gray-100 dark:bg-white/5 dark:ring-volt-borderSoft">
            {scoreBars.map((b) => (
              <div key={b.score_range_label} className="flex flex-1 flex-col items-center gap-2">
                <div className="flex h-32 w-full items-end justify-center">
                  <div className={`w-10 rounded-xl ${b.color}`} style={{ height: `${Math.max(8, b.heightPct)}%` }} />
                </div>
                <p className="text-[11px] font-semibold text-gray-500 dark:text-volt-muted2">{b.score_range_label}</p>
              </div>
            ))}
            {!loading && scoreBars.length === 0 ? (
              <p className="w-full py-6 text-center text-sm text-gray-400">{translate("analytics.scoreDist.empty")}</p>
            ) : null}
          </div>

          <div className="mt-3 flex items-center justify-between text-[11px] text-gray-500 font-medium dark:text-volt-muted2">
            <span>{translate("analytics.scoreDist.below", { count: formatInt(data?.score_insights?.below_0_40 ?? 0) })}</span>
            <span className="font-semibold text-emerald-700">
              {translate("analytics.scoreDist.above", { count: formatInt(data?.score_insights?.above_0_70 ?? 0) })}
            </span>
          </div>
        </div>

        <div className="app-surface-card p-4">
          <div className="mb-3">
            <p className="text-sm font-semibold text-[#1e2a52] dark:text-white">{translate("analytics.llm.title")}</p>
            <p className="mt-1 text-[11px] text-gray-500 font-medium dark:text-volt-muted2">{translate("analytics.llm.subtitle")}</p>
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
                  {translate("analytics.llm.tokens")}
                  {row.cost_jpy != null ? ` · ¥${formatInt(Math.round(row.cost_jpy))}` : ""}
                </p>
                <p className={`mt-2 text-[11px] ${i === 0 ? "text-amber-900/70" : "text-blue-900/70"}`}>{row.note}</p>
              </div>
            ))}
          </div>

          <div className="mt-3 rounded-2xl bg-volt-card p-4 ring-1 ring-volt-borderSoft">
            <div className="flex items-center justify-between text-xs font-semibold text-volt-muted">
              <span>{translate("analytics.llm.totalMonthly")}</span>
              <span className="text-lg font-semibold text-volt-text">
                {data?.llm_total_monthly_jpy != null ? `¥${formatInt(Math.round(data.llm_total_monthly_jpy))}` : "—"}
              </span>
            </div>
            {!llmTracked ? (
              <p className="mt-2 text-[11px] text-volt-muted2">{translate("analytics.llm.notPersisted")}</p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Analytics;

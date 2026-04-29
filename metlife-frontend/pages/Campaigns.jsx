import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { fetchLeadsList } from "../src/services/leadsApi";
import { fetchHitlQueue } from "../src/services/hitlApi";
import { fetchDashboardStats } from "../src/services/dashboardApi";
import { getBatchStatus, getLatestBatch, runBatch } from "../src/services/agentsApi";
import { buildSseStreamUrl } from "../src/services/sseStream";
import { useTranslation } from "react-i18next";
import GuidePanel from "../components/GuidePanel";

const SCENARIO_IDS = ["S1", "S2", "S3", "S4", "S5", "S6", "S7"];

const scenarioCards = [
  { id: "S1", label: "Young Prof", tone: "text-indigo-700 bg-indigo-50 ring-indigo-100" },
  { id: "S2", label: "Life Event", tone: "text-emerald-700 bg-emerald-50 ring-emerald-100" },
  { id: "S3", label: "Senior", tone: "text-violet-700 bg-violet-50 ring-violet-100" },
  { id: "S4", label: "Dormant", tone: "text-amber-700 bg-amber-50 ring-amber-100" },
  { id: "S5", label: "Buyer", tone: "text-cyan-700 bg-cyan-50 ring-cyan-100" },
  { id: "S6", label: "F2F", tone: "text-teal-700 bg-teal-50 ring-teal-100" },
  { id: "S7", label: "W2C", tone: "text-rose-700 bg-rose-50 ring-rose-100" },
];

const workflowDefinitions = [
  ["Run All", "Starts every eligible lead that is new or ready for dormant revival."],
  ["Run Selected", "From Leads, starts only checked eligible leads and reuses the same batch progress."],
  ["Succeeded", "The graph invocation completed without a backend exception; it may still pause at HITL."],
  ["Awaiting HITL", "A human review gate is open and the workflow is waiting before continuing."],
  ["Cadence", "After a send, the next email waits for the scenario cadence timer instead of sending immediately."],
  ["Revival", "Old dormant leads re-enter through S4 after the dormancy window, not immediately after completion."],
];

const scenarioLegend = [
  ["S1", "Young Professional", "Survey path for younger leads without a life-event answer."],
  ["S2", "Life Event", "Life event such as marriage, birth, home, or job change."],
  ["S3", "Senior", "Older survey path with more formal communication rules."],
  ["S4", "Dormant Revival", "Reactivation path for old inactive leads."],
  ["S5", "Active Buyer", "High intent quote/survey answer path with product interest."],
  ["S6", "Face-to-Face", "Consultation form path, usually one email then handoff."],
  ["S7", "Web-to-Call", "Callback or call-based path, may skip email when none captured."],
];

/** Maps backend ``Lead.current_agent_node`` values → pipeline card keys (see agent NODE_ID constants). */
const BACKEND_NODE_TO_STAGE_KEY = {
  A1_Identity: "a1",
  A2_Persona: "a2",
  A3_Intent: "a3",
  A4_ContentStrategy: "a4",
  A5_Writer: "a4",
  A6_Send: "a6",
  A8_Scoring: "a8",
  A9_Handoff: "a9",
  A10_Dormancy: "a10",
};

const emptyPipelineCounts = () =>
  pipelineStages.reduce((acc, s) => {
    if (!["hitl", "conv"].includes(s.key)) acc[s.key] = 0;
    return acc;
  }, {});

function aggregatePipelineCounts(nodeCounts) {
  const base = emptyPipelineCounts();
  if (!nodeCounts || typeof nodeCounts !== "object") return base;
  for (const [nodeId, raw] of Object.entries(nodeCounts)) {
    const key = BACKEND_NODE_TO_STAGE_KEY[nodeId];
    const n = Number(raw);
    if (!key || Number.isNaN(n)) continue;
    base[key] = (base[key] || 0) + n;
  }
  return base;
}

/** S1–S7 totals from GET /dashboard/stats ``scenario_breakdown`` (same query as funnel). */
function aggregateScenarioCounts(scenarioBreakdown) {
  const out = { S1: 0, S2: 0, S3: 0, S4: 0, S5: 0, S6: 0, S7: 0, unknown: 0 };
  if (!scenarioBreakdown || typeof scenarioBreakdown !== "object") return out;
  for (const id of SCENARIO_IDS) {
    const n = Number(scenarioBreakdown[id]);
    if (!Number.isNaN(n)) out[id] = n;
  }
  return out;
}

/** Merge ``scenario_breakdown`` + ``scenario_unknown`` from dashboard stats. */
function mergeScenarioState(scenarioBreakdown, scenarioUnknown) {
  const out = aggregateScenarioCounts(scenarioBreakdown);
  if (typeof scenarioUnknown === "number" && !Number.isNaN(scenarioUnknown)) {
    out.unknown = scenarioUnknown;
  }
  return out;
}

function unknownScenarioCountFromLeads(rows) {
  let unknown = 0;
  for (const r of rows) {
    const s = r?.scenario_id;
    if (s && SCENARIO_IDS.includes(s)) continue;
    unknown += 1;
  }
  return unknown;
}

const pipelineStages = [
  { key: "a1", label: "A1 - Identity", accent: "text-cyan-700", icon: "id" },
  { key: "a2", label: "A2 - Persona", accent: "text-cyan-700", icon: "users" },
  { key: "a3", label: "A3 - Intent (LLM)", accent: "text-amber-700", icon: "spark" },
  { key: "a4", label: "A4+A5 - Content", accent: "text-amber-700", icon: "doc" },
  { key: "a6", label: "A6 - Send", accent: "text-blue-700", icon: "send" },
  { key: "a8", label: "A8 - Scoring", accent: "text-violet-700", icon: "score" },
  { key: "a9", label: "A9 - Handoff", accent: "text-emerald-700", icon: "handoff" },
  { key: "a10", label: "A10 - Dormancy", accent: "text-rose-700", icon: "clock" },
  { key: "hitl", label: "HITL Gates", accent: "text-amber-700", icon: "shield" },
  {
    key: "conv",
    label: "✓ Batch run OK",
    accent: "text-emerald-700",
    icon: "check",
  },
];

const pipelineLegend = [
  ["A1", "Identity", "Loads lead profile, contact, survey, quote, and consultation context."],
  ["A2", "Persona", "Classifies scenario/persona and applies scenario config like max emails."],
  ["A3", "Intent", "Reads memo/events and extracts urgency, intent, and product interest."],
  ["A4/A5", "Content", "Chooses a template or creates an AI draft, then opens G1 if needed."],
  ["A6", "Send", "Records the communication or pauses during quiet hours."],
  ["A8", "Scoring", "Updates propensity and decides cadence, handoff, G5, or dormant."],
  ["A11", "Cadence", "Timer pause before the next nurture email."],
  ["A9/G4", "Handoff", "Creates sales briefing, then waits for sales acceptance."],
  ["G1-G5", "HITL", "Human approval gates for compliance, persona, campaign, sales, and score override."],
];

const emptyExecutedCounts = () =>
  pipelineStages.reduce((acc, s) => {
    if (!["hitl", "conv"].includes(s.key)) acc[s.key] = 0;
    return acc;
  }, {});

const StageIcon = ({ name }) => {
  const common = "h-5 w-5";
  switch (name) {
    case "id":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={common} aria-hidden="true">
          <path
            d="M9 7.5A3 3 0 1 0 9 13.5a3 3 0 0 0 0-6Z"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M4.5 20a6 6 0 0 1 9 0"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <path
            d="M14 6h6v6h-6V6Z"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M14 18h6"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      );
    case "users":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={common} aria-hidden="true">
          <path
            d="M9 11a3.5 3.5 0 1 0-3.5-3.5A3.5 3.5 0 0 0 9 11Z"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M2.5 20a6.5 6.5 0 0 1 13 0"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <path
            d="M16.5 11.5a2.8 2.8 0 1 0-2.8-2.8 2.8 2.8 0 0 0 2.8 2.8Z"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M17 14.2a5.2 5.2 0 0 1 4.5 5.8"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      );
    case "spark":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={common} aria-hidden="true">
          <path
            d="M12 2l1.2 4.2L17.4 7.4 13.2 8.6 12 12.8 10.8 8.6 6.6 7.4l4.2-1.2L12 2Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M6 14l.8 2.7L9.5 17.5 6.8 18.3 6 21 5.2 18.3 2.5 17.5l2.7-.8L6 14Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M18 14l.9 2.9 2.6.6-2.6.6L18 21l-.9-2.9-2.6-.6 2.6-.6L18 14Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "doc":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={common} aria-hidden="true">
          <path
            d="M7 4h7l3 3v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M12 4v4h4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M8 12h8M8 15h8M8 18h6"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      );
    case "send":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={common} aria-hidden="true">
          <path
            d="M21 3 10.5 13.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <path
            d="M21 3 14 21l-3.5-7.5L3 10l18-7Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "score":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={common} aria-hidden="true">
          <path
            d="M4 19h16"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <path
            d="M6 16V8m6 8V5m6 11v-6"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      );
    case "handoff":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={common} aria-hidden="true">
          <path
            d="M7 12h10"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <path
            d="M14 9l3 3-3 3"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M6 7a3 3 0 1 0 0 .01V7Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <path
            d="M6 20a3 3 0 1 0 0 .01V20Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      );
    case "clock":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={common} aria-hidden="true">
          <path
            d="M12 22a10 10 0 1 0-10-10 10 10 0 0 0 10 10Z"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M12 6v6l4 2"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "shield":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={common} aria-hidden="true">
          <path
            d="M12 3 20 7v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V7l8-4Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M9.5 12.5 11.2 14.2 14.8 10.6"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "check":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={common} aria-hidden="true">
          <path
            d="M20 6 9 17l-5-5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" className={common} aria-hidden="true">
          <path
            d="M4 12h16"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      );
  }
};

const formatInt = (n) => new Intl.NumberFormat().format(n);

const Campaigns = () => {
  const { token } = useAuth();
  const { t } = useTranslation();
  const [status, setStatus] = useState("idle"); // idle | running | complete | error
  const [batch, setBatch] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [runError, setRunError] = useState("");
  const [loading, setLoading] = useState(true);
  /** Pending HITL rows for legend + tiles (scoped to ``batch.batch_id`` when present). */
  const [awaitingHitl, setAwaitingHitl] = useState(0);
  /** Full-queue count for footnotes when a batch scope is active. */
  const [awaitingHitlGlobal, setAwaitingHitlGlobal] = useState(0);
  /** Per-stage counts from GET /dashboard/stats → ``node_counts`` (Active/Processing leads). */
  const [pipelineCounts, setPipelineCounts] = useState(() => aggregatePipelineCounts(null));
  /** Per-stage executed counts from SSE node_transition events (per active batch). */
  const [executedCounts, setExecutedCounts] = useState(() => emptyExecutedCounts());
  const [scenarioCounts, setScenarioCounts] = useState(() => ({
    S1: 0,
    S2: 0,
    S3: 0,
    S4: 0,
    S5: 0,
    S6: 0,
    S7: 0,
    unknown: 0,
  }));
  /** ``converted_leads`` from GET /dashboard/stats (CRM-style converted count, all leads). */
  const [dashConvertedLeads, setDashConvertedLeads] = useState(0);

  const timerRef = useRef(null);
  /** Batch row currently shown — used to ignore other users' ``batch_progress`` events on shared SSE. */
  const activeBatchIdRef = useRef(null);

  const totalLeads = batch?.total ?? Object.values(scenarioCounts).reduce((a, b) => a + b, 0);
  const processed = batch?.processed_count ?? 0;
  const success = batch?.success_count ?? 0;
  const failed = batch?.failed_count ?? 0;
  const remaining = Math.max(0, (batch?.total ?? 0) - processed);
  const progressPct = batch?.pct ?? (totalLeads ? Math.round((processed / totalLeads) * 100) : 0);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopTimer();
  // stopTimer is stable (useCallback with []), include for lint correctness.
  }, [stopTimer]);

  const reset = () => {
    stopTimer();
    setRunError("");
    setLoadError("");
    setBatch(null);
    setStatus("idle");
  };

  /**
   * @param {string} [batchIdOverride]  Use right after starting a run (state may not have flushed yet).
   */
  const refreshHitl = useCallback(
    async (batchIdOverride) => {
      const bid = batchIdOverride ?? batch?.batch_id;
      try {
        const globalQ = await fetchHitlQueue(token);
        const globalLen = Array.isArray(globalQ) ? globalQ.length : 0;
        setAwaitingHitlGlobal(globalLen);
        if (bid) {
          const scoped = await fetchHitlQueue(token, { batchId: bid });
          setAwaitingHitl(Array.isArray(scoped) ? scoped.length : 0);
        } else {
          setAwaitingHitl(globalLen);
        }
      } catch {
        // Queue count is secondary; ignore errors here.
      }
    },
    [token, batch?.batch_id],
  );

  /** Single stats fetch: pipeline node counts + S1–S7 scenario bar (authoritative DB aggregates). */
  const refreshDashboardAggregates = useCallback(async () => {
    try {
      const stats = await fetchDashboardStats(token);
      setPipelineCounts(aggregatePipelineCounts(stats?.node_counts));
      setScenarioCounts(mergeScenarioState(stats?.scenario_breakdown, stats?.scenario_unknown));
      const c = stats?.converted_leads;
      setDashConvertedLeads(typeof c === "number" && !Number.isNaN(c) ? c : 0);
    } catch {
      // Keep previous counts on failure.
    }
  }, [token]);

  const pollBatch = (batchId) => {
    stopTimer();
    timerRef.current = setInterval(async () => {
      try {
        const b = await getBatchStatus(token, batchId);
        setBatch(b);
        await refreshHitl(b?.batch_id);
        await refreshDashboardAggregates();
        if (b?.status && b.status !== "running") {
          stopTimer();
          setStatus("complete");
        } else {
          setStatus("running");
        }
      } catch (e) {
        stopTimer();
        setStatus("error");
        setLoadError(e.message || "Failed to refresh batch status.");
      }
    }, 1200);
  };

  const runAll = async () => {
    if (status === "running") return;
    setRunError("");
    setLoadError("");
    setStatus("running");
    try {
      const payload = await runBatch(token);
      if (!payload?.success) {
        setStatus("idle");
        setBatch(payload?.data || null);
        setRunError(payload?.message || "No leads found to process.");
        return;
      }
      const b = payload?.data;
      setBatch(b);
      await refreshHitl(b?.batch_id);
      await refreshDashboardAggregates();
      if (b?.batch_id) pollBatch(b.batch_id);
    } catch (e) {
      setStatus("error");
      setRunError(e.message || "Failed to start batch.");
    }
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setLoadError("");
      try {
        const [leads, latest, dash] = await Promise.allSettled([
          fetchLeadsList(token),
          getLatestBatch(token),
          fetchDashboardStats(token),
        ]);

        if (!cancelled) {
          if (dash.status === "fulfilled" && dash.value) {
            const base = mergeScenarioState(
              dash.value.scenario_breakdown,
              dash.value.scenario_unknown,
            );
            if (
              dash.value.scenario_unknown === undefined &&
              leads.status === "fulfilled"
            ) {
              const rows = Array.isArray(leads.value) ? leads.value : [];
              base.unknown = unknownScenarioCountFromLeads(rows);
            }
            setScenarioCounts(base);
          } else if (leads.status === "fulfilled") {
            const rows = Array.isArray(leads.value) ? leads.value : [];
            const counts = { S1: 0, S2: 0, S3: 0, S4: 0, S5: 0, S6: 0, S7: 0, unknown: 0 };
            rows.forEach((r) => {
              const s = r?.scenario_id;
              if (s && counts[s] != null) counts[s] += 1;
              else counts.unknown += 1;
            });
            setScenarioCounts(counts);
          }
          if (dash.status === "fulfilled" && dash.value?.node_counts) {
            setPipelineCounts(aggregatePipelineCounts(dash.value.node_counts));
          }

          if (dash.status === "fulfilled" && dash.value && typeof dash.value.converted_leads === "number") {
            setDashConvertedLeads(dash.value.converted_leads);
          }

          if (latest.status === "fulfilled") {
            setBatch(latest.value);
            if (latest.value?.status === "running" && latest.value?.batch_id) {
              pollBatch(latest.value.batch_id);
              setStatus("running");
            } else if (latest.value?.status) {
              setStatus("complete");
            }
          } else if (latest.status === "rejected" && latest.reason?.status !== 404) {
            setLoadError(latest.reason?.message || "Failed to load latest batch.");
          }
        }
      } catch (e) {
        if (!cancelled) setLoadError(e.message || "Failed to load campaigns data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  // pollBatch is defined in this component and does not change across renders in practice.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    activeBatchIdRef.current = batch?.batch_id ?? null;
    // When a new batch is set (or cleared), reset executed counters for "this run".
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExecutedCounts(emptyExecutedCounts());
  }, [batch?.batch_id]);

  // Live SSE: ``batch_progress`` matches backend agent_api emissions; HITL / workflow hints refresh stats.
  useEffect(() => {
    if (!token || typeof EventSource === "undefined") return;

    let es;
    try {
      es = new EventSource(buildSseStreamUrl(token));
    } catch {
      return;
    }

    const liveStatTypes = [
      "hitl_required",
      "hitl_approved",
      "hitl_edited",
      "hitl_rejected",
      "lead_converted",
      "workflow_state",
      "node_transition",
    ];

    const onBatchProgress = (ev) => {
      let d;
      try {
        d = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (d.event_type !== "batch_progress" || !d.batch_id) return;
      if (d.batch_id !== activeBatchIdRef.current) return;

      setBatch((prev) => {
        if (!prev || prev.batch_id !== d.batch_id) return prev;
        const pct =
          d.pct != null
            ? d.pct
            : d.total
              ? Math.round((d.processed / d.total) * 100)
              : prev.pct ?? 0;
        return {
          ...prev,
          processed_count: d.processed,
          total: d.total,
          success_count: d.success,
          failed_count: d.failed,
          status: d.status,
          pct,
        };
      });

      if (d.status && d.status !== "running") {
        setStatus("complete");
        stopTimer();
        void refreshDashboardAggregates();
      } else {
        setStatus("running");
      }
    };

    const onNodeTransition = (ev) => {
      let d;
      try {
        d = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (d.event_type !== "node_transition") return;
      if (d.status !== "completed") return;
      if (!d.batch_id || d.batch_id !== activeBatchIdRef.current) return;

      const stageKey = BACKEND_NODE_TO_STAGE_KEY[d.node];
      if (!stageKey) return;
      setExecutedCounts((prev) => ({ ...prev, [stageKey]: (prev[stageKey] || 0) + 1 }));
    };

    let lastLiveRefresh = 0;
    const onLiveStatHint = () => {
      const t = Date.now();
      if (t - lastLiveRefresh < 2000) return;
      lastLiveRefresh = t;
      void refreshHitl();
      void refreshDashboardAggregates();
    };

    es.addEventListener("batch_progress", onBatchProgress);
    es.addEventListener("node_transition", onNodeTransition);
    for (const t of liveStatTypes) es.addEventListener(t, onLiveStatHint);

    return () => {
      es.close();
    };
  }, [token, refreshHitl, refreshDashboardAggregates, stopTimer]);

  // After load, and when the active batch id changes, resync HITL (batch-scoped when possible).
  useEffect(() => {
    if (!token || loading) return;
    const id = setTimeout(() => {
      void refreshHitl();
    }, 0);
    return () => clearTimeout(id);
  }, [token, loading, batch?.batch_id, refreshHitl]);

  // When a batch finishes, the 1.2s poller stops — HITL approvals would not update the top
  // “awaiting HITL” number. Keep HITL + dashboard aggregates fresh even with no running batch.
  useEffect(() => {
    if (!token) return;
    const id = setInterval(() => {
      void (async () => {
        await refreshHitl();
        await refreshDashboardAggregates();
      })();
    }, 4000);
    return () => clearInterval(id);
  }, [token, refreshHitl, refreshDashboardAggregates]);

  return (
    <section className="space-y-3">
      <div className="app-surface-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[#1e2a52] dark:text-white">{t("campaigns.title")}</h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-volt-muted">
              {t("campaigns.subtitle")}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {status === "complete" ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-500/20">
                {t("campaigns.status.complete")}
              </span>
            ) : status === "running" ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-100 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/20">
                {t("campaigns.status.batchRunning")}
              </span>
            ) : (
              <span className="text-xs font-semibold text-gray-500 dark:text-volt-muted2">{loading ? t("common.loading") : t("common.ready")}</span>
            )}

            <button
              type="button"
              onClick={runAll}
              disabled={status === "running"}
              title={
                status === "running"
                  ? t("campaigns.runButton.runningTitle")
                  : undefined
              }
              className="inline-flex h-10 items-center gap-2 rounded-full bg-gradient-to-r from-[#0b4aa6] via-[#004EB2] to-[#003B86] px-5 text-xs font-semibold text-white shadow-[0_12px_30px_rgba(0,78,178,0.22)] transition hover:brightness-[1.05] disabled:cursor-not-allowed disabled:opacity-60 dark:shadow-[0_12px_30px_rgba(0,0,0,0.35)]"
            >
              {status === "complete"
                ? t("campaigns.runButton.complete")
                : status === "running"
                  ? t("common.running")
                  : t("campaigns.runButton.runAll")}
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/20" aria-hidden>
                {status === "running" ? (
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  "▶"
                )}
              </span>
            </button>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <GuidePanel title="Workflow guide" subtitle="Batch counts, cadence, and selected runs" tone="indigo">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {workflowDefinitions.map(([term, detail]) => (
                <div key={term} className="rounded-xl bg-white/75 px-3 py-2 text-[11px] dark:bg-volt-panel/60">
                  <span className="font-semibold text-gray-800 dark:text-white">{term}:</span>{" "}
                  <span className="text-gray-600 dark:text-volt-muted">{detail}</span>
                </div>
              ))}
            </div>
          </GuidePanel>

          {runError ? (
            <div className="rounded-2xl border border-amber-100 bg-amber-50/80 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
              {runError}
            </div>
          ) : null}
          {loadError ? (
            <div className="rounded-2xl border border-amber-100 bg-amber-50/80 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
              {loadError}
            </div>
          ) : null}

          <div className="app-surface-nested p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-semibold text-gray-700 dark:text-volt-text">
                {t("campaigns.batch.processing")}{" "}
                <span className="text-indigo-700">
                  {formatInt(processed)} / {formatInt(batch?.total ?? totalLeads)}
                </span>{" "}
                {t("campaigns.batch.leads")}
              </p>
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-500 dark:text-volt-muted2">
                <span
                  className="inline-flex items-center gap-2"
                  title={t("campaigns.batch.scopeSucceeded")}
                >
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  {formatInt(success)} {t("campaigns.batch.succeeded")}
                </span>
                <span
                  className="inline-flex items-center gap-2"
                  title={
                    batch?.batch_id
                      ? t("campaigns.batch.scopeAwaitingHitl")
                      : t("campaigns.batch.scopeAwaitingHitlGlobal")
                  }
                >
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  {awaitingHitl}{" "}
                  {batch?.batch_id
                    ? t("campaigns.batch.awaitingHitlScoped")
                    : t("campaigns.batch.awaitingHitlAll")}
                </span>
                <span
                  className="inline-flex items-center gap-2"
                  title={t("campaigns.batch.scopeRemaining")}
                >
                  <span className="h-2 w-2 rounded-full bg-blue-500" />
                  {formatInt(remaining)} {t("campaigns.batch.remaining")}
                </span>
                <span
                  className="inline-flex items-center gap-2"
                  title={t("campaigns.batch.scopeFailed")}
                >
                  <span className="h-2 w-2 rounded-full bg-rose-500" />
                  {formatInt(failed)} {t("campaigns.batch.failed")}
                </span>
                <span className="inline-flex items-center gap-2" title="All open HITL rows">
                  <span className="h-2 w-2 rounded-full bg-violet-500" />
                  {formatInt(awaitingHitlGlobal)} global HITL
                </span>
                <span className="inline-flex items-center gap-2" title="Converted leads across all campaigns">
                  <span className="h-2 w-2 rounded-full bg-teal-500" />
                  {formatInt(dashConvertedLeads)} converted
                </span>
              </div>
            </div>

            <div className="mt-3 h-2 rounded-full bg-gray-100 dark:bg-white/10">
              <div
                className="h-2 rounded-full bg-gradient-to-r from-emerald-500 via-cyan-500 to-indigo-500 transition-[width] duration-300"
                style={{ width: `${Math.min(100, progressPct)}%` }}
              />
            </div>
          </div>

          <p className="px-1 text-[10px] leading-snug text-gray-500 dark:text-volt-muted2">
            {t("campaigns.scenarios.subtitle")}
          </p>
          <GuidePanel title="Scenario legend" subtitle="S1-S7 routing definitions">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {scenarioLegend.map(([id, label, detail]) => (
                <div key={id} className="rounded-xl bg-gray-50 px-3 py-2 text-[11px] dark:bg-white/5">
                  <span className="font-semibold text-indigo-700 dark:text-indigo-200">{id} · {label}</span>
                  <p className="mt-0.5 text-gray-600 dark:text-volt-muted2">{detail}</p>
                </div>
              ))}
            </div>
          </GuidePanel>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {scenarioCards.map((s) => (
              <div
                key={s.id}
                className="app-surface-nested p-3"
              >
                <div className="flex items-center justify-between">
                  <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ring-1 ${s.tone}`}>
                    {s.id}
                  </span>
                  <span className="text-[11px] font-semibold text-gray-400">
                    {status === "idle" ? "—" : ""}
                  </span>
                </div>
                <p className="mt-3 text-xl font-semibold tracking-tight text-[#1e2a52] dark:text-white">
                  {loading ? "—" : formatInt(scenarioCounts[s.id] || 0)}
                </p>
                <p className="mt-1 text-xs font-medium text-gray-500 dark:text-volt-muted2">{s.label}</p>
                <p className="mt-2 text-[11px] text-gray-800 dark:text-volt-muted2">
                  {loading ? t("campaigns.status.loading") : t("campaigns.status.ready")}
                </p>
              </div>
            ))}
          </div>

          <div className="app-surface-card p-4">
            <div className="mb-3">
              <p className="text-sm font-semibold text-[#1e2a52] dark:text-white">{t("campaigns.pipeline.title")}</p>
              <p className="mt-1 text-[11px] text-gray-500 dark:text-volt-muted2">
                Agent tiles show this batch's node completions; subtext shows current DB queue position.
              </p>
              <div className="mt-3">
                <GuidePanel title="Pipeline legend" subtitle="Agent steps, cadence, and HITL gates">
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {pipelineLegend.map(([code, label, detail]) => (
                      <div key={code} className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-[11px] dark:border-volt-borderSoft dark:bg-white/5">
                        <span className="font-semibold text-gray-800 dark:text-white">{code} · {label}</span>
                        <p className="mt-0.5 text-gray-600 dark:text-volt-muted2">{detail}</p>
                      </div>
                    ))}
                  </div>
                </GuidePanel>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {pipelineStages.map((stage) => {
                const isHitl = stage.key === "hitl";
                const isConv = stage.key === "conv";
                const isAgentStage = !isHitl && !isConv;
                const value =
                  stage.key === "hitl"
                    ? awaitingHitl
                    : stage.key === "conv"
                      ? success
                      : pipelineCounts[stage.key] ?? 0;
                const executed = isAgentStage ? executedCounts[stage.key] ?? 0 : 0;

                let caption = "";
                if (loading) {
                  caption = t("campaigns.pipeline.idleCaption");
                } else if (isHitl) {
                  caption = awaitingHitl
                    ? t("campaigns.pipeline.hitlAwaiting", { count: awaitingHitl })
                    : t("campaigns.pipeline.idleCaption");
                } else if (isConv) {
                  caption = "";
                } else if (executed > 0) {
                  caption = t("campaigns.pipeline.completionsQueued", {
                    queued: formatInt(value),
                  });
                } else if (value > 0) {
                  caption = t("campaigns.pipeline.queuedOnly", { queued: formatInt(value) });
                } else {
                  caption = t("campaigns.pipeline.emDash");
                }

                return (
                  <div
                    key={stage.key}
                    className={`app-surface-nested p-4 ${
                      isHitl && awaitingHitl > 0 ? "ring-1 ring-amber-200" : ""
                    }`}
                  >
                    <div className={`text-[11px] font-semibold ${stage.accent}`}>
                      {stage.key === "conv"
                        ? t("campaigns.pipeline.batchSuccessLabel")
                        : stage.label}
                    </div>
                    <div className="mt-4 text-center">
                      <p
                        className={`text-3xl font-semibold tracking-tight ${isConv ? "text-emerald-700" : "text-[#1e2a52] dark:text-white"}`}
                        title={
                          isAgentStage
                            ? t("campaigns.pipeline.stageMainHint")
                            : isConv
                              ? undefined
                              : isHitl
                                ? batch?.batch_id
                                  ? t("campaigns.pipeline.hitlTileHintBatch")
                                  : t("campaigns.pipeline.hitlTileHintGlobal")
                                : undefined
                        }
                      >
                        {loading ? 0 : isAgentStage ? executed : value}
                      </p>
                      {caption ? (
                        <p
                          className="mt-1 text-xs font-medium text-gray-600 dark:text-volt-muted2"
                          title={
                            isAgentStage
                              ? t("campaigns.pipeline.stageSubHint")
                              : isConv
                                ? t("campaigns.pipeline.batchSuccessSubHint")
                                : undefined
                          }
                        >
                          {caption}
                        </p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Campaigns;
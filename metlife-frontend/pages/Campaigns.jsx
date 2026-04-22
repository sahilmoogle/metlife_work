import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { fetchLeadsList } from "../src/services/leadsApi";
import { fetchHitlQueue } from "../src/services/hitlApi";
import { getBatchStatus, getLatestBatch, runBatch } from "../src/services/agentsApi";

const scenarioCards = [
  { id: "S1", label: "Young Prof", tone: "text-indigo-700 bg-indigo-50 ring-indigo-100" },
  { id: "S2", label: "Married", tone: "text-emerald-700 bg-emerald-50 ring-emerald-100" },
  { id: "S3", label: "Senior", tone: "text-violet-700 bg-violet-50 ring-violet-100" },
  { id: "S4", label: "Dormant", tone: "text-amber-700 bg-amber-50 ring-amber-100" },
  { id: "S5", label: "Buyer", tone: "text-cyan-700 bg-cyan-50 ring-cyan-100" },
  { id: "S6", label: "F2F", tone: "text-teal-700 bg-teal-50 ring-teal-100" },
  { id: "S7", label: "W2C", tone: "text-rose-700 bg-rose-50 ring-rose-100" },
];

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
  { key: "conv", label: "✓ Converted", accent: "text-emerald-700", icon: "check" },
];

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
  const [status, setStatus] = useState("idle"); // idle | running | complete | error
  const [batch, setBatch] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [runError, setRunError] = useState("");
  const [loading, setLoading] = useState(true);
  const [awaitingHitl, setAwaitingHitl] = useState(0);
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

  const timerRef = useRef(null);

  const totalLeads = batch?.total ?? Object.values(scenarioCounts).reduce((a, b) => a + b, 0);
  const processed = batch?.processed_count ?? 0;
  const success = batch?.success_count ?? 0;
  const failed = batch?.failed_count ?? 0;
  const remaining = Math.max(0, (batch?.total ?? 0) - processed);
  const progressPct = batch?.pct ?? (totalLeads ? Math.round((processed / totalLeads) * 100) : 0);

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    return () => stopTimer();
  }, []);

  const reset = () => {
    stopTimer();
    setRunError("");
    setLoadError("");
    setBatch(null);
    setStatus("idle");
  };

  const refreshHitl = async () => {
    try {
      const q = await fetchHitlQueue(token);
      setAwaitingHitl(Array.isArray(q) ? q.length : 0);
    } catch {
      // Queue count is secondary; ignore errors here.
    }
  };

  const pollBatch = (batchId) => {
    stopTimer();
    timerRef.current = setInterval(async () => {
      try {
        const b = await getBatchStatus(token, batchId);
        setBatch(b);
        await refreshHitl();
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
      await refreshHitl();
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
        const [leads, latest, hitl] = await Promise.allSettled([
          fetchLeadsList(token),
          getLatestBatch(token),
          fetchHitlQueue(token),
        ]);

        if (!cancelled) {
          if (leads.status === "fulfilled") {
            const rows = Array.isArray(leads.value) ? leads.value : [];
            const counts = { S1: 0, S2: 0, S3: 0, S4: 0, S5: 0, S6: 0, S7: 0, unknown: 0 };
            rows.forEach((r) => {
              const s = r?.scenario_id;
              if (s && counts[s] != null) counts[s] += 1;
              else counts.unknown += 1;
            });
            setScenarioCounts(counts);
          }

          if (hitl.status === "fulfilled") {
            setAwaitingHitl(Array.isArray(hitl.value) ? hitl.value.length : 0);
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

  return (
    <section className="space-y-3">
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.03)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[#1e2a52]">Workflow Orchestration</h2>
            <p className="mt-1 text-xs text-gray-500">
              LangGraph batch execution • Auto-runs all agents • Pauses only at HITL gates
            </p>
          </div>

          <div className="flex items-center gap-2">
            {status === "complete" ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
                ✓ Complete
              </span>
            ) : (
              <span className="text-xs font-semibold text-gray-500">{loading ? "Loading…" : "Ready"}</span>
            )}

            <button
              type="button"
              onClick={status === "complete" ? reset : runAll}
              disabled={status === "running"}
              className={`inline-flex h-9 items-center gap-2 rounded-full px-4 text-xs font-semibold text-white shadow-[0_10px_25px_rgba(16,185,129,0.20)] transition ${
                status === "complete"
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-emerald-600 hover:bg-emerald-700"
              }`}
            >
              {status === "complete" ? "Complete" : status === "running" ? "Running…" : "Run All Workflows"}
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/20">
                ▶
              </span>
            </button>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {runError ? (
            <div className="rounded-2xl border border-amber-100 bg-amber-50/80 p-4 text-sm text-amber-900">
              {runError}
            </div>
          ) : null}
          {loadError ? (
            <div className="rounded-2xl border border-amber-100 bg-amber-50/80 p-4 text-sm text-amber-900">
              {loadError}
            </div>
          ) : null}

          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[inset_0_1px_0_rgba(0,0,0,0.02)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-semibold text-gray-700">
                Batch Processing{" "}
                <span className="text-indigo-700">
                  {formatInt(processed)} / {formatInt(batch?.total ?? totalLeads)}
                </span>{" "}
                leads
              </p>
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-500">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  {formatInt(success)} succeeded
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  {awaitingHitl} awaiting HITL
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-blue-500" />
                  {formatInt(remaining)} remaining
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-rose-500" />
                  {formatInt(failed)} failed
                </span>
              </div>
            </div>

            <div className="mt-3 h-2 rounded-full bg-gray-100">
              <div
                className="h-2 rounded-full bg-gradient-to-r from-emerald-500 via-cyan-500 to-indigo-500 transition-[width] duration-300"
                style={{ width: `${Math.min(100, progressPct)}%` }}
              />
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {scenarioCards.map((s) => (
              <div
                key={s.id}
                className="rounded-2xl border border-gray-100 bg-white p-3 shadow-[inset_0_1px_0_rgba(0,0,0,0.02)]"
              >
                <div className="flex items-center justify-between">
                  <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ring-1 ${s.tone}`}>
                    {s.id}
                  </span>
                  <span className="text-[11px] font-semibold text-gray-400">
                    {status === "idle" ? "—" : ""}
                  </span>
                </div>
                <p className="mt-3 text-xl font-semibold tracking-tight text-[#1e2a52]">
                  {loading ? "—" : formatInt(scenarioCounts[s.id] || 0)}
                </p>
                <p className="mt-1 text-[11px] text-gray-400">{s.label}</p>
                <p className="mt-2 text-[11px] text-gray-400">
                  {loading ? "Loading" : "Ready"}
                </p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.03)]">
            <div className="mb-3">
              <p className="text-sm font-semibold text-[#1e2a52]">Agent Execution Pipeline</p>
              <p className="mt-1 text-[11px] text-gray-400">
                Live processing counts • Leads flow through agents automatically • Click any node to inspect
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {pipelineStages.map((stage) => {
                const isHitl = stage.key === "hitl";
                const isConv = stage.key === "conv";
                const value =
                  stage.key === "hitl"
                    ? awaitingHitl
                    : stage.key === "conv"
                      ? success
                      : 0;
                return (
                  <div
                    key={stage.key}
                    className={`rounded-2xl border border-gray-100 bg-white p-4 shadow-[inset_0_1px_0_rgba(0,0,0,0.02)] ${
                      isHitl && awaitingHitl > 0 ? "ring-1 ring-amber-200" : ""
                    }`}
                  >
                    <div className={`text-[11px] font-semibold ${stage.accent}`}>{stage.label}</div>
                    <div className="mt-4 text-center">
                      <p className={`text-3xl font-semibold tracking-tight ${isConv ? "text-emerald-700" : "text-[#1e2a52]"}`}>
                        {loading ? 0 : value}
                      </p>
                      <p className="mt-1 text-[11px] text-gray-400">
                        {loading
                          ? "Idle"
                          : isHitl
                            ? awaitingHitl
                              ? `${awaitingHitl} awaiting`
                              : "Idle"
                            : isConv
                              ? "Succeeded"
                              : "—"}
                      </p>
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
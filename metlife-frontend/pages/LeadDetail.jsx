import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { fetchLeadDetail } from "../src/services/leadsApi";
import { getWorkflowState, trackEvent } from "../src/services/agentsApi";
import { fetchHitlQueue, approveHitl } from "../src/services/hitlApi";
import { downloadBlob, leadDetailToJson } from "../src/utils/exportFile";
import { buildSseStreamUrl } from "../src/services/sseStream";
import { formatRelativeTime } from "../src/utils/relativeTime";
import { useRelativeClock } from "../src/hooks/useRelativeClock";

const statusStyles = {
  Active: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200",
  Processing: "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-200",
  New: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200",
  Pending_HITL: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-200",
  HITL: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-200",
  Converted: "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-200",
  Dormant: "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-volt-muted2",
  Suppressed: "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-volt-muted2",
};

const SCENARIO_NAMES = {
  S1: "Young Prof",
  S2: "Life Event",
  S3: "Senior",
  S4: "Dormant Revival",
  S5: "Active Buyer",
  S6: "F2F Consult",
  S7: "Web-to-Call",
};

const scenarioLabel = (id) =>
  id ? `${id} · ${SCENARIO_NAMES[id] ?? id}` : "—";

const chip = {
  Low: "bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-volt-text",
  Medium: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200",
  High: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-200",
  Rising: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200",
  Steady: "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-200",
};

const StepStateIcon = ({ state }) => {
  const base = "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold";
  if (state === "completed") {
    return <div className={`${base} border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200`}>✓</div>;
  }
  if (state === "active") {
    return <div className={`${base} border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200`}>•</div>;
  }
  if (state === "skipped") {
    return (
      <div className={`${base} border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200`} title="Not reached">
        —
      </div>
    );
  }
  return <div className={`${base} border-gray-200 bg-gray-50 text-gray-400 dark:border-volt-borderSoft dark:bg-white/5 dark:text-volt-muted2`}>○</div>;
};

/** Typical nurture path (S1–S5); S4 revival may insert A10 before this chain. */
const PIPELINE_STAGES = [
  { node: "A1_Identity", title: "A1 · Identity", detail: "Unify Oracle / form profile & thread" },
  { node: "A2_Persona", title: "A2 · Persona", detail: "Scenario classification & survey routing" },
  { node: "A4_ContentStrategy", title: "A4 · Content strategy", detail: "Campaign arc & constraints" },
  { node: "A5_Writer", title: "A5 · Generative writer", detail: "Draft email (then G1 compliance)" },
  { node: "A6_Send", title: "A6 · Send engine", detail: "Delivery & quiet-hours checks" },
  { node: "A3_Intent", title: "A3 · Intent analyser", detail: "MEMO / engagement interpretation" },
  { node: "A8_Scoring", title: "A8 · Propensity score", detail: "Threshold vs handoff · may pause at G5" },
  { node: "A9_Handoff", title: "A9 · Sales handoff", detail: "Briefing pack · then G4 sales gate" },
];

const GATE_REVIEW_HINT = {
  G1: "Compliance on drafted email — approve, edit, or reject in Reviews.",
  G2: "Persona suggestion — confirm or override in Reviews.",
  G3: "Campaign / revival approval (often S4). Needed before nurture can advance toward scoring and handoff.",
  G4: "Sales acceptance of the handoff briefing — converted when approved.",
  G5: "Score near threshold — use Force handoff or Hold nurture on this page.",
};

const LeadDetail = () => {
  useRelativeClock(30000);
  const { id } = useParams();
  const { token } = useAuth();
  const { i18n } = useTranslation();
  const isEnglish = i18n.language === "en";
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [workflowState, setWorkflowState] = useState(null);
  const [pendingHitl, setPendingHitl] = useState(null);
  const [latestHitl, setLatestHitl] = useState(null);
  const [threadCtxLoading, setThreadCtxLoading] = useState(false);
  const [threadCtxNote, setThreadCtxNote] = useState("");
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [decisionErr, setDecisionErr] = useState("");
  const [decisionOk, setDecisionOk] = useState("");
  const [simulateOpen, setSimulateOpen] = useState(false);
  const [simulateBusy, setSimulateBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    const run = async () => {
      setLoadError("");
      setNotFound(false);
      setLoading(true);
      try {
        const data = await fetchLeadDetail(token, id);
        if (!cancelled) {
          setLead(data || null);
          if (!data) setNotFound(true);
        }
      } catch (e) {
        if (cancelled) return;
        if (e.status === 404) {
          setNotFound(true);
          setLead(null);
        } else {
          setLead(null);
          setLoadError(e.message || "Failed to load lead.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [id, token, refreshKey]);

  useEffect(() => {
    if (!lead?.thread_id || !token) {
      const id = setTimeout(() => {
        setWorkflowState(null);
        setPendingHitl(null);
        setLatestHitl(null);
        setThreadCtxNote("");
      }, 0);
      return () => clearTimeout(id);
    }
    let cancelled = false;
    (async () => {
      setThreadCtxLoading(true);
      setThreadCtxNote("");
      try {
        const [wf, pendingRows, resolvedRows] = await Promise.all([
          getWorkflowState(token, lead.thread_id),
          fetchHitlQueue(token, { threadId: lead.thread_id }),
          fetchHitlQueue(token, { threadId: lead.thread_id, queue: "resolved" }),
        ]);
        if (!cancelled) {
          setWorkflowState(wf);
          const pending = Array.isArray(pendingRows) ? pendingRows : [];
          const resolved = Array.isArray(resolvedRows) ? resolvedRows : [];
          setPendingHitl(pending[0] || null);
          setLatestHitl(pending[0] || resolved[0] || null);
        }
      } catch (e) {
        if (!cancelled) {
          setWorkflowState(null);
          setPendingHitl(null);
          setLatestHitl(null);
          const msg = e.message || "";
          setThreadCtxNote(
            msg.includes("404") || msg.includes("No checkpoint")
              ? "No LangGraph checkpoint for this thread (run may have ended or expired)."
              : msg,
          );
        }
      } finally {
        if (!cancelled) setThreadCtxLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lead?.thread_id, token, refreshKey]);

  useEffect(() => {
    if (!token || !id || typeof EventSource === "undefined") return;

    let es;
    try {
      es = new EventSource(buildSseStreamUrl(token));
    } catch {
      return;
    }

    let last = 0;
    const refreshSoon = () => {
      const t = Date.now();
      if (t - last < 800) return;
      last = t;
      setRefreshKey((k) => k + 1);
    };

    const onLeadEvent = (ev) => {
      let d;
      try {
        d = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (!d || String(d.lead_id || "") !== String(id)) return;
      refreshSoon();
    };

    const leadEvents = [
      "node_transition",
      "workflow_state",
      "hitl_required",
      "hitl_approved",
      "hitl_edited",
      "hitl_rejected",
      "lead_converted",
    ];
    for (const t of leadEvents) es.addEventListener(t, onLeadEvent);

    return () => {
      es.close();
    };
  }, [token, id]);

  const displayName = useMemo(() => {
    if (!lead) return "";
    const parts = [lead.first_name, lead.last_name].filter(Boolean);
    return parts.join(" ").trim() || "Unknown";
  }, [lead]);

  const cpScoreNum = workflowState?.engagement_score ?? lead?.engagement_score ?? 0;
  const cpThresholdNum = workflowState?.handoff_threshold ?? 0.8;

  /** Pipeline row states: avoids showing “stuck” on A8 while the journey actually ended at Dormant. */
  const pipelineStageStates = useMemo(() => {
    const n = PIPELINE_STAGES.length;
    const pending = () => Array(n).fill("pending");
    if (!lead) return pending();

    const st = lead.workflow_status || "New";
    const out = pending();

    if (st === "Converted") {
      return Array(n).fill("completed");
    }

    if (st === "Dormant") {
      for (let i = 0; i < n - 1; i++) out[i] = "completed";
      out[n - 1] = "skipped";
      return out;
    }

    const node = workflowState?.current_node || lead?.current_node || "";
    if (node === "A10_Dormancy") {
      out[0] = "active";
      return out;
    }

    const idx = PIPELINE_STAGES.findIndex((s) => s.node === node);
    if (idx >= 0) {
      for (let i = 0; i < idx; i++) out[i] = "completed";
      out[idx] = "active";
      return out;
    }

    return out;
  }, [lead, workflowState]);

  const handoffContext = useMemo(() => {
    if (!lead) return null;
    const st = lead.workflow_status || "New";
    const below = Number(cpScoreNum) < Number(cpThresholdNum);
    return {
      status: st,
      belowThreshold: below,
      score: Number(cpScoreNum),
      threshold: Number(cpThresholdNum),
      isDormant: st === "Dormant",
      isConverted: st === "Converted",
      emailsSent: lead.emails_sent_count ?? 0,
    };
  }, [lead, cpScoreNum, cpThresholdNum]);
  const hasSentEmail = (lead?.emails_sent_count ?? 0) > 0 || (lead?.communications?.length ?? 0) > 0;

  const reviewsPath = lead?.thread_id ? `/reviews/${encodeURIComponent(lead.thread_id)}` : "/reviews";

  /** Single sentence describing where this lead stands (for the unified workflow header). */
  const workflowOneLiner = useMemo(() => {
    if (!lead) return "";
    const st = lead.workflow_status || "New";
    if (st === "Converted") return "Journey finished — converted after sales review.";
    if (st === "Suppressed") return "Suppressed — no further automation.";
    if (st === "Dormant")
      return "Nurture sequence ended — lead is in the dormant pool until revival.";
    if (pendingHitl?.review_status === "Awaiting" && pendingHitl.gate_type) {
      return `Waiting on reviewer — gate ${pendingHitl.gate_type}.`;
    }
    if (!lead.thread_id) return "No LangGraph thread yet — workflow not started.";
    return "Automation in progress or idle between steps.";
  }, [lead, pendingHitl]);

  const executionTimeline = useMemo(() => {
    const raw = Array.isArray(lead?.execution_log) ? lead.execution_log : [];
    const items = raw
      .map((e, idx) => ({
        key: `${idx}-${e?.timestamp || ""}-${e?.title || ""}`,
        title: e?.title || "Event",
        description: e?.description || "",
        badges: Array.isArray(e?.badges) ? e.badges : [],
        timestamp: e?.timestamp || "",
      }))
      .filter((x) => x.title || x.description);

    items.sort((a, b) => {
      const ta = new Date(a.timestamp).getTime();
      const tb = new Date(b.timestamp).getTime();
      if (!Number.isFinite(ta) || !Number.isFinite(tb)) return 0;
      return ta - tb;
    });
    return items;
  }, [lead]);

  const executionTimelineRecent = useMemo(() => {
    if (!executionTimeline.length) return [];
    return executionTimeline.slice(-8);
  }, [executionTimeline]);

  const handleExport = () => {
    if (!lead) return;
    const name = `lead-${lead.id}.json`;
    downloadBlob(name, leadDetailToJson(lead), "application/json;charset=utf-8");
  };

  const handleG5Decision = async (action) => {
    if (!lead?.thread_id || decisionBusy) return;
    setDecisionBusy(true);
    setDecisionErr("");
    setDecisionOk("");
    try {
      await approveHitl(token, lead.thread_id, {
        action,
        reviewer_notes: `Lead detail · operator ${action}`,
      });
      setDecisionOk(
        action === "hold"
          ? "Held for nurture — workflow routes back to the email loop."
          : "Promoted to handoff — workflow resumes toward sales briefing (A9) and G4.",
      );
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setDecisionErr(e.message || "Could not submit decision.");
    } finally {
      setDecisionBusy(false);
    }
  };

  const handleSimulate = async (eventType, label = null) => {
    if (!lead?.thread_id || simulateBusy) return;
    if (!hasSentEmail) {
      setSimulateOpen(false);
      alert("No email has been sent yet. Approve G1 and let A6 send before using the demo simulator.");
      return;
    }
    setSimulateBusy(true);
    setSimulateOpen(false);
    try {
      await trackEvent(token, {
        thread_id: lead.thread_id,
        event_type: eventType,
        clicked_label: label,
      });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      alert(e.message || "Simulation failed.");
    } finally {
      setSimulateBusy(false);
    }
  };

  if (notFound) {
    return <Navigate to="/leads" replace />;
  }

  if (loading) {
    return (
      <section className="app-surface-card p-6">
        <p className="text-sm text-gray-600 dark:text-volt-muted">Loading lead…</p>
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="rounded-xl border border-amber-100 bg-amber-50/80 p-4 shadow-sm dark:border-amber-500/30 dark:bg-amber-500/10 dark:shadow-none">
        <p className="text-sm text-amber-900 dark:text-amber-100">{loadError}</p>
        <button
          type="button"
          className="mt-2 text-sm font-semibold text-indigo-700 underline"
          onClick={() => setRefreshKey((k) => k + 1)}
        >
          Retry
        </button>
        <div className="mt-3">
          <Link to="/leads" className="text-xs font-semibold text-gray-600 hover:underline dark:text-volt-muted">
            ← Back to leads
          </Link>
        </div>
      </section>
    );
  }

  if (!lead) {
    return <Navigate to="/leads" replace />;
  }

  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();

  const statusKey = lead.workflow_status || "New";
  const statusClass = statusStyles[statusKey] || statusStyles.New;
  const urgencyChip = lead.urgency && chip[lead.urgency] ? chip[lead.urgency] : chip.Medium;

  return (
    <section className="app-surface-card p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Link to="/leads" className="text-xs font-semibold text-indigo-700 hover:underline">
              ← Back
            </Link>
            <span className="text-[11px] font-semibold text-gray-400">/</span>
            <span className="text-xs font-semibold text-gray-500 dark:text-volt-muted2">Lead Details</span>
          </div>
          <p className="mt-1 text-[11px] text-gray-500 dark:text-volt-muted2">Identity &amp; messages · workflow &amp; actions on the right</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {lead?.thread_id && (
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  if (!hasSentEmail) return;
                  setSimulateOpen(!simulateOpen);
                }}
                disabled={simulateBusy}
                title={!hasSentEmail ? "Approve G1 and send at least one email before simulating engagement." : "Simulate engagement event"}
                className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-semibold shadow-sm ${
                  hasSentEmail
                    ? "border-violet-200 bg-violet-50 text-violet-700 hover:border-violet-300 hover:bg-violet-100 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200 dark:hover:border-violet-400"
                    : "cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400 dark:border-volt-borderSoft dark:bg-white/5 dark:text-volt-muted2"
                }`}
              >
                {simulateBusy ? "Simulating…" : "⚡ Demo Simulator"}
                <svg viewBox="0 0 24 24" fill="none" className={`h-3 w-3 transition-transform ${simulateOpen ? "rotate-180" : ""}`}>
                  <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {simulateOpen && (
                <div className="absolute right-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-xl border border-gray-100 bg-white py-1 shadow-lg dark:border-volt-borderSoft dark:bg-volt-panel">
                  <p className="px-3 py-1.5 text-[10px] font-semibold uppercase text-gray-400 dark:text-volt-muted2">Simulate Event</p>
                  <button onClick={() => handleSimulate("email_opened")} className="block w-full px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50 dark:text-volt-text dark:hover:bg-white/5">
                    Email Opened (+0.10)
                  </button>
                  <button onClick={() => handleSimulate("email_clicked", "Medical Insurance")} className="block w-full px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50 dark:text-volt-text dark:hover:bg-white/5">
                    Click Medical (+0.15)
                  </button>
                  <button onClick={() => handleSimulate("email_clicked", "Life Insurance")} className="block w-full px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50 dark:text-volt-text dark:hover:bg-white/5">
                    Click Life (+0.15)
                  </button>
                  <button onClick={() => handleSimulate("email_clicked", "Asset Formation")} className="block w-full px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50 dark:text-volt-text dark:hover:bg-white/5">
                    Click Asset (+0.15)
                  </button>
                  <button onClick={() => handleSimulate("consult_page_visit")} className="block w-full px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50 dark:text-volt-text dark:hover:bg-white/5">
                    Page Visit (+0.40)
                  </button>
                  <button onClick={() => handleSimulate("seminar_inquiry")} className="block w-full px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50 dark:text-volt-text dark:hover:bg-white/5">
                    Seminar Inquiry (+0.20)
                  </button>
                  <button onClick={() => handleSimulate("f2f_request")} className="block w-full px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50 dark:text-volt-text dark:hover:bg-white/5">
                    F2F Request (+0.30)
                  </button>
                  <div className="my-1 border-t border-gray-100 dark:border-volt-borderSoft" />
                  <button onClick={() => handleSimulate("consultation_booked")} className="block w-full px-3 py-2 text-left text-xs font-semibold text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10">
                    Consult Booked (+0.50)
                  </button>
                  <button onClick={() => handleSimulate("bounce")} className="block w-full px-3 py-2 text-left text-xs text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10">
                    Bounce + DQ Review
                  </button>
                  <button onClick={() => handleSimulate("unsubscribe")} className="block w-full px-3 py-2 text-left text-xs text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10">
                    Unsubscribe (Suppress)
                  </button>
                </div>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={handleExport}
            className="rounded-full border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-700 shadow-sm hover:border-indigo-300 hover:text-indigo-700 dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-text dark:shadow-none dark:hover:border-volt-border dark:hover:text-white"
          >
            Export JSON
          </button>
          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusClass}`}>
            {statusKey}
          </span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="rounded-xl border border-gray-100 bg-white p-4 dark:border-volt-borderSoft dark:bg-volt-card/60">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-indigo-700">Profile</p>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
              Score: {(lead.engagement_score ?? 0).toFixed(2)}
            </span>
          </div>

            <div className="mt-4 flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
              {initials || "?"}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-800 dark:text-white">{displayName}</p>
              <p className="truncate text-xs text-gray-400 dark:text-volt-muted2">
                {lead.persona_code || "—"} • age {lead.age ?? "—"}
              </p>
              <p className="truncate text-xs text-gray-400 dark:text-volt-muted2">
                {scenarioLabel(lead.scenario_id)} • {lead.workflow_status || "New"}
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-gray-50 p-3 dark:bg-white/5">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <p className="text-gray-400 dark:text-volt-muted2">Email</p>
              <p className="text-right font-medium text-gray-700 dark:text-volt-text">{lead.email || "—"}</p>
              <p className="text-gray-400 dark:text-volt-muted2">Device</p>
              <p className="text-right font-medium text-gray-700 dark:text-volt-text">{lead.device_type || "—"}</p>
              <p className="text-gray-400 dark:text-volt-muted2">Scenario</p>
              <p className="text-right font-medium text-gray-700 dark:text-volt-text">{scenarioLabel(lead.scenario_id)}</p>
              <p className="text-gray-400 dark:text-volt-muted2">Persona</p>
              <p className="text-right font-medium text-gray-700 dark:text-volt-text">{lead.persona_code || "—"}</p>
              <p className="text-gray-400 dark:text-volt-muted2">Persona confidence</p>
              <p className="text-right font-medium text-gray-700 dark:text-volt-text">
                {lead.persona_confidence != null ? lead.persona_confidence.toFixed(2) : "—"}
              </p>
              <p className="text-gray-400 dark:text-volt-muted2">Keigo</p>
              <p className="text-right font-medium text-gray-700 dark:text-volt-text">{lead.keigo_level || "—"}</p>
              <p className="text-gray-400 dark:text-volt-muted2">Emails sent</p>
              <p className="text-right font-medium text-gray-700 dark:text-volt-text">{lead.emails_sent_count ?? 0}</p>
              <p className="text-gray-400 dark:text-volt-muted2">Thread</p>
              <p className="truncate text-right font-medium text-gray-700 dark:text-volt-text" title={lead.thread_id || ""}>
                {lead.thread_id ? `${lead.thread_id.slice(0, 8)}…` : "—"}
              </p>
            </div>
          </div>

          {(lead.ans3 || lead.ans4 || lead.ans5) && (
            <div className="mt-3 rounded-xl border border-gray-100 p-3 dark:border-volt-borderSoft">
              <p className="text-xs font-semibold text-gray-600 dark:text-volt-muted">Survey answers</p>
              {lead.ans3 ? (
                <p className="mt-1 text-[11px] text-gray-500 dark:text-volt-muted2">
                  <span className="font-semibold text-gray-700 dark:text-volt-text">Q3:</span> {lead.ans3}
                </p>
              ) : null}
              {lead.ans4 ? (
                <p className="mt-1 text-[11px] text-gray-500 dark:text-volt-muted2">
                  <span className="font-semibold text-gray-700 dark:text-volt-text">Q4:</span> {lead.ans4}
                </p>
              ) : null}
              {lead.ans5 ? (
                <p className="mt-1 text-[11px] text-gray-500 dark:text-volt-muted2">
                  <span className="font-semibold text-gray-700 dark:text-volt-text">Q5:</span> {lead.ans5}
                </p>
              ) : null}
            </div>
          )}

          <div className="mt-4 border-t border-gray-100 pt-4 dark:border-volt-borderSoft">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-indigo-700">Communications</p>
              {lead.communications?.length ? (
                <span className="text-[11px] text-gray-400 dark:text-volt-muted2">
                  {lead.communications.length} email{lead.communications.length !== 1 ? "s" : ""}
                </span>
              ) : null}
            </div>
            <div className="mt-3 max-h-[300px] space-y-3 overflow-auto pr-1">
              {lead.communications?.length ? (
                lead.communications.map((c) => {
                  const isTemplate = c.content_type === "existing_asset";
                  const isLlm = c.content_type === "llm_generated";
                  // In English mode: prefer the stored English subject label;
                  // fall back to sequence label if neither is available.
                  const displaySubject = isEnglish
                    ? (c.subject_en || (isLlm ? `AI-Generated Email #${c.email_number ?? "?"}` : c.subject || `Email #${c.email_number ?? "?"}`))
                    : (c.subject || `Email #${c.email_number ?? "?"}`);
                  return (
                    <div key={c.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-volt-borderSoft dark:bg-white/5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-semibold text-gray-800 dark:text-white leading-snug">
                          {displaySubject}
                        </p>
                        {c.email_number != null && (
                          <span className="flex-none rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
                            #{c.email_number}
                          </span>
                        )}
                      </div>
                      {c.body_preview ? (
                        <div className="mt-1.5">
                          <p className="text-[11px] leading-relaxed text-gray-600 dark:text-volt-muted line-clamp-2">
                            {c.body_preview}
                          </p>
                          {isEnglish && (
                            <p className="mt-0.5 text-[10px] text-gray-400 dark:text-volt-muted2 italic">
                              Body sent in Japanese to lead
                            </p>
                          )}
                        </div>
                      ) : null}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {isTemplate && (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                            Pre-approved template
                          </span>
                        )}
                        {isLlm && (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                            AI-generated
                          </span>
                        )}
                        {c.sent_at && (
                          <span className="text-[10px] text-gray-400 dark:text-volt-muted2">
                            Sent {formatRelativeTime(c.sent_at) || c.sent_at}
                          </span>
                        )}
                        {!c.sent_at && (
                          <span className="text-[10px] text-gray-400 dark:text-volt-muted2">Not sent yet</span>
                        )}
                        {c.opened_at && (
                          <span className="text-[10px] font-semibold text-sky-600 dark:text-sky-300">
                            ✓ Opened
                          </span>
                        )}
                        {c.clicked_at && (
                          <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-300">
                            ✓ Clicked
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-[11px] text-gray-500 dark:text-volt-muted2">No communications recorded yet.</p>
              )}
            </div>
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          <div className="rounded-xl border border-gray-100 bg-white p-4 dark:border-volt-borderSoft dark:bg-volt-card/60">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-indigo-700">Workflow</p>
                <p className="mt-1 text-sm leading-snug text-gray-700 dark:text-volt-text">{workflowOneLiner}</p>
                <p className="mt-1 text-[11px] text-gray-500 dark:text-volt-muted2">
                  Scenario <span className="font-semibold text-gray-700 dark:text-volt-text">{scenarioLabel(lead.scenario_id)}</span>
                  {" · "}
                  Persona <span className="font-semibold text-gray-700 dark:text-volt-text">{lead.persona_code || "pending"}</span>
                </p>
              </div>
              <div className="inline-flex shrink-0 items-center gap-2 rounded-full bg-gray-50 px-3 py-1 text-[11px] font-semibold text-gray-600 dark:bg-white/5 dark:text-volt-muted">
                <span
                  className={`h-2 w-2 rounded-full ${
                    lead.workflow_status === "Dormant"
                      ? "bg-gray-400"
                      : lead.workflow_status === "Converted"
                        ? "bg-indigo-500"
                        : lead.workflow_status === "Suppressed"
                          ? "bg-gray-500"
                          : "bg-emerald-500"
                  }`}
                />
                {lead.workflow_status || "New"}
              </div>
            </div>

            <div className="mb-4 flex flex-wrap gap-2 rounded-xl bg-gray-50 p-3 dark:bg-white/5">
              <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${urgencyChip}`}>
                Urgency: {workflowState?.urgency || lead.urgency || "—"}
              </span>
              <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${chip.Rising}`}>
                Checkpoint score {Number(cpScoreNum).toFixed(2)}
              </span>
              <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-gray-700 shadow-sm dark:bg-volt-panel dark:text-volt-muted">
                Handoff threshold {Number(cpThresholdNum).toFixed(2)}
              </span>
              {(workflowState?.intent_summary || lead.intent_summary || workflowState?.product_interest || lead.product_interest) && (
                <p className="w-full text-[11px] leading-relaxed text-gray-600 dark:text-volt-muted">
                  {(workflowState?.intent_summary || lead.intent_summary) && (
                    <>
                      <span className="font-semibold text-gray-800 dark:text-volt-text">Intent:</span>{" "}
                      {workflowState?.intent_summary || lead.intent_summary}{" "}
                    </>
                  )}
                  {(workflowState?.product_interest || lead.product_interest) && (
                    <>
                      <span className="font-semibold text-gray-800 dark:text-volt-text">Product:</span>{" "}
                      {workflowState?.product_interest || lead.product_interest}
                    </>
                  )}
                </p>
              )}
            </div>

            <div className="mb-4 rounded-xl border border-gray-100 bg-gray-50/80 p-3 dark:border-volt-borderSoft dark:bg-white/5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-volt-muted2">Run details</p>
              <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-2 text-[11px] sm:grid-cols-2">
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-500 dark:text-volt-muted2">LangGraph thread</dt>
                  <dd className="truncate text-right font-medium text-gray-800 dark:text-volt-text" title={lead.thread_id || ""}>
                    {lead.thread_id ? `${lead.thread_id.slice(0, 10)}…` : "Not started"}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-500 dark:text-volt-muted2">Emails sent</dt>
                  <dd className="text-right font-medium text-gray-800 dark:text-volt-text">{lead.emails_sent_count ?? 0}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-500 dark:text-volt-muted2">Completed</dt>
                  <dd className="text-right font-medium text-gray-800 dark:text-volt-text">
                    {lead.workflow_completed
                      ? lead.completed_at
                        ? formatRelativeTime(lead.completed_at) || new Date(lead.completed_at).toLocaleString()
                        : "Yes"
                      : "No"}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-500 dark:text-volt-muted2">Checkpoint node</dt>
                  <dd className="truncate text-right font-medium text-gray-800 dark:text-volt-text">
                    {(workflowState?.current_node || lead?.current_node) || "—"}
                  </dd>
                </div>
                {pendingHitl?.review_status === "Awaiting" && pendingHitl?.gate_type ? (
                  <div className="flex justify-between gap-2 sm:col-span-2">
                    <dt className="text-gray-500 dark:text-volt-muted2">HITL gate</dt>
                    <dd className="text-right font-medium text-gray-800 dark:text-volt-text">
                      {pendingHitl.gate_type} · pending
                    </dd>
                  </div>
                ) : latestHitl?.gate_type ? (
                  <div className="flex justify-between gap-2 sm:col-span-2">
                    <dt className="text-gray-500 dark:text-volt-muted2">HITL gate</dt>
                    <dd className="text-right font-medium text-gray-800 dark:text-volt-text">
                      {latestHitl.gate_type}
                      {latestHitl.review_status ? ` · ${latestHitl.review_status}` : ""}
                    </dd>
                  </div>
                ) : null}
                {threadCtxNote ? (
                  <div className="sm:col-span-2">
                    <p className="text-[11px] font-medium text-amber-800 dark:text-amber-200">{threadCtxNote}</p>
                  </div>
                ) : null}
              </dl>
            </div>

            {lead.thread_id ? (
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 dark:border-indigo-500/20 dark:bg-indigo-500/10">
                <p className="text-xs font-semibold text-indigo-800 dark:text-indigo-200">Pipeline (checkpoint position)</p>
                <p className="mt-1 text-[11px] text-gray-600 dark:text-volt-muted2">
                  Typical nurture chain (S1–S5). S4 dormant revival inserts <span className="font-semibold">A10 · Dormancy</span> before revival steps.
                  {threadCtxLoading ? " Loading checkpoint…" : ""}
                </p>
                {(workflowState?.current_node || lead?.current_node) === "A10_Dormancy" ? (
                  <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-900 dark:bg-amber-500/15 dark:text-amber-100">
                    Active: dormant-revival segment (A10) → G3 campaign gate
                  </p>
                ) : null}
                {handoffContext?.isDormant ? (
                  <div className="mt-2 rounded-lg border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-[11px] leading-snug text-amber-950 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-100">
                    <p className="font-semibold text-amber-950 dark:text-amber-50">Sales handoff (A9) did not run</p>
                    <p className="mt-1 text-amber-900/95 dark:text-amber-100/95">
                      This lead was moved to the <strong>Dormant</strong> pool after the email sequence finished. The graph
                      only routes to A9 when the engagement score reaches the handoff threshold (≤ max emails). Here,
                      score <strong>{handoffContext.score.toFixed(2)}</strong> stayed below threshold{" "}
                      <strong>{handoffContext.threshold.toFixed(2)}</strong>
                      {handoffContext.emailsSent > 0 ? (
                        <>
                          {" "}
                          after <strong>{handoffContext.emailsSent}</strong> send(s).
                        </>
                      ) : (
                        "."
                      )}
                    </p>
                    <p className="mt-2 text-amber-900/90 dark:text-amber-200/90">
                      To pursue handoff again, run <strong>S4 dormant revival</strong> from{" "}
                      <Link className="font-semibold underline hover:text-amber-950 dark:hover:text-white" to="/campaigns">
                        Campaigns
                      </Link>
                      , then complete reviews (G3 → … → G5 as needed).
                    </p>
                  </div>
                ) : null}
                {handoffContext?.isConverted ? (
                  <p className="mt-2 rounded-lg border border-emerald-200/80 bg-emerald-50/80 px-3 py-2 text-[11px] text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100">
                    Journey completed via sales handoff / G4 — this lead is marked <strong>Converted</strong>.
                  </p>
                ) : null}
                <div className="mt-3 space-y-2">
                  {PIPELINE_STAGES.map((stage, idx) => {
                    const state = pipelineStageStates[idx] || "pending";
                    return (
                      <div
                        key={stage.node}
                        className={`flex items-start gap-2 rounded-lg border px-2 py-1.5 text-[11px] ${
                          state === "active"
                            ? "border-sky-300 bg-sky-50 dark:border-sky-500/40 dark:bg-sky-500/10"
                            : state === "completed"
                              ? "border-emerald-100 bg-white dark:border-emerald-500/20 dark:bg-emerald-500/5"
                              : state === "skipped"
                                ? "border-amber-100 bg-amber-50/50 dark:border-amber-500/25 dark:bg-amber-500/5"
                                : "border-gray-100 bg-white/60 opacity-80 dark:border-volt-borderSoft dark:bg-volt-panel"
                        }`}
                      >
                        <StepStateIcon
                          state={
                            state === "completed"
                              ? "completed"
                              : state === "active"
                                ? "active"
                                : state === "skipped"
                                  ? "skipped"
                                  : "pending"
                          }
                        />
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-800 dark:text-volt-text">{stage.title}</p>
                          <p className="text-gray-500 dark:text-volt-muted2">{stage.detail}</p>
                          {state === "skipped" && stage.node === "A9_Handoff" ? (
                            <p className="mt-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-200/90">
                              Not reached — nurture ended (score below threshold or max emails).
                            </p>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-amber-800 dark:text-amber-200">
                No LangGraph thread yet — run batch or start workflow to see pipeline position and gates.
              </p>
            )}

            <div className="mt-6 border-t border-gray-100 pt-4 dark:border-volt-borderSoft">
              <p className="text-xs font-semibold text-indigo-700">Reviews &amp; handoff</p>
              <div className="mt-2 space-y-2">
                <p className="text-[11px] leading-relaxed text-gray-500 dark:text-volt-muted2">
                  <strong className="text-gray-700 dark:text-volt-text">How handoff works:</strong> the graph reaches{" "}
                  <strong>A9 · Sales handoff</strong> only after scoring and gates (often G5 if score is near the threshold).
                  “Force handoff” below applies only when the workflow is paused at{" "}
                  <strong>G5</strong>. Campaign approval is <strong>G3</strong>; sales acceptance after A9 is{" "}
                  <strong>G4</strong> — both open in Reviews.
                </p>
                <p className="text-[11px] text-gray-500 dark:text-volt-muted2">
                  Checkpoint score{" "}
                  <span className="font-semibold text-gray-800 dark:text-volt-text">{cpScoreNum.toFixed(2)}</span>
                  {" · "}
                  Handoff threshold{" "}
                  <span className="font-semibold text-gray-800 dark:text-volt-text">{cpThresholdNum.toFixed(2)}</span>
                  {handoffContext?.belowThreshold && !handoffContext?.isConverted ? (
                    <span className="text-amber-700 dark:text-amber-300">
                      {" "}
                      — below threshold, so routing will not promote to handoff unless a reviewer overrides at G5 or
                      engagement rises.
                    </span>
                  ) : null}
                </p>
                {pendingHitl?.review_status === "Awaiting" && pendingHitl?.gate_type ? (
                  <div className="rounded-lg border border-rose-200/60 bg-rose-50/50 px-2.5 py-2 dark:border-rose-500/25 dark:bg-rose-500/10">
                    <p className="text-[11px] font-semibold text-rose-800 dark:text-rose-200">
                      Pending: gate {pendingHitl.gate_type}
                    </p>
                    <p className="mt-1 text-[11px] text-rose-900/90 dark:text-rose-100/90">
                      {GATE_REVIEW_HINT[pendingHitl.gate_type] ||
                        "Complete this review in the Reviews screen to resume the workflow."}
                    </p>
                    {handoffContext?.isDormant && pendingHitl.gate_type === "G3" ? (
                      <p className="mt-2 text-[11px] font-medium text-amber-900 dark:text-amber-200">
                        Note: this lead is already <strong>Dormant</strong>. Resuming from G3 may fail if the LangGraph run
                        has ended — prefer a fresh revival from Campaigns if approval does not stick.
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {!lead.thread_id ? (
                  <p className="text-[11px] text-amber-800 dark:text-amber-200">No workflow thread yet — run batch / start workflow first.</p>
                ) : null}
                {handoffContext?.isDormant && !(pendingHitl?.review_status === "Awaiting") ? (
                  <p className="text-[11px] text-gray-500 dark:text-volt-muted2">
                    There is no active operator shortcut to A9 while dormant — use{" "}
                    <Link className="font-semibold text-indigo-600 underline dark:text-indigo-300" to="/campaigns">
                      Campaigns
                    </Link>{" "}
                    for revival, then complete Reviews as the workflow requests.
                  </p>
                ) : null}
                {decisionOk ? <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">{decisionOk}</p> : null}
                {decisionErr ? <p className="text-[11px] font-semibold text-rose-700 dark:text-rose-300">{decisionErr}</p> : null}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {pendingHitl?.gate_type && pendingHitl?.review_status === "Awaiting" && pendingHitl.gate_type !== "G5" ? (
                  <Link
                    to={reviewsPath}
                    className="inline-flex h-9 flex-1 min-w-[140px] items-center justify-center rounded-full border border-indigo-200 bg-indigo-50 px-3 text-xs font-semibold text-indigo-800 hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-500/15 dark:text-indigo-100 dark:hover:bg-indigo-500/25"
                  >
                    Open in Reviews
                  </Link>
                ) : null}
                {pendingHitl?.gate_type === "G5" && pendingHitl?.review_status === "Awaiting" ? (
                  <>
                    <button
                      type="button"
                      disabled={decisionBusy || !token}
                      onClick={() => void handleG5Decision("approved")}
                      className="h-9 flex-1 min-w-[120px] rounded-full border border-indigo-600 bg-indigo-600 px-3 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {decisionBusy ? "…" : "Force handoff"}
                    </button>
                    <button
                      type="button"
                      disabled={decisionBusy || !token}
                      onClick={() => void handleG5Decision("hold")}
                      className="h-9 flex-1 min-w-[120px] rounded-full border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 hover:border-indigo-300 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-muted dark:hover:border-volt-border dark:hover:text-white"
                    >
                      Hold nurture
                    </button>
                  </>
                ) : null}
                {lead.thread_id &&
                !(pendingHitl?.review_status === "Awaiting") &&
                !threadCtxLoading &&
                !threadCtxNote &&
                !handoffContext?.isDormant ? (
                  <p className="w-full text-[11px] text-gray-400 dark:text-volt-muted2">
                    No pending HITL for this thread — the workflow may be between steps or finished.
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-100 bg-white p-4 dark:border-volt-borderSoft dark:bg-volt-card/60">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-indigo-700">Recent activity</p>
              <span className="text-[11px] text-gray-400 dark:text-volt-muted2">
                {(workflowState?.current_node || lead.current_node)
                  ? `Now: ${workflowState?.current_node || lead.current_node}`
                  : "—"}
                {executionTimeline.length > executionTimelineRecent.length
                  ? ` · Last ${executionTimelineRecent.length} of ${executionTimeline.length} events`
                  : null}
              </span>
            </div>

            {executionTimelineRecent.length ? (
              <div className="mt-3 max-h-[320px] space-y-2 overflow-auto pr-1">
                {executionTimelineRecent.map((e) => (
                  <div key={e.key} className="rounded-lg border border-gray-100 bg-gray-50/80 p-2.5 dark:border-volt-borderSoft dark:bg-volt-panel/80">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-gray-700 dark:text-volt-text">{e.title}</p>
                        {e.description ? (
                          <p className="mt-0.5 text-[11px] text-gray-500 dark:text-volt-muted2">{e.description}</p>
                        ) : null}
                      </div>
                      <span className="flex-none text-[10px] font-semibold text-gray-400 dark:text-volt-muted2">
                        {formatRelativeTime(e.timestamp) || "—"}
                      </span>
                    </div>
                    {e.badges?.length ? (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {e.badges.map((b) => (
                          <span key={`${e.key}-${b}`} className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-600 dark:bg-white/5 dark:text-volt-muted">
                            {b}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-gray-500 dark:text-volt-muted">
                No execution log yet. Start the workflow or wait for the first agent step.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default LeadDetail;

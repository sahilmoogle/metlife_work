import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { fetchLeadDetail } from "../src/services/leadsApi";
import { downloadBlob, leadDetailToJson } from "../src/utils/exportFile";

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

const chip = {
  Low: "bg-gray-100 text-gray-700",
  Medium: "bg-amber-50 text-amber-700",
  High: "bg-rose-50 text-rose-700",
  Rising: "bg-emerald-50 text-emerald-700",
  Steady: "bg-indigo-50 text-indigo-700",
};

const StepStateIcon = ({ state }) => {
  const base = "flex h-6 w-6 items-center justify-center rounded-full border";
  if (state === "completed") {
    return <div className={`${base} border-emerald-200 bg-emerald-50 text-emerald-700`}>✓</div>;
  }
  if (state === "active") {
    return <div className={`${base} border-sky-200 bg-sky-50 text-sky-700`}>•</div>;
  }
  return <div className={`${base} border-gray-200 bg-gray-50 text-gray-400`}>○</div>;
};

const LeadDetail = () => {
  const { id } = useParams();
  const { token } = useAuth();
  const [decision, setDecision] = useState("continue");
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

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

  const displayName = useMemo(() => {
    if (!lead) return "";
    const parts = [lead.first_name, lead.last_name].filter(Boolean);
    return parts.join(" ").trim() || "Unknown";
  }, [lead]);

  const workflowSteps = useMemo(() => {
    if (!lead) return [];
    const steps = [
      {
        id: "profile",
        title: "Lead profile",
        lines: [
          lead.scenario_id ? `Scenario: ${lead.scenario_id}` : "Scenario not assigned",
          lead.persona_code ? `Persona: ${lead.persona_code}` : "Persona pending",
        ],
        tags: ["Database"],
        state: "completed",
      },
      {
        id: "workflow",
        title: `Workflow — ${lead.workflow_status || "New"}`,
        lines: [
          lead.thread_id ? `Thread: ${lead.thread_id}` : "Workflow not started (no thread yet)",
          `Emails sent: ${lead.emails_sent_count ?? 0}`,
        ],
        tags: lead.thread_id ? ["LangGraph"] : [],
        state: lead.thread_id ? "active" : "pending",
      },
    ];
    if (lead.intent_summary || lead.urgency || lead.product_interest) {
      steps.push({
        id: "ai",
        title: "AI insights (checkpoint)",
        lines: [
          lead.intent_summary ? `Intent: ${lead.intent_summary}` : null,
          lead.urgency ? `Urgency: ${lead.urgency}` : null,
          lead.product_interest ? `Product interest: ${lead.product_interest}` : null,
        ].filter(Boolean),
        tags: ["State"],
        state: "completed",
      });
    }
    return steps;
  }, [lead]);

  const handleExport = () => {
    if (!lead) return;
    const name = `lead-${lead.id}.json`;
    downloadBlob(name, leadDetailToJson(lead), "application/json;charset=utf-8");
  };

  if (notFound) {
    return <Navigate to="/leads" replace />;
  }

  if (loading) {
    return (
      <section className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
        <p className="text-sm text-gray-600">Loading lead…</p>
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="rounded-xl border border-amber-100 bg-amber-50/80 p-4 shadow-sm">
        <p className="text-sm text-amber-900">{loadError}</p>
        <button
          type="button"
          className="mt-2 text-sm font-semibold text-indigo-700 underline"
          onClick={() => setRefreshKey((k) => k + 1)}
        >
          Retry
        </button>
        <div className="mt-3">
          <Link to="/leads" className="text-xs font-semibold text-gray-600 hover:underline">
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
    <section className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Link to="/leads" className="text-xs font-semibold text-indigo-700 hover:underline">
              ← Back
            </Link>
            <span className="text-[11px] font-semibold text-gray-400">/</span>
            <span className="text-xs font-semibold text-gray-500">Lead Details</span>
          </div>
          <p className="mt-1 text-[11px] text-gray-500">Profile, workflow state, and communications</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            className="rounded-full border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-700 shadow-sm hover:border-indigo-300 hover:text-indigo-700"
          >
            Export JSON
          </button>
          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusClass}`}>
            {statusKey}
          </span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[340px_1fr_320px]">
        <div className="rounded-xl border border-gray-100 bg-white p-4">
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
              <p className="truncate text-sm font-semibold text-gray-800">{displayName}</p>
              <p className="truncate text-xs text-gray-400">
                {lead.persona_code || "—"} • age {lead.age ?? "—"}
              </p>
              <p className="truncate text-xs text-gray-400">
                {lead.scenario_id || "No scenario"} • {lead.workflow_status || "New"}
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-gray-50 p-3">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <p className="text-gray-400">Email</p>
              <p className="text-right font-medium text-gray-700">{lead.email || "—"}</p>
              <p className="text-gray-400">Device</p>
              <p className="text-right font-medium text-gray-700">{lead.device_type || "—"}</p>
              <p className="text-gray-400">Scenario</p>
              <p className="text-right font-medium text-gray-700">{lead.scenario_id || "—"}</p>
              <p className="text-gray-400">Persona</p>
              <p className="text-right font-medium text-gray-700">{lead.persona_code || "—"}</p>
              <p className="text-gray-400">Persona confidence</p>
              <p className="text-right font-medium text-gray-700">
                {lead.persona_confidence != null ? lead.persona_confidence.toFixed(2) : "—"}
              </p>
              <p className="text-gray-400">Keigo</p>
              <p className="text-right font-medium text-gray-700">{lead.keigo_level || "—"}</p>
              <p className="text-gray-400">Emails sent</p>
              <p className="text-right font-medium text-gray-700">{lead.emails_sent_count ?? 0}</p>
              <p className="text-gray-400">Thread</p>
              <p className="truncate text-right font-medium text-gray-700" title={lead.thread_id || ""}>
                {lead.thread_id ? `${lead.thread_id.slice(0, 8)}…` : "—"}
              </p>
            </div>
          </div>

          {(lead.ans3 || lead.ans4 || lead.ans5) && (
            <div className="mt-3 rounded-xl border border-gray-100 p-3">
              <p className="text-xs font-semibold text-gray-600">Survey answers</p>
              {lead.ans3 ? (
                <p className="mt-1 text-[11px] text-gray-500">
                  <span className="font-semibold text-gray-700">Q3:</span> {lead.ans3}
                </p>
              ) : null}
              {lead.ans4 ? (
                <p className="mt-1 text-[11px] text-gray-500">
                  <span className="font-semibold text-gray-700">Q4:</span> {lead.ans4}
                </p>
              ) : null}
              {lead.ans5 ? (
                <p className="mt-1 text-[11px] text-gray-500">
                  <span className="font-semibold text-gray-700">Q5:</span> {lead.ans5}
                </p>
              ) : null}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-gray-100 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold text-indigo-700">
              Agent workflow — <span className="text-gray-500">{lead.scenario_id || "—"}</span>
            </p>
            <div className="inline-flex items-center gap-2 rounded-full bg-gray-50 px-3 py-1 text-[11px] font-semibold text-gray-600">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {lead.workflow_status || "New"}
            </div>
          </div>

          <div className="max-h-[640px] space-y-3 overflow-auto pr-1">
            {workflowSteps.map((step) => (
              <div key={step.id} className="rounded-xl border border-gray-100 bg-white p-3">
                <div className="flex items-start gap-3">
                  <StepStateIcon state={step.state} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-gray-700">{step.title}</p>
                    <div className="mt-2 space-y-1 text-xs text-gray-500">
                      {step.lines.map((line, idx) => (
                        <p key={`${step.id}-l-${idx}`}>{line}</p>
                      ))}
                    </div>

                    {step.tags?.length ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {step.tags.map((t) => (
                          <span
                            key={`${step.id}-${t}`}
                            className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <aside className="space-y-3">
          <div className="rounded-xl border border-gray-100 bg-white p-4">
            <p className="text-xs font-semibold text-indigo-700">Urgency</p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${urgencyChip}`}>
                {lead.urgency || "—"}
              </span>
              <span className="text-right text-[11px] text-gray-400">From workflow state when available</span>
            </div>
          </div>

          <div className="rounded-xl border border-gray-100 bg-white p-4">
            <p className="text-xs font-semibold text-indigo-700">Engagement</p>
            <div className="mt-2 flex items-center justify-between">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${chip.Rising}`}>
                Score {(lead.engagement_score ?? 0).toFixed(2)}
              </span>
              <span className="text-[11px] text-gray-400">Stored engagement metric</span>
            </div>
          </div>

          <div className="rounded-xl border border-gray-100 bg-white p-4">
            <p className="text-xs font-semibold text-indigo-700">AI summary</p>
            <p className="mt-2 text-xs text-gray-600">
              {lead.intent_summary || "No intent summary until the workflow produces checkpoint data."}
            </p>
            {lead.product_interest ? (
              <p className="mt-2 text-[11px] font-semibold text-indigo-700">Product: {lead.product_interest}</p>
            ) : null}
          </div>

          <div className="rounded-xl border border-gray-100 bg-white p-4">
            <p className="text-xs font-semibold text-indigo-700">Decision</p>
            <div className="mt-2">
              <p className="text-[11px] text-gray-400">UI only (not wired to backend)</p>
              <p className="mt-0.5 text-xs font-semibold text-indigo-700">Review actions</p>
              <p className="mt-0.5 text-[11px] text-gray-500">Score {(lead.engagement_score ?? 0).toFixed(2)}</p>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDecision("continue")}
                className={`h-9 flex-1 rounded-full border px-3 text-xs font-semibold transition ${
                  decision === "continue"
                    ? "border-indigo-600 bg-indigo-600 text-white"
                    : "border-gray-200 bg-white text-gray-600 hover:border-indigo-300 hover:text-indigo-700"
                }`}
              >
                Force Handoff
              </button>
              <button
                type="button"
                onClick={() => setDecision("hold")}
                className={`h-9 flex-1 rounded-full border px-3 text-xs font-semibold transition ${
                  decision === "hold"
                    ? "border-indigo-600 bg-indigo-600 text-white"
                    : "border-gray-200 bg-white text-gray-600 hover:border-indigo-300 hover:text-indigo-700"
                }`}
              >
                Hold
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-gray-100 bg-white p-4">
            <p className="text-xs font-semibold text-indigo-700">Communications</p>
            <div className="mt-3 max-h-[280px] space-y-3 overflow-auto pr-1">
              {lead.communications?.length ? (
                lead.communications.map((c) => (
                  <div key={c.id} className="rounded-lg bg-gray-50 p-3">
                    <p className="text-xs font-semibold text-gray-800">{c.subject || `Email #${c.email_number ?? "?"}`}</p>
                    {c.body_preview ? <p className="mt-1 text-[11px] text-gray-600">{c.body_preview}</p> : null}
                    <p className="mt-1 text-[11px] text-gray-500">
                      Sent: {c.sent_at || "—"}
                      {c.opened_at ? ` · Opened: ${c.opened_at}` : ""}
                      {c.clicked_at ? ` · Clicked: ${c.clicked_at}` : ""}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-[11px] text-gray-500">No communications recorded yet.</p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
};

export default LeadDetail;

import { useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { findLeadById } from "../src/data/leads";

const badge = {
  Active: "bg-emerald-50 text-emerald-700",
  Pending: "bg-amber-50 text-amber-700",
  HITL: "bg-rose-50 text-rose-700",
  Converted: "bg-indigo-50 text-indigo-700",
  Dormant: "bg-gray-100 text-gray-600",
};

const chip = {
  Low: "bg-gray-100 text-gray-700",
  Medium: "bg-amber-50 text-amber-700",
  High: "bg-rose-50 text-rose-700",
  Rising: "bg-emerald-50 text-emerald-700",
  Steady: "bg-indigo-50 text-indigo-700",
};

const workflowSeed = [
  {
    id: "w1",
    title: "Trigger - Completed",
    lines: [
      "Newsletter Form Submitted",
      "T_YEC_QUOTE_MST record → FastAPI webhook → lead_created → Workflow S1 init",
    ],
    tags: ["Webhook - FastAPI", "T_YEC_QUOTE_MST"],
    state: "completed",
  },
  {
    id: "w2",
    title: "Rule Check - Completed",
    lines: ["OPT_IN Eligibility", "OPT_IN = 0 → Eligible. Proceed."],
    tags: ["Rule - Based"],
    state: "completed",
  },
  {
    id: "w3",
    title: "A3 - Intent Listener - LLM - Pending",
    lines: [
      "Engagement Signal Analysis #2",
      "Email #2 opened + click on product page. Medical confirmed. Urgency=medium.",
    ],
    tags: ["GPT-4 mini - Intent"],
    state: "pending",
  },
  {
    id: "w4",
    title: "A8 - Scoring - Pending",
    lines: ["Score Update: 0.65 → 0.72", "Open +0.05 • Click +0.02 = 0.72. Edge zone (0.70–0.85)."],
    tags: [],
    state: "pending",
  },
  {
    id: "w5",
    title: "LongGraph Decision Node - Pending",
    lines: ["Score Router: Continue / G5 / Handoff", "Score 0.72 → Edge zone. Route to G5 for threshold override."],
    tags: [],
    state: "pending",
  },
];

const StepStateIcon = ({ state }) => {
  const base = "flex h-6 w-6 items-center justify-center rounded-full border";
  if (state === "completed") {
    return <div className={`${base} border-emerald-200 bg-emerald-50 text-emerald-700`}>✓</div>;
  }
  return <div className={`${base} border-gray-200 bg-gray-50 text-gray-400`}>•</div>;
};

const LeadDetail = () => {
  const { id } = useParams();
  const [decision, setDecision] = useState("continue");

  const lead = useMemo(() => findLeadById(id), [id]);

  if (!lead) {
    return <Navigate to="/leads" replace />;
  }

  const scenarioTotal =
    (lead.scenarioBreakdown?.base || 0) +
    (lead.scenarioBreakdown?.email1Open || 0) +
    (lead.scenarioBreakdown?.email1Click || 0) +
    (lead.scenarioBreakdown?.email2Open || 0) +
    (lead.scenarioBreakdown?.email2Click || 0);

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
          <p className="mt-1 text-[11px] text-gray-500">Real-time overview across 7 scenarios</p>
        </div>

        <div className="flex items-center gap-2">
          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${badge[lead.status] || badge.Active}`}>
            {lead.status} — {lead.currentStep}
          </span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[340px_1fr_320px]">
        <div className="rounded-xl border border-gray-100 bg-white p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-indigo-700">Profile</p>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
              Propensity Score: {lead.score.toFixed(2)}
            </span>
          </div>

          <div className="mt-4 flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
              {lead.name
                .split(" ")
                .slice(0, 2)
                .map((s) => s[0])
                .join("")}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-800">{lead.name}</p>
              <p className="truncate text-xs text-gray-400">
                {lead.persona} • {lead.age}M
              </p>
              <p className="truncate text-xs text-gray-400">
                {lead.scenario} • Score: {lead.score.toFixed(2)}
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-gray-50 p-3">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <p className="text-gray-400">Name</p>
              <p className="text-right font-medium text-gray-700">{lead.name}</p>
              <p className="text-gray-400">Age</p>
              <p className="text-right font-medium text-gray-700">{lead.age}</p>
              <p className="text-gray-400">Email</p>
              <p className="text-right font-medium text-gray-700">{lead.email}</p>
              <p className="text-gray-400">Device</p>
              <p className="text-right font-medium text-gray-700">{lead.device}</p>
              <p className="text-gray-400">Scenario</p>
              <p className="text-right font-medium text-gray-700">{lead.scenario}</p>
              <p className="text-gray-400">Persona</p>
              <p className="text-right font-medium text-gray-700">{lead.persona}</p>
              <p className="text-gray-400">Confidence</p>
              <p className="text-right font-medium text-gray-700">{lead.confidence}</p>
              <p className="text-gray-400">Cadence</p>
              <p className="text-right font-medium text-gray-700">{lead.cadence}</p>
              <p className="text-gray-400">Handoff</p>
              <p className="text-right font-medium text-gray-700">≥ {lead.handoff.toFixed(2)}</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-100 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold text-indigo-700">
              Agent Workflow — <span className="text-gray-500">{lead.scenario}</span>
            </p>
            <div className="inline-flex items-center gap-2 rounded-full bg-gray-50 px-3 py-1 text-[11px] font-semibold text-gray-600">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {lead.status} — {lead.currentStep}
            </div>
          </div>

          <div className="max-h-[640px] space-y-3 overflow-auto pr-1">
            {workflowSeed.map((step) => (
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
            <div className="mt-2 flex items-center justify-between">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${chip[lead.urgency] || chip.Medium}`}>
                {lead.urgency}
              </span>
              <span className="text-[11px] text-gray-400">Clicked within 2hrs of delivery</span>
            </div>
          </div>

          <div className="rounded-xl border border-gray-100 bg-white p-4">
            <p className="text-xs font-semibold text-indigo-700">Engagement</p>
            <div className="mt-2 flex items-center justify-between">
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  chip[lead.engagement] || chip.Rising
                }`}
              >
                {lead.engagement}
              </span>
              <span className="text-[11px] text-gray-400">3/3 opened, 2/3 clicked</span>
            </div>
          </div>

          <div className="rounded-xl border border-gray-100 bg-white p-4">
            <p className="text-xs font-semibold text-indigo-700">Scenario</p>
            <div className="mt-3 space-y-2 text-xs">
              <div className="flex items-center justify-between text-gray-500">
                <span>Base Score ({lead.scenario})</span>
                <span className="font-medium text-gray-700">{(lead.scenarioBreakdown?.base || 0).toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-gray-500">
                <span>Email #1 Open</span>
                <span className="font-medium text-gray-700">+{(lead.scenarioBreakdown?.email1Open || 0).toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-gray-500">
                <span>Email #1 Click</span>
                <span className="font-medium text-gray-700">+{(lead.scenarioBreakdown?.email1Click || 0).toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-gray-500">
                <span>Email #2 Open</span>
                <span className="font-medium text-gray-700">+{(lead.scenarioBreakdown?.email2Open || 0).toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-gray-500">
                <span>Email #2 Click</span>
                <span className="font-medium text-gray-700">+{(lead.scenarioBreakdown?.email2Click || 0).toFixed(2)}</span>
              </div>

              <div className="mt-3 rounded-lg bg-gray-50 p-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-gray-500">Current</span>
                  <span className="text-[11px] font-semibold text-gray-700">{lead.device}</span>
                </div>
                <div className="mt-2 h-2 w-full rounded-full bg-gray-200">
                  <div
                    className="h-2 rounded-full bg-indigo-600"
                    style={{ width: `${Math.min(100, Math.max(5, scenarioTotal * 100))}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-100 bg-white p-4">
            <p className="text-xs font-semibold text-indigo-700">Decision</p>
            <div className="mt-2">
              <p className="text-[11px] text-gray-400">Recommendation</p>
              <p className="mt-0.5 text-xs font-semibold text-indigo-700">Continue Nurture</p>
              <p className="mt-0.5 text-[11px] text-gray-500">Score {lead.score.toFixed(2)} in edge zone</p>
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
            <p className="text-xs font-semibold text-indigo-700">Comm History</p>
            <div className="mt-3 space-y-3">
              {lead.commHistory?.map((c, idx) => (
                <div key={`${lead.id}-c-${idx}`} className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs font-semibold text-gray-800">{c.title}</p>
                  <p className="mt-1 text-[11px] text-gray-500">{c.meta}</p>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
};

export default LeadDetail;
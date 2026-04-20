const agentStages = [
  { title: "Identity & Unification Output", done: true },
  { title: "Persona Classifier", done: false },
  { title: "Intent & Topic Output", done: false },
  { title: "Strategy Output", done: false },
  { title: "Content Output", done: false },
  { title: "Orchestration Output", done: false },
];

const processSteps = [
  "Capture incoming user/session data",
  "Assign communication traits",
  "Map to persona model",
  "Calculate confidence",
  "Behavioral validation",
];

const Campaigns = () => {
  return (
    <section className="space-y-3">
      <article className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm sm:p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          {agentStages.map((stage) => (
            <div key={stage.title} className="rounded-xl border border-gray-100 bg-[#fcfdff] p-3">
              <div className="mb-6 h-6 w-6 rounded-md border border-indigo-200 bg-indigo-50" />
              <h3 className="text-sm font-medium text-[#28345f]">{stage.title}</h3>
              <div className="mt-4 h-1.5 rounded-full bg-gray-100">
                <div
                  className={`h-full rounded-full ${stage.done ? "w-3/5 bg-purple-500" : "w-0"}`}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 h-0.5 rounded-full bg-[#2f33b7]" />

        <div className="mt-3">
          <button
            type="button"
            className="rounded-full bg-[#3326c7] px-6 py-2 text-xs font-semibold text-white"
          >
            Start →
          </button>
        </div>
      </article>

      <article className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm sm:p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3">
          <div className="flex items-center gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
              AI
            </span>
            <h3 className="text-sm font-semibold text-[#1f2e55]">Identity & Unification</h3>
          </div>
          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-600">
            Awaiting for Approval
          </span>
        </div>

        <p className="mb-3 text-xs font-semibold text-purple-500">Process Step</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {processSteps.map((step) => (
            <div key={step} className="rounded-lg border border-gray-100 bg-[#fafbfd] px-3 py-2 text-xs text-gray-600">
              {step}
            </div>
          ))}
        </div>
      </article>
    </section>
  );
};

export default Campaigns;
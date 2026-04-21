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

const stats = [
  {
    title: "Total Leads",
    value: "2,847",
    change: "+12.4%",
    icon: "leads",
    chip: "bg-violet-50 text-violet-700 ring-violet-100",
    iconWrap: "bg-violet-50 text-violet-700",
  },
  {
    title: "Active Workflows",
    value: "847",
    change: "+12.4%",
    icon: "workflows",
    chip: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    iconWrap: "bg-emerald-50 text-emerald-700",
  },
  {
    title: "Converted",
    value: "247",
    change: "+15.6%",
    icon: "converted",
    chip: "bg-amber-50 text-amber-700 ring-amber-100",
    iconWrap: "bg-amber-50 text-amber-700",
  },
  {
    title: "Pending HITL",
    value: "11",
    change: "-2%",
    icon: "pending",
    chip: "bg-rose-50 text-rose-700 ring-rose-100",
    iconWrap: "bg-rose-50 text-rose-700",
  },
];

const scenarios = [
  { id: "S1", value: "271", label: "Young Prof" },
  { id: "S2", value: "153", label: "Married" },
  { id: "S3", value: "119", label: "Senior" },
  { id: "S4", value: "85", label: "Dormant" },
  { id: "S5", value: "127", label: "Buyer" },
  { id: "S6", value: "51", label: "F2F" },
  { id: "S7", value: "41", label: "W2C" },
];

const feed = [
  "Mei Fujita - Consultation booked - Score 0.90+",
  "AB - Hana Kimura - Score improved 0.72 -> 0.81",
  "G1 - Ryo Matsuda - New HLTL review assigned",
  "A6 - Koji Tanaka - Email #2 successfully delivered",
  "Mei Fujita - Consultation booked - Score 0.90+",
];

const progressBars = [
  { label: "Total Leads 2,847", value: 100, color: "bg-violet-600", track: "bg-violet-50" },
  { label: "Email Sent 2,050", value: 75, color: "bg-emerald-600", track: "bg-emerald-50" },
  { label: "Engaged 1,368", value: 60, color: "bg-amber-500", track: "bg-amber-50" },
  { label: "High Score 798", value: 38, color: "bg-blue-600", track: "bg-blue-50" },
  { label: "Converted 342", value: 25, color: "bg-fuchsia-600", track: "bg-fuchsia-50" },
];

const Dashboard = () => {
  return (
    <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((item) => (
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
          <p className="mb-4 text-[11px] text-gray-400">Lead Journey Progression</p>
          <div className="space-y-3">
            {progressBars.map((bar) => (
              <div key={bar.label}>
                <div className="mb-1 flex justify-between text-[11px] text-gray-500">
                  <span>{bar.label}</span>
                  <span>{bar.value}%</span>
                </div>
                <div className={`h-2 rounded-full ${bar.track}`}>
                  <div
                    className={`h-full rounded-full ${bar.color}`}
                    style={{ width: `${bar.value}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.03)]">
          <h3 className="text-sm font-semibold text-[#1e2a52]">Scenario Distribution</h3>
          <p className="mb-4 text-[11px] text-gray-400">Active Leads by Scenario</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {scenarios.map((scenario) => (
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
          <span className="text-xs text-gray-400 inline-flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            Real-time
          </span>
        </div>
        <div className="space-y-3">
          {feed.map((item) => (
            <div
              key={item}
              className="flex items-start gap-3 border-b border-gray-100 pb-3 text-sm text-gray-600 last:border-none last:pb-0"
            >
              <span className="mt-1.5 h-2 w-2 rounded-full bg-violet-500" />
              <div className="min-w-0">
                <p className="truncate text-sm text-gray-700">{item}</p>
                <p className="mt-0.5 text-[11px] text-gray-400">S3 • Just now</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
};

export default Dashboard;
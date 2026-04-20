const stats = [
  { title: "Total Leads", value: "2,847", change: "+12.4%", color: "text-purple-600" },
  { title: "Active Workflows", value: "847", change: "+12.4%", color: "text-green-600" },
  { title: "Converted", value: "247", change: "+15.6%", color: "text-amber-600" },
  { title: "Pending HLTL", value: "11", change: "-2%", color: "text-red-600" },
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
  { label: "Total Leads 2,847", value: 100, color: "bg-purple-600" },
  { label: "Email Sent 2,050", value: 75, color: "bg-green-600" },
  { label: "Engaged 1,368", value: 60, color: "bg-amber-500" },
  { label: "High Score 798", value: 38, color: "bg-blue-600" },
  { label: "Converted 342", value: 25, color: "bg-violet-500" },
];

const Dashboard = () => {
  return (
    <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((item) => (
          <article key={item.title} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-start justify-between">
              <p className="text-xs text-gray-500">{item.title}</p>
              <span className={`rounded-full bg-gray-50 px-2 py-0.5 text-[10px] font-semibold ${item.color}`}>
                {item.change}
              </span>
            </div>
            <p className="text-2xl font-semibold text-[#24325f]">{item.value}</p>
          </article>
        ))}
      </section>

      <section className="mt-4 grid gap-3 xl:grid-cols-2">
        <article className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <h3 className="text-base font-semibold text-[#1f3aa5]">Conversion Funnel</h3>
          <p className="mb-4 text-[11px] text-gray-400">Lead Journey Progression</p>
          <div className="space-y-3">
            {progressBars.map((bar) => (
              <div key={bar.label}>
                <div className="mb-1 flex justify-between text-[11px] text-gray-500">
                  <span>{bar.label}</span>
                  <span>{bar.value}%</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100">
                  <div className={`h-full rounded-full ${bar.color}`} style={{ width: `${bar.value}%` }} />
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <h3 className="text-base font-semibold text-[#1f3aa5]">Scenario Distribution</h3>
          <p className="mb-4 text-[11px] text-gray-400">Active Leads by Scenario</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {scenarios.map((scenario) => (
              <div
                key={scenario.id}
                className="flex items-center gap-3 rounded-lg border border-gray-100 bg-[#fcfdff] p-3"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
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

      <section className="mt-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-[#1f3aa5]">Live Activity Feed</h3>
          <span className="text-xs text-gray-400">
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-green-500" />
            Real-time
          </span>
        </div>
        <div className="space-y-3">
          {feed.map((item) => (
            <div
              key={item}
              className="flex items-start gap-3 border-b border-gray-100 pb-3 text-sm text-gray-600 last:border-none last:pb-0"
            >
              <span className="mt-1 h-2 w-2 rounded-full bg-purple-500" />
              <p>{item}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
};

export default Dashboard;
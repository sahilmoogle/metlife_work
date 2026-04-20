const leadFilters = ["All", "Active", "HLTL", "Converted", "Dormant"];
const leadColumns = ["Lead", "Scenario", "Persona", "Score", "Status", "Current Step", "Last Activity"];
const leadFeed = [
  { text: "Mei Fujita - Consultation booked - Score 0.90+", meta: "S3 - Just now" },
  { text: "AB - Hana Kimura - Score improved 0.72 -> 0.81", meta: "S5 - Just now" },
  { text: "G1 - Ryo Matsuda - New HLTL review assigned", meta: "S1 - Just now" },
  { text: "A6 - Koji Tanaka - Email #2 successfully delivered", meta: "S1 - Just now" },
  { text: "Mei Fujita - Consultation booked - Score 0.90+", meta: "S3 - Just now" },
];

const Leads = () => {
  return (
    <section className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {leadFilters.map((filter, index) => (
            <button
              key={filter}
              type="button"
              className={`rounded-full px-4 py-1.5 text-xs font-medium ${
                index === 0 ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {filter}
            </button>
          ))}
        </div>

        <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
          <div className="flex h-9 w-full items-center gap-2 rounded-full border border-gray-200 px-3 text-sm text-gray-400 sm:w-[260px]">
            <span>Q</span>
            <input
              type="text"
              placeholder="Search"
              className="w-full bg-transparent text-sm text-gray-600 outline-none"
            />
          </div>
          <button
            type="button"
            className="rounded-full bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
          >
            Export
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[760px] border-b border-gray-200 pb-2">
          <div className="grid grid-cols-7 gap-3 text-xs font-semibold text-gray-600">
            {leadColumns.map((column) => (
              <span key={column}>{column}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-end text-xs text-gray-500">
        <span className="mr-1 inline-block h-2 w-2 rounded-full bg-green-500" />
        Real-time
      </div>

      <div className="mt-2 space-y-2">
        {leadFeed.map((item, index) => (
          <article
            key={`${item.text}-${index}`}
            className="flex items-start gap-3 rounded-lg border border-gray-100 bg-white px-3 py-2.5"
          >
            <span className="mt-1.5 h-2 w-2 rounded-full bg-purple-500" />
            <div>
              <p className="text-sm text-gray-700">{item.text}</p>
              <p className="text-xs text-gray-400">{item.meta}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};

export default Leads;
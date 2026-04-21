import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

const queueTabs = [
  { key: "pending", label: "Pending" },
  { key: "resolved", label: "Resolved" },
];

const chipStyles = {
  pending: "bg-amber-50 text-amber-700",
  resolved: "bg-emerald-50 text-emerald-700",
};

const reviewSeed = [
  {
    id: "r1",
    state: "pending",
    name: "Kana Suzuki",
    scenario: "S3",
    score: 0.65,
    step: "G1 - Content Compliance Review",
    age: "2min ago",
  },
  {
    id: "r2",
    state: "pending",
    name: "Riku Endo",
    scenario: "S2",
    score: 0.65,
    step: "G4 - Sales Handoff",
    age: "2min ago",
  },
  {
    id: "r3",
    state: "pending",
    name: "Hiroshi Nakamura",
    scenario: "S3",
    score: 0.65,
    step: "G3 - Campaign Approval",
    age: "2min ago",
  },
  {
    id: "r4",
    state: "pending",
    name: "Ayumi Takeshi",
    scenario: "S6",
    score: 0.85,
    step: "G2 - Persona Override",
    age: "2min ago",
  },
  {
    id: "r5",
    state: "resolved",
    name: "Masaki Tanaka",
    scenario: "S1",
    score: 0.72,
    step: "A4 - Content Strategy",
    age: "10min ago",
  },
  {
    id: "r6",
    state: "resolved",
    name: "Mei Fujita",
    scenario: "S3",
    score: 0.91,
    step: "A9 - Project Briefing",
    age: "18min ago",
  },
];

const Reviews = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("pending");

  const counts = useMemo(() => {
    const pending = reviewSeed.filter((r) => r.state === "pending").length;
    const resolved = reviewSeed.filter((r) => r.state === "resolved").length;
    return { pending, resolved };
  }, []);

  const items = useMemo(
    () => reviewSeed.filter((r) => r.state === activeTab),
    [activeTab]
  );

  return (
    <section className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm sm:p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-[#1e2a52]">HITL Review Queue</h3>
        <p className="mt-0.5 text-xs text-gray-500">
          Human-in-the-loop gates awaiting review
        </p>
      </div>

      <div className="mb-3 rounded-lg bg-gray-50 p-2">
        <div className="flex flex-wrap items-center gap-2">
          {queueTabs.map((tab) => {
            const isActive = activeTab === tab.key;
            const count = counts[tab.key];
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  isActive ? "bg-white shadow-sm" : "hover:bg-white/60"
                }`}
              >
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    chipStyles[tab.key]
                  }`}
                >
                  {count} {tab.label.toLowerCase()}
                </span>
                <span className={`${isActive ? "text-gray-900" : "text-gray-600"}`}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        {items.map((item) => (
          <article
            key={item.id}
            className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-[0_1px_0_rgba(0,0,0,0.02)] hover:bg-gray-50/60"
            onClick={() => navigate(`/reviews/${item.id}`)}
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-amber-50">
                <div className="h-4 w-1.5 rounded-full bg-amber-400" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-800">{item.name}</p>
                <p className="truncate text-xs text-gray-400">
                  {item.scenario} • Score: {item.score.toFixed(2)}
                </p>
              </div>
            </div>

            <div className="flex flex-none items-center gap-3">
              <span className="hidden rounded-full bg-indigo-50 px-3 py-1 text-[11px] font-semibold text-indigo-700 sm:inline-flex">
                {item.step}
              </span>
              <span className="text-xs text-gray-400">{item.age}</span>
            </div>
          </article>
        ))}

        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center">
            <p className="text-sm font-medium text-gray-700">No items</p>
            <p className="mt-1 text-xs text-gray-500">
              Nothing in this queue right now.
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
};

export default Reviews;
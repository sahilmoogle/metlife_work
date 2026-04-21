import { Link, Navigate, useParams } from "react-router-dom";
import { getHitlReviewById } from "../src/data/hitlReviews";

const CheckIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
    <path
      d="M20 6 9 17l-5-5"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const PencilIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
    <path
      d="M12 20h9"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
    <path
      d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4L16.5 3.5Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  </svg>
);

const ReviewDetail = () => {
  const { id } = useParams();
  const data = getHitlReviewById(id);

  if (!data) {
    return <Navigate to="/reviews" replace />;
  }

  const { lead, content, compliance } = data;

  return (
    <section className="space-y-3">
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.03)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Link to="/reviews" className="text-xs font-semibold text-indigo-700 hover:underline">
                ← Back
              </Link>
              <span className="text-[11px] font-semibold text-gray-400">/</span>
              <span className="text-xs font-semibold text-gray-500">HITL Review</span>
            </div>
            <h2 className="mt-2 text-sm font-semibold text-[#1e2a52]">{data.gateTitle}</h2>
            <p className="mt-1 text-[11px] text-gray-500">{data.gateSubtitle}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[320px_1fr]">
        <aside className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.03)]">
          <p className="text-xs font-semibold text-[#1e2a52]">Lead Information</p>

          <div className="mt-3 flex items-center gap-3 rounded-xl bg-indigo-50/60 p-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-xs font-bold text-indigo-700 ring-1 ring-indigo-100">
              {lead.initials}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-800">{lead.name}</p>
              <p className="truncate text-xs text-gray-400">{lead.email}</p>
            </div>
            <span className="ml-auto inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
              {lead.scenario}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-gray-100 pt-3 text-xs">
            <div>
              <p className="text-[11px] text-gray-400">Persona</p>
              <p className="mt-1 font-medium text-gray-700">{lead.persona}</p>
            </div>
            <div>
              <p className="text-[11px] text-gray-400">Life Event</p>
              <p className="mt-1 font-medium text-gray-700">{lead.lifeEvent}</p>
            </div>
            <div>
              <p className="text-[11px] text-gray-400">Score</p>
              <p className="mt-1 font-medium text-gray-700">{lead.score.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-[11px] text-gray-400">Emails Sent</p>
              <p className="mt-1 font-medium text-gray-700">{lead.emailsSent}</p>
            </div>
            <div>
              <p className="text-[11px] text-gray-400">Keigo</p>
              <p className="mt-1 font-medium text-gray-700">{lead.keigo}</p>
            </div>
            <div>
              <p className="text-[11px] text-gray-400">Step</p>
              <p className="mt-1 font-medium text-gray-700">{lead.step}</p>
            </div>
            <div className="col-span-2">
              <p className="text-[11px] text-gray-400">Mode</p>
              <p className="mt-1 font-medium text-gray-700">{lead.mode}</p>
            </div>
          </div>
        </aside>

        <article className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.03)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-[#1e2a52]">{content.title}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {content.chips.map((c) => (
                  <span
                    key={c}
                    className="rounded-full bg-indigo-50 px-3 py-1 text-[11px] font-semibold text-indigo-700 ring-1 ring-indigo-100"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>

            <button
              type="button"
              className="inline-flex h-8 items-center gap-2 rounded-full border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-600 hover:border-indigo-200 hover:text-indigo-700"
            >
              <PencilIcon className="h-4 w-4" />
              Edit
            </button>
          </div>

          <div className="mt-3 rounded-xl bg-gray-50 p-4 text-xs text-gray-700">
            <p className="font-semibold text-gray-700">Subject: {content.subject}</p>
            {content.greeting ? <p className="mt-2">{content.greeting}</p> : null}
            <div className="mt-2 space-y-2">
              {content.body.map((line, idx) => (
                <p key={`${data.id}-line-${idx}`}>{line}</p>
              ))}
            </div>
          </div>

          <div className="mt-4 border-t border-gray-100 pt-3">
            <p className="text-xs font-semibold text-[#1e2a52]">Compliance Check</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {compliance.map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2 text-xs text-gray-600"
                >
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
                    <CheckIcon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">{item}</span>
                </div>
              ))}
            </div>

          </div>
        </article>
            <div className="mt-4 flex items-center justify-end">
              <button
                type="button"
                className="inline-flex h-9 items-center gap-2 rounded-full bg-[#0b4aa2] px-5 text-xs font-semibold text-white shadow-[0_10px_25px_rgba(11,74,162,0.18)] transition hover:brightness-110 mr-4"
              >
                Approved & Send <span className="text-sm bg-green">→</span>
              </button>

              <button
                type="button"
                className="inline-flex h-9 items-center gap-2 rounded-full bg-[#0b4aa2] px-5 text-xs font-semibold text-white shadow-[0_10px_25px_rgba(11,74,162,0.18)] transition hover:brightness-110"
              >
                Edit Content  <span className="text-sm">→</span>
              </button>
            </div>
      </div>
    </section>
  );
};

export default ReviewDetail;


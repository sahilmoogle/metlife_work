import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { approveHitl, fetchHitlDetail } from "../src/services/hitlApi";

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
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [editedSubject, setEditedSubject] = useState("");
  const [editedBody, setEditedBody] = useState("");
  const [reviewerNotes, setReviewerNotes] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionOk, setActionOk] = useState("");

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    const run = async () => {
      setLoadError("");
      setNotFound(false);
      setLoading(true);
      try {
        const detail = await fetchHitlDetail(token, id);
        if (!cancelled) {
          setData(detail || null);
          setEditedSubject(detail?.draft_subject || "");
          setEditedBody(detail?.draft_body || "");
        }
      } catch (e) {
        if (cancelled) return;
        if (e.status === 404) {
          setNotFound(true);
          setData(null);
        } else {
          setData(null);
          setLoadError(e.message || "Failed to load HITL item.");
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

  const leadName = useMemo(() => {
    if (!data) return "Unknown";
    return `${data.first_name || ""} ${data.last_name || ""}`.trim() || "Unknown";
  }, [data]);

  const initials = useMemo(() => {
    if (!data) return "?";
    return leadName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0])
      .join("")
      .toUpperCase();
  }, [data, leadName]);

  const gateTitle = useMemo(() => {
    if (!data) return "HITL Review";
    return data.gate_description ? `${data.gate_type} — ${data.gate_description}` : data.gate_type;
  }, [data]);

  const handleDecision = async (action) => {
    if (!id) return;
    setActionOk("");
    setActionError("");
    setActionLoading(true);
    try {
      const body =
        action === "edited"
          ? { action, edited_subject: editedSubject, edited_body: editedBody, reviewer_notes: reviewerNotes }
          : { action, reviewer_notes: reviewerNotes };
      await approveHitl(token, id, body);
      setActionOk(`Saved: ${action}`);
    } catch (e) {
      setActionError(e.message || "Action failed.");
    } finally {
      setActionLoading(false);
    }
  };

  if (notFound) {
    return <Navigate to="/reviews" replace />;
  }

  if (loading) {
    return (
      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.03)] dark:border-white/10 dark:bg-slate-900 dark:shadow-none">
        <p className="text-sm text-gray-600 dark:text-slate-300">Loading review…</p>
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="rounded-2xl border border-amber-100 bg-amber-50/80 p-4 shadow-[0_1px_0_rgba(0,0,0,0.03)] dark:border-amber-500/30 dark:bg-amber-500/10 dark:shadow-none">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-amber-900 dark:text-amber-100">{loadError}</p>
          <button
            type="button"
            className="text-sm font-semibold text-indigo-700 underline"
            onClick={() => setRefreshKey((k) => k + 1)}
          >
            Retry
          </button>
        </div>
        <div className="mt-3">
          <Link to="/reviews" className="text-xs font-semibold text-gray-600 hover:underline dark:text-slate-300">
            ← Back to queue
          </Link>
        </div>
      </section>
    );
  }

  if (!data) {
    return <Navigate to="/reviews" replace />;
  }

  return (
    <section className="space-y-3">
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.03)] dark:border-white/10 dark:bg-slate-900 dark:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Link to="/reviews" className="text-xs font-semibold text-indigo-700 hover:underline">
                ← Back
              </Link>
              <span className="text-[11px] font-semibold text-gray-400">/</span>
              <span className="text-xs font-semibold text-gray-500 dark:text-slate-400">HITL Review</span>
            </div>
            <h2 className="mt-2 text-sm font-semibold text-[#1e2a52] dark:text-white">{gateTitle}</h2>
            <p className="mt-1 text-[11px] text-gray-500 dark:text-slate-400">Thread: {data.thread_id}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[320px_1fr]">
        <aside className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.03)] dark:border-white/10 dark:bg-slate-900 dark:shadow-none">
          <p className="text-xs font-semibold text-[#1e2a52] dark:text-white">Lead Information</p>

          <div className="mt-3 flex items-center gap-3 rounded-xl bg-indigo-50/60 p-3 dark:bg-indigo-500/10">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-xs font-bold text-indigo-700 ring-1 ring-indigo-100 dark:bg-slate-950/40 dark:text-indigo-200 dark:ring-white/10">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-800 dark:text-white">{leadName}</p>
              <p className="truncate text-xs text-gray-400 dark:text-slate-400">Lead ID: {data.lead_id}</p>
            </div>
            <span className="ml-auto inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
              {data.scenario_id || "—"}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-gray-100 pt-3 text-xs dark:border-white/10">
            <div>
              <p className="text-[11px] text-gray-400 dark:text-slate-400">Persona</p>
              <p className="mt-1 font-medium text-gray-700 dark:text-slate-200">{data.suggested_persona || "—"}</p>
            </div>
            <div>
              <p className="text-[11px] text-gray-400 dark:text-slate-400">Life Event</p>
              <p className="mt-1 font-medium text-gray-700 dark:text-slate-200">—</p>
            </div>
            <div>
              <p className="text-[11px] text-gray-400 dark:text-slate-400">Score</p>
              <p className="mt-1 font-medium text-gray-700 dark:text-slate-200">{(data.engagement_score ?? 0).toFixed(2)}</p>
            </div>
            <div>
              <p className="text-[11px] text-gray-400 dark:text-slate-400">Emails Sent</p>
              <p className="mt-1 font-medium text-gray-700 dark:text-slate-200">—</p>
            </div>
            <div>
              <p className="text-[11px] text-gray-400 dark:text-slate-400">Keigo</p>
              <p className="mt-1 font-medium text-gray-700 dark:text-slate-200">—</p>
            </div>
            <div>
              <p className="text-[11px] text-gray-400 dark:text-slate-400">Step</p>
              <p className="mt-1 font-medium text-gray-700 dark:text-slate-200">{data.gate_type}</p>
            </div>
            <div className="col-span-2">
              <p className="text-[11px] text-gray-400 dark:text-slate-400">Mode</p>
              <p className="mt-1 font-medium text-gray-700 dark:text-slate-200">{data.review_status}</p>
            </div>
            {data.persona_confidence != null ? (
              <div className="col-span-2">
                <p className="text-[11px] text-gray-400 dark:text-slate-400">Persona confidence</p>
                <p className="mt-1 font-medium text-gray-700 dark:text-slate-200">{data.persona_confidence.toFixed(2)}</p>
              </div>
            ) : null}
            {data.handoff_briefing ? (
              <div className="col-span-2">
                <p className="text-[11px] text-gray-400 dark:text-slate-400">Handoff briefing</p>
                <p className="mt-1 whitespace-pre-wrap font-medium text-gray-700 dark:text-slate-200">{data.handoff_briefing}</p>
              </div>
            ) : null}
          </div>
        </aside>

        <article className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.03)] dark:border-white/10 dark:bg-slate-900 dark:shadow-none">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-[#1e2a52] dark:text-white">Draft preview</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="rounded-full bg-indigo-50 px-3 py-1 text-[11px] font-semibold text-indigo-700 ring-1 ring-indigo-100">
                  {data.gate_type}
                </span>
                <span className="rounded-full bg-indigo-50 px-3 py-1 text-[11px] font-semibold text-indigo-700 ring-1 ring-indigo-100">
                  {data.review_status}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setEditMode((v) => !v)}
              className="inline-flex h-8 items-center gap-2 rounded-full border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-600 hover:border-indigo-200 hover:text-indigo-700 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-300 dark:hover:border-white/20 dark:hover:text-white"
            >
              <PencilIcon className="h-4 w-4" />
              {editMode ? "Close edit" : "Edit"}
            </button>
          </div>

          <div className="mt-3 rounded-xl bg-gray-50 p-4 text-xs text-gray-700 dark:bg-slate-950/40 dark:text-slate-200">
            {!editMode ? (
              <>
                <p className="font-semibold text-gray-700 dark:text-slate-200">Subject: {data.draft_subject || "—"}</p>
                <div className="mt-2 whitespace-pre-wrap">{data.draft_body || "—"}</div>
              </>
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="text-[11px] font-semibold text-gray-600 dark:text-slate-300">Subject</p>
                  <input
                    value={editedSubject}
                    onChange={(e) => setEditedSubject(e.target.value)}
                    className="mt-1 h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-xs text-gray-800 outline-none focus:border-indigo-300 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-200"
                    placeholder="Edited subject"
                  />
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-gray-600 dark:text-slate-300">Body</p>
                  <textarea
                    value={editedBody}
                    onChange={(e) => setEditedBody(e.target.value)}
                    rows={8}
                    className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-800 outline-none focus:border-indigo-300 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-200"
                    placeholder="Edited body"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 border-t border-gray-100 pt-3 dark:border-white/10">
            <p className="text-xs font-semibold text-[#1e2a52] dark:text-white">Reviewer notes</p>
            <textarea
              value={reviewerNotes}
              onChange={(e) => setReviewerNotes(e.target.value)}
              rows={3}
              className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-800 outline-none focus:border-indigo-300 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-200"
              placeholder="Optional notes for audit trail"
            />

            {actionError ? <p className="mt-2 text-xs font-semibold text-rose-700">{actionError}</p> : null}
            {actionOk ? <p className="mt-2 text-xs font-semibold text-emerald-700">{actionOk}</p> : null}

          </div>
        </article>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          disabled={actionLoading}
          onClick={() => handleDecision("rejected")}
          className="inline-flex h-9 items-center gap-2 rounded-full border border-gray-200 bg-white px-5 text-xs font-semibold text-gray-600 hover:border-rose-200 hover:text-rose-700 disabled:opacity-60 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-300 dark:hover:border-rose-500/40 dark:hover:text-rose-200"
        >
          Reject
        </button>
        <button
          type="button"
          disabled={actionLoading}
          onClick={() => handleDecision("hold")}
          className="inline-flex h-9 items-center gap-2 rounded-full border border-gray-200 bg-white px-5 text-xs font-semibold text-gray-600 hover:border-amber-200 hover:text-amber-700 disabled:opacity-60 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-300 dark:hover:border-amber-500/40 dark:hover:text-amber-200"
        >
          Hold
        </button>
        {editMode ? (
          <button
            type="button"
            disabled={actionLoading}
            onClick={() => handleDecision("edited")}
            className="inline-flex h-9 items-center gap-2 rounded-full bg-[#0b4aa2] px-5 text-xs font-semibold text-white shadow-[0_10px_25px_rgba(11,74,162,0.18)] transition hover:brightness-110 disabled:opacity-60"
          >
            Save Edited & Approve <span className="text-sm">→</span>
          </button>
        ) : (
          <button
            type="button"
            disabled={actionLoading}
            onClick={() => handleDecision("approved")}
            className="inline-flex h-9 items-center gap-2 rounded-full bg-[#0b4aa2] px-5 text-xs font-semibold text-white shadow-[0_10px_25px_rgba(11,74,162,0.18)] transition hover:brightness-110 disabled:opacity-60"
          >
            Approve <span className="text-sm">→</span>
          </button>
        )}
      </div>
    </section>
  );
};

export default ReviewDetail;


import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
  const navigate = useNavigate();
  const { t } = useTranslation();
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
  /** Prevents double-submit while success message is showing / redirect pending. */
  const [decisionLocked, setDecisionLocked] = useState(false);

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
      const okMsg =
        action === "edited" ? t("reviews.detail.successEdited") : t("reviews.detail.successApproved");
      setDecisionLocked(true);
      setActionOk(okMsg);
      window.setTimeout(() => {
        navigate("/reviews", { replace: true });
      }, 1400);
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
      <section className="app-surface-card p-4">
        <p className="text-sm text-gray-600 dark:text-volt-muted">Loading review…</p>
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
            className="text-sm font-semibold text-[#004EB2] underline"
            onClick={() => setRefreshKey((k) => k + 1)}
          >
            Retry
          </button>
        </div>
        <div className="mt-3">
          <Link to="/reviews" className="text-xs font-semibold text-gray-600 hover:underline dark:text-volt-muted">
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
      <div className="app-surface-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Link to="/reviews" className="text-xs font-semibold text-[#004EB2] hover:underline">
                ← Back
              </Link>
              <span className="text-[11px] font-semibold text-gray-400">/</span>
              <span className="text-xs font-semibold text-gray-500 dark:text-volt-muted2">HITL Review</span>
            </div>
            <h2 className="mt-2 text-sm font-semibold text-[#1e2a52] dark:text-white">{gateTitle}</h2>
            <p className="mt-1 text-[11px] text-gray-500 dark:text-volt-muted2">Thread: {data.thread_id}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[320px_1fr]">
        <aside className="app-surface-card p-4">
          <p className="text-xs font-semibold text-[#1e2a52] dark:text-white">Lead Information</p>

          <div className="mt-3 flex items-center gap-3 rounded-xl bg-[#eaf2ff]/70 p-3 dark:bg-indigo-500/10">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-xs font-bold text-[#004EB2] ring-1 ring-[#cfe0ff] dark:bg-volt-card/60 dark:text-indigo-200 dark:ring-volt-borderSoft">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-800 dark:text-white">{leadName}</p>
              <p className="truncate text-xs text-gray-400 dark:text-volt-muted2">Lead ID: {data.lead_id}</p>
            </div>
            <span className="ml-auto inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
              {data.scenario_id || "—"}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-gray-100 pt-3 text-xs dark:border-volt-borderSoft">
            <div>
              <p className="text-[11px] text-gray-400 dark:text-volt-muted2">Persona</p>
              <p className="mt-1 font-medium text-gray-700 dark:text-volt-text">{data.suggested_persona || "—"}</p>
            </div>
            <div>
              <p className="text-[11px] text-gray-400 dark:text-volt-muted2">Life Event</p>
              <p className="mt-1 font-medium text-gray-700 dark:text-volt-text">—</p>
            </div>
            <div>
              <p className="text-[11px] text-gray-400 dark:text-volt-muted2">Score</p>
              <p className="mt-1 font-medium text-gray-700 dark:text-volt-text">{(data.engagement_score ?? 0).toFixed(2)}</p>
            </div>
            <div>
              <p className="text-[11px] text-gray-400 dark:text-volt-muted2">Emails Sent</p>
              <p className="mt-1 font-medium text-gray-700 dark:text-volt-text">—</p>
            </div>
            <div>
              <p className="text-[11px] text-gray-400 dark:text-volt-muted2">Keigo</p>
              <p className="mt-1 font-medium text-gray-700 dark:text-volt-text">—</p>
            </div>
            <div>
              <p className="text-[11px] text-gray-400 dark:text-volt-muted2">Step</p>
              <p className="mt-1 font-medium text-gray-700 dark:text-volt-text">{data.gate_type}</p>
            </div>
            <div className="col-span-2">
              <p className="text-[11px] text-gray-400 dark:text-volt-muted2">
                {t("reviews.detail.fieldReviewStatus")}
              </p>
              <p className="mt-1 font-medium text-gray-700 dark:text-volt-text">{data.review_status}</p>
            </div>
            {data.persona_confidence != null ? (
              <div className="col-span-2">
                <p className="text-[11px] text-gray-400 dark:text-volt-muted2">Persona confidence</p>
                <p className="mt-1 font-medium text-gray-700 dark:text-volt-text">{data.persona_confidence.toFixed(2)}</p>
              </div>
            ) : null}
            {data.handoff_briefing ? (
              <div className="col-span-2">
                <p className="text-[11px] text-gray-400 dark:text-volt-muted2">Handoff briefing</p>
                <p className="mt-1 whitespace-pre-wrap font-medium text-gray-700 dark:text-volt-text">{data.handoff_briefing}</p>
              </div>
            ) : null}
          </div>
        </aside>

        <article className="app-surface-card p-4">
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
              disabled={decisionLocked}
              onClick={() => setEditMode((v) => !v)}
              className="inline-flex h-8 items-center gap-2 rounded-full border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-600 hover:border-indigo-200 hover:text-indigo-700 disabled:opacity-60 dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-muted dark:hover:border-volt-border dark:hover:text-white"
            >
              <PencilIcon className="h-4 w-4" />
              {editMode ? "Close edit" : "Edit"}
            </button>
          </div>

          <div className="mt-3 rounded-xl bg-gray-50 p-4 text-xs text-gray-700 dark:bg-volt-card/60 dark:text-volt-text">
            {!editMode ? (
              <>
                <p className="font-semibold text-gray-700 dark:text-volt-text">Subject: {data.draft_subject || "—"}</p>
                {data.draft_body && data.draft_body.trim().startsWith("<") ? (
                  <div className="mt-2 overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-volt-borderSoft">
                    <iframe
                      title="Email preview"
                      sandbox=""
                      srcDoc={data.draft_body}
                      className="w-full border-0"
                      style={{ minHeight: 420, background: "#fff" }}
                      onLoad={(e) => {
                        const doc = e.target.contentDocument;
                        if (doc?.body) {
                          e.target.style.height = `${doc.body.scrollHeight + 24}px`;
                        }
                      }}
                    />
                  </div>
                ) : (
                  <div className="mt-2 whitespace-pre-wrap">{data.draft_body || "—"}</div>
                )}
              </>
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="text-[11px] font-semibold text-gray-600 dark:text-volt-muted">Subject</p>
                  <input
                    value={editedSubject}
                    onChange={(e) => setEditedSubject(e.target.value)}
                    className="mt-1 h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-xs text-gray-800 outline-none focus:border-indigo-300 dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-text"
                    placeholder="Edited subject"
                  />
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-gray-600 dark:text-volt-muted">Body</p>
                  <textarea
                    value={editedBody}
                    onChange={(e) => setEditedBody(e.target.value)}
                    rows={8}
                    className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-800 outline-none focus:border-indigo-300 dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-text"
                    placeholder="Edited body"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 border-t border-gray-100 pt-3 dark:border-volt-borderSoft">
            <p className="text-xs font-semibold text-[#1e2a52] dark:text-white">Reviewer notes</p>
            <textarea
              value={reviewerNotes}
              onChange={(e) => setReviewerNotes(e.target.value)}
              rows={3}
              className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-800 outline-none focus:border-indigo-300 dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-text"
              placeholder="Optional notes for audit trail"
            />

            {actionError ? <p className="mt-2 text-xs font-semibold text-rose-700">{actionError}</p> : null}
            {actionOk ? (
              <div className="mt-2 space-y-1">
                <p className="text-xs font-semibold text-emerald-700">{actionOk}</p>
                <p className="text-[11px] text-gray-500 dark:text-volt-muted2">{t("reviews.detail.redirecting")}</p>
              </div>
            ) : null}

          </div>
        </article>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {/* <button
          type="button"
          disabled={actionLoading}
          onClick={() => handleDecision("rejected")}
          className="inline-flex h-9 items-center gap-2 rounded-full border border-gray-200 bg-white px-5 text-xs font-semibold text-gray-600 hover:border-rose-200 hover:text-rose-700 disabled:opacity-60 dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-muted dark:hover:border-rose-500/40 dark:hover:text-rose-200"
        >
          Reject
        </button>
        <button
          type="button"
          disabled={actionLoading}
          onClick={() => handleDecision("hold")}
          className="inline-flex h-9 items-center gap-2 rounded-full border border-gray-200 bg-white px-5 text-xs font-semibold text-gray-600 hover:border-amber-200 hover:text-amber-700 disabled:opacity-60 dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-muted dark:hover:border-amber-500/40 dark:hover:text-amber-200"
        >
          Hold
        </button> */}
        {editMode ? (
          <button
            type="button"
            disabled={actionLoading || decisionLocked}
            onClick={() => handleDecision("edited")}
            className="inline-flex h-9 items-center gap-2 rounded-full bg-[#0b4aa2] px-5 text-xs font-semibold text-white shadow-[0_10px_25px_rgba(11,74,162,0.18)] transition hover:brightness-110 disabled:opacity-60"
          >
            Save Edited & Approve <span className="text-sm">→</span>
          </button>
        ) : (
          <button
            type="button"
            disabled={actionLoading || decisionLocked}
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


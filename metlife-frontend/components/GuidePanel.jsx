import { useState } from "react";

const toneStyles = {
  indigo: "border-indigo-100 bg-indigo-50/35 text-indigo-800 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-200",
  amber: "border-amber-100 bg-amber-50/40 text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200",
  gray: "border-gray-100 bg-gray-50/80 text-gray-700 dark:border-volt-borderSoft dark:bg-white/5 dark:text-volt-text",
};

const infoButtonClass =
  "inline-flex h-5 w-5 flex-none items-center justify-center rounded-full border border-gray-200/90 bg-white/90 text-gray-500 transition hover:border-indigo-200 hover:text-indigo-600 dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-muted2 dark:hover:text-indigo-300";

const popoverPanelClass =
  "absolute left-0 top-full z-50 mt-1.5 w-72 max-w-[min(100vw-2rem,18rem)] rounded-2xl border border-gray-100 bg-white p-3 text-left shadow-lg dark:border-volt-borderSoft dark:bg-volt-card";

/**
 * Optional guide block: title + ⓘ (info popover) + optional collapsible body.
 * Use `info` for definitions; do not use long subtitles in the title row.
 */
const GuidePanel = ({
  title,
  children,
  tone = "gray",
  info,
  collapsible = true,
  infoAriaLabel,
}) => {
  const [infoOpen, setInfoOpen] = useState(false);
  const toneClass = toneStyles[tone] || toneStyles.gray;

  const titleRow = (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <span className="truncate font-semibold">{title}</span>
      {info ? (
        <span
          className="relative inline-flex flex-none"
          onClick={(e) => e.preventDefault()}
        >
          <button
            type="button"
            className={infoButtonClass}
            aria-label={infoAriaLabel || `About ${title}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setInfoOpen((v) => !v);
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3" aria-hidden="true">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
              <path
                d="M12 16v-4M12 8h.01"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
          {infoOpen ? (
            <>
              <div
                className="fixed inset-0 z-[45]"
                onClick={() => setInfoOpen(false)}
                aria-hidden="true"
              />
              <div className={popoverPanelClass}>
                <div className="text-[11px] leading-relaxed text-gray-600 dark:text-volt-muted2">
                  {typeof info === "string" ? <p className="m-0">{info}</p> : info}
                </div>
              </div>
            </>
          ) : null}
        </span>
      ) : null}
    </div>
  );

  if (!collapsible) {
    return (
      <div className={`rounded-2xl border ${toneClass} px-4 py-3 text-xs`}>
        <div className="flex items-center justify-between gap-3">{titleRow}</div>
      </div>
    );
  }

  return (
    <details
      className={`group rounded-2xl border ${toneClass}`}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-xs [&::-webkit-details-marker]:hidden">
        {titleRow}
        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/70 text-sm transition group-open:rotate-180 dark:bg-white/10">
          v
        </span>
      </summary>
      {children ? (
        <div className="border-t border-black/5 px-4 py-3 dark:border-white/10">{children}</div>
      ) : null}
    </details>
  );
};

export default GuidePanel;

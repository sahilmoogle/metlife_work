const toneStyles = {
  indigo: "border-indigo-100 bg-indigo-50/35 text-indigo-800 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-200",
  amber: "border-amber-100 bg-amber-50/40 text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200",
  gray: "border-gray-100 bg-gray-50/80 text-gray-700 dark:border-volt-borderSoft dark:bg-white/5 dark:text-volt-text",
};

const GuidePanel = ({ title, subtitle, children, tone = "gray" }) => (
  <details className={`group rounded-2xl border ${toneStyles[tone] || toneStyles.gray}`}>
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-xs font-semibold [&::-webkit-details-marker]:hidden">
      <span>
        {title}
        {subtitle ? (
          <span className="ml-2 font-normal text-gray-500 dark:text-volt-muted2">{subtitle}</span>
        ) : null}
      </span>
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/70 text-sm transition group-open:rotate-180 dark:bg-white/10">
        v
      </span>
    </summary>
    <div className="border-t border-black/5 px-4 py-3 dark:border-white/10">{children}</div>
  </details>
);

export default GuidePanel;

const toneStyles = {
  indigo: "border-indigo-100 bg-indigo-50/35 text-indigo-800 dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-text",
  amber: "border-amber-100 bg-amber-50/40 text-amber-800 dark:border-volt-borderSoft dark:bg-volt-card/60 dark:text-volt-text",
  gray: "border-gray-100 bg-gray-50/80 text-gray-700 dark:border-volt-borderSoft dark:bg-white/5 dark:text-volt-text",
};

const GuidePanel = ({ title, subtitle, children, tone = "gray" }) => (
  <details className={`group rounded-2xl border ${toneStyles[tone] || toneStyles.gray}`}>
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-xs font-semibold transition duration-200 ease-out hover:bg-white/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#004EB2]/35 [&::-webkit-details-marker]:hidden dark:hover:bg-white/[0.06]">
      <span>
        {title}
        {subtitle ? (
          <span className="ml-2 font-normal text-gray-500 dark:text-volt-muted2">{subtitle}</span>
        ) : null}
      </span>
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/70 text-sm transition duration-200 group-open:rotate-180 dark:bg-white/10 dark:text-white/80">
        v
      </span>
    </summary>
    <div className="border-t border-black/5 px-4 py-3 dark:border-white/10">{children}</div>
  </details>
);

export default GuidePanel;

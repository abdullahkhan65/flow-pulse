import clsx from 'clsx';

export function FlowPulseMark({ className }: { className?: string }) {
  return (
    <div
      className={clsx(
        'relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg border border-blue-200 bg-gradient-to-br from-blue-600 via-blue-500 to-sky-500 shadow-[0_8px_18px_rgba(9,30,66,0.3)]',
        className,
      )}
      aria-hidden="true"
    >
      <svg viewBox="0 0 36 36" className="h-7 w-7">
        <path
          d="M7 23c4-5 7-5 11 0 4-5 7-5 11 0"
          fill="none"
          stroke="rgba(255,255,255,0.95)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M7 15c4-5 7-5 11 0 4-5 7-5 11 0"
          fill="none"
          stroke="rgba(255,255,255,0.65)"
          strokeWidth="2.3"
          strokeLinecap="round"
        />
      </svg>
      <span className="pulse-ring absolute inset-1 rounded-lg border border-white/30" />
    </div>
  );
}

export function FlowPulseLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <FlowPulseMark />
      {!compact && (
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-800 [font-family:var(--font-heading)]">FlowPulse</p>
          <p className="truncate text-[11px] uppercase tracking-[0.16em] text-slate-500">Signal Intelligence</p>
        </div>
      )}
    </div>
  );
}

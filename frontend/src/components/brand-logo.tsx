import clsx from 'clsx';

export function FlowPulseMark({ className }: { className?: string }) {
  return (
    <div
      className={clsx(
        'relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg border border-blue-200 bg-gradient-to-br from-[#0055CC] via-[#0C66E4] to-[#4C9AFF] shadow-[0_8px_18px_rgba(9,30,66,0.3)]',
        className,
      )}
      aria-hidden="true"
    >
      <svg viewBox="0 0 36 36" className="h-7 w-7" fill="none">
        <rect x="6" y="7" width="4" height="22" rx="2" fill="rgba(255,255,255,0.9)" />
        <rect x="13" y="12" width="4" height="17" rx="2" fill="rgba(255,255,255,0.82)" />
        <rect x="20" y="16" width="4" height="13" rx="2" fill="rgba(255,255,255,0.72)" />
        <path d="M7 23C11 19 14 19 18 23C22 19 25 19 29 23" stroke="white" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
      <span className="pulse-ring absolute inset-1 rounded-md border border-white/30" />
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
          <p className="truncate text-[11px] uppercase tracking-[0.16em] text-slate-500">Team Signal Intelligence</p>
        </div>
      )}
    </div>
  );
}

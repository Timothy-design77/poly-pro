import type { ReactNode } from 'react';

/** Selectable project row: the main area activates the project, an optional trailing control edits it. */
export function ProjectCard({ active, disabled, onSelect, leading, title, details, trailing, label }: {
  active: boolean;
  disabled?: boolean;
  onSelect: () => void;
  leading: ReactNode;
  title: string;
  details: ReactNode;
  trailing?: ReactNode;
  /** Accessible name for the select button. */
  label?: string;
}) {
  return (
    <div className={`flex min-h-[76px] items-center gap-2 rounded-2xl border bg-bg-surface pr-2 ${active ? 'border-accent shadow-[inset_0_0_0_1px_var(--accent)]' : 'border-border-subtle'}`}>
      <button type="button" disabled={disabled} onClick={onSelect} aria-current={active ? 'true' : undefined} aria-label={label}
        className="flex min-h-[76px] min-w-0 flex-1 items-center gap-3 rounded-2xl py-3 pl-4 text-left touch-manipulation">
        <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-bg-primary text-xl text-text-secondary">{leading}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-text-primary">{title}</span>
          <span className="mt-0.5 block text-xs text-text-secondary">{details}</span>
        </span>
        {active && <span className="shrink-0 rounded-pill bg-accent px-2 py-0.5 text-xs font-semibold text-[var(--text-on-accent)]">Active</span>}
      </button>
      {trailing}
    </div>
  );
}

/** Small trend line of recent scores (decorative; the numbers are in the label). */
export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 46 + 1},${22 - (value / 100) * 20}`).join(' ');
  return (
    <svg aria-hidden="true" width="48" height="24" viewBox="0 0 48 24" className="shrink-0 text-success">
      <polyline fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" points={points} />
      <circle cx={47} cy={22 - (values[values.length - 1] / 100) * 20} r="2" fill="currentColor" />
    </svg>
  );
}

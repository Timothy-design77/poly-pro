import type { ReactNode } from 'react';

/** Circular progress with content in the middle. Exposed as a progressbar. */
export function ProgressRing({ value, max, label, done = false, size = 136, children }: {
  value: number;
  max: number;
  label: string;
  done?: boolean;
  size?: number;
  children?: ReactNode;
}) {
  const r = 56;
  const circumference = 2 * Math.PI * r;
  const fraction = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.min(value, max)}
      className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg aria-hidden="true" className="absolute inset-0 -rotate-90" viewBox="0 0 128 128" width={size} height={size}>
        <circle cx="64" cy="64" r={r} fill="none" stroke="var(--bg-raised)" strokeWidth="6" />
        <circle cx="64" cy="64" r={r} fill="none" stroke={done ? 'var(--success)' : 'var(--accent)'} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={`${fraction * circumference} ${circumference}`} style={{ transition: 'stroke-dasharray 0.2s' }} />
      </svg>
      <div className="relative text-center">{children}</div>
    </div>
  );
}

/** Indeterminate activity indicator with a visible label. */
export function Spinner({ label }: { label: string }) {
  return (
    <div role="status" className="flex flex-col items-center gap-3 text-sm text-text-secondary">
      <span aria-hidden="true" className="h-8 w-8 rounded-full border-2 border-bg-raised border-t-accent animate-spin" />
      {label}
    </div>
  );
}

/** Step indicator: done steps carry pass/fail, the current step is outlined. */
export function StepDots({ total, current, results, label }: { total: number; current: number; results: (boolean | undefined)[]; label: string }) {
  return (
    <ol aria-label={label} className="flex justify-center gap-2">
      {Array.from({ length: total }, (_, index) => {
        const result = results[index];
        const state = result === true ? 'passed' : result === false ? 'needs attention' : index === current ? 'current' : 'not started';
        const tone = result === true ? 'bg-success' : result === false ? 'bg-danger' : index === current ? 'bg-accent' : 'bg-bg-raised shadow-[inset_0_0_0_1px_var(--border-emphasis)]';
        return <li key={index} aria-label={`Test ${index + 1}: ${state}`} aria-current={index === current ? 'step' : undefined} className={`h-2.5 w-2.5 rounded-full ${tone} ${index === current ? 'scale-125' : ''}`} />;
      })}
    </ol>
  );
}

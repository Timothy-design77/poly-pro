import type { ReactNode } from 'react';
import { HelpTip } from '../../ui/HelpTip';

/** Labelled metric: name (with optional help), value, and a short interpretation. */
export function StatRow({ label, value, sub, help }: { label: string; value: string; sub?: string; help?: string }) {
  return (
    <div role="group" aria-label={label} className="py-2">
      <p className="flex items-center gap-2 text-xs text-text-secondary">{label}{help && <HelpTip text={help} />}</p>
      <p className="mt-0.5 text-base font-semibold tabular-nums text-text-primary">{value}</p>
      {sub && <p className="text-xs text-text-muted">{sub}</p>}
    </div>
  );
}

/** Titled surface holding a two-column grid of StatRows. */
export function StatSection({ title, help, children }: { title: string; help?: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="ui-surface px-4 py-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary">{title}{help && <HelpTip text={help} />}</h3>
      <div className="mt-1 grid grid-cols-2 gap-x-4">{children}</div>
    </section>
  );
}

export function ProgressPage() {
  return (
    <div className="h-full flex flex-col px-4 py-4">
      {/* Project identity */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-base">🥁</span>
        <div>
          <p className="text-sm font-semibold text-text-primary">My First Project</p>
          <p className="text-xs text-text-muted font-mono">80 → 120 BPM</p>
        </div>
      </div>

      {/* Hero chart placeholder */}
      <div className="bg-bg-surface rounded-md border border-border-subtle p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-text-secondary">Accuracy</span>
          <span className="text-xs text-text-muted">BPM</span>
        </div>
        <div className="h-32 flex items-end justify-center">
          <p className="text-text-muted text-xs text-center">
            Complete a recorded session<br />to see your stats
          </p>
        </div>
      </div>

      {/* Heatmap + stats placeholder */}
      <div className="flex gap-3 mb-4">
        <div className="flex-1 bg-bg-surface rounded-md border border-border-subtle p-3">
          <p className="text-[10px] text-text-muted uppercase tracking-wider mb-2">Consistency</p>
          <div className="grid grid-cols-7 gap-[2px]">
            {Array.from({ length: 28 }).map((_, i) => (
              <div
                key={i}
                className="aspect-square rounded-[2px] bg-bg-raised"
              />
            ))}
          </div>
        </div>
        <div className="flex-1 flex flex-col gap-2">
          {[
            { label: 'Total Time', value: '—' },
            { label: 'Sessions', value: '0' },
            { label: 'Streak', value: '0 days' },
          ].map(({ label, value }) => (
            <div key={label} className="bg-bg-surface rounded-md border border-border-subtle p-2">
              <p className="text-[10px] text-text-muted">{label}</p>
              <p className="text-sm font-mono text-text-primary">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Sessions list */}
      <div>
        <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">
          Sessions
        </h3>
        <div className="flex items-center justify-center py-8">
          <p className="text-sm text-text-muted">No sessions yet</p>
        </div>
      </div>
    </div>
  );
}

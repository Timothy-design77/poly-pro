export function ProgressPage() {
  return (
    <div className="h-full flex flex-col px-4 py-4 overflow-y-auto">
      {/* Project identity */}
      <div className="flex items-center gap-2 mb-4 shrink-0">
        <span className="text-base">🥁</span>
        <div>
          <p className="text-sm font-semibold text-text-primary">My First Project</p>
          <p className="text-[11px] text-text-muted font-mono">80 → 120 BPM</p>
        </div>
      </div>

      {/* Hero chart placeholder */}
      <div className="bg-bg-surface rounded-[10px] border border-border-subtle p-4 mb-3 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-text-secondary">Accuracy</span>
          <span className="text-xs text-text-muted cursor-pointer">BPM</span>
        </div>
        <div className="h-32 flex items-end justify-center">
          <p className="text-text-muted text-xs text-center leading-relaxed">
            Complete a recorded session<br />to see your stats
          </p>
        </div>
      </div>

      {/* Stats strip: heatmap + stat rows */}
      <div className="flex gap-2.5 mb-3 shrink-0">
        {/* Heatmap */}
        <div className="flex-1 bg-bg-surface rounded-[10px] border border-border-subtle p-3">
          <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-2">
            Consistency
          </p>
          <div className="grid grid-cols-7 gap-[2px]">
            {Array.from({ length: 28 }).map((_, i) => (
              <div
                key={i}
                className="aspect-square rounded-[2px] bg-bg-raised"
              />
            ))}
          </div>
        </div>

        {/* Stat rows */}
        <div className="flex-1 flex flex-col gap-1.5">
          {[
            { label: 'Total Time', value: '—' },
            { label: 'Sessions', value: '0' },
            { label: 'Best Tempo', value: '—' },
            { label: 'Streak', value: '0 days' },
          ].map(({ label, value }) => (
            <div key={label} className="bg-bg-surface rounded-[8px] border border-border-subtle px-2.5 py-1.5">
              <p className="text-[9px] text-text-muted font-medium">{label}</p>
              <p className="text-sm font-mono font-semibold text-text-primary">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* BPM progress bar */}
      <div className="bg-bg-surface rounded-[10px] border border-border-subtle p-3 mb-3 shrink-0">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] text-text-muted font-medium">BPM Progress</span>
          <span className="text-[11px] font-mono text-text-secondary">80 / 120</span>
        </div>
        <div className="h-2 bg-bg-raised rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-[rgba(255,255,255,0.15)]" style={{ width: '0%' }} />
        </div>
      </div>

      {/* Milestones */}
      <div className="mb-3 shrink-0">
        <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-2">
          Milestones
        </p>
        <div className="flex items-center justify-center py-4">
          <p className="text-xs text-text-muted">Start practicing to earn milestones</p>
        </div>
      </div>

      {/* Sessions list */}
      <div>
        <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">
          Sessions
        </h3>
        <div className="flex items-center justify-center py-6">
          <p className="text-xs text-text-muted">No sessions yet</p>
        </div>
      </div>
    </div>
  );
}

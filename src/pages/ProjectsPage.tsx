export function ProjectsPage() {
  return (
    <div className="h-full flex flex-col px-4 py-4">
      <h1 className="text-lg font-semibold text-text-primary mb-1">Projects</h1>
      <p className="text-xs text-text-secondary mb-6">Tap to switch</p>

      {/* Default project card */}
      <div className="bg-bg-surface rounded-md border border-border-subtle p-3 flex items-center gap-3
                      border-l-[3px] border-l-[rgba(255,255,255,0.85)] bg-bg-raised">
        <span className="text-xl">🥁</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text-primary truncate">My First Project</p>
          <p className="text-xs text-text-muted mt-0.5">Just created</p>
          <p className="text-xs font-mono text-text-secondary mt-0.5">80 → 120</p>
        </div>
        <div className="w-12 h-6 bg-bg-primary rounded-sm" />
      </div>

      <div className="flex-1" />

      {/* New project button */}
      <button className="w-full py-3 rounded-md border border-dashed border-border-subtle
                         text-text-secondary text-sm font-medium
                         active:bg-bg-raised transition-colors min-h-[44px]">
        + New Project
      </button>
    </div>
  );
}

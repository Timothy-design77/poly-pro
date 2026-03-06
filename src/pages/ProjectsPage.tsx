export function ProjectsPage() {
  // Placeholder projects — will be replaced with Zustand store data in P3
  const projects = [
    {
      emoji: '🥁',
      name: 'My First Project',
      lastPracticed: 'Just created',
      goalStart: 80,
      goalEnd: 120,
      active: true,
      trend: [62, 65, 70, 68, 75, 78, 82, 85, 87],
    },
  ];

  return (
    <div className="h-full flex flex-col px-4 py-4">
      <h1 className="text-lg font-semibold text-text-primary mb-1">Projects</h1>
      <p className="text-xs text-text-secondary mb-4">Tap to switch · long-press to edit</p>

      {/* Project cards */}
      <div className="flex flex-col gap-1.5">
        {projects.map((project, i) => (
          <div
            key={i}
            className={`rounded-[10px] border p-3 flex items-center gap-3 cursor-pointer
                        transition-all active:scale-[0.98]
              ${project.active
                ? 'bg-bg-raised border-border-subtle border-l-[3px] border-l-[rgba(255,255,255,0.5)]'
                : 'bg-bg-surface border-border-subtle'
              }`}
          >
            {/* Emoji */}
            <span className="text-xl shrink-0">{project.emoji}</span>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-text-primary truncate">
                {project.name}
              </p>
              <p className="text-[11px] text-text-muted mt-0.5">
                {project.lastPracticed}
              </p>
              <p className="text-[11px] font-mono text-text-secondary mt-0.5">
                {project.goalStart} → {project.goalEnd}
              </p>
            </div>

            {/* Sparkline placeholder */}
            <div className="w-12 h-6 shrink-0">
              <svg width="48" height="24" viewBox="0 0 48 24">
                <polyline
                  fill="none"
                  stroke="rgba(74,222,128,0.4)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={project.trend
                    .map((v, j) => {
                      const x = (j / (project.trend.length - 1)) * 46 + 1;
                      const y = 22 - ((v - 50) / 50) * 20;
                      return `${x},${y}`;
                    })
                    .join(' ')}
                />
                {/* End dot */}
                <circle
                  cx={(project.trend.length - 1) / (project.trend.length - 1) * 46 + 1}
                  cy={22 - ((project.trend[project.trend.length - 1] - 50) / 50) * 20}
                  r="2"
                  fill="rgba(74,222,128,0.6)"
                />
              </svg>
            </div>
          </div>
        ))}
      </div>

      <div className="flex-1" />

      {/* New project button */}
      <button className="w-full py-3 rounded-[10px] border border-dashed border-border-subtle
                         text-text-secondary text-sm font-medium
                         active:bg-bg-raised transition-colors min-h-[44px]">
        + New Project
      </button>
    </div>
  );
}

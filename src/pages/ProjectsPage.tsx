import { useState } from 'react';
import { useProjectStore } from '../store/project-store';
import { useSessionStore } from '../store/session-store';
import { ProjectCreateSheet } from '../components/projects/ProjectCreateSheet';
import { Modal } from '../components/ui/Modal';
import { HelpTip } from '../components/ui/HelpTip';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

export function ProjectsPage() {
  const projects = useProjectStore((s) => s.projects);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const setActiveProject = useProjectStore((s) => s.setActiveProject);
  const createProject = useProjectStore((s) => s.createProject);
  const updateProject = useProjectStore((s) => s.updateProject);
  const deleteProject = useProjectStore((s) => s.deleteProject);
  const sessions = useSessionStore((s) => s.sessions);
  const getSessionsForProject = useSessionStore((s) => s.getSessionsForProject);

  const [showCreate, setShowCreate] = useState(false);
  const [editingProject, setEditingProject] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const editProject = projects.find((project) => project.id === editingProject);
  const deleteTargetProject = projects.find((project) => project.id === deleteTarget);
  const quickStartSessions = sessions.filter((session) => session.projectId === null);

  return (
    <div className="h-full flex flex-col px-4 py-4 overflow-y-auto bg-bg-primary">
      <div className="w-full max-w-xl mx-auto flex flex-col min-h-full">
        <h1 className="text-lg font-semibold text-text-primary mb-1 flex items-center gap-2">
          Projects
          <HelpTip text="Use Quick Start for untracked practice, or select a project to restore its saved metronome setup and track progress toward a BPM goal." />
        </h1>
        <p className="text-xs text-text-secondary mb-4">Tap a project to make it active. Use Edit for project settings.</p>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setActiveProject(null)}
            aria-current={activeProjectId === null ? 'true' : undefined}
            className={`w-full rounded-xl border p-3.5 flex items-center gap-3 text-left
                        touch-manipulation select-none min-h-[72px] transition-colors
              ${activeProjectId === null
                ? 'bg-bg-surface border-border-emphasis border-l-[4px] border-l-accent'
                : 'bg-bg-surface border-border-subtle active:bg-bg-raised'
              }`}
          >
            <span className="text-2xl shrink-0" aria-hidden="true">⚡</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-text-primary">Quick Start</p>
              <p className="text-[11px] text-text-muted mt-0.5">
                Practice without a project · {quickStartSessions.length} session{quickStartSessions.length === 1 ? '' : 's'}
              </p>
            </div>
            {activeProjectId === null && (
              <span className="text-[10px] font-bold uppercase tracking-wider text-text-primary bg-accent-dim rounded-pill px-2 py-1">
                Active
              </span>
            )}
          </button>

          {projects.map((project) => {
            const isActive = project.id === activeProjectId;
            const projectSessions = getSessionsForProject(project.id);
            const sessionCount = projectSessions.length;
            const sparkData = projectSessions.length >= 2
              ? projectSessions.slice(0, 10).reverse().map((session) => session.perfectPct)
              : [0];

            return (
              <div
                key={project.id}
                className={`rounded-xl border p-3.5 flex items-center gap-3 min-h-[76px]
                  ${isActive
                    ? 'bg-bg-surface border-border-emphasis border-l-[4px] border-l-accent'
                    : 'bg-bg-surface border-border-subtle'
                  }`}
              >
                <button
                  type="button"
                  onClick={() => setActiveProject(project.id)}
                  className="flex flex-1 min-w-0 items-center gap-3 text-left touch-manipulation select-none"
                  aria-current={isActive ? 'true' : undefined}
                >
                  <span className="text-xl shrink-0">{project.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-text-primary truncate">{project.name}</p>
                    <p className="text-[11px] text-text-muted mt-0.5">
                      {sessionCount > 0 ? timeAgo(project.lastOpened) : 'No sessions'}
                    </p>
                    <p className="text-[11px] font-mono text-text-secondary mt-0.5">
                      {project.currentBpm} / {project.goalBpm} BPM
                    </p>
                  </div>

                  {sparkData.length > 1 && (
                    <div className="w-12 h-6 shrink-0" aria-hidden="true">
                      <svg width="48" height="24" viewBox="0 0 48 24">
                        <polyline
                          fill="none"
                          stroke="rgba(24,122,59,0.55)"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          points={sparkData
                            .map((value, index) => {
                              const x = (index / (sparkData.length - 1)) * 46 + 1;
                              const y = 22 - (value / 100) * 20;
                              return `${x},${y}`;
                            })
                            .join(' ')}
                        />
                        <circle
                          cx={47}
                          cy={22 - (sparkData[sparkData.length - 1] / 100) * 20}
                          r="2"
                          fill="rgba(24,122,59,0.8)"
                        />
                      </svg>
                    </div>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setEditingProject(project.id)}
                  className="shrink-0 min-h-[44px] min-w-[52px] rounded-lg border border-border-subtle
                             bg-bg-primary px-2 text-[11px] font-semibold text-text-secondary active:bg-bg-raised"
                  aria-label={`Edit ${project.name}`}
                >
                  Edit
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex-1 min-h-4" />

        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="w-full py-3 rounded-xl border-[1.5px] border-dashed border-border-emphasis
                     bg-bg-surface text-text-primary text-sm font-semibold
                     active:bg-bg-raised transition-colors min-h-[50px] mt-3 touch-manipulation"
        >
          + New Project
        </button>

        <ProjectCreateSheet
          isOpen={showCreate}
          onClose={() => setShowCreate(false)}
          onSubmit={async (data) => {
            await createProject({ ...data, presetId: null });
          }}
        />

        <ProjectCreateSheet
          isOpen={!!editingProject}
          onClose={() => setEditingProject(null)}
          isEdit
          initial={editProject ? {
            icon: editProject.icon,
            name: editProject.name,
            startBpm: editProject.startBpm,
            goalBpm: editProject.goalBpm,
            accuracyTarget: editProject.accuracyTarget,
            autoAdvance: editProject.autoAdvance,
            advanceAfterN: editProject.advanceAfterN,
            bpmStep: editProject.bpmStep,
          } : undefined}
          onSubmit={async (data) => {
            if (editingProject) await updateProject(editingProject, data);
          }}
          onDelete={editingProject && editingProject !== activeProjectId
            ? () => setDeleteTarget(editingProject)
            : undefined}
        />

        <Modal
          isOpen={!!deleteTarget}
          onClose={() => { setDeleteTarget(null); setEditingProject(null); }}
          title={`Delete ${deleteTargetProject?.name || 'project'}?`}
          confirmLabel="Delete"
          confirmDanger
          onConfirm={() => {
            if (deleteTarget) {
              deleteProject(deleteTarget);
              setEditingProject(null);
            }
          }}
        >
          This will permanently remove this project.
          {deleteTargetProject && ` (${getSessionsForProject(deleteTargetProject.id).length} sessions)`}
        </Modal>
      </div>
    </div>
  );
}

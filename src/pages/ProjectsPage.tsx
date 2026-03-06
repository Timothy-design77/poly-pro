import { useState, useRef, useCallback } from 'react';
import { useProjectStore } from '../store/project-store';
import { useSessionStore } from '../store/session-store';
import { ProjectCreateSheet } from '../components/projects/ProjectCreateSheet';
import { Modal } from '../components/ui/Modal';

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
  const getSessionsForProject = useSessionStore((s) => s.getSessionsForProject);

  const [showCreate, setShowCreate] = useState(false);
  const [editingProject, setEditingProject] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [swipedId, setSwipedId] = useState<string | null>(null);

  // Long-press for edit
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>();
  const didLongPress = useRef(false);

  const handlePointerDown = useCallback((id: string) => {
    didLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      setEditingProject(id);
    }, 600);
  }, []);

  const handlePointerUp = useCallback((id: string) => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    if (!didLongPress.current) {
      setActiveProject(id);
      setSwipedId(null);
    }
  }, [setActiveProject]);

  const handlePointerLeave = useCallback(() => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  }, []);

  // Swipe to delete
  const touchStartX = useRef(0);
  const handleTouchStart = useCallback((e: React.TouchEvent, id: string) => {
    touchStartX.current = e.touches[0].clientX;
    if (swipedId && swipedId !== id) setSwipedId(null);
  }, [swipedId]);

  const handleTouchEnd = useCallback((e: React.TouchEvent, id: string) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (dx < -60) {
      setSwipedId(id);
    } else if (dx > 30 && swipedId === id) {
      setSwipedId(null);
    }
  }, [swipedId]);

  const editProject = projects.find((p) => p.id === editingProject);
  const deleteTargetProject = projects.find((p) => p.id === deleteTarget);

  return (
    <div className="h-full flex flex-col px-4 py-4 overflow-y-auto">
      <h1 className="text-lg font-semibold text-text-primary mb-1">Projects</h1>
      <p className="text-xs text-text-secondary mb-4">Tap to switch · hold to edit · swipe to delete</p>

      {/* Project cards */}
      <div className="flex flex-col gap-1.5">
        {projects.map((project) => {
          const isActive = project.id === activeProjectId;
          const isSwiped = swipedId === project.id;
          const sessions = getSessionsForProject(project.id);
          const sessionCount = sessions.length;

          // Simple sparkline from session data (or flat line if no sessions)
          const sparkData = sessions.length >= 2
            ? sessions.slice(0, 10).reverse().map((s) => s.perfectPct)
            : [0];

          return (
            <div key={project.id} className="relative overflow-hidden rounded-[10px]">
              {/* Delete button (behind card) */}
              {isSwiped && (
                <button
                  onClick={() => {
                    if (isActive) return;
                    setDeleteTarget(project.id);
                    setSwipedId(null);
                  }}
                  className={`absolute right-0 top-0 bottom-0 w-[80px] flex items-center justify-center
                    text-sm font-bold rounded-r-[10px]
                    ${isActive ? 'bg-bg-raised text-text-muted' : 'bg-danger text-white'}`}
                >
                  {isActive ? 'Active' : 'Delete'}
                </button>
              )}

              {/* Card */}
              <div
                onPointerDown={(e) => { e.preventDefault(); handlePointerDown(project.id); }}
                onPointerUp={() => handlePointerUp(project.id)}
                onPointerLeave={handlePointerLeave}
                onPointerCancel={handlePointerLeave}
                onTouchStart={(e) => handleTouchStart(e, project.id)}
                onTouchEnd={(e) => handleTouchEnd(e, project.id)}
                className={`rounded-[10px] border p-3 flex items-center gap-3
                  transition-transform touch-manipulation select-none
                  ${isSwiped ? '-translate-x-[80px]' : ''}
                  ${isActive
                    ? 'bg-bg-raised border-border-subtle border-l-[3px] border-l-[rgba(255,255,255,0.5)]'
                    : 'bg-bg-surface border-border-subtle'
                  }`}
              >
                <span className="text-xl shrink-0">{project.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text-primary truncate">{project.name}</p>
                  <p className="text-[11px] text-text-muted mt-0.5">
                    {sessionCount > 0 ? timeAgo(project.lastOpened) : 'No sessions'}
                  </p>
                  <p className="text-[11px] font-mono text-text-secondary mt-0.5">
                    {project.startBpm} → {project.goalBpm}
                  </p>
                </div>

                {/* Sparkline */}
                {sparkData.length > 1 && (
                  <div className="w-12 h-6 shrink-0">
                    <svg width="48" height="24" viewBox="0 0 48 24">
                      <polyline
                        fill="none"
                        stroke="rgba(74,222,128,0.4)"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        points={sparkData
                          .map((v, j) => {
                            const x = (j / (sparkData.length - 1)) * 46 + 1;
                            const y = 22 - (v / 100) * 20;
                            return `${x},${y}`;
                          })
                          .join(' ')}
                      />
                      <circle
                        cx={47}
                        cy={22 - (sparkData[sparkData.length - 1] / 100) * 20}
                        r="2"
                        fill="rgba(74,222,128,0.6)"
                      />
                    </svg>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex-1" />

      {/* New project button */}
      <button
        onClick={() => setShowCreate(true)}
        className="w-full py-3 rounded-[10px] border border-dashed border-border-subtle
                   text-text-secondary text-sm font-medium
                   active:bg-bg-raised transition-colors min-h-[44px] mt-3 touch-manipulation"
      >
        + New Project
      </button>

      {/* Create sheet */}
      <ProjectCreateSheet
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        onSubmit={async (data) => {
          await createProject({
            ...data,
            presetId: null,
          });
        }}
      />

      {/* Edit sheet */}
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
          if (editingProject) {
            await updateProject(editingProject, data);
          }
        }}
      />

      {/* Delete confirmation */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={`Delete ${deleteTargetProject?.name || 'project'}?`}
        confirmLabel="Delete"
        confirmDanger
        onConfirm={() => {
          if (deleteTarget) deleteProject(deleteTarget);
        }}
      >
        This will permanently remove this project.
        {deleteTargetProject && ` (${getSessionsForProject(deleteTargetProject.id).length} sessions)`}
      </Modal>
    </div>
  );
}

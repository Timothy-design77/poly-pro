import { lazy, Suspense, useState } from 'react';
import { useProjectStore } from '../store/project-store';
import { useSessionStore } from '../store/session-store';
import { loadProjectForm } from '../utils/prefetch';
const ProjectCreateSheet = lazy(() => loadProjectForm().then((module) => ({ default: module.ProjectCreateSheet })));
import { Modal } from '../components/ui/Modal';
import { isCriticalActivityActive } from '../utils/critical-activity';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Notice } from '../components/ui/Notice';
import { ProjectCard, Sparkline } from '../components/projects/ProjectCard';

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

  const [error, setError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const selectProject = async (id: string | null) => {
    if (switching) return;
    if (isCriticalActivityActive()) { setError('Finish the current recording, analysis or data operation before switching projects.'); return; }
    setSwitching(true); setError(null);
    try { await setActiveProject(id); } catch (error) { setError(error instanceof Error ? error.message : 'Could not save the project selection.'); }
    finally { setSwitching(false); }
  };
  const [showCreate, setShowCreate] = useState(false);
  const [editingProject, setEditingProject] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const editProject = projects.find((project) => project.id === editingProject);
  const deleteTargetProject = projects.find((project) => project.id === deleteTarget);
  const quickStartSessions = sessions.filter((session) => session.projectId === null);

  return (
    <div className="h-full overflow-y-auto bg-bg-primary">
      <div className="app-page">
        <PageHeader title="Projects">
          <Button variant="primary" onClick={() => setShowCreate(true)} className="pl-3">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            New project
          </Button>
        </PageHeader>

        {error && <Notice tone="danger" className="mb-3">{error}</Notice>}
        <div className="flex flex-col gap-2">
          <ProjectCard
            active={activeProjectId === null}
            disabled={switching}
            onSelect={() => void selectProject(null)}
            leading={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="9" /><path d="m10 8 6 4-6 4Z" /></svg>}
            title="Quick Start"
            details={`Practice without a project · ${quickStartSessions.length} take${quickStartSessions.length === 1 ? '' : 's'}`}
          />

          {projects.map((project) => {
            const projectSessions = getSessionsForProject(project.id);
            return (
              <ProjectCard
                key={project.id}
                active={project.id === activeProjectId}
                disabled={switching}
                onSelect={() => void selectProject(project.id)}
                leading={project.icon}
                title={project.name}
                details={<>
                  <span className="tabular-nums">{project.currentBpm} of {project.goalBpm} BPM</span>
                  {' · '}{projectSessions.length > 0 ? timeAgo(project.lastOpened) : 'No takes yet'}
                </>}
                trailing={<>
                  <Sparkline values={projectSessions.slice(0, 10).reverse().map((session) => session.perfectPct)} />
                  <Button variant="secondary" className="shrink-0 px-3" aria-label={`Edit ${project.name}`} onClick={() => setEditingProject(project.id)}>Edit</Button>
                </>}
              />
            );
          })}
        </div>

        <Suspense fallback={null}>
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
            onDelete={editingProject ? () => setDeleteTarget(editingProject) : undefined}
          />

        </Suspense>

        <Modal
          isOpen={!!deleteTarget}
          onClose={() => { setDeleteTarget(null); setEditingProject(null); }}
          title={`Delete ${deleteTargetProject?.name || 'project'}?`}
          confirmLabel="Delete"
          confirmDanger
          onConfirm={async () => {
            if (deleteTarget) {
              if (isCriticalActivityActive()) throw new Error('Finish the current recording, playback or data operation before deleting a project.');
              if (deleteTarget === useProjectStore.getState().activeProjectId) await setActiveProject(null);
              await deleteProject(deleteTarget);
              setEditingProject(null);
            }
          }}
        >
          The project is removed. Its {deleteTargetProject ? getSessionsForProject(deleteTargetProject.id).length : 0} takes and their recordings move to Quick Start.
        </Modal>
      </div>
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { createPortal } from 'react-dom';

const EMOJIS = ['🥁', '🎵', '🎸', '🎹', '🎷', '🎺', '🎻', '🪘', '🎤', '🔥', '⚡', '🎯', '💪', '🏆', '⭐', '🎶'];

interface ProjectFormData {
  icon: string;
  name: string;
  startBpm: number;
  goalBpm: number;
  accuracyTarget: number;
  autoAdvance: boolean;
  advanceAfterN: number;
  bpmStep: number;
}

interface ProjectCreateSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: ProjectFormData) => void | Promise<void>;
  initial?: Partial<ProjectFormData>;
  isEdit?: boolean;
  onDelete?: () => void;
}

export function ProjectCreateSheet({
  isOpen,
  onClose,
  onSubmit,
  initial,
  isEdit = false,
  onDelete,
}: ProjectCreateSheetProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef, isOpen, onClose);
  const initialRef = useRef(initial); initialRef.current = initial;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoAdvance, setAutoAdvance] = useState(initial?.autoAdvance ?? true);
  const [accuracyTarget, setAccuracyTarget] = useState(initial?.accuracyTarget ?? 85);
  const [advanceAfterN, setAdvanceAfterN] = useState(initial?.advanceAfterN ?? 3);
  const [bpmStep, setBpmStep] = useState(initial?.bpmStep ?? 5);
  const [icon, setIcon] = useState(initial?.icon || '🥁');
  const [name, setName] = useState(initial?.name || '');
  const [startBpm, setStartBpm] = useState(initial?.startBpm || 80);
  const [goalBpm, setGoalBpm] = useState(initial?.goalBpm || 120);
  const [showEmojiGrid, setShowEmojiGrid] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const openTimeRef = useRef(0);

  useEffect(() => {
    if (isOpen) {
      const initial = initialRef.current;
      setError(null); setSaving(false);
      setAutoAdvance(initial?.autoAdvance ?? true); setAccuracyTarget(initial?.accuracyTarget ?? 85); setAdvanceAfterN(initial?.advanceAfterN ?? 3); setBpmStep(initial?.bpmStep ?? 5);
      setIcon(initial?.icon || '🥁');
      setName(initial?.name || '');
      setStartBpm(initial?.startBpm || 80);
      setGoalBpm(initial?.goalBpm || 120);
      setShowEmojiGrid(false);
      openTimeRef.current = Date.now();
      const timer = setTimeout(() => nameRef.current?.focus(), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isValid = name.trim().length > 0 && goalBpm >= startBpm && startBpm >= 10 && goalBpm <= 400 && accuracyTarget >= 1 && accuracyTarget <= 100 && advanceAfterN >= 1 && advanceAfterN <= 100 && Number.isInteger(advanceAfterN) && bpmStep >= 0.5 && bpmStep <= 100;

  const handleSubmit = async () => {
    if (!isValid || saving) return;
    setSaving(true); setError(null);
    try { await onSubmit({ icon, name: name.trim(), startBpm, goalBpm, accuracyTarget, autoAdvance, advanceAfterN, bpmStep }); onClose(); }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not save this project.'); }
    finally { setSaving(false); }
  };

  const handleBackdrop = () => {
    if (Date.now() - openTimeRef.current > 300) onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60"
      onClick={handleBackdrop}
    >
      <div
        ref={dialogRef} role="dialog" aria-modal="true" aria-label={isEdit ? 'Edit Project' : 'New Project'} tabIndex={-1}
        className="w-full max-h-[85vh] bg-bg-surface rounded-t-2xl flex flex-col animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-border-subtle shrink-0 flex items-center justify-between">
          <span className="text-base font-semibold text-text-primary">
            {isEdit ? 'Edit Project' : 'New Project'}
          </span>
          <button onClick={onClose} className="text-xs text-text-muted font-semibold px-2 py-1 rounded active:bg-bg-raised">
            Cancel
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Live preview card */}
          <div className={`rounded-xl border p-3 flex items-center gap-3
            bg-bg-raised border-border-subtle border-l-[3px] border-l-[rgba(21,23,26,0.5)]`}>
            <span className="text-xl">{icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-text-primary truncate">
                {name || 'Project Name'}
              </p>
              <p className="text-xs font-mono text-text-secondary mt-0.5">
                {startBpm} → {goalBpm} BPM
              </p>
            </div>
          </div>

          {/* Emoji picker */}
          <div>
            <label className="text-xs text-text-muted  mb-1.5 block">Icon</label>
            <button
              onClick={() => setShowEmojiGrid(!showEmojiGrid)}
              className="w-[56px] h-[56px] rounded-xl bg-bg-primary border border-border-subtle
                         flex items-center justify-center text-2xl active:bg-bg-raised touch-manipulation"
            >
              {icon}
            </button>
            {showEmojiGrid && (
              <div className="grid grid-cols-8 gap-1 mt-2">
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    onClick={() => { setIcon(e); setShowEmojiGrid(false); }}
                    className={`h-[40px] rounded-lg flex items-center justify-center text-lg
                      touch-manipulation active:bg-bg-raised
                      ${e === icon ? 'bg-[rgba(21,23,26,0.1)] border border-[rgba(21,23,26,0.15)]' : ''}`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Name */}
          <div>
            <label className="text-xs text-text-muted  mb-1.5 block">Name</label>
            <input
              aria-label="Project name" ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Paradiddles, Jazz Comping..."
              maxLength={40}
              className="w-full h-[48px] bg-bg-primary border border-border-subtle rounded-xl
                         px-3 text-sm text-text-primary placeholder-text-muted outline-none
                         focus:border-border-emphasis"
            />
          </div>

          {/* BPM range */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="text-xs text-text-muted  mb-1.5 block">Start BPM</label>
              <input
                type="number"
                aria-label="Start BPM" min={10} max={400} step={0.5}
                value={startBpm}
                onChange={(e) => setStartBpm(Number(e.target.value))}
                className="w-full h-[48px] bg-bg-primary border border-border-subtle rounded-xl
                           px-3 font-mono text-base text-text-primary text-center outline-none
                           focus:border-border-emphasis"
              />
            </div>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round"
              className="text-text-muted mt-5 shrink-0">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
            <div className="flex-1">
              <label className="text-xs text-text-muted  mb-1.5 block">Goal BPM</label>
              <input
                type="number"
                aria-label="Goal BPM" min={10} max={400} step={0.5}
                value={goalBpm}
                onChange={(e) => setGoalBpm(Number(e.target.value))}
                className="w-full h-[48px] bg-bg-primary border border-border-subtle rounded-xl
                           px-3 font-mono text-base text-text-primary text-center outline-none
                           focus:border-border-emphasis"
              />
            </div>
          </div>

          <label className="flex items-center gap-3 min-h-[44px] text-sm text-text-primary"><input type="checkbox" checked={autoAdvance} onChange={(event) => setAutoAdvance(event.target.checked)} />Advance tempo after successful takes</label>
          {autoAdvance && <div className="grid grid-cols-3 gap-2 text-xs text-text-secondary">
            <label>Target score %<input aria-label="Target score" type="number" min={1} max={100} value={accuracyTarget} onChange={(event) => setAccuracyTarget(Number(event.target.value))} className="w-full min-h-[44px] border border-border-subtle rounded-lg bg-bg-input p-2" /></label>
            <label>Passing takes<input aria-label="Passing takes" type="number" min={1} max={100} value={advanceAfterN} onChange={(event) => setAdvanceAfterN(Number(event.target.value))} className="w-full min-h-[44px] border border-border-subtle rounded-lg bg-bg-input p-2" /></label>
            <label>BPM step<input aria-label="BPM step" type="number" min={0.5} max={100} step={0.5} value={bpmStep} onChange={(event) => setBpmStep(Number(event.target.value))} className="w-full min-h-[44px] border border-border-subtle rounded-lg bg-bg-input p-2" /></label>
          </div>}
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          {!isValid && name.trim().length > 0 && goalBpm < startBpm && (
            <div className="text-xs text-warning">Goal BPM must be at least Start BPM</div>
          )}
        </div>

        {/* Submit + Delete */}
        <div className="px-4 pb-4 pt-2 shrink-0 space-y-2">
          <button
            onClick={handleSubmit}
            disabled={!isValid || saving}
            className={`w-full h-[50px] rounded-xl text-sm font-semibold touch-manipulation
              ${isValid
                ? 'bg-[rgba(21,23,26,0.85)] text-bg-primary active:bg-[rgba(21,23,26,0.95)]'
                : 'bg-bg-raised text-text-muted cursor-not-allowed'
              }`}
          >
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Project'}
          </button>
          {isEdit && onDelete && (
            <button
              onClick={onDelete}
              className="w-full h-[44px] rounded-xl text-sm font-semibold touch-manipulation
                         text-danger border border-danger/20 active:bg-danger-dim"
            >
              Delete Project
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

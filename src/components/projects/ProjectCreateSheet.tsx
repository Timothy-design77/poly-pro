import { useState, useEffect, useRef } from 'react';
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
  onSubmit: (data: ProjectFormData) => void;
  initial?: Partial<ProjectFormData>;
  isEdit?: boolean;
}

export function ProjectCreateSheet({
  isOpen,
  onClose,
  onSubmit,
  initial,
  isEdit = false,
}: ProjectCreateSheetProps) {
  const [icon, setIcon] = useState(initial?.icon || '🥁');
  const [name, setName] = useState(initial?.name || '');
  const [startBpm, setStartBpm] = useState(initial?.startBpm || 80);
  const [goalBpm, setGoalBpm] = useState(initial?.goalBpm || 120);
  const [showEmojiGrid, setShowEmojiGrid] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const openTimeRef = useRef(0);

  useEffect(() => {
    if (isOpen) {
      setIcon(initial?.icon || '🥁');
      setName(initial?.name || '');
      setStartBpm(initial?.startBpm || 80);
      setGoalBpm(initial?.goalBpm || 120);
      setShowEmojiGrid(false);
      openTimeRef.current = Date.now();
      setTimeout(() => nameRef.current?.focus(), 300);
    }
  }, [isOpen, initial]);

  if (!isOpen) return null;

  const isValid = name.trim().length > 0 && goalBpm > startBpm && startBpm >= 20 && goalBpm <= 300;

  const handleSubmit = () => {
    if (!isValid) return;
    onSubmit({
      icon,
      name: name.trim(),
      startBpm,
      goalBpm,
      accuracyTarget: initial?.accuracyTarget ?? 85,
      autoAdvance: initial?.autoAdvance ?? true,
      advanceAfterN: initial?.advanceAfterN ?? 3,
      bpmStep: initial?.bpmStep ?? 5,
    });
    onClose();
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
        className="w-full max-h-[85vh] bg-bg-surface rounded-t-2xl flex flex-col animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-border-subtle shrink-0 flex items-center justify-between">
          <span className="text-base font-bold text-text-primary">
            {isEdit ? 'Edit Project' : 'New Project'}
          </span>
          <button onClick={onClose} className="text-xs text-text-muted font-bold px-2 py-1 rounded active:bg-bg-raised">
            Cancel
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Live preview card */}
          <div className={`rounded-xl border p-3 flex items-center gap-3
            bg-bg-raised border-border-subtle border-l-[3px] border-l-[rgba(255,255,255,0.5)]`}>
            <span className="text-xl">{icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-text-primary truncate">
                {name || 'Project Name'}
              </p>
              <p className="text-[11px] font-mono text-text-secondary mt-0.5">
                {startBpm} → {goalBpm} BPM
              </p>
            </div>
          </div>

          {/* Emoji picker */}
          <div>
            <label className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5 block">Icon</label>
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
                      ${e === icon ? 'bg-[rgba(255,255,255,0.1)] border border-[rgba(255,255,255,0.15)]' : ''}`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Name */}
          <div>
            <label className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5 block">Name</label>
            <input
              ref={nameRef}
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
              <label className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5 block">Start BPM</label>
              <input
                type="number"
                value={startBpm}
                onChange={(e) => setStartBpm(Math.max(20, Math.min(300, Number(e.target.value))))}
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
              <label className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5 block">Goal BPM</label>
              <input
                type="number"
                value={goalBpm}
                onChange={(e) => setGoalBpm(Math.max(20, Math.min(300, Number(e.target.value))))}
                className="w-full h-[48px] bg-bg-primary border border-border-subtle rounded-xl
                           px-3 font-mono text-base text-text-primary text-center outline-none
                           focus:border-border-emphasis"
              />
            </div>
          </div>

          {!isValid && name.trim().length > 0 && goalBpm <= startBpm && (
            <div className="text-xs text-warning">Goal BPM must be higher than Start BPM</div>
          )}
        </div>

        {/* Submit */}
        <div className="px-4 pb-4 pt-2 shrink-0">
          <button
            onClick={handleSubmit}
            disabled={!isValid}
            className={`w-full h-[50px] rounded-xl text-sm font-bold touch-manipulation
              ${isValid
                ? 'bg-[rgba(255,255,255,0.85)] text-bg-primary active:bg-[rgba(255,255,255,0.95)]'
                : 'bg-bg-raised text-text-muted cursor-not-allowed'
              }`}
          >
            {isEdit ? 'Save Changes' : 'Create Project'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

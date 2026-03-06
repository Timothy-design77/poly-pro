import { useEffect, useRef } from 'react';
import { SOUND_CATALOG } from '../../audio/sounds';
import { audioEngine } from '../../audio/engine';

interface SoundPickerSheetProps {
  isOpen: boolean;
  onClose: () => void;
  currentSoundId: string | null;
  inheritedSoundId: string;
  onSelect: (soundId: string | null) => void;
  beatLabel: string;
}

const categories = ['clicks', 'drums', 'percussion', 'tonal'] as const;
const categoryLabels: Record<string, string> = {
  clicks: 'Clicks',
  drums: 'Drums',
  percussion: 'Percussion',
  tonal: 'Tonal',
};

/**
 * Bottom sheet for picking a sound for a specific beat.
 * Shows current/inherited state, categories, preview on tap.
 * Select "Default" to clear the override.
 */
export function SoundPickerSheet({
  isOpen,
  onClose,
  currentSoundId,
  inheritedSoundId,
  onSelect,
  beatLabel,
}: SoundPickerSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const openTimeRef = useRef(0);

  // Track when sheet opens — ignore close events for 300ms after
  useEffect(() => {
    if (isOpen) {
      openTimeRef.current = Date.now();
    }
  }, [isOpen]);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Guard: don't close if the sheet just opened (same touch gesture)
  const handleBackdropClick = () => {
    if (Date.now() - openTimeRef.current > 300) {
      onClose();
    }
  };

  const activeSoundId = currentSoundId || inheritedSoundId;
  const hasOverride = currentSoundId !== null;
  const inheritedName = SOUND_CATALOG.find((s) => s.id === inheritedSoundId)?.name || inheritedSoundId;

  const handleSelect = (soundId: string) => {
    audioEngine.previewSound(soundId);
    onSelect(soundId);
  };

  const handleClearOverride = () => {
    onSelect(null);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60"
      onClick={handleBackdropClick}
      onPointerUp={handleBackdropClick}
    >
      <div
        ref={panelRef}
        className="w-full max-w-[500px] max-h-[70vh] bg-bg-surface rounded-t-2xl flex flex-col animate-slide-up"
        onClick={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-border-subtle shrink-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-bold text-text-primary">{beatLabel} Sound</span>
            <button
              onClick={onClose}
              className="text-xs text-text-muted font-bold px-2 py-1 rounded active:bg-bg-raised"
            >
              Done
            </button>
          </div>
          {hasOverride ? (
            <div className="text-[11px] text-text-muted">
              Custom override · Default: {inheritedName}
            </div>
          ) : (
            <div className="text-[11px] text-text-muted">
              Using track default: {inheritedName}
            </div>
          )}
        </div>

        {/* Sound list */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {/* Reset to default */}
          {hasOverride && (
            <button
              onClick={handleClearOverride}
              className="w-full text-left px-3 py-3 rounded-lg mb-1
                         text-sm text-text-secondary active:bg-bg-raised
                         flex items-center gap-3 border border-dashed border-border-subtle"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-text-muted">
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
              Use track default ({inheritedName})
            </button>
          )}

          {categories.map((cat) => {
            const sounds = SOUND_CATALOG.filter((s) => s.category === cat);
            return (
              <div key={cat}>
                <div className="text-[10px] text-text-muted uppercase tracking-wider px-3 pt-3 pb-1">
                  {categoryLabels[cat]}
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {sounds.map((s) => {
                    const isActive = s.id === activeSoundId;
                    return (
                      <button
                        key={s.id}
                        onClick={() => handleSelect(s.id)}
                        className={`
                          text-left px-3 py-3 rounded-lg text-sm flex items-center gap-2
                          touch-manipulation
                          ${isActive
                            ? 'bg-[rgba(255,255,255,0.08)] text-text-primary border border-[rgba(255,255,255,0.1)]'
                            : 'text-text-secondary active:bg-bg-raised'}
                        `}
                      >
                        {isActive && (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="shrink-0">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                        <span className={isActive ? '' : 'pl-[22px]'}>{s.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

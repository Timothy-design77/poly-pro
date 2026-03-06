interface RecordButtonProps {
  isRecording: boolean;
  onToggle: () => void;
}

/**
 * Record button — fully wired.
 * Red pulsing when recording, normal gray when not.
 */
export function RecordButton({ isRecording, onToggle }: RecordButtonProps) {
  return (
    <button
      onPointerDown={(e) => { e.preventDefault(); onToggle(); }}
      className={`
        flex-1 flex items-center justify-center gap-1.5 rounded-xl
        border-[1.5px] text-xs font-bold tracking-wide
        h-[44px] touch-manipulation select-none
        ${isRecording
          ? 'border-danger bg-danger-dim text-danger animate-pulse'
          : 'border-border-subtle bg-bg-surface text-text-secondary active:bg-bg-raised'
        }
      `}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" className="text-danger" fill="currentColor">
        {isRecording ? (
          <rect x="4" y="4" width="16" height="16" rx="2" />
        ) : (
          <circle cx="12" cy="12" r="10" />
        )}
      </svg>
      {isRecording ? 'STOP REC' : 'RECORD'}
    </button>
  );
}

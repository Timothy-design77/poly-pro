interface RecordButtonProps {
  isRecording: boolean;
  onToggle: () => void | Promise<void>;
}

/** Large full-width recording action used directly below the tempo ring. */
export function RecordButton({ isRecording, onToggle }: RecordButtonProps) {
  return (
    <button
      type="button"
      aria-label={isRecording ? 'Stop recording' : 'Start recording'}
      aria-pressed={isRecording}
      onPointerDown={(e) => { e.preventDefault(); onToggle(); }}
      className={`
        w-full min-h-[72px] flex items-center justify-center gap-2.5 rounded-[18px]
        border-[1.5px] text-sm font-extrabold tracking-[0.10em]
        touch-manipulation select-none
        ${isRecording
          ? 'border-danger bg-danger text-white animate-pulse'
          : 'border-danger/40 bg-bg-surface text-danger active:bg-danger-dim'
        }
      `}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
        {isRecording ? (
          <rect x="4" y="4" width="16" height="16" rx="2" />
        ) : (
          <circle cx="12" cy="12" r="10" />
        )}
      </svg>
      {isRecording ? 'STOP RECORDING' : 'RECORD'}
    </button>
  );
}

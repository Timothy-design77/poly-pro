import type {
  RecordingPhase,
  RecordingPreparationStage,
} from '../../hooks/useRecording';

interface RecordButtonProps {
  phase: RecordingPhase;
  preparationStage: RecordingPreparationStage | null;
  onToggle: () => void | Promise<void>;
}

const PREPARATION_LABELS: Record<RecordingPreparationStage, string> = {
  microphone: 'MIC',
  'bluetooth-check': 'DEVICE',
  'audio-context': 'AUDIO',
  'audio-worklet': 'CAPTURE',
  storage: 'STORAGE',
  'audio-graph': 'ROUTING',
  transport: 'CLICK',
};

export function RecordButton({
  phase,
  preparationStage,
  onToggle,
}: RecordButtonProps) {
  const isRecording = phase === 'recording';
  const isPreparing = phase === 'preparing';
  const isBusy = phase === 'stopping' || phase === 'saving';

  const text = isRecording
    ? 'STOP REC'
    : isPreparing
      ? `CANCEL ${preparationStage ? PREPARATION_LABELS[preparationStage] : 'SETUP'}`
      : phase === 'stopping'
        ? 'STOPPING…'
        : phase === 'saving'
          ? 'SAVING…'
          : 'RECORD';

  return (
    <button
      type="button"
      onClick={() => void onToggle()}
      disabled={isBusy}
      aria-label={isRecording
        ? 'Stop recording'
        : isPreparing
          ? 'Cancel recording setup'
          : isBusy
            ? text
            : 'Start recording'}
      aria-pressed={isRecording}
      aria-busy={isPreparing || isBusy}
      className={`
        flex-1 flex items-center justify-center gap-1.5 rounded-xl
        border-[1.5px] text-xs font-bold tracking-wide
        h-[44px] touch-manipulation select-none
        disabled:cursor-wait disabled:opacity-70
        ${isRecording
          ? 'border-danger bg-danger-dim text-danger animate-pulse'
          : isPreparing
            ? 'border-warning/60 bg-warning/10 text-warning'
            : 'border-border-subtle bg-bg-surface text-text-secondary active:bg-bg-raised'
        }
      `}
    >
      <svg
        width="11"
        height="11"
        viewBox="0 0 24 24"
        className={isPreparing ? 'text-warning' : 'text-danger'}
        fill="currentColor"
        aria-hidden="true"
      >
        {isRecording ? (
          <rect x="4" y="4" width="16" height="16" rx="2" />
        ) : (
          <circle cx="12" cy="12" r="10" />
        )}
      </svg>
      {text}
    </button>
  );
}

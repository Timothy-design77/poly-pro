interface WaveformDisplayProps {
  micLevel: number;
  isRecording: boolean;
}

/** Uses the capture worklet's measured peak; never opens another audio route. */
export function WaveformDisplay({ micLevel, isRecording }: WaveformDisplayProps) {
  if (!isRecording) return null;
  const level = Math.round(Math.max(0, Math.min(1, Number.isFinite(micLevel) ? micLevel : 0)) * 100);
  const clipping = level >= 98;
  return (
    <div className="flex items-center gap-3 mt-4 text-xs text-text-secondary">
      <span>Input</span>
      <div role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={level}
        aria-valuetext={clipping ? 'Clipping' : `${level}% peak`} className="flex-1 h-2 rounded-full bg-bg-raised overflow-hidden">
        <div className={`h-full rounded-full ${clipping ? 'bg-danger' : 'bg-text-secondary'}`} style={{ width: `${level}%` }} />
      </div>
      <span className={clipping ? 'text-danger' : 'text-text-muted'}>{clipping ? 'Clipping' : level === 0 ? 'Quiet' : 'Receiving'}</span>
    </div>
  );
}

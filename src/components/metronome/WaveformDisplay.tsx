interface WaveformDisplayProps {
  micLevel: number;
  isRecording: boolean;
}

/**
 * Recording indicator — shows pulsing bar during recording.
 * No live mic levels (connecting mic to AudioContext causes
 * Android volume ducking).
 */
export function WaveformDisplay({ isRecording }: WaveformDisplayProps) {
  if (!isRecording) return null;

  return (
    <div className="w-full h-[28px] rounded-lg bg-bg-surface border border-border-subtle
                    flex items-center justify-center gap-1.5 mt-2 overflow-hidden">
      <div className="flex items-center gap-[3px] h-full py-2">
        {[0.4, 0.7, 1.0, 0.6, 0.9, 0.5, 0.8, 1.0, 0.3, 0.7, 0.9, 0.5].map((h, i) => (
          <div
            key={i}
            className="w-[3px] rounded-full bg-danger animate-pulse"
            style={{
              height: `${h * 100}%`,
              animationDelay: `${i * 0.08}s`,
              opacity: 0.4 + h * 0.4,
            }}
          />
        ))}
      </div>
    </div>
  );
}

import { useSettingsStore } from '../../store/settings-store';

export function VibrationSettings() {
  const hapticEnabled = useSettingsStore((s) => s.hapticEnabled);
  const vibrationIntensity = useSettingsStore((s) => s.vibrationIntensity);
  const setHapticEnabled = useSettingsStore((s) => s.setHapticEnabled);
  const setVibrationIntensity = useSettingsStore((s) => s.setVibrationIntensity);

  const hasVibration = typeof navigator !== 'undefined' && 'vibrate' in navigator;

  const resetVibration = () => {
    setHapticEnabled(true);
    setVibrationIntensity(0.5);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm text-text-primary">Haptic Feedback</div>
          {!hasVibration && (
            <div className="text-[10px] text-text-muted mt-0.5">Not supported on this device</div>
          )}
        </div>
        <button
          type="button"
          aria-pressed={hapticEnabled && hasVibration}
          onClick={() => setHapticEnabled(!hapticEnabled)}
          disabled={!hasVibration}
          className={`relative w-[46px] h-[28px] rounded-full transition-colors border
            ${hapticEnabled && hasVibration
              ? 'bg-accent border-accent'
              : 'bg-bg-raised border-border-subtle'}
            ${!hasVibration ? 'opacity-40 cursor-not-allowed' : ''}`}
        >
          <div
            className={`absolute top-[3px] w-[20px] h-[20px] rounded-full transition-all shadow-sm
              ${hapticEnabled && hasVibration
                ? 'left-[22px] bg-white'
                : 'left-[3px] bg-text-muted'}`}
          />
        </button>
      </div>

      {hapticEnabled && hasVibration && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs text-text-muted uppercase tracking-wider">Intensity</label>
            <span className="font-mono text-xs text-text-secondary">{Math.round(vibrationIntensity * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={Math.round(vibrationIntensity * 100)}
            onChange={(event) => setVibrationIntensity(Number(event.target.value) / 100)}
            className="w-full accent-accent h-2 bg-bg-raised rounded-full appearance-none
                       [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5
                       [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full
                       [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:cursor-pointer"
          />
          <button
            type="button"
            onClick={() => navigator.vibrate?.(Math.round(20 * vibrationIntensity))}
            className="mt-2 w-full min-h-[40px] rounded-lg border border-border-subtle bg-bg-surface
                       text-text-primary text-xs font-bold active:bg-bg-raised"
          >
            Test Vibration
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={resetVibration}
        className="w-full min-h-[40px] rounded-lg border border-border-subtle bg-bg-surface
                   text-text-secondary text-xs font-semibold active:bg-bg-raised"
      >
        Reset Vibration
      </button>
    </div>
  );
}

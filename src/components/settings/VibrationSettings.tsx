import { useSettingsStore } from '../../store/settings-store';

/**
 * Settings section: Vibration
 * - Haptic Feedback toggle
 * - Vibration Intensity slider
 */
export function VibrationSettings() {
  const hapticEnabled = useSettingsStore((s) => s.hapticEnabled);
  const vibrationIntensity = useSettingsStore((s) => s.vibrationIntensity);
  const setHapticEnabled = useSettingsStore((s) => s.setHapticEnabled);
  const setVibrationIntensity = useSettingsStore((s) => s.setVibrationIntensity);

  const hasVibration = typeof navigator !== 'undefined' && 'vibrate' in navigator;

  return (
    <div className="space-y-4">
      {/* Haptic Feedback toggle */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-text-primary">Haptic Feedback</div>
          {!hasVibration && (
            <div className="text-[10px] text-text-muted mt-0.5">
              Not supported on this device
            </div>
          )}
        </div>
        <button
          onClick={() => setHapticEnabled(!hapticEnabled)}
          disabled={!hasVibration}
          className={`
            relative w-[44px] h-[24px] rounded-full transition-all
            ${hapticEnabled && hasVibration
              ? 'bg-[rgba(255,255,255,0.3)]'
              : 'bg-bg-raised'
            }
            ${!hasVibration ? 'opacity-40 cursor-not-allowed' : ''}
          `}
        >
          <div
            className={`
              absolute top-[2px] w-[20px] h-[20px] rounded-full transition-all
              ${hapticEnabled && hasVibration
                ? 'left-[22px] bg-white'
                : 'left-[2px] bg-text-muted'
              }
            `}
          />
        </button>
      </div>

      {/* Vibration Intensity */}
      {hapticEnabled && hasVibration && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs text-text-muted uppercase tracking-wider">
              Intensity
            </label>
            <span className="font-mono text-xs text-text-secondary">
              {Math.round(vibrationIntensity * 100)}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={Math.round(vibrationIntensity * 100)}
            onChange={(e) => setVibrationIntensity(Number(e.target.value) / 100)}
            className="w-full accent-white h-1 bg-bg-raised rounded-full appearance-none
                       [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4
                       [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full
                       [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer"
          />
          <button
            onClick={() => {
              if (navigator.vibrate) {
                navigator.vibrate(Math.round(20 * vibrationIntensity));
              }
            }}
            className="mt-2 w-full h-[36px] rounded-lg border border-border-subtle bg-bg-primary
                       text-text-secondary text-xs font-bold tracking-wide
                       active:bg-bg-raised transition-all"
          >
            Test Vibration
          </button>
        </div>
      )}
    </div>
  );
}

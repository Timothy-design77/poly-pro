import { useSettingsStore } from '../../store/settings-store';
import { Toggle } from '../ui/Toggle';

/**
 * Settings section: Vibration
 * - Haptic Feedback toggle
 * - Vibration Intensity slider
 */
export function VibrationSettings() {
  const hapticEnabled = useSettingsStore((state) => state.hapticEnabled);
  const vibrationIntensity = useSettingsStore((state) => state.vibrationIntensity);
  const setHapticEnabled = useSettingsStore((state) => state.setHapticEnabled);
  const setVibrationIntensity = useSettingsStore((state) => state.setVibrationIntensity);

  const hasVibration = typeof navigator !== 'undefined' && 'vibrate' in navigator;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-text-primary">Haptic Feedback</div>
          {!hasVibration && (
            <div className="text-[10px] text-text-secondary mt-0.5">
              Not supported on this device
            </div>
          )}
        </div>
        <Toggle
          label="Haptic feedback"
          enabled={hapticEnabled}
          onChange={setHapticEnabled}
          disabled={!hasVibration}
        />
      </div>

      {hapticEnabled && hasVibration && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="vibration-intensity"
              className="text-xs text-text-secondary uppercase tracking-wider"
            >
              Intensity
            </label>
            <span className="font-mono text-xs text-text-secondary">
              {Math.round(vibrationIntensity * 100)}%
            </span>
          </div>
          <input
            id="vibration-intensity"
            aria-label="Vibration intensity"
            type="range"
            min="0"
            max="100"
            value={Math.round(vibrationIntensity * 100)}
            onChange={(event) => setVibrationIntensity(Number(event.target.value) / 100)}
            className="w-full accent-white h-1 bg-bg-raised rounded-full appearance-none
                       [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4
                       [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full
                       [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer"
          />
          <button
            type="button"
            onClick={() => navigator.vibrate?.(Math.round(20 * vibrationIntensity))}
            className="mt-2 w-full min-h-[44px] rounded-lg border border-border-subtle bg-bg-primary
                       text-text-secondary text-xs font-bold tracking-wide
                       active:bg-bg-raised transition-all
                       focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Test Vibration
          </button>
        </div>
      )}
    </div>
  );
}

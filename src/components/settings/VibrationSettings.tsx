import { useSettingsStore } from '../../store/settings-store';
import { Toggle } from '../ui/Toggle';
import { Range } from '../ui/Range';
import { Button } from '../ui/Button';
import { SettingRow } from '../ui/SettingRow';

export function VibrationSettings() {
  const hapticEnabled = useSettingsStore((s) => s.hapticEnabled);
  const vibrationIntensity = useSettingsStore((s) => s.vibrationIntensity);
  const setHapticEnabled = useSettingsStore((s) => s.setHapticEnabled);
  const setVibrationIntensity = useSettingsStore((s) => s.setVibrationIntensity);

  const hasVibration = typeof navigator !== 'undefined' && 'vibrate' in navigator;
  const active = hapticEnabled && hasVibration;

  return (
    <div className="space-y-2">
      <div className="ui-rows">
        <SettingRow label="Haptic feedback" description={hasVibration ? 'Vibrate on each beat for loud rooms.' : 'Not supported on this device.'}>
          <Toggle label="Haptic feedback" enabled={active} disabled={!hasVibration} onChange={setHapticEnabled} />
        </SettingRow>
        {active && (
          <div className="ui-field py-3">
            <div className="flex items-center justify-between">
              <span className="ui-label">Intensity</span>
              <span className="text-sm tabular-nums text-text-secondary">{Math.round(vibrationIntensity * 100)}%</span>
            </div>
            <Range aria-label="Vibration intensity" min={0} max={100} value={Math.round(vibrationIntensity * 100)} onChange={(value) => setVibrationIntensity(value / 100)} />
            <Button variant="secondary" onClick={() => navigator.vibrate?.(Math.round(20 * vibrationIntensity))}>Test vibration</Button>
          </div>
        )}
      </div>
      <Button variant="quiet" block onClick={() => { setHapticEnabled(true); setVibrationIntensity(0.5); }}>Reset vibration</Button>
    </div>
  );
}

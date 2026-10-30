import { useState } from 'react';
import { useSettingsStore } from '../../store/settings-store';
import { CalibrationPage } from '../../pages/CalibrationPage';
import { HelpTip } from '../ui/HelpTip';
import { PrecisionSlider } from '../ui/PrecisionSlider';
import { Button } from '../ui/Button';
import { SettingRow } from '../ui/SettingRow';

export function CalibrationSettings() {
  const calibratedOffset = useSettingsStore((s) => s.calibratedOffset);
  const manualAdjustment = useSettingsStore((s) => s.manualAdjustment);
  const lastCalibratedAt = useSettingsStore((s) => s.lastCalibratedAt);
  const calibrationConsistency = useSettingsStore((s) => s.calibrationConsistency);
  const setManualAdjustment = useSettingsStore((s) => s.setManualAdjustment);
  const [showCalibration, setShowCalibration] = useState(false);

  const effectiveOffset = calibratedOffset + manualAdjustment;
  const lastCalLabel = lastCalibratedAt
    ? new Date(lastCalibratedAt).toLocaleDateString(undefined, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : 'Never';

  const clearCalibration = () => {
    useSettingsStore.setState({
      calibratedOffset: 0,
      manualAdjustment: 0,
      lastCalibratedAt: null,
      calibrationConsistency: null,
    });
  };

  return (
    <div className="space-y-4">
      <div className="ui-rows">
        <SettingRow label={<span className="flex items-center gap-2">Effective offset <HelpTip text="Total latency compensation used in analysis: the calibrated base plus your fine-tune adjustment." /></span>}>
          <span className="ui-row-value font-semibold text-text-primary">{effectiveOffset.toFixed(1)} ms</span>
        </SettingRow>
        {lastCalibratedAt && <SettingRow label="Calibrated base"><span className="ui-row-value">{calibratedOffset.toFixed(1)} ms</span></SettingRow>}
        {calibrationConsistency !== null && <SettingRow label="Consistency"><span className="ui-row-value">±{calibrationConsistency.toFixed(1)} ms</span></SettingRow>}
        <SettingRow label="Last calibrated"><span className="ui-row-value">{lastCalLabel}</span></SettingRow>
      </div>

      <Button variant="primary" block onClick={() => setShowCalibration(true)}>
        {lastCalibratedAt ? 'Recalibrate' : 'Run calibration'}
      </Button>

      <div className="ui-field">
        <div className="flex items-center justify-between gap-2">
          <span className="ui-label flex items-center gap-2">
            Fine-tune
            <HelpTip text="Adjust up to ±300 ms on top of the calibrated value. Tap the value for exact entry." />
          </span>
          {manualAdjustment !== 0 && <Button variant="quiet" className="px-3 text-xs" onClick={() => setManualAdjustment(0)}>Reset</Button>}
        </div>
        <PrecisionSlider
          ariaLabel="Calibration fine-tune"
          min={Math.min(-300, manualAdjustment)}
          max={Math.max(300, manualAdjustment)}
          step={0.5}
          value={manualAdjustment}
          onChange={setManualAdjustment}
          formatValue={(value) => `${value > 0 ? '+' : ''}${value.toFixed(1)} ms`}
          showValue
          unit="ms"
        />
        <div className="flex justify-between text-xs text-text-muted tabular-nums" aria-hidden="true">
          <span>−300 ms</span><span>0</span><span>+300 ms</span>
        </div>
      </div>

      {lastCalibratedAt && <Button variant="danger-quiet" block onClick={clearCalibration}>Clear calibration</Button>}

      {showCalibration && <CalibrationPage visible onClose={() => setShowCalibration(false)} />}
    </div>
  );
}

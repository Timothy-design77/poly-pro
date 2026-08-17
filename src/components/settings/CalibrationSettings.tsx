import { useState } from 'react';
import { useSettingsStore } from '../../store/settings-store';
import { CalibrationPage } from '../../pages/CalibrationPage';
import { HelpTip } from '../ui/HelpTip';
import { PrecisionSlider } from '../ui/PrecisionSlider';

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
    : 'Not calibrated';

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
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-text-secondary flex items-center gap-1">
          Effective Offset
          <HelpTip text="Total latency compensation applied during analysis: calibrated base plus fine-tune adjustment." />
        </span>
        <span className="text-sm font-mono font-bold text-text-primary">
          {calibratedOffset === 0 && !lastCalibratedAt ? 'Not calibrated' : `${effectiveOffset.toFixed(1)}ms`}
        </span>
      </div>

      {lastCalibratedAt && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-secondary">Calibrated Base</span>
          <span className="text-xs font-mono text-text-muted">{calibratedOffset.toFixed(1)}ms</span>
        </div>
      )}

      {calibrationConsistency !== null && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-secondary">Consistency</span>
          <span className="text-xs font-mono text-text-muted">±{calibrationConsistency.toFixed(1)}ms</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs text-text-secondary">Last Calibrated</span>
        <span className="text-xs text-text-muted">{lastCalLabel}</span>
      </div>

      <button
        type="button"
        onClick={() => setShowCalibration(true)}
        className="w-full min-h-[44px] rounded-xl font-bold text-sm tracking-wide
                   touch-manipulation select-none bg-accent text-bg-primary active:bg-accent-hover"
      >
        {lastCalibratedAt ? 'Recalibrate' : 'Run Calibration'}
      </button>

      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-text-secondary flex items-center gap-1">
            Fine-Tune
            <HelpTip text="Adjust up to ±150ms on top of the calibrated value. Tap the value for exact entry." />
          </span>
          {manualAdjustment !== 0 && (
            <button
              type="button"
              onClick={() => setManualAdjustment(0)}
              className="text-[10px] font-semibold text-text-muted min-h-[28px] px-2 rounded active:bg-bg-raised"
            >
              Reset
            </button>
          )}
        </div>
        <PrecisionSlider
          min={-150}
          max={150}
          step={0.5}
          value={manualAdjustment}
          onChange={setManualAdjustment}
          formatValue={(value) => `${value > 0 ? '+' : ''}${value.toFixed(1)}ms`}
          showValue
          unit="ms"
        />
        <div className="flex justify-between mt-0.5">
          <span className="text-[9px] text-text-muted">-150ms</span>
          <span className="text-[9px] text-text-muted">0</span>
          <span className="text-[9px] text-text-muted">+150ms</span>
        </div>
      </div>

      {lastCalibratedAt && (
        <button
          type="button"
          onClick={clearCalibration}
          className="w-full min-h-[40px] rounded-lg border border-border-subtle bg-bg-surface
                     text-text-secondary text-xs font-semibold active:bg-bg-raised"
        >
          Clear Calibration
        </button>
      )}

      <CalibrationPage visible={showCalibration} onClose={() => setShowCalibration(false)} />
    </div>
  );
}

/**
 * CalibrationSettings — Calibration section in the Settings dialog.
 *
 * Shows the effective offset, calibrated base, consistency, calibration flow,
 * and a keyboard/touch-accessible manual fine-tune control.
 */

import { useState } from 'react';
import { useSettingsStore } from '../../store/settings-store';
import { CalibrationPage } from '../../pages/CalibrationPage';
import { HelpTip } from '../ui/HelpTip';
import { PrecisionSlider } from '../ui/PrecisionSlider';

export function CalibrationSettings() {
  const calibratedOffset = useSettingsStore((state) => state.calibratedOffset);
  const manualAdjustment = useSettingsStore((state) => state.manualAdjustment);
  const lastCalibratedAt = useSettingsStore((state) => state.lastCalibratedAt);
  const calibrationConsistency = useSettingsStore((state) => state.calibrationConsistency);
  const setManualAdjustment = useSettingsStore((state) => state.setManualAdjustment);

  const [showCalibration, setShowCalibration] = useState(false);
  const effectiveOffset = calibratedOffset + manualAdjustment;

  const lastCalibrationLabel = lastCalibratedAt
    ? new Date(lastCalibratedAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Not calibrated';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-secondary flex items-center gap-1">
          Effective Offset
          <HelpTip text="Total latency compensation applied during analysis. Calibrated base plus your fine-tune adjustment. This is subtracted from every detected onset time." />
        </span>
        <span className="text-sm font-mono font-bold text-text-primary">
          {calibratedOffset === 0 && !lastCalibratedAt
            ? 'Not calibrated'
            : `${effectiveOffset.toFixed(1)}ms`}
        </span>
      </div>

      {lastCalibratedAt && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-secondary">Calibrated Base</span>
          <span className="text-xs font-mono text-text-secondary">
            {calibratedOffset.toFixed(1)}ms
          </span>
        </div>
      )}

      {calibrationConsistency !== null && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-secondary">Consistency</span>
          <span className="text-xs font-mono text-text-secondary">
            ±{calibrationConsistency.toFixed(1)}ms
          </span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs text-text-secondary">Last Calibrated</span>
        <span className="text-xs text-text-secondary">{lastCalibrationLabel}</span>
      </div>

      <button
        type="button"
        onClick={() => setShowCalibration(true)}
        className="w-full h-[44px] rounded-xl font-bold text-sm tracking-wide
                   touch-manipulation select-none bg-[rgba(255,255,255,0.85)] text-[#0C0C0E]
                   active:bg-[rgba(255,255,255,0.95)]
                   focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        {lastCalibratedAt ? 'Recalibrate' : 'Run Calibration'}
      </button>

      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-text-secondary flex items-center gap-1">
            Fine-Tune
            <HelpTip text="Adjust on top of the calibrated value. If your mean offset is consistently off by a few milliseconds, nudge this to center it." />
          </span>
        </div>
        <PrecisionSlider
          min={-150}
          max={150}
          step={0.5}
          value={manualAdjustment}
          onChange={setManualAdjustment}
          formatValue={(value) => `${value > 0 ? '+' : ''}${value.toFixed(1)}ms`}
          showValue
          ariaLabel="Fine-tune latency adjustment"
          unit="ms"
        />
        <div className="flex justify-between mt-0.5" aria-hidden="true">
          <span className="text-[9px] text-text-secondary">-150ms</span>
          <span className="text-[9px] text-text-secondary">0</span>
          <span className="text-[9px] text-text-secondary">+150ms</span>
        </div>
      </div>

      <CalibrationPage
        visible={showCalibration}
        onClose={() => setShowCalibration(false)}
      />
    </div>
  );
}

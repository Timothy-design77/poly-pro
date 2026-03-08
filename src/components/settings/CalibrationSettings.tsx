/**
 * CalibrationSettings — Calibration section in the Settings overlay.
 *
 * Shows:
 * - Effective offset (calibrated + manual)
 * - Calibrated base value (read-only)
 * - Run Calibration button → opens CalibrationPage
 * - Fine-tune slider: ±50ms on top of calibration
 * - Last calibrated date
 */

import { useState } from 'react';
import { useSettingsStore } from '../../store/settings-store';
import { CalibrationPage } from '../../pages/CalibrationPage';
import { HelpTip } from '../ui/HelpTip';

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

  return (
    <div className="space-y-4">
      {/* Effective offset */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-secondary flex items-center gap-1">
          Effective Offset
          <HelpTip text="Total latency compensation applied during analysis. Calibrated base + your fine-tune adjustment. This is subtracted from every detected onset time." />
        </span>
        <span className="text-sm font-mono font-bold text-text-primary">
          {calibratedOffset === 0 && !lastCalibratedAt
            ? 'Not calibrated'
            : `${effectiveOffset.toFixed(1)}ms`}
        </span>
      </div>

      {/* Calibrated base (read-only) */}
      {lastCalibratedAt && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-secondary">Calibrated Base</span>
          <span className="text-xs font-mono text-text-muted">
            {calibratedOffset.toFixed(1)}ms
          </span>
        </div>
      )}

      {/* Consistency from last calibration */}
      {calibrationConsistency !== null && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-secondary">Consistency</span>
          <span className="text-xs font-mono text-text-muted">
            ±{calibrationConsistency.toFixed(1)}ms
          </span>
        </div>
      )}

      {/* Last calibrated */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-secondary">Last Calibrated</span>
        <span className="text-xs text-text-muted">{lastCalLabel}</span>
      </div>

      {/* Run Calibration button */}
      <button
        onClick={() => setShowCalibration(true)}
        className="w-full h-[44px] rounded-xl font-bold text-sm tracking-wide
                   touch-manipulation select-none
                   bg-[rgba(255,255,255,0.85)] text-[#0C0C0E]
                   active:bg-[rgba(255,255,255,0.95)]"
      >
        {lastCalibratedAt ? 'Recalibrate' : 'Run Calibration'}
      </button>

      {/* Fine-tune slider: ±50ms on top of calibrated value */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-text-secondary flex items-center gap-1">
            Fine-Tune
            <HelpTip text="Adjust on top of the calibrated value. If your mean offset is consistently off by a few ms, nudge this to center it." />
          </span>
          <span className="text-xs font-mono text-text-primary">
            {manualAdjustment > 0 ? '+' : ''}{manualAdjustment.toFixed(1)}ms
          </span>
        </div>
        <input
          type="range"
          min={-50}
          max={50}
          step={0.5}
          value={manualAdjustment}
          onChange={(e) => setManualAdjustment(parseFloat(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer touch-manipulation"
          style={{
            background: `linear-gradient(to right, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.08) ${
              ((manualAdjustment + 50) / 100) * 100
            }%, rgba(255,255,255,0.08) 100%)`,
          }}
        />
        <div className="flex justify-between mt-0.5">
          <span className="text-[9px] text-text-muted">-50ms</span>
          <span className="text-[9px] text-text-muted">0</span>
          <span className="text-[9px] text-text-muted">+50ms</span>
        </div>
      </div>

      {/* Calibration full-screen flow */}
      <CalibrationPage
        visible={showCalibration}
        onClose={() => setShowCalibration(false)}
      />
    </div>
  );
}

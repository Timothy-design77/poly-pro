/**
 * CalibrationSettings — Calibration section in the Settings overlay.
 *
 * Shows:
 * - Current offset (read-only display)
 * - Run Calibration button → opens CalibrationPage
 * - Manual offset override slider (-100 to +100ms, 0.5ms step)
 * - Last calibrated date
 */

import { useState } from 'react';
import { useSettingsStore } from '../../store/settings-store';
import { CalibrationPage } from '../../pages/CalibrationPage';

export function CalibrationSettings() {
  const latencyOffset = useSettingsStore((s) => s.latencyOffset);
  const lastCalibratedAt = useSettingsStore((s) => s.lastCalibratedAt);
  const calibrationConsistency = useSettingsStore((s) => s.calibrationConsistency);
  const setLatencyOffset = useSettingsStore((s) => s.setLatencyOffset);

  const [showCalibration, setShowCalibration] = useState(false);

  const lastCalLabel = lastCalibratedAt
    ? new Date(lastCalibratedAt).toLocaleDateString(undefined, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : 'Not calibrated';

  return (
    <div className="space-y-4">
      {/* Current offset display */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-secondary">Current Offset</span>
        <span className="text-sm font-mono font-bold text-text-primary">
          {latencyOffset === 0 && !lastCalibratedAt
            ? 'Not set'
            : `${latencyOffset > 0 ? '+' : ''}${latencyOffset.toFixed(1)}ms`}
        </span>
      </div>

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
        Run Calibration
      </button>

      {/* Manual override slider */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-text-secondary">Manual Override</span>
          <span className="text-xs font-mono text-text-primary">
            {latencyOffset > 0 ? '+' : ''}{latencyOffset.toFixed(1)}ms
          </span>
        </div>
        <input
          type="range"
          min={-100}
          max={100}
          step={0.5}
          value={latencyOffset}
          onChange={(e) => setLatencyOffset(parseFloat(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer touch-manipulation"
          style={{
            background: `linear-gradient(to right, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.08) ${
              ((latencyOffset + 100) / 200) * 100
            }%, rgba(255,255,255,0.08) 100%)`,
          }}
        />
        <div className="flex justify-between mt-0.5">
          <span className="text-[9px] text-text-muted">-100ms</span>
          <span className="text-[9px] text-text-muted">0</span>
          <span className="text-[9px] text-text-muted">+100ms</span>
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
